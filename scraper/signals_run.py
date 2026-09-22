"""CLI + entry point for the deeper signals.

    python -m scraper.signals_run                 # search shelf + (weekly) assortment + capped review history
    python -m scraper.signals_run --all           # everything, no caps (one-time backfill)
    python -m scraper.signals_run --only search|assortment|reviews

Reads the key-brand product set from Supabase (latest snapshots), writes results back.
Also called at the end of `scraper.run` when SUPABASE_URL is set.
"""
from __future__ import annotations

import argparse
import asyncio
import random
import logging
import os
import sys
from datetime import date, datetime, timezone

from playwright.async_api import async_playwright

from . import config
from .db import (connect, read_review_cursors, write_assortment, write_review_history, write_review_texts,
                 write_search, write_suggestions)
from .nykaa import BlockedError, open_browser
from .signals import SEARCH_QUERIES, RateLimited, assortment, key_products, review_history, search_shelf, suggestions

log = logging.getLogger("signals")


def latest_rows(client) -> list[dict]:
    d = client.table("scrape_snapshots").select("scrape_date").order("scrape_date", desc=True).limit(1).execute().data
    if not d:
        return []
    day = d[0]["scrape_date"]
    rows = client.table("v_snapshots").select("product_id,brand,name,rank,subcategory,origin").eq("scrape_date", day).limit(5000).execute().data
    return [r for r in rows if r["subcategory"] not in config.STORE_KEYS]


def classify_search_brands(client, rows: list[dict], today: str) -> int:
    """Brands seen only in search results get a classification row, so search capture is not 'unclassified'."""
    from .brands import classify_all, to_rows
    from .db import build_brand_payload, fetch_country_map
    if not rows:
        return 0
    known = {r["brand"] for r in client.table("brand_classification").select("brand").limit(10000).execute().data}
    seen_pid = set(); new_rows = []
    for r in rows:
        if r["brand"] and r["brand"] not in known and r["product_id"] not in seen_pid:
            seen_pid.add(r["product_id"]); new_rows.append({"brand": r["brand"], "product_id": r["product_id"], "name": r["name"], "in_kbeauty_store": False})
    if not new_rows:
        return 0
    payload = build_brand_payload(to_rows(classify_all(new_rows, country_by_product=fetch_country_map(client))), today)
    client.rpc("upsert_brand_classifications", {"p_rows": payload}).execute()
    log.info("classified %d search-only brands", len(payload))
    return len(payload)


def brand_ids(client) -> dict[str, str]:
    rows = client.table("products").select("brand,brand_id").limit(20000).execute().data
    out: dict[str, str] = {}
    for r in rows:
        if r.get("brand_id") and r["brand"] not in out:
            out[r["brand"]] = r["brand_id"]
    return out


