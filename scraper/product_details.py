"""Product detail enrichment via Nykaa's product-details API.

  GET /app-api/index.php/products/details?product_id=<id>   (browser-session fetch only)

Fetched ONCE per product (details rarely change), cached locally under
data/cache/product_details/<id>.json and upserted into Supabase
product_details. Per-run cap keeps daily volume small; the one-time backfill
is run locally with --all.

What we keep (see supabase/migrations/003_product_details.sql):
  country of origin (strong brand-origin signal), highlight attributes
  (formulation, skin type, concern, ingredient, preference), Nykaa's AI
  summary (USP proxy), description text, key + full ingredients, how to use,
  review key phrases with sentiment, star split-up, variants, image.
"""
from __future__ import annotations

import asyncio
import html as htmllib
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from playwright.async_api import Page

from . import config
from .nykaa import BlockedError

log = logging.getLogger("details")
CACHE_DIR = Path(config.DATA_DIR) / "cache" / "product_details"
DETAILS_URL = "https://www.nykaa.com/app-api/index.php/products/details?product_id={product_id}"

_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")


def _text(s: str | None, cap: int | None = None) -> str | None:
    if not s:
        return None
    s = re.sub(r"<style.*?</style>|<script.*?</script>", " ", s, flags=re.S | re.I)
    s = re.sub(r"</(p|li|div|h\d|br|tr)>|<br\s*/?>", "\n", s, flags=re.I)
    s = htmllib.unescape(_TAG.sub(" ", s))
    s = "\n".join(_WS.sub(" ", line).strip() for line in s.splitlines())
    s = re.sub(r"\n{2,}", "\n", s).strip()
    return s[:cap] if cap else s


def _split_list(v: str | None) -> list[str]:
    """Nykaa separates attribute values with commas; keep slashes ("Dark Spots/Pigmentation") intact."""
    return [x.strip() for x in (v or "").split(",") if x.strip()]


