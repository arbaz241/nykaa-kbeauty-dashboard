"""Brand origin classification: kbeauty | local (India) | global | unknown.

Resolution order for a brand:
  1. Seed list (scraper/seed/brand_classification.csv) — curated defaults,
     source="seed". Still confirmed=False until the owner confirms them.
     In Phase 3 the seed is loaded into the Supabase brand_classification
     table once; from then on that table is the source of truth and edits
     happen there, not here.
  2. Auto heuristics, source="auto", with an `evidence` string:
       a. country_of_origin from product details (KR -> kbeauty, IN -> local,
          anything else -> global) when a majority of the brand's detailed
          products agree                                    -> strongest signal
       b. any of the brand's products is in Nykaa's own "Korean Beauty" store
          category (in_kbeauty_store)                      -> kbeauty
       c. brand name contains korea/korean/seoul/k-beauty  -> kbeauty
       d. brand name contains ayurved/herbal/india/bharat  -> local
     Seed entries that contradict the country-of-origin majority keep the seed
     origin but get a "verify" note in evidence for the owner.
  3. Otherwise origin="unknown" — surfaced for the owner to classify.
Nothing auto-classified is ever marked confirmed.
"""
from __future__ import annotations

import csv
import re
from collections import defaultdict
from dataclasses import dataclass, asdict
from pathlib import Path

SEED_PATH = Path(__file__).parent / "seed" / "brand_classification.csv"

# "Korean positioning" by a non-Korean brand: product names that sell the
# product as Korean. Ingredient words alone (cica, snail, rice) are NOT enough
# — many Indian brands use them without claiming Korean origin.
_K_MARKETING = re.compile(r"\b(korea|korean|k-?beauty|glass skin|seoul|jeju|hanbang|k-?glow)\b", re.I)
ORIGINS = ("kbeauty", "local", "global", "unknown")

_K_PATTERNS = re.compile(r"\b(korea|korean|seoul|k-?beauty)\b", re.I)
_LOCAL_PATTERNS = re.compile(r"\b(ayurved\w*|herbals?|india|indian|bharat|desi)\b", re.I)


def norm(name: str) -> str:
    """Case/punctuation-insensitive key: "Dear, Klairs" == "dear klairs"."""
    return re.sub(r"[^a-z0-9]+", "", (name or "").lower())


@dataclass
class Classification:
    brand: str
    origin: str
    source: str          # seed | auto | manual
    confirmed: bool
    evidence: str
    products_seen: int = 0
    k_marketing: bool = False        # non-Korean brand marketing products as Korean
    k_marketing_evidence: str = ""


def load_seed(path: Path = SEED_PATH) -> dict[str, dict]:
    seed: dict[str, dict] = {}
    with path.open(newline="") as f:
        for row in csv.DictReader(f):
            origin = row["origin"].strip()
            assert origin in ORIGINS, f"bad origin {origin!r} for {row['brand']!r}"
            seed[norm(row["brand"])] = {"brand": row["brand"].strip(), "origin": origin,
                                        "note": (row.get("note") or "").strip(),
                                        "k_positioned": (row.get("k_positioned") or "").strip().lower() in ("1", "true", "yes")}
    return seed


_COUNTRY_TO_ORIGIN = {"KR": "kbeauty", "IN": "local"}


def _country_majority(stats: dict) -> tuple[str | None, str]:
    """(origin implied by country_of_origin majority, evidence text)."""
    counts: dict[str, int] = stats.get("countries") or {}
    if not counts:
        return None, ""
    code, n = max(counts.items(), key=lambda kv: kv[1])
    total = sum(counts.values())
    if n * 2 < total:  # no majority
        return None, f"country_of_origin mixed: {dict(counts)}"
    return _COUNTRY_TO_ORIGIN.get(code, "global"), f"country_of_origin {code} on {n}/{total} detailed products"


