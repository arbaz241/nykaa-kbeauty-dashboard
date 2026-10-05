"""Who each anchor product actually competes with: the comparison set for USP analysis.

    python -m scraper.rivals            # print the anchor products and their rivals (no AI, no Nykaa requests)

Anchor products: chosen by the owner (ANCHOR_PRODUCTS), the Innisfree products that matter.

Five rivals per anchor product (owner's rule, 5 Oct):
  3 Korean    a) doing the same job: same category, a shared main benefit, the same product type and the same
                 defining active (a retinol ampoule's rivals contain a retinoid); shelf price within ±40% (and
                 per ml within ±60% when both sizes are known), widened to ±60% only when nothing fits at all;
                 a product at the same price point (shelf price within 15%) ranks first, then per-ml closeness;
              b) from the Korean brands doing best on Nykaa (average daily top-100 places across all shelves),
                 one product per brand, that brand's most popular matching product;
  1 Indian    the closest product of the same job from the Indian market leaders (most popular first), any price;
  1 global    the closest product of the same job from a non-Korean, non-Indian brand at a similar price
              (±40%, widened to ±60% only when nothing fits).
"Same job": the rival covers at least half of the anchor's benefits, and each product's main job (the benefit
its title leads with) is among the other's benefits. RIVAL_OVERRIDES holds the owner's manual corrections.
"Popular" = average position in the category over the last HISTORY_DAYS collected days, paid slots included
(a product in a bought slot is still in front of shoppers), then number of ratings. Kits, sets, minis and
refills are left out, and every rival needs MIN_RATINGS ratings.
"""
from __future__ import annotations

import logging
import re
import sys
from collections import defaultdict

from . import config
from .db import connect, fetch_all

log = logging.getLogger("rivals")

# the owner's choice of Innisfree products to analyse (5 Oct 2026): product id -> category
ANCHOR_PRODUCTS = {
    "22854035": "toner",              # Green Tea Ceramide Milky Toner
    "79599": "face_moisturizer",      # Green Tea Seed Cream
    "79585": "face_moisturizer",      # Perfect 9 Intensive Cream EX
    "1272752": "serum",               # Hyaluronic Acid Green Tea Seed Serum
    "13237333": "serum",              # Retinol Cica Repair Ampoule
    "12452460": "serum",              # Vitamin C Green Tea Brightening Serum
    "566010": "sunscreen",            # Tone Up No Sebum Sunscreen EX
    "15986194": "sunscreen",          # Hyaluron Moist Sunscreen
    "18742425": "sunscreen",          # Green Tea Hyaluronic Sunscreen Serum
    "524311": "face_wash",            # Volcanic Clusters BHA Foaming Cleanser
    "8216952": "face_wash",           # Green Tea Amino Acid Foam Cleanser
    "322018": "masks",                # Super Volcanic Pore Clay Mask 2X
    "79589": "eye_care",              # Perfect 9 Repair Intensive Eye Cream
    "8216954": "eye_care",            # Green Tea Hyaluronic Glow Eye and Face Ball
    "13217099": "lip_balm",           # Dewy Tint Lip Balm
}
# owner's corrections, applied after the rule: anchor id -> {"add": {"korean"|"indian"|"global": [ids]}, "drop": [ids]}
RIVAL_OVERRIDES: dict[str, dict] = {}
KOREAN_RIVALS = 3
PRICE_BAND = 0.40           # ±40%: a rival is priced like the anchor
WIDE_BAND = 0.60            # used only when no product at all fits ±40% (owner, 5 Oct)
# categories whose rivals may sit on another shelf: tinted lip balms compete with lip tints
POOL_CATEGORIES = {"lip_balm": {"lip_balm", "lip_tint", "lip_care"}, "lip_care": {"lip_balm", "lip_tint", "lip_care"}}
# Nykaa's Korean Beauty store mixes every product type; its own sub-category says which shelf a product belongs to
STORE_L3 = {"Serums & Essence": "serum", "Toners & Mists": "toner", "Face Moisturizer & Day Cream": "face_moisturizer",
            "Night Cream": "face_moisturizer", "Face Sunscreen": "sunscreen", "Face Wash": "face_wash",
            "Cleansing Oils & Balm": "face_wash", "Sheet Masks": "sheet_mask", "Masks & Peels": "masks", "Face Packs": "masks",
            "Under Eye Cream & Serums": "eye_care", "Lip Tint": "lip_tint", "Lip Balm": "lip_balm", "Lip Masks": "lip_balm"}
