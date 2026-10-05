"""Who each anchor product actually competes with: the comparison set for USP analysis.

    python -m scraper.rivals            # print the anchor products and their rivals (no AI, no Nykaa requests)

Anchor products: the anchor brand's top ANCHOR_TOP_N products in every category it sells in, one listing per
product (sizes that share a review pool collapse to one), each product in one category only.

Rivals of an anchor product, in order:
  1. same category, and doing the same job: they share a benefit tag read from the name and Nykaa's
     concern/ingredient fields (a hydrating milky toner is not compared with a glycolic exfoliating toner);
  2. no kits, sets, combos, minis or refills unless the anchor is one;
  3. price within PRICE_BAND of the anchor, per ml/g when both pack sizes are known, else per pack;
  4. Korean brands first, one product per brand, most popular first: average position in the category over
     the last HISTORY_DAYS collected days (a day off the top 100 counts as 101; paid slots count, because a
     product holding a bought slot is still in front of shoppers), then ratings;
  5. one market reference: the most popular non-Korean product doing the same job inside the same price band
     (none if there is none: a half-price mass product is not a direct rival).
"""
from __future__ import annotations

import logging
import re
import sys
from collections import defaultdict

from . import config
from .db import connect, fetch_all

log = logging.getLogger("rivals")

ANCHOR_TOP_N = 5
KOREAN_RIVALS = 4
PRICE_BAND = 0.40           # ±40%

# benefit/job tags, matched as whole-word stems in name + concerns + key ingredients
TAGS = {
    "hydrating": r"hydrat|hyaluron|moist|aqua|water ?gel|dewy|plump|milky|milk\b|essence",
    "barrier": r"barrier|ceramide|cerapeptide|repair|panthenol|madecass",
    "soothing": r"sooth|calm|cica|centella|heartleaf|aloe|tea tree|sensitive|redness|mugwort|propolis",
    "brightening": r"bright|vitamin c|niacinamide|tone[- ]?up|dark spot|pigment|radian|whiten|rice|txa|tranexamic|arbutin",
    "exfoliating": r"exfoliat|glycolic|\baha\b|\bbha\b|\bpha\b|salicylic|lactic|peel|acid toner",
    "pore_oil": r"\bpore|sebum|oil[- ]?control|oily|blackhead|volcanic|clay|charcoal|matte|mattif|no sebum",
    "acne": r"acne|blemish|trouble|pimple|breakout",
    "retinoid": r"retinol|retinal|retinoid|vita-a|bakuchiol",
    "anti_aging": r"anti[- ]?aging|wrinkle|firm|retinol|retinal|bakuchiol|peptide|collagen|elastic|lift|perfect 9|ginseng|snail",
    "cleansing_oil": r"cleansing (oil|balm|water)|micellar|makeup remov",
    "tinted": r"tint|tone[- ]?up|bb\b|cc\b|cushion",
}
# what the product physically is: a pad or a mist is not a toner's rival even when Nykaa files it there
FORMATS = {
    "pad": r"\bpads?\b", "mist": r"\bmist|spray\b|thermal water|facial spray", "serum": r"serum|ampoule|booster|\boil\b",
    "sheet": r"sheet|\bpatch", "wash_off_mask": r"clay|wash[- ]?off|peel[- ]?off|sleeping|overnight|\bpack\b",
    "gel": r"\bgel\b|jelly", "lotion": r"lotion|emulsion|fluid|milk\b", "cream": r"cream|balm|moisturi[sz]er",
    "stick": r"\bstick", "foam": r"foam|wash|cleanser|gel cleanser", "toner": r"toner|essence|water\b",
    "sleeping_mask": r"sleeping|overnight|night mask|sleep mask", "scrub": r"scrub|exfoliating gel|peeling gel",
    "tint": r"\btint|\bbb\b|\bcc\b|cushion", "cleansing_oil": r"cleansing (oil|balm|water)|micellar",
}
# a product defined by an active or a specific job only competes with products sharing it: a retinol
# ampoule's rivals contain a retinoid, an acne cleanser's rivals treat acne
SIGNATURE = {"retinoid", "exfoliating", "acne", "pore_oil", "tinted", "cleansing_oil"}
MIN_RATINGS = 50
HISTORY_DAYS = 14            # "popular right now" needs some buyers behind it
EXCLUDE_FORMAT = re.compile(r"\b(kit|set|combo|duo|trio|mini|travel|refill|bundle|gift|routine)\b", re.I)


CATEGORY_DEFAULT_FORMAT = {"sheet_mask": "sheet", "masks": "wash_off_mask", "face_wash": "foam", "toner": "toner", "serum": "serum"}


