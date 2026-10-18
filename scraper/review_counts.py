"""Nightly written-review counts (plan v4, owner OK 18 Oct 2026).

Nykaa stopped updating its rating counts on 10 Oct; the number of written reviews still moves. This step records
it each night, so buying can later be estimated from reviews while ratings stay frozen. Nothing on the dashboard
uses it until the owner has seen it compared with ratings.

Coverage (owner: stay inside the free Actions minutes): every list's top 30 every night, and ranks 31-100 of the
product lists every third night (a product's turn is fixed by its id, so each one is read every 3 days). Leaders
first, then the rest by rank, inside a time budget; one light request per product (reviews API, 1 review).

    python -m scraper.review_counts            # read today's shelf from Supabase and record (local test)
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import zlib
from datetime import date

from playwright.async_api import Page, async_playwright

from . import config
from .db import _upsert, connect, fetch_all
from .nykaa import BlockedError, open_browser

log = logging.getLogger("review_counts")

URL = ("https://www.nykaa.com/gateway-api/products/{product_id}/reviews"
       "?pageNo=1&size=1&sort=MOST_RECENT&domain=nykaa&source=react")
TOP_DAILY = 30
BUDGET_SEC = 15 * 60
DELAY_SEC = 0.8


def pick(shelf: list[dict], day: str) -> list[tuple[str, int | None]]:
    """(product_id, rating_count) to read today: top 30 of every list, then today's third of ranks 31-100."""
    turn = date.fromisoformat(day).toordinal() % 3
    best: dict[str, tuple[int, int | None]] = {}   # product -> (best rank, rating count)
    for r in shelf:
        pid, rank = str(r["product_id"]), int(r.get("rank") or 999)
        daily = rank <= TOP_DAILY
        rotating = rank <= 100 and r.get("subcategory") not in config.STORE_KEYS and zlib.crc32(pid.encode()) % 3 == turn
        if not (daily or rotating):
            continue
        if pid not in best or rank < best[pid][0]:
            best[pid] = (rank if daily else 100 + rank, r.get("rating_count"))
    return [(pid, rc) for pid, (_, rc) in sorted(best.items(), key=lambda x: x[1][0])]


async def _count(page: Page, product_id: str) -> int | None:
    for attempt in range(4):
        status, body = await page.evaluate(
            "async (u) => { const r = await fetch(u, {credentials:'include'}); return [r.status, await r.text()]; }",
            URL.format(product_id=product_id))
        if status != 429:
            break
        log.warning("review count 429 for %s; backing off %ss", product_id, 15 * (attempt + 1))
        await asyncio.sleep(15 * (attempt + 1))
    if status == 403 or "Access Denied" in body[:300]:
        raise BlockedError(f"reviews API 403 for {product_id}")
    if status != 200:
        return None
    n = json.loads(body).get("reviewCount")
    return int(n) if str(n).isdigit() else None


async def record(client, day: str, shelf: list[dict], page: Page | None = None) -> dict:
    todo = pick(shelf, day)
    stats = {"planned": len(todo), "read": 0, "failed": 0, "left_for_budget": 0}
    rows: list[dict] = []
    started = time.monotonic()

    async def run(p: Page) -> None:
        for i, (pid, rc) in enumerate(todo):
            if time.monotonic() - started > BUDGET_SEC:
                stats["left_for_budget"] = len(todo) - i
                break
            try:
                n = await _count(p, pid)
            except BlockedError:
                raise
            except Exception as e:  # noqa: BLE001
                log.warning("review count %s failed: %s", pid, e); n = None
            if n is None:
                stats["failed"] += 1
            else:
                rows.append({"scrape_date": day, "product_id": pid, "review_count": n, "rating_count": rc}); stats["read"] += 1
            await asyncio.sleep(DELAY_SEC)

    try:
        if page is not None:
            await run(page)
        else:
            async with async_playwright() as pw:
                browser, _, p = await open_browser(pw)
                await p.goto(config.CATEGORIES[0].url, wait_until="domcontentloaded", timeout=60000)
                try:
                    await run(p)
                finally:
                    await browser.close()
    finally:
        if rows:
            _upsert(client, "review_counts", rows, "scrape_date,product_id")
    stats["minutes"] = round((time.monotonic() - started) / 60, 1)
    return stats


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s", datefmt="%H:%M:%S")
    client = connect()
    shelf = fetch_all(lambda: client.table("web_latest_shelf").select("product_id,subcategory,rank,rating_count").order("subcategory").order("rank"))
    day = max(str(r.get("scrape_date", "")) for r in shelf) if shelf and "scrape_date" in shelf[0] else date.today().isoformat()
    log.info("review counts: %s", asyncio.run(record(client, day, shelf)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
