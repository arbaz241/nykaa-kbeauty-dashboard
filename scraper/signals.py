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
from datetime import datetime, timedelta, timezone

from playwright.async_api import Page

from . import config
from .nykaa import BlockedError, _STATE_RE

log = logging.getLogger("signals")

_norm = lambda s_: re.sub(r"[^a-z0-9]+", "", (s_ or "").lower())

SEARCH_QUERIES = [
    # K-beauty purchase intent. Generic head terms ("sunscreen") are omitted: Nykaa
    # redirects them to the category pages we already track as shelves.
    "korean skincare", "korean sunscreen", "korean serum", "korean moisturizer", "korean face wash",
    "korean toner", "korean sheet mask", "korean lip tint", "glass skin", "snail mucin", "cica",
    "rice toner", "centella", "niacinamide serum", "sunscreen for oily skin",
]
REVIEWS_URL = ("https://www.nykaa.com/gateway-api/products/{product_id}/reviews"
               "?pageNo={page_no}&size=50&sort=MOST_RECENT&domain=nykaa&source=react")


class RateLimited(RuntimeError):
    """Nykaa kept answering 429 after back-off: stop this crawl, keep what was saved."""


async def _fetch_json(page: Page, url: str, retries: int = 5) -> tuple[int, str]:
    """In-page fetch with back-off on 429 Too Many Requests (15s, 30s, 45s…)."""
    for attempt in range(retries + 1):
        status, body = await page.evaluate("async (u) => { const r = await fetch(u,{credentials:'include'}); return [r.status, await r.text()]; }", url)
        if status != 429:
            return status, body
        if attempt == retries:
            raise RateLimited(f"429 after {retries} retries: {url[:90]}")
        log.warning("429 Too Many Requests; backing off %ss", 15 * (attempt + 1))
        await asyncio.sleep(15 * (attempt + 1))
    return status, body


# ------------------------------------------------------------------ search shelf

