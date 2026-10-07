"""CLI + entry point for the deeper signals.

    python -m scraper.signals_run                 # search shelf + (weekly) assortment + capped review history
    python -m scraper.signals_run --all           # everything, no caps (one-time backfill)
    python -m scraper.signals_run --only search|assortment|catalog|reviews|texts

Reads the key-brand product set from Supabase (latest snapshots), writes results back.
Also called at the end of `scraper.run` when SUPABASE_URL is set.
"""
from __future__ import annotations

import argparse
import asyncio
import contextlib
import random
import logging
import os
import sys
from datetime import date, datetime, timezone

from playwright.async_api import async_playwright

from . import config
from .db import (connect, fetch_all, read_review_cursors, write_assortment, write_review_history, write_review_texts,
                 write_search, write_suggestions)
from .nykaa import BlockedError, open_browser
from .signals import (SEARCH_QUERIES, RateLimited, assortment, key_products, products_missing_text, review_history,
                      review_texts_only, search_shelf, suggestions)

log = logging.getLogger("signals")


def latest_rows(client) -> list[dict]:
    d = client.table("scrape_snapshots").select("scrape_date").order("scrape_date", desc=True).limit(1).execute().data
    if not d:
        return []
    day = d[0]["scrape_date"]
    rows = fetch_all(lambda: client.table("v_snapshots").select("product_id,brand,name,rank,subcategory,origin").eq("scrape_date", day)
                     .order("subcategory").order("rank").order("product_id"))
    return [r for r in rows if r["subcategory"] not in config.STORE_KEYS]


def tracked_products(client) -> list[dict]:
    """Products whose reviews we follow: the anchor's top products per category and their direct rivals
    (scraper.rivals, so every USP comparison has buyer evidence), then the brand-tier selection."""
    from .rivals import comparison_set
    out = list(comparison_set(client))
    seen = {p["product_id"] for p in out}
    out += [p for p in key_products(latest_rows(client), catalog_rows(client)) if p["product_id"] not in seen]
    return out


def catalog_rows(client) -> list[dict]:
    """Latest full-catalogue snapshot for the focus brands (most of a brand's range never reaches a top-100)."""
    d = client.table("brand_catalog").select("scrape_date").order("scrape_date", desc=True).limit(1).execute().data
    if not d:
        return []
    return fetch_all(lambda: client.table("brand_catalog").select("product_id,brand,name,rating_count,subcategories")
                     .eq("scrape_date", d[0]["scrape_date"]).order("product_id"))


def products_with_text(client) -> set[str]:
    """Product ids that already have at least one stored review text."""
    return {r["product_id"] for r in fetch_all(lambda: client.table("review_texts").select("product_id").order("product_id").order("review_id"))}


def classify_search_brands(client, rows: list[dict], today: str) -> int:
    """Brands seen only in search results get a classification row, so search capture is not 'unclassified'."""
    from .brands import classify_all, to_rows
    from .db import build_brand_payload, fetch_country_map
    if not rows:
        return 0
    known = {r["brand"] for r in fetch_all(lambda: client.table("brand_classification").select("brand").order("brand"))}
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


def focus_brand_ids(client) -> dict[str, str]:
    """Nykaa brand-page ids for the focus brands: shelf data first, then known ids for off-shelf brands."""
    import re
    from .catalog import KNOWN_BRAND_IDS
    norm = lambda x: re.sub(r"[^a-z0-9]", "", x.lower())
    have = brand_ids(client)
    out = {}
    for b in config.FOCUS_BRANDS:
        hit = next(((name, i) for name, i in have.items() if norm(name) == norm(b)), None)
        if hit:
            out[hit[0]] = hit[1]
        elif b in KNOWN_BRAND_IDS:
            out[b] = KNOWN_BRAND_IDS[b]
        else:
            log.warning("no brand id for focus brand %s", b)
    return out


def brand_ids(client) -> dict[str, str]:
    rows = fetch_all(lambda: client.table("products").select("brand,brand_id").order("product_id"))
    out: dict[str, str] = {}
    for r in rows:
        if r.get("brand_id") and r["brand"] not in out:
            out[r["brand"]] = r["brand_id"]
    return out



