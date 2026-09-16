"""Deeper signals: search-intent shelf, brand assortment breadth, review history.

All three use the same browser session as the listing scrape (Akamai-gated).

  search_shelf(page, queries)      -> rows for search_snapshots (top 20 per query, 1 page load each)
  assortment(page, brand_ids)      -> rows for brand_assortment (1 API call per brand)
  review_history(page, products)   -> monthly review counts per product, incremental via review_cursor

Key brands (for review history): the owner's tracked brands plus the ten most
visible brands in the latest listings; up to KEY_PRODUCTS_PER_BRAND products each.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone

from playwright.async_api import Page

from . import config
from .nykaa import BlockedError, _STATE_RE

log = logging.getLogger("signals")

SEARCH_QUERIES = [
    # K-beauty purchase intent. Generic head terms ("sunscreen") are omitted: Nykaa
    # redirects them to the category pages we already track as shelves.
    "korean skincare", "korean sunscreen", "korean serum", "korean moisturizer", "korean face wash",
    "korean toner", "korean sheet mask", "korean lip tint", "glass skin", "snail mucin", "cica",
    "rice toner", "centella", "niacinamide serum", "sunscreen for oily skin",
]
REVIEWS_URL = ("https://www.nykaa.com/gateway-api/products/{product_id}/reviews"
               "?pageNo={page_no}&size=50&sort=MOST_RECENT&domain=nykaa&source=react")


async def _fetch_json(page: Page, url: str) -> tuple[int, str]:
    return await page.evaluate("async (u) => { const r = await fetch(u,{credentials:'include'}); return [r.status, await r.text()]; }", url)


# ------------------------------------------------------------------ search shelf

async def search_shelf(page: Page, queries: list[str], scraped_at: str) -> tuple[list[dict], dict]:
    rows, stats = [], {"queries": len(queries), "ok": 0, "errors": 0}
    for q in queries:
        url = "https://www.nykaa.com/search/result/?q=" + q.replace(" ", "%20")
        try:
            resp = await page.goto(url, wait_until="domcontentloaded", timeout=config.NAV_TIMEOUT_MS)
            html = await page.content()
            if resp is None or resp.status == 403 or "<TITLE>Access Denied</TITLE>" in html[:400]:
                raise BlockedError(f"search 403 for {q!r}")
            m = _STATE_RE.search(html)
            state = json.loads(m.group(1)) if m else {}
            ld = (state.get("searchListingPage") or {}).get("listingData") or {}
            if not ld.get("products"):  # Nykaa redirected the query to a category page
                ld = (state.get("categoryListing") or {}).get("listingData") or {}
                log.info("search %r redirected to %s", q, page.url.split("?")[0])
            prods = ld.get("products") or []
            if not prods:
                raise RuntimeError(f"no products for {q!r}")
            seen_ids: set[str] = set()
            for i, p in enumerate(prods[:20]):
                pid = str(p.get("productId") or p.get("id"))
                if pid in seen_ids:
                    continue
                seen_ids.add(pid)
                brand = p.get("brandName"); brand = brand[0] if isinstance(brand, list) and brand else brand
                rows.append({"scrape_date": scraped_at[:10], "query": q, "rank": i + 1, "product_id": pid,
                             "brand": brand or "", "name": p.get("name") or p.get("title") or "", "price": p.get("price"),
                             "rating": p.get("rating"), "rating_count": p.get("ratingCount"),
                             "is_ad": "AD" in (p.get("dynamicTags") or []), "total_found": ld.get("totalFound"), "scraped_at": scraped_at})
            stats["ok"] += 1
        except BlockedError:
            raise
        except Exception as e:  # noqa: BLE001
            stats["errors"] += 1; log.warning("search %r failed: %s", q, e)
        await asyncio.sleep(2.0)
    log.info("search shelf: %s", stats)
    return rows, stats


# ------------------------------------------------------------------ assortment

async def assortment(page: Page, brand_ids: dict[str, str], scrape_date: str) -> tuple[list[dict], dict]:
    rows, stats = [], {"brands": len(brand_ids), "ok": 0, "errors": 0}
    for brand, bid in brand_ids.items():
        try:
            st, body = await _fetch_json(page, f"https://www.nykaa.com/app-api/index.php/products/list?category_id={bid}&page_no=1&sort=popularity")
            if st == 403:
                raise BlockedError(f"assortment 403 for {brand}")
            resp = json.loads(body).get("response") or {}
            if not resp.get("is_brand"):
                raise RuntimeError(f"{brand}: id {bid} is not a brand page")
            rows.append({"brand": brand, "scrape_date": scrape_date, "brand_id": bid, "total_products": resp.get("total_found")})
            stats["ok"] += 1
        except BlockedError:
            raise
        except Exception as e:  # noqa: BLE001
            stats["errors"] += 1; log.warning("assortment %s failed: %s", brand, e)
        await asyncio.sleep(1.5)
    log.info("assortment: %s", stats)
    return rows, stats


# ------------------------------------------------------------------ review history

async def review_history(page: Page, products: list[dict], cursors: dict[str, dict], max_pages_per_product: int = 60,
                         max_products: int | None = None, on_product=None) -> tuple[list[dict], list[dict], dict]:
    """products: [{product_id}]; cursors: product_id -> {newest_review_id, complete}.
    Returns (history rows [{product_id, month, reviews, avg_rating}], cursor rows, stats).
    Incremental: stop when the newest known review id is reached; full crawl when no cursor."""
    hist_rows, cur_rows = [], []
    stats = {"products": 0, "requests": 0, "reviews": 0, "errors": 0}
    todo = products if max_products is None else products[:max_products]
    for p in todo:
        pid = p["product_id"]; cur = cursors.get(pid) or {}
        known_newest = cur.get("newest_review_id")
        months: Counter = Counter(); rating_sum: dict[str, float] = defaultdict(float)
        seen: set[int] = set(); newest = known_newest; pg = 0; reached_known = False; complete = bool(cur.get("complete"))
        try:
            while pg < max_pages_per_product:
                pg += 1
                st, body = await _fetch_json(page, REVIEWS_URL.format(product_id=pid, page_no=pg)); stats["requests"] += 1
                if st == 403:
                    raise BlockedError(f"reviews 403 for {pid}")
                rd = (json.loads(body).get("response") or {}).get("reviewData") or []
                new = [r for r in rd if int(r["id"]) not in seen]
                if not new:
                    complete = True; break
                for r in new:
                    rid = int(r["id"]); seen.add(rid)
                    if known_newest and rid <= known_newest:
                        reached_known = True; continue
                    newest = max(newest or 0, rid)
                    mo = r["createdOn"][:7] + "-01"; months[mo] += 1; rating_sum[mo] += float(r.get("rating") or 0)
                if reached_known:
                    break
                await asyncio.sleep(config.ENRICH_DELAY_SEC)
            else:
                complete = False  # hit the page cap
            p_hist = [{"product_id": pid, "month": mo, "reviews": n, "avg_rating": round(rating_sum[mo] / n, 2) if n else None} for mo, n in months.items()]
            p_cur = {"product_id": pid, "newest_review_id": newest, "reviews_fetched": (cur.get("reviews_fetched") or 0) + sum(months.values()),
                     "complete": complete or reached_known, "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            if on_product:
                on_product(p_hist, p_cur)   # persist per product so a crash loses at most one product
            else:
                hist_rows.extend(p_hist); cur_rows.append(p_cur)
            stats["products"] += 1; stats["reviews"] += sum(months.values())
        except BlockedError:
            raise
        except Exception as e:  # noqa: BLE001
            stats["errors"] += 1; log.warning("review history %s failed: %s", pid, e)
        await asyncio.sleep(config.ENRICH_DELAY_SEC)
    log.info("review history: %s", stats)
    return hist_rows, cur_rows, stats


# ------------------------------------------------------------------ key brands / products

def key_products(latest_rows: list[dict], tracked: list[str], top_competitors: int = 10, per_brand: int = 5) -> list[dict]:
    """Tracked brands + the most visible competitors; up to `per_brand` best-ranked products each."""
    norm = lambda s: re.sub(r"[^a-z0-9]+", "", (s or "").lower())
    by_brand: dict[str, list[dict]] = defaultdict(list)
    for r in latest_rows:
        by_brand[r["brand"]].append(r)
    tracked_keys = {norm(t) for t in tracked}
    ranked = sorted(by_brand.items(), key=lambda kv: (-len(kv[1]), min(x["rank"] for x in kv[1])))
    chosen = [b for b, _ in ranked if norm(b) in tracked_keys]
    chosen += [b for b, _ in ranked if norm(b) not in tracked_keys][:top_competitors]
    out, seen = [], set()
    for b in chosen:
        for r in sorted(by_brand[b], key=lambda x: x["rank"])[:per_brand]:
            if r["product_id"] not in seen:
                seen.add(r["product_id"]); out.append({"product_id": r["product_id"], "brand": b, "rank": r["rank"], "name": r["name"]})
    return out
