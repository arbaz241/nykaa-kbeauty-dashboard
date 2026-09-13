"""Review enrichment via Nykaa's reviews API (browser-session fetch).

For each candidate product (rating_count < ENRICH_MAX_RATING_COUNT):
  - review_count: number of text reviews (distinct from rating_count)
  - first_review_date: createdOn of the oldest review, found by paging
    MOST_RECENT to the end (max ENRICH_MAX_PAGES). This is the best available
    proxy for when a product launched on Nykaa; listings carry no launch date.

first_review_date never changes, so it is cached permanently in
data/cache/first_review.json and fetched once per product. review_count is
refreshed on every run for candidates.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from playwright.async_api import Page

from . import config
from .nykaa import BlockedError

log = logging.getLogger("reviews")
CACHE_PATH = Path(config.DATA_DIR) / "cache" / "first_review.json"


def load_cache() -> dict[str, dict]:
    return json.loads(CACHE_PATH.read_text()) if CACHE_PATH.exists() else {}


def save_cache(cache: dict[str, dict]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, indent=0, sort_keys=True))


REQUESTS_MADE = 0


async def _fetch_reviews_page(page: Page, product_id: str, page_no: int) -> tuple[int | None, list[dict]]:
    global REQUESTS_MADE
    REQUESTS_MADE += 1
    url = config.REVIEWS_URL.format(product_id=product_id, page_no=page_no)
    status, body = await page.evaluate(
        "async (u) => { const r = await fetch(u, {credentials:'include'}); return [r.status, await r.text()]; }", url)
    if status == 403 or "Access Denied" in body[:300]:
        raise BlockedError(f"reviews API 403 for {product_id} p{page_no}")
    if status != 200:
        raise RuntimeError(f"reviews HTTP {status} for {product_id} p{page_no}: {body[:100]!r}")
    d = json.loads(body)
    return d.get("reviewCount"), (d.get("response") or {}).get("reviewData") or []


async def enrich_product(page: Page, product_id: str, need_first_date: bool) -> dict:
    """Returns {review_count, first_review_date (or None), complete (bool)}."""
    review_count, reviews = await _fetch_reviews_page(page, product_id, 1)
    out = {"review_count": review_count, "first_review_date": None, "complete": True}
    if not need_first_date:
        return out
    oldest = min((r["createdOn"] for r in reviews), default=None)
    page_no = 1
    while reviews and page_no < config.ENRICH_MAX_PAGES:
        page_no += 1
        await asyncio.sleep(config.ENRICH_DELAY_SEC)
        _, reviews = await _fetch_reviews_page(page, product_id, page_no)
        if reviews:
            oldest = min([oldest] + [r["createdOn"] for r in reviews]) if oldest else min(r["createdOn"] for r in reviews)
    if reviews:  # hit the page cap while reviews were still coming: oldest is an upper bound only
        out["complete"] = False
    out["first_review_date"] = oldest[:10] if oldest else None
    return out


async def enrich(page: Page, rows: list[dict]) -> dict:
    """Mutates rows in place (adds review_count, first_review_date). Returns stats.

    Volume control:
      - only rows with rating_count < ENRICH_MAX_RATING_COUNT are candidates
      - a product whose cache entry is complete and fresher than
        ENRICH_REFRESH_DAYS is served from cache with zero requests
      - at most ENRICH_MAX_PRODUCTS_PER_RUN products are fetched per run
        (never-fetched products first, then the stalest); the rest keep
        their cached values or stay null until a later run
      - a 403 aborts enrichment immediately (BlockedError propagates)
    """
    cache = load_cache()
    now = datetime.now(timezone.utc)
    stats = {"candidates": 0, "fetched": 0, "from_cache": 0, "deferred": 0, "errors": 0, "incomplete": 0, "requests": 0}

    def is_fresh(entry: dict | None) -> bool:
        if not entry or not entry.get("complete") or "review_count_at" not in entry:
            return False
        age = (now - datetime.fromisoformat(entry["review_count_at"])).days
        return age < config.ENRICH_REFRESH_DAYS

    # one entry per distinct product (same product can sit in two subcategories)
    by_pid: dict[str, list[dict]] = {}
    for r in rows:
        if (r.get("rating_count") or 0) < config.ENRICH_MAX_RATING_COUNT:
            by_pid.setdefault(r["product_id"], []).append(r)
    stats["candidates"] = len(by_pid)

    def apply(pid: str, entry: dict) -> None:
        for r in by_pid[pid]:
            r["review_count"] = entry.get("review_count")
            r["first_review_date"] = entry.get("first_review_date")

    to_fetch = []
    for pid in by_pid:
        entry = cache.get(pid)
        if is_fresh(entry):
            apply(pid, entry); stats["from_cache"] += 1
        else:
            to_fetch.append(pid)
    # never-fetched first, then stalest
    to_fetch.sort(key=lambda pid: cache.get(pid, {}).get("review_count_at", ""))
    deferred = to_fetch[config.ENRICH_MAX_PRODUCTS_PER_RUN:]
    to_fetch = to_fetch[:config.ENRICH_MAX_PRODUCTS_PER_RUN]
    for pid in deferred:
        if pid in cache:
            apply(pid, cache[pid])
    stats["deferred"] = len(deferred)

    try:
        for pid in to_fetch:
            entry = cache.get(pid, {})
            need_first = not entry.get("complete")
            try:
                res = await enrich_product(page, pid, need_first)
                stats["fetched"] += 1
                stats["requests"] = REQUESTS_MADE
            except BlockedError:
                raise
            except Exception as e:  # noqa: BLE001
                stats["errors"] += 1
                log.warning("enrich %s (%s) failed: %s", pid, by_pid[pid][0].get("brand"), e)
                if entry:
                    apply(pid, entry)
                await asyncio.sleep(config.ENRICH_DELAY_SEC)
                continue
            if need_first:
                entry = {"first_review_date": res["first_review_date"], "complete": res["complete"],
                         "fetched_at": now.isoformat(timespec="seconds")}
                if not res["complete"]:
                    stats["incomplete"] += 1
            entry["review_count"] = res["review_count"]
            entry["review_count_at"] = now.isoformat(timespec="seconds")
            cache[pid] = entry
            apply(pid, entry)
            await asyncio.sleep(config.ENRICH_DELAY_SEC)
    finally:
        save_cache(cache)  # keep whatever we learned, even on abort
    for r in rows:
        r.setdefault("review_count", None); r.setdefault("first_review_date", None)
    stats["requests"] = REQUESTS_MADE
    log.info("enrichment: %s", stats)
    return stats