async def search_shelf(page: Page, queries: list[str], scraped_at: str, samples: int = 1) -> tuple[list[dict], dict]:
    """Top 20 results per query, loaded `samples` times: unpaid order is stable, paid AD slots rotate per load."""
    rows, stats = [], {"queries": len(queries), "samples": samples, "ok": 0, "errors": 0}
    for q, sample in [(q, n) for q in queries for n in range(1, samples + 1)]:
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
                rows.append({"scrape_date": scraped_at[:10], "query": q, "sample": sample, "rank": i + 1, "product_id": pid,
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


# ------------------------------------------------------------------ autosuggest

async def suggestions(page: Page, seeds: list[str], scrape_date: str) -> tuple[list[dict], dict]:
    """Nykaa's popular-searches list plus the autosuggest keywords and products for each seed."""
    rows, stats = [], {"seeds": len(seeds), "ok": 0, "errors": 0}
    try:
        st, body = await _fetch_json(page, "https://www.nykaa.com/search/trending")
        for i, t in enumerate((json.loads(body).get("response") or {}).get("trending") or []):
            rows.append({"scrape_date": scrape_date, "seed": "", "position": i + 1, "suggestion": t.get("q"), "kind": "popular", "product_id": None, "url": t.get("url")})
    except Exception as e:  # noqa: BLE001
        stats["errors"] += 1; log.warning("popular searches failed: %s", e)
    for seed in seeds:
        try:
            st, body = await _fetch_json(page, "https://www.nykaa.com/api/search/suggestions/v2?q=" + seed.replace(" ", "%20").replace("&", "%26"))
            if st == 403:
                raise BlockedError(f"suggestions 403 for {seed!r}")
            pos = {}
            for grp in json.loads(body).get("suggestions") or []:
                for sug in grp.get("suggestions") or []:
                    kind = sug.get("type") or "query"
                    pos[kind] = pos.get(kind, 0) + 1
                    rows.append({"scrape_date": scrape_date, "seed": seed, "position": pos[kind], "suggestion": sug.get("q"), "kind": kind,
                                 "product_id": str(sug.get("id")) if kind == "product" and sug.get("id") else None, "url": sug.get("url")})
            stats["ok"] += 1
        except BlockedError:
            raise
        except Exception as e:  # noqa: BLE001
            stats["errors"] += 1; log.warning("suggestions %r failed: %s", seed, e)
        await asyncio.sleep(1.5)
    log.info("suggestions: %s", stats)
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

async def review_history(page: Page, products: list[dict], cursors: dict[str, dict], max_pages_per_product: int = 40,
                         max_products: int | None = None, on_product=None,
                         max_minutes: float | None = None) -> tuple[list[dict], list[dict], dict]:
    """products: [{product_id}]; cursors: product_id -> {newest_review_id, complete}.
    Nykaa serves at most 40 review pages per product; page 41 returns HTTP 400.
    Returns (history rows [{product_id, month, reviews, avg_rating}], cursor rows, stats).
    Incremental: stop when the newest known review id is reached; full crawl when no cursor.
    max_minutes bounds wall clock: Nykaa answers 429 to roughly every other request under load, so a
    product count cannot keep the daily job inside its budget. Each product is saved as it finishes, so
    stopping early loses nothing — the next run picks up the stalest products."""
    hist_rows, cur_rows = [], []
    stats = {"products": 0, "requests": 0, "reviews": 0, "errors": 0}
    todo = products if max_products is None else products[:max_products]
    deadline = None if not max_minutes else datetime.now(timezone.utc) + timedelta(minutes=max_minutes)
    for p in todo:
        if deadline and datetime.now(timezone.utc) >= deadline:
            stats["out_of_time"] = len(todo) - stats["products"]
            log.info("review history: out of time, %d products left for the next run", stats["out_of_time"])
            break
        pid = p["product_id"]; cur = cursors.get(pid) or {}
        known_newest = cur.get("newest_review_id")
        months: Counter = Counter(); rating_sum: dict[str, float] = defaultdict(float); texts: list[dict] = []
        text_cutoff = (datetime.now(timezone.utc) - timedelta(days=config.REVIEW_TEXT_DAYS)).strftime("%Y-%m-%d")
        seen: set[int] = set(); newest = known_newest; pg = 0; reached_known = False; complete = bool(cur.get("complete"))
        reported = cur.get("reported_reviews")
        try:
            while pg < max_pages_per_product:
                pg += 1
                st, body = await _fetch_json(page, REVIEWS_URL.format(product_id=pid, page_no=pg)); stats["requests"] += 1
                if st == 403:
                    raise BlockedError(f"reviews 403 for {pid}")
                if st == 400:
                    # Nykaa refuses pages past its ~40-page ceiling: stop here and keep what was collected
                    log.info("reviews page ceiling reached for %s at p%d", pid, pg)
                    complete = False
                    break
                if st != 200:
                    raise RuntimeError(f"reviews HTTP {st} for {pid} p{pg}")   # never read an error as 'no more reviews'
                payload = json.loads(body)
                if pg == 1 and payload.get("reviewCount") is not None:
                    reported = int(payload["reviewCount"])   # Nykaa's live count, for truncation detection
                rd = (payload.get("response") or {}).get("reviewData") or []
                new = [r for r in rd if int(r["id"]) not in seen]
                if not new:
                    # empty page = Nykaa has no older reviews; a full page of repeats = the endpoint's ceiling
                    complete = not rd
                    break
                for r in new:
                    rid = int(r["id"]); seen.add(rid)
                    if known_newest and rid <= known_newest:
                        reached_known = True; continue
                    newest = max(newest or 0, rid)
                    mo = r["createdOn"][:7] + "-01"; months[mo] += 1; rating_sum[mo] += float(r.get("rating") or 0)
                    if r["createdOn"][:10] >= text_cutoff and (r.get("title") or r.get("description")):
                        texts.append({"review_id": rid, "product_id": pid, "created_on": r["createdOn"].replace(" ", "T") + "+05:30",
                                      "rating": int(r.get("rating") or 0) or None, "title": (r.get("title") or "")[:300],
                                      "body": (r.get("description") or "")[:2000], "is_buyer": bool(r.get("isBuyer")),
                                      "aspects": r.get("aspects") or None, "images": len(r.get("images") or []),
                                      "likes": int(r.get("likeCount") or 0)})
                if reached_known:
                    break
                await asyncio.sleep(max(config.ENRICH_DELAY_SEC, 2.5))
            else:
                complete = False  # hit the page cap
            p_hist = [{"product_id": pid, "month": mo, "reviews": n, "avg_rating": round(rating_sum[mo] / n, 2) if n else None} for mo, n in months.items()]
            p_cur = {"product_id": pid, "newest_review_id": newest, "reviews_fetched": (cur.get("reviews_fetched") or 0) + sum(months.values()),
                     "complete": complete or reached_known, "reported_reviews": reported,
                     "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            if on_product:
                on_product(p_hist, p_cur, texts)   # persist per product so a crash loses at most one product
            else:
                hist_rows.extend(p_hist); cur_rows.append(p_cur)
            stats["products"] += 1; stats["reviews"] += sum(months.values())
            log.info("history %s: %d reviews over %d months%s, %d texts", pid, sum(months.values()), len(months),
                     "" if p_cur["complete"] else " (truncated)", len(texts))
        except (BlockedError, RateLimited):
            raise
        except Exception as e:  # noqa: BLE001
            stats["errors"] += 1; log.warning("review history %s failed (nothing saved for it): %s", pid, e)
        await asyncio.sleep(config.ENRICH_DELAY_SEC)
    log.info("review history: %s", stats)
    return hist_rows, cur_rows, stats


# ------------------------------------------------------------------ key brands / products

def key_products(latest_rows: list[dict], catalog_rows: list[dict] | None = None,
                 core: list[str] | None = None, watch: list[str] | None = None,
                 per_core: int | None = None, per_watch: int | None = None,
                 per_competitor: int | None = None, competitors: int | None = None) -> list[dict]:
    """Products to track for review history, in priority order — the daily job works down this list.

      1. the anchor brand (config.ANCHOR_BRAND), deepest
      2. the other core K-beauty brands, `per_core` products each
      3. the Indian/global brands that actually compete with the anchor: those holding the most shelf
         slots in the anchor's own categories today, `per_competitor` each
      4. the smaller/newer Korean watch-list brands, `per_watch` each

    Within a brand, products on today's shelves come first (best rank first), then the rest of the
    brand's catalogue by review count, so a brand's biggest sellers are covered even when they are
    not in a tracked top-100 today (most of Innisfree's range is off-shelf).
    """
    core = core or config.KBEAUTY_CORE
    watch = watch or config.KBEAUTY_WATCH
    per_core = per_core if per_core is not None else config.KEY_PRODUCTS_PER_BRAND
    per_watch = per_watch if per_watch is not None else config.KEY_PRODUCTS_PER_WATCH
    per_competitor = per_competitor if per_competitor is not None else config.KEY_PRODUCTS_PER_COMPETITOR
    competitors = competitors if competitors is not None else config.KEY_COMPETITORS
    catalog_rows = catalog_rows or []

    by_brand: dict[str, list[dict]] = defaultdict(list)
    for r in latest_rows:
        by_brand[r["brand"]].append({"product_id": r["product_id"], "brand": r["brand"], "name": r.get("name"),
                                     "rank": r.get("rank") or 999, "pop": r.get("rating_count") or 0})
    for r in catalog_rows:
        by_brand[r["brand"]].append({"product_id": r["product_id"], "brand": r["brand"], "name": r.get("name"),
                                     "rank": 9999, "pop": r.get("rating_count") or 0})

    def resolve(name: str) -> str:
        return next((b for b in by_brand if _norm(b) == _norm(name)), name)

    def pick(brand: str, n: int) -> list[dict]:
        seen: set[str] = set(); out = []
        for p in sorted(by_brand.get(brand, []), key=lambda x: (x["rank"], -x["pop"])):
            if p["product_id"] not in seen:
                seen.add(p["product_id"]); out.append(p)
        return out[:n]

    core_r = [resolve(b) for b in core]
    watch_r = [resolve(b) for b in watch if resolve(b) not in [resolve(c) for c in core]]
    anchor = resolve(config.ANCHOR_BRAND)

    # the anchor's own categories decide who its rivals are
    anchor_cats = {r["subcategory"] for r in latest_rows if r["brand"] == anchor}
    anchor_cats |= {c for r in catalog_rows if r["brand"] == anchor for c in (r.get("subcategories") or [])}
    korean = set(core_r) | set(watch_r)
    slots: dict[str, int] = defaultdict(int)
    for r in latest_rows:
        if r["subcategory"] in anchor_cats and r["brand"] not in korean:
            slots[r["brand"]] += 1
    rivals = [b for b, _ in sorted(slots.items(), key=lambda kv: (-kv[1], kv[0]))[:competitors]]

    plan = ([(anchor, per_core)] + [(b, per_core) for b in core_r if b != anchor]
            + [(b, per_competitor) for b in rivals] + [(b, per_watch) for b in watch_r])
    out: list[dict] = []; taken: set[str] = set()
    for brand, n in plan:
        for p in pick(brand, n):
            if p["product_id"] not in taken:
                taken.add(p["product_id"]); out.append(p)
    log.info("key products: %d (anchor %s, %d core, %d rivals %s, %d watch)",
             len(out), anchor, len(core_r), len(rivals), rivals[:5], len(watch_r))
    return out


def products_missing_text(all_key: list[dict], have_text: set[str]) -> list[dict]:
    """Key products whose review text was never stored (history was collected before text capture existed)."""
    return [p for p in all_key if p["product_id"] not in have_text]


async def review_texts_only(page: Page, products: list[dict], on_product=None, max_pages_per_product: int = 20,
                            max_minutes: float | None = None) -> dict:
    """Fetch reviews purely to store their text. Monthly counts are NOT touched (they are already stored and
    are additive, so re-counting them would double them)."""
    stats = {"products": 0, "requests": 0, "texts": 0, "errors": 0}
    cutoff = (datetime.now(timezone.utc) - timedelta(days=config.REVIEW_TEXT_DAYS)).strftime("%Y-%m-%d")
    deadline = None if not max_minutes else datetime.now(timezone.utc) + timedelta(minutes=max_minutes)
    for p in products:
        if deadline and datetime.now(timezone.utc) >= deadline:
            stats["out_of_time"] = len(products) - stats["products"]
            log.info("review texts: out of time, %d products left for the next run", stats["out_of_time"])
            break
        pid = p["product_id"]; seen: set[int] = set(); texts: list[dict] = []
        try:
            for pg in range(1, max_pages_per_product + 1):
                st, body = await _fetch_json(page, REVIEWS_URL.format(product_id=pid, page_no=pg)); stats["requests"] += 1
                if st == 400:
                    break
                if st == 403:
                    raise BlockedError(f"reviews 403 for {pid}")
                if st != 200:
                    raise RuntimeError(f"reviews HTTP {st} for {pid} p{pg}")
                rd = (json.loads(body).get("response") or {}).get("reviewData") or []
                new = [r for r in rd if int(r["id"]) not in seen]
                if not new:
                    break
                stale = all(r["createdOn"][:10] < cutoff for r in new)
                for r in new:
                    seen.add(int(r["id"]))
                    if r["createdOn"][:10] >= cutoff and (r.get("title") or r.get("description")):
                        texts.append({"review_id": int(r["id"]), "product_id": pid, "created_on": r["createdOn"].replace(" ", "T") + "+05:30",
                                      "rating": int(r.get("rating") or 0) or None, "title": (r.get("title") or "")[:300],
                                      "body": (r.get("description") or "")[:2000], "is_buyer": bool(r.get("isBuyer")),
                                      "aspects": r.get("aspects") or None, "images": len(r.get("images") or []),
                                      "likes": int(r.get("likeCount") or 0)})
                if stale:      # newest-first: once a whole page predates the text window, stop
                    break
                await asyncio.sleep(max(config.ENRICH_DELAY_SEC, 2.5))
            if on_product and texts:
                on_product(texts)
            stats["products"] += 1; stats["texts"] += len(texts)
            log.info("texts %s: %d reviews", pid, len(texts))
        except (BlockedError, RateLimited):
            raise
        except Exception as e:  # noqa: BLE001
            stats["errors"] += 1; log.warning("texts %s failed: %s", pid, e)
        await asyncio.sleep(config.ENRICH_DELAY_SEC)
    log.info("review texts: %s", stats)
    return stats