@contextlib.contextmanager
def _stage(stats: dict, name: str):
    """One collector's failure must not cost the rest of the night's data. A block is different:
    that means Nykaa is refusing us, so it stops the whole run."""
    try:
        yield
    except (BlockedError, RateLimited):
        raise
    except Exception as e:  # noqa: BLE001
        stats[name] = {"failed": f"{type(e).__name__}: {e}"[:300]}
        log.error("signals stage %r failed (the other stages continue): %s", name, e)


async def run_signals(client, which: set[str], unlimited: bool = False) -> dict:
    now = datetime.now(timezone.utc); scraped_at = now.isoformat(timespec="seconds"); today = now.date().isoformat()
    stats: dict = {}
    async with async_playwright() as pw:
        browser, ctx, page = await open_browser(pw)
        try:
            await page.goto(config.CATEGORIES[0].url, wait_until="domcontentloaded", timeout=config.NAV_TIMEOUT_MS)
            await page.wait_for_timeout(1500)
            if "search" in which:
                with _stage(stats, "search"):
                    # 1. autosuggest: what Nykaa proposes as shoppers type
                    # One seed per phrase: two shelves used to map onto "sheet mask" (masks + sheet_mask), which put
                    # the same seed in the batch twice and made Postgres reject the whole upsert.
                    shelf_terms = {"masks": "face mask", "sheet_mask": "sheet mask", "face_wash": "face wash",
                                   "face_moisturizer": "moisturizer", "cleansing_balm": "cleansing balm",
                                   "eye_care": "eye cream", "lip_tint": "lip tint", "lip_care": "lip balm", "toner": "toner"}
                    seeds = list(dict.fromkeys(
                        ["korean", "k beauty", "korean skin care"]
                        + [shelf_terms.get(c.key, c.key.replace("_", " ")) for c in config.CATEGORIES if c.key not in config.STORE_KEYS]
                        + [b.lower() for b in config.FOCUS_BRANDS]))
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
                with _stage(stats, "assortment"):
                    rows, st = await assortment(page, brand_ids(client), today)
                    st["written"] = write_assortment(client, rows); stats["assortment"] = st
            if "catalog" in which and (unlimited or now.weekday() == config.ASSORTMENT_WEEKDAY or not client.table("brand_catalog").select("brand").limit(1).execute().data):
                with _stage(stats, "catalog"):
                    from .catalog import brand_catalog
                    from .db import write_catalog
                    rows, st = await brand_catalog(page, focus_brand_ids(client), today)
                    st["written"] = write_catalog(client, rows); stats["catalog"] = st
            if "reviews" in which:
                with _stage(stats, "reviews"):
                    prods = tracked_products(client)
                    cursors = read_review_cursors(client)
                    # never-fetched first (bounded by the minute budget only), then the stalest up to the refresh cap
                    prods.sort(key=lambda p: (p["product_id"] in cursors, (cursors.get(p["product_id"]) or {}).get("fetched_at", "")))
                    new = sum(1 for p in prods if p["product_id"] not in cursors)
                    cap = None if unlimited else new + config.REVIEW_HISTORY_MAX_PRODUCTS_PER_RUN
                    written = {"n": 0}
                    def save(h, c, texts=()):
                        written["n"] += write_review_history(client, h, [c]) if h else 0
                        if not h:
                            from .db import _upsert
                            _upsert(client, "review_cursor", [c], "product_id")
                        if texts:
                            write_review_texts(client, list(texts))
                    try:
                        _, _, st = await review_history(page, prods, cursors, max_products=cap, on_product=save,
                                                        max_minutes=None if unlimited else config.REVIEW_HISTORY_MAX_MINUTES)
                    except RateLimited as e:
                        log.error("review history stopped by rate limiting (progress saved; resumes next run): %s", e)
                        st = {"rate_limited": str(e)}
                    st["written"] = written["n"]; st["key_products"] = len(prods); stats["reviews"] = st
            if "texts" in which:
                with _stage(stats, "texts"):
                    # products whose monthly history was collected before review text was captured:
                    # fetch the text only, never the counts (write_review_history is additive)
                    # only products whose monthly history is already collected: for the rest, the reviews pass
                    # fetches counts and text together in one walk
                    # and only once: a product with no written reviews stays "missing text", and re-walking it
                    # nightly found nothing (later reviews arrive with their text through the reviews pass)
                    hist = read_review_cursors(client)
                    todo = [p for p in products_missing_text(tracked_products(client), products_with_text(client))
                            if p["product_id"] in hist and not hist[p["product_id"]].get("text_checked_at")]
                    cap = None if unlimited else config.REVIEW_TEXT_MAX_PRODUCTS_PER_RUN
                    written = {"n": 0}
                    def save_texts(texts):
                        written["n"] += write_review_texts(client, list(texts))
                    def checked(pid):
                        client.table("review_cursor").update({"text_checked_at": datetime.now(timezone.utc).isoformat()}).eq("product_id", pid).execute()
                    try:
                        st = await review_texts_only(page, todo[:cap] if cap else todo, on_product=save_texts, on_checked=checked,
                                                     max_minutes=None if unlimited else config.REVIEW_TEXT_MAX_MINUTES)
                    except RateLimited as e:
                        log.error("review texts stopped by rate limiting (progress saved; resumes next run): %s", e)
                        st = {"rate_limited": str(e)}
                    st["candidates"] = len(todo); st["written"] = written["n"]; stats["texts"] = st
            if "usp-texts" in which:
                with _stage(stats, "usp-texts"):
                    # the USP comparison set needs review text to the analysis' depth (scraper.usp: 150 for core
                    # brands, 30 for others); the nightly window keeps only REVIEW_TEXT_DAYS, so reach further back
                    from collections import Counter
                    from .rivals import comparison_set
                    from .usp import REVIEWS_LIGHT, REVIEWS_THOROUGH, THOROUGH_BRANDS, USP_TEXT_DAYS, _norm
                    ids = {p["product_id"] for p in comparison_set(client)}
                    have = Counter(r["product_id"] for r in fetch_all(lambda: client.table("review_texts").select("product_id,review_id")
                                                                       .in_("product_id", sorted(ids)).order("product_id").order("review_id")))
                    want, todo = {}, []
                    for p in comparison_set(client):
                        need = REVIEWS_THOROUGH if _norm(p["brand"]) in THOROUGH_BRANDS else REVIEWS_LIGHT
                        if have[p["product_id"]] < need:
                            want[p["product_id"]] = need; todo.append(p)
                    log.info("usp texts: %d of %d comparison products short of their review depth", len(todo), len(ids))
                    written = {"n": 0}
                    def save_usp_texts(texts):
                        written["n"] += write_review_texts(client, list(texts))
                    try:
                        st = await review_texts_only(page, todo, on_product=save_usp_texts, text_days=USP_TEXT_DAYS, want=want)
                    except RateLimited as e:
                        log.error("usp texts stopped by rate limiting (progress saved; re-run to continue): %s", e)
                        st = {"rate_limited": str(e)}
                    st["candidates"] = len(todo); st["written"] = written["n"]; stats["usp-texts"] = st
        finally:
            await browser.close()
    return stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true"); ap.add_argument("--only", choices=["search", "assortment", "catalog", "reviews", "texts", "usp-texts"])
    ap.add_argument("--max", type=int, default=None, help="cap products for --only reviews|texts")
    args = ap.parse_args()
    logging.basicConfig(level=config.LOG_LEVEL, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s", datefmt="%H:%M:%S", stream=sys.stdout)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    if not os.getenv("SUPABASE_URL"):
        log.error("SUPABASE_URL not set"); return 2
    which = {args.only} if args.only else {"search", "assortment", "catalog", "reviews", "texts"}
    if args.max is not None:
        config.REVIEW_HISTORY_MAX_PRODUCTS_PER_RUN = config.REVIEW_TEXT_MAX_PRODUCTS_PER_RUN = args.max
    try:
        stats = asyncio.run(run_signals(connect(), which, unlimited=args.all))
    except BlockedError as e:
        log.error("BLOCKED — stopped: %s", e); return 1
    log.info("signals done: %s", stats)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