async def run_signals(client, which: set[str], unlimited: bool = False) -> dict:
    now = datetime.now(timezone.utc); scraped_at = now.isoformat(timespec="seconds"); today = now.date().isoformat()
    stats: dict = {}
    async with async_playwright() as pw:
        browser, ctx, page = await open_browser(pw)
        try:
            await page.goto(config.CATEGORIES[0].url, wait_until="domcontentloaded", timeout=config.NAV_TIMEOUT_MS)
            await page.wait_for_timeout(1500)
            if "search" in which:
                # 1. autosuggest: what Nykaa proposes as shoppers type
                seeds = ["korean", "k beauty", "korean skin care"] + [c.key.replace("_", " ").replace("masks", "sheet mask")
                         for c in config.CATEGORIES if c.key not in config.STORE_KEYS] + [b.lower() for b in config.FOCUS_BRANDS]
                srows, sst = await suggestions(page, seeds, today)
                sst["written"] = write_suggestions(client, srows); stats["suggestions"] = sst
                # 2. keywords to track: the fixed Korean-intent set + the top suggested keywords
                core = [q.lower() for q in SEARCH_QUERIES]
                extra = []
                for r in srows:
                    kw = (r["suggestion"] or "").strip().lower()
                    if r["kind"] in ("query", "search") and kw and kw not in core and kw not in extra and len(kw) <= 40:
                        extra.append(kw)
                extra = extra[:config.SUGGESTED_KEYWORDS_MAX]
                # 3. results: core terms sampled several times (ads rotate per load), suggested terms once
                # Ads rotate per visitor, not per page load: each sample is a fresh browser session (new cookies,
                # new user agent), i.e. a different "shopper". Unpaid order is identical across samples.
                rows, st = await search_shelf(page, SEARCH_QUERIES + extra, scraped_at, samples=1)
                for n in range(2, config.SEARCH_SAMPLES + 1):
                    sctx = await browser.new_context(user_agent=random.choice(config.USER_AGENTS), locale="en-IN", viewport={"width": 1366, "height": 900})
                    spage = await sctx.new_page()
                    try:
                        await spage.goto(config.CATEGORIES[n % 7].url, wait_until="domcontentloaded", timeout=config.NAV_TIMEOUT_MS)
                        await spage.wait_for_timeout(1500)
                        srows_n, st_n = await search_shelf(spage, SEARCH_QUERIES, scraped_at, samples=1)
                        for r in srows_n:
                            r["sample"] = n
                        rows += srows_n; st["ok"] += st_n["ok"]; st["errors"] += st_n["errors"]
                    finally:
                        await sctx.close()
                st["suggested_terms"] = extra; st["samples"] = config.SEARCH_SAMPLES
                st["written"] = write_search(client, rows); stats["search"] = st
                st["brands_classified"] = classify_search_brands(client, rows, today)
            if "assortment" in which and (unlimited or now.weekday() == config.ASSORTMENT_WEEKDAY or not client.table("brand_assortment").select("brand").limit(1).execute().data):
                rows, st = await assortment(page, brand_ids(client), today)
                st["written"] = write_assortment(client, rows); stats["assortment"] = st
            if "reviews" in which:
                prods = key_products(latest_rows(client), config.TRACKED_BRANDS, config.KEY_COMPETITORS, config.KEY_PRODUCTS_PER_BRAND)
                cursors = read_review_cursors(client)
                # never-fetched first, then stalest
                prods.sort(key=lambda p: (p["product_id"] in cursors, (cursors.get(p["product_id"]) or {}).get("fetched_at", "")))
                cap = None if unlimited else config.REVIEW_HISTORY_MAX_PRODUCTS_PER_RUN
                written = {"n": 0}
                def save(h, c, texts=()):
                    written["n"] += write_review_history(client, h, [c]) if h else 0
                    if not h:
                        from .db import _upsert
                        _upsert(client, "review_cursor", [c], "product_id")
                    if texts:
                        write_review_texts(client, list(texts))
                try:
                    _, _, st = await review_history(page, prods, cursors, max_products=cap, on_product=save)
                except RateLimited as e:
                    log.error("review history stopped by rate limiting (progress saved; resumes next run): %s", e)
                    st = {"rate_limited": str(e)}
                st["written"] = written["n"]; st["key_products"] = len(prods); stats["reviews"] = st
        finally:
            await browser.close()
    return stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true"); ap.add_argument("--only", choices=["search", "assortment", "reviews"])
    args = ap.parse_args()
    logging.basicConfig(level=config.LOG_LEVEL, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s", datefmt="%H:%M:%S", stream=sys.stdout)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    if not os.getenv("SUPABASE_URL"):
        log.error("SUPABASE_URL not set"); return 2
    which = {args.only} if args.only else {"search", "assortment", "reviews"}
    try:
        stats = asyncio.run(run_signals(connect(), which, unlimited=args.all))
    except BlockedError as e:
        log.error("BLOCKED — stopped: %s", e); return 1
    log.info("signals done: %s", stats)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