def format_of(name: str, category: str) -> str | None:
    n = name.lower()
    order = {
        "toner": ["pad", "mist", "serum", "toner", "lotion"],
        "face_moisturizer": ["sleeping_mask", "serum", "mist", "tint", "gel", "lotion", "cream"],
        "face_wash": ["cleansing_oil", "scrub", "foam"],
        "sheet_mask": ["scrub", "wash_off_mask", "sleeping_mask", "sheet"],
        "masks": ["sheet", "sleeping_mask", "scrub", "wash_off_mask"],
        "sunscreen": ["stick", "tint", "serum", "gel", "lotion", "cream"],
        "serum": ["pad", "mist", "toner", "lotion", "cream", "serum"],
    }.get(category, ["pad", "mist", "sheet", "stick", "serum", "wash_off_mask", "toner", "lotion", "gel", "cream", "foam"])
    return next((f for f in order if re.search(FORMATS[f], n)), None)


def tags_for(text: str) -> set[str]:
    t = text.lower()
    return {k for k, pat in TAGS.items() if re.search(pat, t)}


def pack_amount(*texts: str | None) -> float | None:
    for s in texts:
        m = re.search(r"(\d+(?:\.\d+)?)\s*(ml|g|gm|gms|grams?)\b", s or "", re.I)
        if m:
            return float(m.group(1))
    return None


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def load(client) -> list[dict]:
    """Every product we can place: today's shelves plus the focus brands' full catalogues."""
    origin = {r["brand"]: r["origin"] for r in fetch_all(lambda: client.table("brand_classification").select("brand,origin").order("brand"))}
    details = {r["product_id"]: r for r in fetch_all(lambda: client.table("product_details").select("product_id,concerns,key_ingredients,variants").order("product_id"))}
    # shelf history: each product's average position per category over the recent collected days
    days = sorted({r["scrape_date"] for r in fetch_all(lambda: client.table("web_share_daily").select("scrape_date,subcategory").order("scrape_date"))})[-HISTORY_DAYS:]
    hist: dict[tuple[str, str], list] = defaultdict(list)
    shelf_days: dict[str, set] = defaultdict(set)
    for r in fetch_all(lambda: client.table("scrape_snapshots").select("scrape_date,subcategory,product_id,rank,is_ad")
                       .gte("scrape_date", days[0]).neq("subcategory", "kbeauty_store").order("scrape_date").order("subcategory").order("rank")):
        hist[(r["subcategory"], r["product_id"])].append((r["rank"], r["is_ad"]))
        shelf_days[r["subcategory"]].add(r["scrape_date"])
    out: dict[tuple[str, str], dict] = {}
    for r in fetch_all(lambda: client.table("web_latest_shelf").select("product_id,brand,name,price,pack_size,rating_count,rank,subcategory,origin,is_ad")
                       .neq("subcategory", "kbeauty_store").order("subcategory").order("rank")):
        out[(r["subcategory"], r["product_id"])] = {**r, "price": float(r["price"] or 0)}
    for r in fetch_all(lambda: client.table("web_brand_catalog").select("product_id,brand,name,price,pack_size,rating_count,subcategories,in_stock").order("brand").order("product_id")):
        if r.get("in_stock") is False:
            continue
        for s in r["subcategories"] or []:
            out.setdefault((s, r["product_id"]), {**r, "subcategory": s, "rank": None, "origin": origin.get(r["brand"], "unknown"), "price": float(r["price"] or 0)})
    rows = []
    for p in out.values():
        d = details.get(p["product_id"], {})
        # the job is read from the title first; Nykaa's concern fields are broad ("hydration" on most products)
        p["name_tags"] = tags_for(p["name"])
        p["tags"] = p["name_tags"] or tags_for(" ".join([*(d.get("concerns") or []), *(d.get("key_ingredients") or [])]))
        p["format"] = format_of(p["name"], p["subcategory"]) or CATEGORY_DEFAULT_FORMAT.get(p["subcategory"])
        variant = next((v.get("pack_size") for v in (d.get("variants") or []) if v.get("price") and abs(float(v["price"]) - p["price"]) < 1), None)
        p["amount"] = pack_amount(p.get("pack_size"), variant, p["name"])
        h = hist.get((p["subcategory"], p["product_id"]), [])
        n_days = len(shelf_days.get(p["subcategory"], ())) or 1
        p["days_in_top100"] = len(h)
        p["avg_position"] = (sum(rk for rk, _ in h) + 101 * (n_days - len(h))) / n_days if h else None
        p["paid_days"] = sum(1 for _, ad in h if ad)
        p["korean"] = p["origin"] == "kbeauty"
        rows.append(p)
    return rows


def popularity(p: dict) -> tuple:
    return (p.get("avg_position") is None, p.get("avg_position") or 0, -(p.get("rating_count") or 0))