def _origin(brand: str, stats: dict, seed: dict) -> Classification:
    key = norm(brand)
    c_origin, c_evidence = _country_majority(stats)
    if key in seed:
        e = seed[key]
        ev = f"seed list{': ' + e['note'] if e['note'] else ''}"
        if c_origin and c_origin != e["origin"]:
            ev += f"; VERIFY: {c_evidence} suggests {c_origin}"
        elif c_evidence:
            ev += f"; confirmed by {c_evidence}"
        return Classification(brand, e["origin"], "seed", False, ev, stats["n"])
    if c_origin:
        return Classification(brand, c_origin, "auto", False, c_evidence, stats["n"])
    if stats.get("kstore", 0) > 0:
        return Classification(brand, "kbeauty", "auto", False,
                              f"{stats['kstore']}/{stats['n']} products in Nykaa Korean Beauty store", stats["n"])
    if _K_PATTERNS.search(brand):
        return Classification(brand, "kbeauty", "auto", False, "brand name pattern (korea/seoul)", stats["n"])
    if _LOCAL_PATTERNS.search(brand):
        return Classification(brand, "local", "auto", False, "brand name pattern (ayurveda/herbal/india)", stats["n"])
    return Classification(brand, "unknown", "auto", False, "no signal — needs owner classification", stats["n"])


def classify_brand(brand: str, stats: dict, seed: dict) -> Classification:
    c = _origin(brand, stats, seed)
    if c.origin != "kbeauty":
        ev = []
        if seed.get(norm(brand), {}).get("k_positioned"):
            ev.append("seed: k_positioned")
        if stats.get("k_marketing_names", 0):
            ev.append(f"{stats['k_marketing_names']}/{stats['n']} product names use Korean positioning "
                      f"(e.g. {stats['k_marketing_example']!r})")
        if stats.get("kstore", 0):
            ev.append(f"{stats['kstore']}/{stats['n']} products placed in Nykaa Korean Beauty store")
        kr = (stats.get("countries") or {}).get("KR", 0)
        if kr and c.origin == "local":
            # An Indian brand manufacturing in Korea puts "Made in Korea" on the pack: positioning.
            # A global brand's Korean factory is supply chain, not marketing, so it does not count.
            ev.append(f"{kr} product(s) made in South Korea")
        if ev:
            c.k_marketing = True
            c.k_marketing_evidence = "; ".join(ev)
    return c


def brand_stats(rows: list[dict], country_by_product: dict[str, str] | None = None) -> dict[str, dict]:
    """rows: listing rows. country_by_product: product_id -> country_of_origin code (from product details)."""
    country_by_product = country_by_product or {}
    stats: dict[str, dict] = defaultdict(lambda: {"n": 0, "kstore": 0, "k_marketing_names": 0,
                                                  "k_marketing_example": None, "first_review_dates": [],
                                                  "unenriched": 0, "zero_review": 0, "countries": {}})
    for r in rows:
        s = stats[r["brand"]]
        s["n"] += 1
        code = country_by_product.get(str(r.get("product_id")))
        if code:
            s["countries"][code] = s["countries"].get(code, 0) + 1
        s["kstore"] += 1 if r.get("in_kbeauty_store") else 0
        if _K_MARKETING.search(r.get("name") or ""):
            s["k_marketing_names"] += 1
            s["k_marketing_example"] = s["k_marketing_example"] or (r["name"] or "")[:60]
        if r.get("first_review_date"):
            s["first_review_dates"].append(r["first_review_date"])
        elif r.get("review_count") == 0:
            s["zero_review"] += 1          # enriched, but no text reviews yet
        else:
            s["unenriched"] += 1           # rating_count above threshold: an established product
    return stats


def classify_all(rows: list[dict], seed: dict | None = None, country_by_product: dict[str, str] | None = None) -> list[Classification]:
    seed = seed if seed is not None else load_seed()
    stats = brand_stats(rows, country_by_product)
    return sorted((classify_brand(b, s, seed) for b, s in stats.items()),
                  key=lambda c: (c.origin, -c.products_seen, c.brand.lower()))


def to_rows(cls: list[Classification]) -> list[dict]:
    return [asdict(c) for c in cls]