def parse_details(resp: dict) -> dict:
    """Nykaa details API `response` -> product_details row."""
    attrs: dict[str, str] = {}
    for sec in resp.get("pdp_sections") or []:
        for w in sec.get("child_widgets") or []:
            for a in w.get("attributes") or []:
                if a.get("label") and a.get("value"):
                    attrs[a["label"].strip()] = str(a["value"]).strip()

    ingredients_html = resp.get("ingredients") or ""
    key_from_block = [htmllib.unescape(m).strip(" :") for m in re.findall(r"<b>([^<]{2,60}?):?</b>", ingredients_html)
                      if not re.search(r"key ingredients|full ingredient", m, re.I)]
    key_ings = list(dict.fromkeys(_split_list(attrs.get("Ingredient")) + key_from_block))[:12]
    full = None
    m = re.search(r"Full Ingredient List\s*:?\s*</b>\s*(.*)", ingredients_html, re.S | re.I)
    if m:
        full = _text(m.group(1), 3000)

    ai = resp.get("ai_summary") or {}
    usp_summary, usp_points = None, []
    for sec in ai.get("sections") or []:
        items = [i.get("text") for i in sec.get("items") or [] if i.get("text")]
        if sec.get("sectionType") == "HEADER" and items and not usp_summary:
            usp_summary = items[0]
        elif items and re.search(r"like", sec.get("label") or "", re.I):
            usp_points = items[:6]

    phrases = [{"text": p.get("display_text"), "sentiment": p.get("sentiment"), "rank": int(p["rank"]) if str(p.get("rank", "")).isdigit() else None}
               for p in resp.get("review_key_phrase_v2") or [] if p.get("display_text")]
    split = {str(int(float(s["id"]))): int(s["count"]) for s in resp.get("review_splitup") or [] if s.get("id") is not None and s.get("count")}
    variants = [{"sku": o.get("sku"), "pack_size": o.get("pack_size"), "mrp": o.get("price"), "price": o.get("final_price"),
                 "in_stock": o.get("is_saleable")} for o in (resp.get("options") or [])[:12]]

    return {
        "product_id": str(resp.get("id") or resp.get("parent_id")),
        "country_of_origin": resp.get("country_of_origin") or None,
        "country_name": resp.get("origin_of_country_name") or None,
        "manufacturer_name": resp.get("manufacturer_name") or None,
        "seller_name": resp.get("seller_name") or None,
        "formulation": attrs.get("Formulation"),
        "skin_types": _split_list(attrs.get("Skin Type")),
        "concerns": _split_list(attrs.get("Concern")),
        "key_ingredients": key_ings,
        "preferences": _split_list(attrs.get("Preference")),
        "attributes": attrs,
        "usp_summary": usp_summary,
        "usp_points": usp_points,
        "description_text": _text(resp.get("description"), 2000),
        "full_ingredients": full,
        "how_to_use": _text(resp.get("use"), 800),
        "review_key_phrases": phrases,
        "review_splitup": split,
        "review_count": int(resp["review_count"]) if str(resp.get("review_count", "")).isdigit() else None,
        "expiry_text": resp.get("expdt") or None,
        "variants": variants,
        "image_url": resp.get("image_url") or None,
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


async def fetch_details(page: Page, product_id: str) -> dict:
    url = DETAILS_URL.format(product_id=product_id)
    status, body = await page.evaluate(
        "async (u) => { const r = await fetch(u, {credentials:'include'}); return [r.status, await r.text()]; }", url)
    if status == 403 or "Access Denied" in body[:300]:
        raise BlockedError(f"details API 403 for {product_id}")
    if status != 200:
        raise RuntimeError(f"details HTTP {status} for {product_id}: {body[:100]!r}")
    d = json.loads(body)
    resp = d.get("response")
    if not resp or not resp.get("id"):
        raise RuntimeError(f"details empty for {product_id} (status={d.get('status')})")
    return resp


def cached_ids() -> set[str]:
    return {p.stem for p in CACHE_DIR.glob("*.json")} if CACHE_DIR.exists() else set()


async def enrich_details(page: Page, product_ids: list[str], max_products: int | None = None) -> tuple[list[dict], dict]:
    """Fetch details for products not yet cached. Returns (parsed rows, stats)."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    have = cached_ids()
    todo = [pid for pid in dict.fromkeys(product_ids) if pid not in have]
    cap = max_products if max_products is not None else config.DETAILS_MAX_PER_RUN
    deferred = max(0, len(todo) - cap)
    todo = todo[:cap]
    rows, stats = [], {"candidates": len(product_ids), "already_cached": len(product_ids) - len(todo) - deferred,
                       "fetched": 0, "deferred": deferred, "errors": 0}
    for pid in todo:
        try:
            resp = await fetch_details(page, pid)
        except BlockedError:
            raise
        except Exception as e:  # noqa: BLE001
            stats["errors"] += 1
            log.warning("details %s failed: %s", pid, e)
            await asyncio.sleep(config.DETAILS_DELAY_SEC)
            continue
        slim = {k: v for k, v in resp.items() if k not in ("carousel", "all_images", "options", "siblings", "related_video", "policy_widget", "delivery_data", "shipping_data", "return_data", "tags_assets")}
        slim["options"] = [{k: o.get(k) for k in ("sku", "pack_size", "price", "final_price", "is_saleable")} for o in (resp.get("options") or [])[:12]]
        (CACHE_DIR / f"{pid}.json").write_text(json.dumps(slim, ensure_ascii=False))
        row = parse_details(resp)
        row["product_id"] = pid  # details may report a child/sibling id; key on the listing id
        rows.append(row)
        stats["fetched"] += 1
        await asyncio.sleep(config.DETAILS_DELAY_SEC)
    log.info("details: %s", stats)
    return rows, stats


def rows_from_cache(product_ids: list[str] | None = None) -> list[dict]:
    """Re-parse cached raw responses (e.g. after a parser change) into rows."""
    out = []
    for p in sorted(CACHE_DIR.glob("*.json")) if CACHE_DIR.exists() else []:
        if product_ids is not None and p.stem not in set(product_ids):
            continue
        try:
            row = parse_details(json.loads(p.read_text())); row["product_id"] = p.stem; out.append(row)
        except Exception as e:  # noqa: BLE001
            log.warning("cache %s unparseable: %s", p.name, e)
    return out