LIP = re.compile(r"\blip\b.*\b(balm|tint|oil|gloss|glow)|\b(lip balm|lip tint|lip oil|lip gloss|lip glow)", re.I)

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
    "glossy": r"gloss|glossy|shine|glass|juicy|jelly|glow",
}
# what the product physically is: a pad or a mist is not a toner's rival even when Nykaa files it there
FORMATS = {
    "pad": r"\bpads?\b", "mist": r"\bmist|spray\b|thermal water|facial spray", "serum": r"serum|ampoule|booster|\boil\b",
    "sheet": r"sheet|\bpatch|strips?\b", "wash_off_mask": r"clay|wash[- ]?off|peel[- ]?off|sleeping|overnight|\bpack\b",
    "gel": r"\bgel\b|jelly", "lotion": r"lotion|emulsion|fluid|milk\b", "cream": r"cream|balm|moisturi[sz]er",
    "stick": r"\bstick", "foam": r"foam|wash|cleanser|gel cleanser", "toner": r"toner|essence|water\b",
    "sleeping_mask": r"sleeping|overnight|night mask|sleep mask", "scrub": r"scrub|exfoliating gel|peeling gel",
    "tint": r"\btint|\bbb\b|\bcc\b|cushion", "cleansing_oil": r"cleansing (oil|balm|water)|micellar",
    "lip_oil": r"lip oil|\boil\b", "lip_gloss": r"gloss", "lip_balm": r"balm|lip care|lip treatment|lip mask",
    "lip_stain": r"tint|stain|water|velvet|matte|cheek|mousse",
    "lash": r"lash|brow", "roller": r"\bball\b|roller|roll[- ]on",
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
        "lip_balm": ["lip_balm", "lip_oil", "lip_gloss", "lip_stain"],
        "lip_tint": ["lip_balm", "lip_oil", "lip_gloss", "lip_stain"],
        "lip_care": ["lip_balm", "lip_oil", "lip_gloss", "lip_stain"],
        "eye_care": ["lash", "roller", "pad", "sheet", "stick", "serum", "gel", "cream"],
    }.get(category, ["pad", "mist", "sheet", "stick", "serum", "wash_off_mask", "toner", "lotion", "gel", "cream", "foam"])
    return next((f for f in order if re.search(FORMATS[f], n)), None)


def primary_tag(name: str) -> str | None:
    """The benefit a title leads with: its main job (\"Vitamin C ... Hydrating Serum\" is a vitamin C serum)."""
    t = name.lower()
    hits = [(m.start(), k) for k, pat in TAGS.items() for m in [re.search(pat, t)] if m]
    return min(hits)[1] if hits else None


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
    pid_brand = {r["product_id"]: r["brand"] for r in fetch_all(lambda: client.table("products").select("product_id,brand").order("product_id"))}
    brand_places: dict[str, int] = defaultdict(int)
    for r in fetch_all(lambda: client.table("scrape_snapshots").select("scrape_date,subcategory,product_id,rank,is_ad")
                       .gte("scrape_date", days[0]).neq("subcategory", "kbeauty_store").order("scrape_date").order("subcategory").order("rank")):
        hist[(r["subcategory"], r["product_id"])].append((r["rank"], r["is_ad"]))
        shelf_days[r["subcategory"]].add(r["scrape_date"])
        brand_places[pid_brand.get(r["product_id"], "")] += 1
    # how well each brand does on Nykaa overall: average top-100 places a day across all tracked shelves
    strength = {b: n / max(1, len(days)) for b, n in brand_places.items()}
    out: dict[tuple[str, str], dict] = {}
    for r in fetch_all(lambda: client.table("web_latest_shelf").select("product_id,brand,name,price,pack_size,rating_count,rank,subcategory,origin,is_ad")
                       .neq("subcategory", "kbeauty_store").order("subcategory").order("rank")):
        out[(r["subcategory"], r["product_id"])] = {**r, "price": float(r["price"] or 0)}
    for r in fetch_all(lambda: client.table("web_latest_shelf").select("product_id,brand,name,price,pack_size,rating_count,nykaa_l3,origin")
                       .eq("subcategory", "kbeauty_store").order("rank")):
        cat = STORE_L3.get(r.get("nykaa_l3") or "")
        if cat:
            out.setdefault((cat, r["product_id"]), {**r, "subcategory": cat, "rank": None, "price": float(r["price"] or 0)})
    for r in fetch_all(lambda: client.table("web_brand_catalog").select("product_id,brand,name,price,pack_size,rating_count,subcategories,in_stock").order("brand").order("product_id")):
        if r.get("in_stock") is False:
            continue
        cats = list(r["subcategories"] or [])
        if not cats and LIP.search(r["name"]):
            cats = ["lip_balm"]           # lip balms are not on a tracked shelf; the catalogues still list them
        for s in cats:
            out.setdefault((s, r["product_id"]), {**r, "subcategory": s, "rank": None, "origin": origin.get(r["brand"], "unknown"), "price": float(r["price"] or 0)})
    rows = []
    for p in out.values():
        d = details.get(p["product_id"], {})
        # the job is read from the title first; Nykaa's concern fields are broad ("hydration" on most products)
        p["name_tags"] = tags_for(p["name"])
        p["tags"] = p["name_tags"] or tags_for(" ".join([*(d.get("concerns") or []), *(d.get("key_ingredients") or [])]))
        p["format"] = format_of(p["name"], p["subcategory"]) or CATEGORY_DEFAULT_FORMAT.get(p["subcategory"])
        p["primary"] = primary_tag(p["name"]) or next(iter(sorted(p["tags"])), None)
        variant = next((v.get("pack_size") for v in (d.get("variants") or []) if v.get("price") and abs(float(v["price"]) - p["price"]) < 1), None)
        p["amount"] = pack_amount(p.get("pack_size"), variant, p["name"])
        h = hist.get((p["subcategory"], p["product_id"]), [])
        n_days = len(shelf_days.get(p["subcategory"], ())) or 1
        p["days_in_top100"] = len(h)
        p["avg_position"] = (sum(rk for rk, _ in h) + 101 * (n_days - len(h))) / n_days if h else None
        p["paid_days"] = sum(1 for _, ad in h if ad)
        p["korean"] = p["origin"] == "kbeauty"
        p["brand_strength"] = strength.get(p["brand"], 0.0)
        rows.append(p)
    return rows


