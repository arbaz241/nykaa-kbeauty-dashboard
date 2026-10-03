"""CLI: fetch product details for products that don't have them yet.

    python -m scraper.details            # up to DETAILS_MAX_PER_RUN products
    python -m scraper.details --all      # one-time backfill, no cap (local, polite delays)
    python -m scraper.details --reparse  # re-parse cached raw responses and re-upsert (no requests)

Candidates come from Supabase: products without a product_details row, most
recently seen first. Results are cached locally and upserted to Supabase.
Also called at the end of `scraper.run` (capped) when SUPABASE_URL is set.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys

from playwright.async_api import async_playwright

from . import config
from .db import connect, fetch_all, upsert_product_details
from .nykaa import BlockedError, open_browser
from .product_details import cached_ids, enrich_details, rows_from_cache

log = logging.getLogger("details")


def missing_product_ids(client) -> list[str]:
    """Shelf products (most recently seen first), then focus-brand catalogue products, without details yet."""
    have = {r["product_id"] for r in fetch_all(lambda: client.table("product_details").select("product_id").order("product_id"))}
    prods = fetch_all(lambda: client.table("products").select("product_id,last_seen_date").order("last_seen_date", desc=True).order("product_id"))
    ids = [p["product_id"] for p in prods if p["product_id"] not in have]
    try:
        cat = fetch_all(lambda: client.table("brand_catalog").select("product_id,catalog_rank").order("catalog_rank").order("product_id").order("scrape_date"))
        ids += [c["product_id"] for c in cat if c["product_id"] not in have and c["product_id"] not in ids]
    except Exception as e:  # noqa: BLE001
        log.warning("catalogue not available: %s", e)
    return list(dict.fromkeys(ids))


async def run_details(product_ids: list[str], max_products: int | None, client) -> dict:
    # products already in the local cache but missing in the DB get pushed without any request
    cached = cached_ids()
    from_cache = [pid for pid in product_ids if pid in cached]
    if from_cache:
        upsert_product_details(client, rows_from_cache(from_cache))
    todo = [pid for pid in product_ids if pid not in cached]
    if not todo:
        return {"candidates": len(product_ids), "fetched": 0, "from_cache": len(from_cache)}
    async with async_playwright() as pw:
        browser, ctx, page = await open_browser(pw)
        try:
            await page.goto(config.CATEGORIES[0].url, wait_until="domcontentloaded", timeout=config.NAV_TIMEOUT_MS)
            await page.wait_for_timeout(1500)
            rows, stats = await enrich_details(page, todo, max_products)
        finally:
            await browser.close()
    stats["from_cache"] = len(from_cache)
    upsert_product_details(client, rows)
    return stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="no per-run cap (one-time backfill)")
    ap.add_argument("--reparse", action="store_true", help="re-parse local cache and re-upsert, no requests")
    ap.add_argument("--max", type=int, default=None)
    args = ap.parse_args()
    logging.basicConfig(level=config.LOG_LEVEL, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
                        datefmt="%H:%M:%S", stream=sys.stdout)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    if not os.getenv("SUPABASE_URL"):
        log.error("SUPABASE_URL not set"); return 2
    client = connect()
    if args.reparse:
        n = upsert_product_details(client, rows_from_cache()); log.info("re-upserted %d cached products", n); return 0
    ids = missing_product_ids(client)
    log.info("%d products without details", len(ids))
    cap = 10**9 if args.all else (args.max if args.max is not None else config.DETAILS_MAX_PER_RUN)
    try:
        stats = asyncio.run(run_details(ids, cap, client))
    except BlockedError as e:
        log.error("BLOCKED during details fetch — stopped: %s", e); return 1
    log.info("done: %s", stats)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
