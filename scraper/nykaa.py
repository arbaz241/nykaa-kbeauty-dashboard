"""Nykaa listing fetcher.

Strategy (see docs/phase1-feasibility.md):
  1. Launch full Chromium (new headless). The default headless shell is
     rejected by Akamai at the TLS/HTTP2 layer.
  2. Load the category page once so Akamai's sensor sets its cookies.
  3. For each page 1..N call Nykaa's internal JSON listing API *from inside
     the page* (page.evaluate + fetch). Direct HTTP calls get 403. This
     returns the Nykaa *app* ranking, which is the primary source.
  4. Optional (config.WEB_FALLBACK): if any API page of a category fails,
     re-scrape the whole category from the website pages
     (window.__PRELOADED_STATE__). Web ranking differs from app ranking, so
     rows are tagged listing_source="web" and sources are never mixed within
     a category.

Every failure is logged with category, page, attempt, and reason. Nothing is
silently swallowed; a page that fails all retries raises.
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

from playwright.async_api import Browser, BrowserContext, Page, async_playwright

from . import config

log = logging.getLogger("nykaa")

_STATE_RE = re.compile(r"window\.__PRELOADED_STATE__\s*=\s*(\{.*?\});?\s*</script>", re.S)


class BlockedError(RuntimeError):
    """Akamai returned Access Denied / non-200 — do not hammer, back off."""


@dataclass
class PageResult:
    products: list[dict]
    total_found: int | None
    source: str  # "app" | "web"


@dataclass
class CategoryResult:
    category: config.Category
    products: list[dict] = field(default_factory=list)   # normalized rows
    total_found: int | None = None
    listing_source: str | None = None  # "app" | "web"
    pages_ok: int = 0
    pages_failed: int = 0
    errors: list[str] = field(default_factory=list)


# ---------------------------------------------------------------- normalize

def normalize(raw: dict, category: config.Category, rank: int, scraped_at: str, source: str) -> dict:
    """Flatten one API/SSR product record into the row shape we persist.

    API uses snake_case (brand_name, rating_count); SSR uses camelCase
    (brandName, ratingCount). Accept both.
    """
    g = lambda *keys: next((raw[k] for k in keys if raw.get(k) is not None), None)
    tm = raw.get("tracking_metadata") or raw.get("trackingMetadata") or {}
    cats = raw.get("primary_categories") or raw.get("primaryCategories") or {}
    slug = g("slug") or ""
    cat_ids = str(g("category_ids", "categoryIds") or "")
    return {
        "product_id": str(g("id", "productId")),
        "sku": g("sku"),
        "name": g("name", "title"),
        "brand": g("brand_name", "brandName"),
        "brand_id": str(g("brand_ids", "brandIds") or "").split(",")[0] or None,
        # API: price = MRP, final_price = selling price. SSR: mrp / price.
        "mrp": raw.get("price") if "final_price" in raw else g("mrp"),
        "price": g("final_price") if "final_price" in raw else g("price"),
        "discount_pct": g("discount"),
        "rating": g("rating"),
        "rating_count": g("rating_count", "ratingCount"),
        # API: is_saleable; SSR: inStock
        "in_stock": g("is_saleable", "inStock"),
        "pack_size": g("pack_size", "packSize"),
        "tags": ",".join(g("dynamic_tags", "dynamicTags") or []),
        "is_pinned": bool(tm.get("pinning_info")),
        "pinning_info": tm.get("pinning_info") or None,
        "popularity_score": tm.get("popularity"),
        "in_kbeauty_store": config.KBEAUTY_STORE_CATEGORY_ID in cat_ids.split(","),
        "nykaa_l2": (cats.get("l2") or {}).get("name"),
        "nykaa_l3": (cats.get("l3") or {}).get("name"),
        "subcategory": category.key,
        "category_id": category.nykaa_id,
        "rank": rank,
        "listing_source": source,
        "url": f"https://www.nykaa.com/{slug}" if slug else None,
        "scraped_at": scraped_at,
    }


# ------------------------------------------------------------------ fetching

async def _sleep_polite() -> None:
    await asyncio.sleep(random.uniform(config.MIN_DELAY, config.MAX_DELAY))


async def _fetch_api_page(page: Page, category: config.Category, page_no: int) -> PageResult:
    url = config.API_URL.format(category_id=category.nykaa_id, page_no=page_no)
    status, body = await page.evaluate(
        """async (u) => { const r = await fetch(u, {credentials: 'include',
              headers: {'Accept': 'application/json'}});
              return [r.status, await r.text()]; }""",
        url,
    )
    if status == 403 or "Access Denied" in body[:500]:
        raise BlockedError(f"API 403 for {category.key} p{page_no}")
    if status != 200:
        raise RuntimeError(f"API HTTP {status} for {category.key} p{page_no}: {body[:120]!r}")
    data = json.loads(body)
    resp = data.get("response") or {}
    products = resp.get("products") or []
    if not products:
        raise RuntimeError(f"API returned 0 products for {category.key} p{page_no} (status={data.get('status')})")
    return PageResult(products, resp.get("total_found"), "app")


async def _fetch_ssr_page(page: Page, category: config.Category, page_no: int) -> PageResult:
    url = f"{category.url}?page_no={page_no}"
    resp = await page.goto(url, wait_until="domcontentloaded", timeout=config.NAV_TIMEOUT_MS)
    html = await page.content()
    if resp is None or resp.status == 403 or "<TITLE>Access Denied</TITLE>" in html[:400]:
        raise BlockedError(f"SSR 403 for {category.key} p{page_no}")
    m = _STATE_RE.search(html)
    if not m:
        raise RuntimeError(f"__PRELOADED_STATE__ not found for {category.key} p{page_no}")
    ld = (json.loads(m.group(1)).get("categoryListing") or {}).get("listingData") or {}
    products = ld.get("products") or []
    if not products:
        raise RuntimeError(f"SSR returned 0 products for {category.key} p{page_no}")
    return PageResult(products, ld.get("totalFound"), "web")


async def _fetch_page_with_retry(fetcher, page: Page, category: config.Category, page_no: int) -> PageResult:
    last: Exception | None = None
    for attempt in range(1, config.MAX_RETRIES + 1):
        try:
            return await fetcher(page, category, page_no)
        except BlockedError as e:
            last = e
            log.error("BLOCKED (%s) %s p%d attempt %d/%d: %s",
                      fetcher.__name__, category.key, page_no, attempt, config.MAX_RETRIES, e)
        except Exception as e:  # noqa: BLE001 — logged and retried deliberately
            last = e
            log.warning("%s p%d %s attempt %d/%d failed: %s",
                        category.key, page_no, fetcher.__name__, attempt, config.MAX_RETRIES, e)
        backoff = min(60, (2 ** attempt) * random.uniform(2, 4))
        log.info("%s p%d: backing off %.0fs", category.key, page_no, backoff)
        await asyncio.sleep(backoff)
    raise RuntimeError(f"{category.key} p{page_no} failed after {config.MAX_RETRIES} attempts: {last}")


async def _scrape_category_via(fetcher, page: Page, category: config.Category,
                               top_n: int, scraped_at: str) -> CategoryResult:
    result = CategoryResult(category=category)
    n_pages = -(-top_n // config.PAGE_SIZE)  # ceil
    seen: set[str] = set()
    for page_no in range(1, n_pages + 1):
        try:
            pr = await _fetch_page_with_retry(fetcher, page, category, page_no)
        except Exception as e:  # noqa: BLE001
            result.pages_failed += 1
            result.errors.append(str(e))
            log.error("%s p%d GAVE UP: %s", category.key, page_no, e)
            await _sleep_polite()
            continue
        result.pages_ok += 1
        result.listing_source = pr.source
        result.total_found = result.total_found or pr.total_found
        for i, raw in enumerate(pr.products):
            rank = (page_no - 1) * config.PAGE_SIZE + i + 1
            row = normalize(raw, category, rank, scraped_at, pr.source)
            if row["product_id"] in seen:
                log.debug("%s duplicate product %s at rank %d (skipped)", category.key, row["product_id"], rank)
                continue
            seen.add(row["product_id"])
            result.products.append(row)
        log.info("%s p%d ok via %s: %d products (total_found=%s)",
                 category.key, page_no, pr.source, len(pr.products), pr.total_found)
        await _sleep_polite()
    result.products = result.products[:top_n]
    return result


async def scrape_category(page: Page, category: config.Category, top_n: int, scraped_at: str) -> CategoryResult:
    # Establish/refresh the Akamai session on the real category page.
    resp = await page.goto(category.url, wait_until="domcontentloaded", timeout=config.NAV_TIMEOUT_MS)
    if resp is None or resp.status != 200:
        raise BlockedError(f"category page {category.url} -> {resp.status if resp else 'no response'}")
    await page.wait_for_timeout(1500)

    result = await _scrape_category_via(_fetch_api_page, page, category, top_n, scraped_at)
    if result.pages_failed and config.WEB_FALLBACK:
        log.warning("%s: %d app-API page(s) failed; re-scraping whole category from website pages "
                    "(web ranking, listing_source=web)", category.key, result.pages_failed)
        web = await _scrape_category_via(_fetch_ssr_page, page, category, top_n, scraped_at)
        web.errors = result.errors + web.errors
        return web
    return result


async def open_browser(pw) -> tuple[Browser, BrowserContext, Page]:
    ua = random.choice(config.USER_AGENTS)
    log.info("launching chromium (new headless), UA=%s", ua.split(") ")[0] + ")")
    browser = await pw.chromium.launch(headless=True, channel="chromium")
    ctx = await browser.new_context(user_agent=ua, locale="en-IN",
                                    viewport={"width": 1366, "height": 900})
    return browser, ctx, await ctx.new_page()


async def scrape_all(categories: list[config.Category], top_n: int) -> tuple[str, list[CategoryResult]]:
    scraped_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    results: list[CategoryResult] = []
    async with async_playwright() as pw:
        browser, ctx, page = await open_browser(pw)
        try:
            for cat in categories:
                try:
                    results.append(await scrape_category(page, cat, top_n, scraped_at))
                except Exception as e:  # noqa: BLE001
                    r = CategoryResult(category=cat)
                    r.errors.append(str(e)); r.pages_failed = -(-top_n // config.PAGE_SIZE)
                    results.append(r)
                    log.error("%s FAILED entirely: %s", cat.key, e)
                await _sleep_polite()
        finally:
            await browser.close()
    return scraped_at, results