def popularity(p: dict) -> tuple:
    return (p.get("avg_position") is None, p.get("avg_position") or 0, -(p.get("rating_count") or 0))


def anchor_products(rows: list[dict]) -> list[dict]:
    by = {(p["subcategory"], p["product_id"]): p for p in rows}
    out = []
    for pid, cat in ANCHOR_PRODUCTS.items():
        # once a product reaches a tracked shelf (e.g. the lip balm on Lip care) it may sit under another key
        p = by.get((cat, pid)) or next((r for (c, i), r in by.items() if i == pid), None)
        if p is None:
            log.warning("anchor product %s (%s) not found today", pid, cat)
            continue
        out.append(p)
    return out


def rivals_for(a: dict, rows: list[dict], anchor: str = config.ANCHOR_BRAND) -> dict:
    # the shelf price a shopper compares comes first; per ml/g refines it when both pack sizes are known
    def shelf_gap(p: dict) -> float:
        return abs(p["price"] - a["price"]) / a["price"] if a["price"] > 0 else 9.0

    def ml_gap(p: dict) -> float | None:
        if a["amount"] and p["amount"]:
            ap, pp = a["price"] / a["amount"], p["price"] / p["amount"]
            return abs(pp - ap) / ap
        return None

    def price_fits(p: dict, band: float) -> bool:
        g = ml_gap(p)      # same shelf price for a much smaller pack is not the same price point
        return shelf_gap(p) <= band and (g is None or g <= band + 0.2)

    def price_rank(p: dict) -> tuple:
        g = ml_gap(p)
        return (0 if shelf_gap(p) <= 0.15 else 1, g if g is not None else shelf_gap(p))

    def closeness(p):
        # how much of the anchor's job the rival covers; a rival claiming extra benefits is not penalised
        # (a "ceramide & rice" toner still does a ceramide toner's job)
        # and both products' main jobs (the benefit each title leads with) must be part of the other's
        cover = len(p["tags"] & a["tags"]) / max(1, len(a["tags"]))
        shared_signature = bool(p["tags"] & a["tags"] & SIGNATURE)
        mutual = p["primary"] in a["tags"] and a["primary"] in p["tags"]
        one_way = p["primary"] in a["tags"] or a["primary"] in p["tags"]
        if mutual and (cover >= 0.5 or shared_signature):
            return 0
        if one_way and (cover >= 0.5 or shared_signature):
            return 1
        return 2

    cats = POOL_CATEGORIES.get(a["subcategory"], {a["subcategory"]})
    anchor_kit = bool(EXCLUDE_FORMAT.search(a["name"]))
    same_job = [p for p in rows
                if p["subcategory"] in cats and _norm(p["brand"]) != _norm(anchor) and p["price"] > 0
                and (anchor_kit or not EXCLUDE_FORMAT.search(p["name"]))
                and (p.get("rating_count") or 0) >= MIN_RATINGS
                and (not a["format"] or not p["format"] or p["format"] == a["format"])
                and (p["format"] != "lash" or a["format"] == "lash")
                and ("eye" in a["name"].lower()) == ("eye" in p["name"].lower() or a["subcategory"] == "eye_care")
                and (a["subcategory"] != "sunscreen" or re.search(r"spf|sun", p["name"], re.I))
                and (a["subcategory"] == "sunscreen" or not re.search(r"\bspf|sunscreen", p["name"], re.I))
                and (not (a["tags"] & SIGNATURE) or (p["tags"] & a["tags"] & SIGNATURE))
                and p["tags"] & a["tags"] and closeness(p) < 2]
    seen: set[str] = set()
    uniq = []
    for p in same_job:                   # a product listed on two shelves counts once
        if p["product_id"] not in seen:
            seen.add(p["product_id"]); uniq.append(p)

    # Korean: a) the same job at a similar price, b) from the brands doing best on Nykaa, their best matching product
    # price stays within ±40%; the band widens to ±60% only when not a single Korean product fits
    def korean_within(band):
        best_per_brand: dict[str, dict] = {}
        for p in sorted((p for p in uniq if p["korean"] and price_fits(p, band)), key=lambda p: (closeness(p), price_rank(p)[0], popularity(p))):
            best_per_brand.setdefault(p["brand"], p)
        # same job, then the same price point (shelf price within 15%), then the brands doing best on Nykaa,
        # then the closer price per ml, then popularity
        return sorted(best_per_brand.values(), key=lambda p: (closeness(p), price_rank(p)[0], -p["brand_strength"], price_rank(p)[1], popularity(p)))[:KOREAN_RIVALS]
    korean, korean_band = korean_within(PRICE_BAND), PRICE_BAND
    if not korean:
        korean, korean_band = korean_within(WIDE_BAND), WIDE_BAND
    # Indian: closest product of the same job, market leaders first, any price
    indian = min((p for p in uniq if p["origin"] == "local"), key=lambda p: (closeness(p), popularity(p)), default=None)
    # global: closest product of the same job at a similar price
    def pick_global(band):
        return min((p for p in uniq if p["origin"] == "global" and price_fits(p, band)), key=lambda p: (closeness(p), price_rank(p)[0], popularity(p)), default=None)
    glob, global_band = pick_global(PRICE_BAND), PRICE_BAND
    if glob is None:
        glob, global_band = pick_global(WIDE_BAND), WIDE_BAND
    o = RIVAL_OVERRIDES.get(a["product_id"])
    if o:
        by_id = {p["product_id"]: p for p in rows}
        drop = set(o.get("drop", []))
        korean = [p for p in korean if p["product_id"] not in drop]
        korean = ([by_id[i] for i in o.get("add", {}).get("korean", []) if i in by_id] + korean)[:KOREAN_RIVALS]
        if o.get("add", {}).get("indian"): indian = by_id.get(o["add"]["indian"][0], indian)
        if o.get("add", {}).get("global"): glob = by_id.get(o["add"]["global"][0], glob)
        if indian and indian["product_id"] in drop: indian = None
        if glob and glob["product_id"] in drop: glob = None
    return {"korean": korean, "indian": indian, "global": glob, "korean_band": korean_band, "global_band": global_band}