def anchor_products(rows: list[dict], anchor: str = config.ANCHOR_BRAND) -> list[dict]:
    mine = [p for p in rows if _norm(p["brand"]) == _norm(anchor) and p["price"] > 0]
    # one category per product: where it ranks, else the first category Nykaa files it under
    first_cat: dict[str, str] = {}
    for p in sorted(mine, key=popularity):
        first_cat.setdefault(p["product_id"], p["subcategory"])
    out = []
    for cat in sorted({p["subcategory"] for p in mine}):
        seen_pool: set = set(); picked = []
        for p in sorted((p for p in mine if p["subcategory"] == cat and first_cat[p["product_id"]] == cat), key=popularity):
            # sizes of one product share a review pool (same ratings count) and a title; minis and kits repeat a full size
            pool = (p.get("rating_count") or 0, _norm(p["name"])[:30])
            if pool in seen_pool or EXCLUDE_FORMAT.search(p["name"]):
                continue
            seen_pool.add(pool); picked.append(p)
            if len(picked) == ANCHOR_TOP_N:
                break
        out += picked
    return out


def rivals_for(a: dict, rows: list[dict], anchor: str = config.ANCHOR_BRAND) -> dict:
    def comparable_price(p: dict) -> bool:
        if a["amount"] and p["amount"]:
            ap, pp = a["price"] / a["amount"], p["price"] / p["amount"]
        else:
            ap, pp = a["price"], p["price"]
        return ap > 0 and abs(pp - ap) / ap <= PRICE_BAND
    anchor_kit = bool(EXCLUDE_FORMAT.search(a["name"]))
    pool = [p for p in rows
            if p["subcategory"] == a["subcategory"] and _norm(p["brand"]) != _norm(anchor) and p["price"] > 0
            and (anchor_kit or not EXCLUDE_FORMAT.search(p["name"]))
            and (p.get("rating_count") or 0) >= MIN_RATINGS
            and (not a["format"] or not p["format"] or p["format"] == a["format"])
            and ("eye" in a["name"].lower()) == ("eye" in p["name"].lower() or a["subcategory"] == "eye_care")
            and (a["subcategory"] != "sunscreen" or re.search(r"spf|sun", p["name"], re.I))
            and (a["subcategory"] == "sunscreen" or not re.search(r"\bspf|sunscreen", p["name"], re.I))
            and (not (a["tags"] & SIGNATURE) or (p["tags"] & a["tags"] & SIGNATURE))
            and p["tags"] & a["tags"] and comparable_price(p)]
    # closest job first (share of benefit tags in common, in bands), then most popular
    def closeness(p):
        j = len(p["tags"] & a["tags"]) / max(1, len(p["tags"] | a["tags"]))
        shared_signature = bool(p["tags"] & a["tags"] & SIGNATURE)
        return 0 if j >= 0.5 or (shared_signature and j >= 0.25) else 1 if j >= 0.3 or shared_signature else 2
    pool = [p for p in pool if closeness(p) < 2]      # under ~30% of benefits in common is a different job
    pool.sort(key=lambda p: (closeness(p), popularity(p)))
    korean, brands = [], set()
    for p in pool:
        if p["korean"] and p["brand"] not in brands:
            korean.append(p); brands.add(p["brand"])
        if len(korean) == KOREAN_RIVALS:
            break
    reference = next((p for p in pool if not p["korean"]), None)
    return {"korean": korean, "reference": reference, "pool_size": len(pool)}


def comparison_set(client) -> list[dict]:
    """Anchor products and their rivals, as {product_id, brand, name} (anchor products first)."""
    rows = load(client)
    out: dict[str, dict] = {}
    for a in anchor_products(rows):
        r = rivals_for(a, rows)
        for p in [a, *r["korean"], *([r["reference"]] if r["reference"] else [])]:
            out.setdefault(p["product_id"], {"product_id": p["product_id"], "brand": p["brand"], "name": p["name"]})
    return list(out.values())


def main() -> int:
    from dotenv import load_dotenv
    load_dotenv()
    logging.basicConfig(level=logging.WARNING)
    rows = load(connect())
    anchors = anchor_products(rows)
    def fmt(p):
        per = f" (₹{p['price'] / p['amount']:.1f}/ml)" if p["amount"] else ""
        pos = f"avg #{p['avg_position']:.0f} ({p['days_in_top100']}d in top 100{', ' + str(p['paid_days']) + ' paid' if p['paid_days'] else ''})" if p.get("avg_position") else "not in top 100"
        return f"{p['brand']} — {p['name'][:62]} | ₹{p['price']:.0f}{per} | {pos} | {p.get('rating_count') or 0} ratings | {','.join(sorted(p['tags']))}"
    for a in anchors:
        r = rivals_for(a, rows)
        print(f"\n[{a['subcategory']}] ANCHOR {fmt(a)}")
        for p in r["korean"]:
            print(f"    K   {fmt(p)}")
        print(f"    REF {fmt(r['reference']) if r['reference'] else '— none in band'}")
    print(f"\n{len(anchors)} anchor products")
    return 0


if __name__ == "__main__":
    sys.exit(main())
