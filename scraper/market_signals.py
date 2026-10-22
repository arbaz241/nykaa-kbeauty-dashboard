"""Market signals added in Round 4 (owner OK 17 Oct 2026): what Nykaa itself is pushing, and what brands offer.

    python -m scraper.market_signals            # homepage + brand offers now (local test; ~70 requests)
    python -m scraper.market_signals --homepage # homepage only (1 page load)

1. Brands per category: Nykaa's brand filter (every brand in the category with its product count) comes with page 1
   of each listing, which the nightly scrape already fetches, so it costs no extra request (save_category_brands).
2. Homepage features: the banners on nykaa.com's homepage carousel and strips, read from the page's own inventory
   call. Each banner links to a brand page, a sale page (/sp/...) or a campaign page; that link is what we keep.
   A sale page that stays up for a run of days becomes a sale event on the dashboard.
3. Brand offers: Nykaa's product page lists the offers running on that brand ("Buy 3, get extra 10% off on all
   Etude orders", "Free gift on The Face Shop orders above ₹1499"). One product page per brand is enough because
   the offers are brand-wide; we read it for the Korean brands we track and the brands holding most shelf places.
"""
from __future__ import annotations

import argparse
import asyncio
import collections
import logging
import os
import json
import re
import sys
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit

from playwright.async_api import Page, async_playwright

from . import config
from .db import _upsert, connect, fetch_all
from .nykaa import BlockedError, open_browser
from .product_details import fetch_details

log = logging.getLogger("market")

HOMEPAGE = "https://www.nykaa.com/"
INVENTORY_HINT = "gateway-api/inventory/data/json"
MAX_OFFER_BRANDS = 70     # ~2 s apart: about 2.5 minutes a night
TOP_SHELF_BRANDS = 40     # besides the tracked Korean brands, the brands with the most top-100 places today


# ------------------------------------------------------------------ brands per category (no request)
def save_category_brands(client, scrape_date: str, results) -> int:
    rows = []
    for r in results:
        seen: set[str] = set()
        for b in r.brands or []:
            bid, name = str(b.get("id") or "").strip(), (b.get("name") or "").strip()
            if not bid or not name or bid in seen:
                continue
            seen.add(bid)
            try:
                n = int(b.get("count") or 0)
            except (TypeError, ValueError):
                n = 0
            rows.append({"scrape_date": scrape_date, "subcategory": r.category.key, "brand_id": bid, "brand": name, "products": n})
    return _upsert(client, "category_brands", rows, "scrape_date,subcategory,brand_id") if rows else 0


# ------------------------------------------------------------------ homepage
def _clean_url(u: str) -> str:
    p = urlsplit(u)
    return urlunsplit((p.scheme or "https", p.netloc or "www.nykaa.com", p.path, "", ""))


def _label(slug: str) -> str:
    return re.sub(r"[-_]+", " ", slug).strip().title()


def classify_link(url: str, app_type: str | None, app_data: str | None) -> tuple[str, str, str]:
    """(kind, target, label) for one banner link. kind: brand | sale | campaign | category."""
    path = urlsplit(url).path.strip("/")
    m = re.match(r"brands/c/(\d+)$", path)
    if app_type == "brand" and app_data and str(app_data).isdigit():
        return "brand", str(app_data), ""
    if m:
        return "brand", m.group(1), ""
    parts = path.split("/")
    if parts and parts[0] == "sp" and len(parts) >= 3:
        slug = parts[2]
        kind = "sale" if "sale" in parts[1] or "sale" in slug else "campaign"
        return kind, slug, _label(slug)
    if len(parts) >= 3 and parts[0] == "brands" and parts[-2] == "c":       # brands/<brand>/<range>/c/<id>
        return "brand_range", parts[-1], _label(parts[2] if len(parts) > 3 else parts[1])
    if len(parts) >= 2 and parts[-2] == "c":                                  # <slug>/c/<id>: a curated page
        slug = parts[-3] if len(parts) >= 3 else parts[0]
        kind = "sale" if "sale" in slug else "campaign"
        return kind, parts[-1], _label(slug)
    return "campaign", path or "home", _label(parts[0] if parts and parts[0] else "home")


