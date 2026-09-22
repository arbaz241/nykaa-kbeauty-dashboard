"""Full product catalogue of the focus brands, read from their Nykaa brand pages.

The shelves only show a category's top 100, so most of a brand's range is invisible there
(e.g. Innisfree lists 12 sunscreens, none in the top 100). The brand page lists everything.

  brand_catalog(page, brand_ids, scrape_date) -> rows for table brand_catalog
Cost: ~ceil(range / 20) listing-API calls per brand; ~50 for the 10 focus brands. Weekly.
"""
from __future__ import annotations

import asyncio
import json
import logging

from playwright.async_api import Page

from . import config
from .nykaa import BlockedError
from .signals import _fetch_json

log = logging.getLogger("catalog")

# Brands that never appear on a tracked shelf, so their id cannot come from shelf data.
KNOWN_BRAND_IDS = {"Sulwhasoo": "13600"}
_CAT_IDS = {str(c.nykaa_id): c.key for c in config.CATEGORIES if c.key not in config.STORE_KEYS}
URL = "https://www.nykaa.com/app-api/index.php/products/list?category_id={bid}&page_no={pg}&sort=popularity"


async def brand_catalog(page: Page, brand_ids: dict[str, str], scrape_date: str, max_pages: int = 15) -> tuple[list[dict], dict]:
    rows, stats = [], {"brands": len(brand_ids), "ok": 0, "errors": 0, "products": 0}
    for brand, bid in brand_ids.items():
        try:
            seen: set[str] = set(); pg = 0; total = None
            while pg < max_pages:
                pg += 1
                st, body = await _fetch_json(page, URL.format(bid=bid, pg=pg))
                if st == 403:
                    raise BlockedError(f"catalog 403 for {brand}")
                resp = json.loads(body).get("response") or {}
                total = resp.get("total_found") if total is None else total
                ps = resp.get("products") or []
                if not ps:
                    break
                for p in ps:
                    pid = str(p.get("id"))
                    if pid in seen:
                        continue
                    seen.add(pid)
                    cats = set(str(p.get("category_ids") or "").split(","))
                    slug = p.get("slug") or ""
                    rows.append({
                        "scrape_date": scrape_date, "brand": brand, "brand_id": bid, "product_id": pid, "catalog_rank": len(seen),
                        "name": p.get("name") or "", "subcategories": sorted({k for cid, k in _CAT_IDS.items() if cid in cats}),
                        "l3": ((p.get("primary_categories") or {}).get("l3") or {}).get("name"),
                        "price": p.get("final_price"), "mrp": p.get("price"), "discount_pct": p.get("discount"),
                        "rating": p.get("rating"), "rating_count": p.get("rating_count"), "in_stock": p.get("is_saleable"),
                        "has_offer": bool(p.get("isOfferPresent")) or bool(p.get("offer_message")), "offer_message": p.get("offer_message"),
                        "pack_size": p.get("pack_size"), "url": f"https://www.nykaa.com/{slug}" if slug else None, "image_url": p.get("image_url"),
                    })
                if total and len(seen) >= total:
                    break
                await asyncio.sleep(2.0)
            stats["ok"] += 1; stats["products"] += len(seen)
            log.info("catalog %s: %d of %s products", brand, len(seen), total)
        except BlockedError:
            raise
        except Exception as e:  # noqa: BLE001
            stats["errors"] += 1; log.warning("catalog %s failed: %s", brand, e)
        await asyncio.sleep(2.0)
    log.info("catalog: %s", stats)
    return rows, stats