def comparison_set(client) -> list[dict]:
    """Anchor products and their rivals, as {product_id, brand, name} (anchor products first)."""
    rows = load(client)
    out: dict[str, dict] = {}
    for a in anchor_products(rows):
        r = rivals_for(a, rows)
        for p in [a, *r["korean"], *[x for x in (r["indian"], r["global"]) if x]]:
            out.setdefault(p["product_id"], {"product_id": p["product_id"], "brand": p["brand"], "name": p["name"]})
    return list(out.values())


def main() -> int:
    from dotenv import load_dotenv
    load_dotenv()
    logging.basicConfig(level=logging.WARNING)
    rows = load(connect())
    anchors = anchor_products(rows)
    def fmt(p):
        strength = f" | brand {p['brand_strength']:.0f}/day" if p.get("brand_strength") else ""
        per = f" (₹{p['price'] / p['amount']:.1f}/ml)" if p["amount"] else ""
        pos = f"avg #{p['avg_position']:.0f} ({p['days_in_top100']}d in top 100{', ' + str(p['paid_days']) + ' paid' if p['paid_days'] else ''})" if p.get("avg_position") else "not in top 100"
        return f"{p['brand']} — {p['name'][:62]} | ₹{p['price']:.0f}{per} | {pos} | {p.get('rating_count') or 0} ratings{strength} | {','.join(sorted(p['tags']))}"
    for a in anchors:
        r = rivals_for(a, rows)
        print(f"\n[{a['subcategory']}] ANCHOR {fmt(a)}")
        for p in r["korean"]:
            print(f"    K   {fmt(p)}")
        print(f"    IN  {fmt(r['indian']) if r['indian'] else '— none'}")
        print(f"    GL  {fmt(r['global']) if r['global'] else '— none'}")
    print(f"\n{len(anchors)} anchor products")
    return 0


if __name__ == "__main__":
    sys.exit(main())