def _obj(v):
    """Nykaa sometimes sends a nested object as JSON text (22 Oct 2026: homepage read failed on a string); decode it,
    and treat anything that still isn't an object as empty."""
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except ValueError:
            return {}
    return v if isinstance(v, dict) else {}


def _list(v):
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except ValueError:
            return []
    return [x for x in v if isinstance(x, (dict, str))] if isinstance(v, list) else []


def parse_inventory(payload: dict) -> list[dict]:
    out = []
    for block in _list(_obj(payload).get("result")):
        block = _obj(block)
        for inv in _list(block.get("inventories")):
            inv = _obj(inv)
            section = inv.get("inventory_page_section") or inv.get("inventory_name") or ""
            pos = 0
            for w in _list(_obj(inv.get("widget_data")).get("children")):
                w = _obj(w)
                url = w.get("web_action_url") or w.get("actionlink")
                if not url:
                    params = _obj(w.get("parameters"))
                    url = params.get("web_action_url") or params.get("actionlink")
                    w = {**params, **w}
                if not url:
                    continue
                pos += 1
                kind, target, label = classify_link(url, w.get("app_link_type"), w.get("app_link_data"))
                out.append({"section": section[:80], "position": pos, "kind": kind, "target": target[:120], "label": label[:120],
                            "url": _clean_url(url)[:300], "is_ad": bool(w.get("ad_id"))})
    return out


async def read_homepage(page: Page) -> list[dict]:
    payloads: list[dict] = []

    async def on_resp(r):
        if INVENTORY_HINT in r.url:
            try:
                payloads.append(await r.json())
            except Exception:  # noqa: BLE001
                pass

    page.on("response", on_resp)
    try:
        resp = await page.goto(HOMEPAGE, wait_until="domcontentloaded", timeout=config.NAV_TIMEOUT_MS)
        if resp is not None and resp.status == 403:
            raise BlockedError("homepage 403")
        await page.wait_for_timeout(8000)
    finally:
        page.remove_listener("response", on_resp)
    rows: list[dict] = []
    for p in payloads:
        rows.extend(parse_inventory(p))
    # the same banner can sit in two strips; keep its first place
    seen, uniq = set(), []
    for r in rows:
        k = (r["section"], r["kind"], r["target"])
        if k not in seen:
            seen.add(k); uniq.append(r)
    return uniq


def brand_names(client) -> dict[str, str]:
    """Nykaa brand id -> name, from the category brand filters and the brand catalogues."""
    names: dict[str, str] = {}
    for r in fetch_all(lambda: client.table("brand_catalog").select("brand_id,brand").not_.is_("brand_id", "null").order("brand_id")):
        names.setdefault(str(r["brand_id"]), r["brand"])
    for r in fetch_all(lambda: client.table("category_brands").select("brand_id,brand").order("brand_id").order("scrape_date", desc=True)):
        names.setdefault(str(r["brand_id"]), r["brand"])
    return names


def save_homepage(client, scrape_date: str, rows: list[dict]) -> int:
    if not rows:
        return 0
    names = brand_names(client)
    for r in rows:
        r["scrape_date"] = scrape_date
        r["brand"] = names.get(r["target"]) if r["kind"] == "brand" else None
        if r["kind"] == "brand" and r["brand"]:
            r["label"] = r["brand"]
    return _upsert(client, "homepage_features", rows, "scrape_date,section,kind,target")


