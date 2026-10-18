"""CLI entrypoint: python -m scraper.run [--categories a,b] [--top-n 100]

Phase 1/2: writes results to data/<date>/ as JSON + CSV and prints a summary.
Phase 3 will add the Supabase writer alongside (same rows, same run summary).
Idempotent: re-running on the same day overwrites that day's files.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import random
import time
import csv
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

from . import config
from .nykaa import scrape_all, open_browser, BlockedError
from .reviews import enrich
from playwright.async_api import async_playwright


def setup_logging() -> None:
    logging.basicConfig(
        level=config.LOG_LEVEL,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
        stream=sys.stdout,
    )


async def run_enrichment(rows: list[dict]) -> dict:
    async with async_playwright() as pw:
        browser, ctx, page = await open_browser(pw)
        try:
            # any category page establishes the Akamai session for the reviews API
            await page.goto(config.CATEGORIES[0].url, wait_until="domcontentloaded", timeout=config.NAV_TIMEOUT_MS)
            await page.wait_for_timeout(1500)
            return await enrich(page, rows)
        finally:
            await browser.close()


def write_outputs(scraped_at: str, results, out_root: Path, enrich_stats: dict | None = None) -> Path:
    day = scraped_at[:10]
    out = out_root / day
    out.mkdir(parents=True, exist_ok=True)
    rows = [p for r in results for p in r.products]
    (out / "products.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False))
    if rows:
        with (out / "products.csv").open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader(); w.writerows(rows)
    run_meta = {
        "scraped_at": scraped_at,
        "finished_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "top_n": config.TOP_N,
        "categories": [
            {"key": r.category.key, "nykaa_id": r.category.nykaa_id, "products": len(r.products),
             "total_found": r.total_found, "listing_source": r.listing_source, "pages_ok": r.pages_ok, "pages_failed": r.pages_failed,
             "errors": r.errors} for r in results
        ],
        "total_rows": len(rows),
        "enrichment": enrich_stats,
        "success": all(r.pages_failed == 0 for r in results),
    }
    (out / "run.json").write_text(json.dumps(run_meta, indent=1))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--categories", help="comma-separated category keys (default: all)")
    ap.add_argument("--top-n", type=int, default=config.TOP_N)
    ap.add_argument("--out", default=config.DATA_DIR)
    ap.add_argument("--no-enrich", action="store_true", help="skip the reviews-API enrichment step")
    ap.add_argument("--no-db", action="store_true", help="skip the Supabase ingest even if SUPABASE_URL is set")
    args = ap.parse_args()
    setup_logging()
    log = logging.getLogger("run")

    cats = config.CATEGORIES
    if args.categories:
        wanted = set(args.categories.split(","))
        cats = [c for c in cats if c.key in wanted]
        missing = wanted - {c.key for c in cats}
        if missing:
            log.error("unknown categories: %s", sorted(missing)); return 2

    if config.START_JITTER_SEC > 0:
        wait = random.uniform(0, config.START_JITTER_SEC)
        log.info("start jitter: sleeping %.0fs", wait)
        time.sleep(wait)
    log.info("starting: %d categories, top %d each", len(cats), args.top_n)
    scraped_at, results = asyncio.run(scrape_all(cats, args.top_n))
    blocked = any(any(e.startswith("BLOCKED") for e in r.errors) for r in results)
    enrich_stats = None
    if blocked:
        log.error("run was blocked during listing scrape — skipping enrichment")
    elif not args.no_enrich:
        try:
            enrich_stats = asyncio.run(run_enrichment([p for r in results for p in r.products]))
        except BlockedError as e:
            log.error("BLOCKED during enrichment — stopped: %s", e)
            enrich_stats = {"blocked": str(e)}
    out = write_outputs(scraped_at, results, Path(args.out), enrich_stats)

    ok = True
    for r in results:
        status = "OK " if r.pages_failed == 0 else "ERR"
        ok &= r.pages_failed == 0
        log.info("%s %-17s products=%3d pages_ok=%d pages_failed=%d total_found=%s source=%s",
                 status, r.category.key, len(r.products), r.pages_ok, r.pages_failed, r.total_found, r.listing_source)
        for e in r.errors:
            log.error("   %s", e)
    log.info("wrote %s (%d rows)", out, sum(len(r.products) for r in results))

    if args.no_db:
        log.info("--no-db: skipping Supabase ingest")
    elif not os.getenv("SUPABASE_URL"):
        log.warning("SUPABASE_URL not set: results are on disk only, nothing ingested")
    else:
        from .ingest import ingest_day
        try:
            ingest_day(out)
        except Exception as e:  # noqa: BLE001
            log.error("Supabase ingest FAILED (data is still on disk in %s): %s", out, e)
            return 1
        from .db import connect
        from .market_signals import run_market_signals, save_category_brands
        try:  # every brand in each category, from page 1 of the listing we already fetched (no request)
            log.info("category brands: %d rows", save_category_brands(connect(), scraped_at[:10], results))
        except Exception as e:  # noqa: BLE001
            log.error("category brands step failed (non-fatal): %s", e)
        if not blocked and not args.no_enrich:
            # what Nykaa features on its homepage today, and the offers each brand is running (~70 requests)
            try:
                shelf = [p for r in results for p in r.products]
                log.info("market signals: %s", asyncio.run(run_market_signals(connect(), scraped_at[:10], shelf)))
            except BlockedError as e:
                log.error("BLOCKED during market signals — stopped: %s", e)
                blocked = True
            except Exception as e:  # noqa: BLE001
                log.error("market signals step failed (non-fatal): %s", e)
        if not blocked and not args.no_enrich and not args.categories:
            # written-review counts: every list's top 30 nightly, ranks 31-100 every third night (time-boxed ~15 min)
            from .review_counts import record
            try:
                shelf = [{**p, "subcategory": r.category.key} for r in results for p in r.products]
                log.info("review counts: %s", asyncio.run(record(connect(), scraped_at[:10], shelf)))
            except BlockedError as e:
                log.error("BLOCKED during review counts — stopped: %s", e)
                blocked = True
            except Exception as e:  # noqa: BLE001
                log.error("review counts step failed (non-fatal): %s", e)
            # outside news for the main brands and the day's movers (Google News feed, ~1 minute, not Nykaa)
            from . import news
            try:
                log.info("news: %s", news.run(connect(), scraped_at[:10]))
            except Exception as e:  # noqa: BLE001
                log.error("news step failed (non-fatal): %s", e)
        if not blocked and not args.no_enrich:
            # product details for products we have never fetched (capped per run)
            from .details import missing_catalog_ids, missing_product_ids, run_details
            try:
                client = connect()
                listed = {x["product_id"] for rr in results for x in rr.products}
                # today's shelf products first; spare slots under the cap go to focus brands' range products
                # (new launches the Monday catalogue finds), which otherwise never get details
                on_shelf = [p for p in missing_product_ids(client) if p in listed]
                in_range = [p for p in missing_catalog_ids(client) if p not in listed]
                ids = on_shelf + in_range
                if ids:
                    log.info("product details: %d listed + %d range products without details", len(on_shelf), len(in_range))
                    asyncio.run(run_details(ids, config.DETAILS_MAX_PER_RUN, client))
            except BlockedError as e:
                log.error("BLOCKED during product details — stopped: %s", e)
            except Exception as e:  # noqa: BLE001
                log.error("product details step failed (non-fatal): %s", e)
            # deeper signals: search daily, assortment + catalogue weekly, review history and text time-boxed
            from .signals_run import run_signals
            try:
                stats = asyncio.run(run_signals(client, {"search", "assortment", "catalog", "reviews", "texts"}))
                log.info("signals: %s", stats)
            except BlockedError as e:
                log.error("BLOCKED during signals — stopped: %s", e)
            except Exception as e:  # noqa: BLE001
                log.error("signals step failed (non-fatal): %s", e)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