# ------------------------------------------------------------------ brand offers
def offer_targets(client, scrape_date: str, shelf_rows: list[dict] | None) -> list[tuple[str, str]]:
    """(brand, product_id) pairs: one well-ranked product per brand, tracked Korean brands first."""
    if shelf_rows is None:
        shelf_rows = fetch_all(lambda: client.table("scrape_snapshots").select("product_id,rank,subcategory")
                               .eq("scrape_date", scrape_date).order("subcategory").order("rank"))
        brand_of = {r["product_id"]: r["brand"] for r in fetch_all(lambda: client.table("products").select("product_id,brand").order("product_id"))}
        shelf_rows = [{**r, "brand": brand_of.get(r["product_id"])} for r in shelf_rows]
    best: dict[str, tuple[int, str]] = {}
    slots: collections.Counter = collections.Counter()
    for r in shelf_rows:
        b = r.get("brand")
        if not b or r.get("subcategory") in config.STORE_KEYS and b not in config.TRACKED_BRANDS:
            continue
        slots[b] += 1
        if b not in best or r["rank"] < best[b][0]:
            best[b] = (r["rank"], str(r["product_id"]))
    order = [b for b in config.TRACKED_BRANDS if b in best]
    order += [b for b, _ in slots.most_common() if b not in order][:TOP_SHELF_BRANDS]
    return [(b, best[b][1]) for b in order][:MAX_OFFER_BRANDS]


async def read_offers(page: Page, targets: list[tuple[str, str]]) -> tuple[list[dict], dict]:
    rows, stats = [], {"brands": len(targets), "ok": 0, "with_offers": 0, "errors": 0}
    for brand, pid in targets:
        try:
            resp = await fetch_details(page, pid)
        except BlockedError:
            raise
        except Exception as e:  # noqa: BLE001
            stats["errors"] += 1; log.warning("offers for %s (%s) failed: %s", brand, pid, e)
            await asyncio.sleep(config.DETAILS_DELAY_SEC); continue
        stats["ok"] += 1
        offers = resp.get("offers") or []
        if offers:
            stats["with_offers"] += 1
        seen = set()
        for o in offers:
            oid = str(o.get("offer_id") or o.get("id") or (o.get("title") or "")[:60])
            if not oid or oid in seen:
                continue
            seen.add(oid)
            rows.append({"brand": brand, "offer_id": oid, "title": (o.get("title") or "").strip()[:200],
                         "description": (o.get("description") or "").strip()[:400], "product_id": pid})
        await asyncio.sleep(config.DETAILS_DELAY_SEC)
    return rows, stats


def save_offers(client, scrape_date: str, rows: list[dict], checked: list[str]) -> int:
    # a brand checked today with no offers gets one empty marker row, so "no offer" is told apart from "not checked"
    have = {r["brand"] for r in rows}
    rows = [{**r, "scrape_date": scrape_date} for r in rows]
    rows += [{"scrape_date": scrape_date, "brand": b, "offer_id": "none", "title": "", "description": "", "product_id": None}
             for b in checked if b not in have]
    return _upsert(client, "brand_offers", rows, "scrape_date,brand,offer_id") if rows else 0


async def run_market_signals(client, scrape_date: str, shelf_rows: list[dict] | None = None, offers: bool = True) -> dict:
    stats: dict = {}
    async with async_playwright() as pw:
        browser, ctx, page = await open_browser(pw)
        try:
            try:
                home = await read_homepage(page)
                stats["homepage"] = {"banners": len(home), "written": save_homepage(client, scrape_date, home)}
            except BlockedError:
                raise
            except Exception as e:  # noqa: BLE001
                log.error("homepage read failed (non-fatal): %s", e); stats["homepage"] = {"error": str(e)[:200]}
            if offers:
                targets = offer_targets(client, scrape_date, shelf_rows)
                rows, st = await read_offers(page, targets)
                st["written"] = save_offers(client, scrape_date, rows, [b for b, _ in targets])
                stats["offers"] = st
        finally:
            await browser.close()
    return stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--homepage", action="store_true", help="homepage only, no brand offers")
    args = ap.parse_args()
    logging.basicConfig(level=config.LOG_LEVEL, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
                        datefmt="%H:%M:%S", stream=sys.stdout)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    if not os.getenv("SUPABASE_URL"):
        log.error("SUPABASE_URL not set"); return 2
    client = connect()
    day = datetime.now(timezone.utc).date().isoformat()
    try:
        log.info("market signals: %s", asyncio.run(run_market_signals(client, day, offers=not args.homepage)))
    except BlockedError as e:
        log.error("BLOCKED: %s", e); return 1
    return 0


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    sys.exit(main())
