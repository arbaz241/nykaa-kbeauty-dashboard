"""Brand origin classification: kbeauty | local (India) | global | unknown.

Resolution order for a brand:
  1. Seed list (scraper/seed/brand_classification.csv) — curated defaults,
     source="seed". Still confirmed=False until the owner confirms them.
     In Phase 3 the seed is loaded into the Supabase brand_classification
     table once; from then on that table is the source of truth and edits
     happen there, not here.
  2. Auto heuristics, source="auto", with an `evidence` string:
       a. any of the brand's products is in Nykaa's own "Korean Beauty" store
          category (in_kbeauty_store)                      -> kbeauty
       b. brand name contains korea/korean/seoul/k-beauty  -> kbeauty
       c. brand name contains ayurved/herbal/india/bharat  -> local
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


def load_seed(path: Path = SEED_PATH) -> dict[str, tuple[str, str, str]]:
    seed: dict[str, tuple[str, str, str]] = {}
    with path.open(newline="") as f:
        for row in csv.DictReader(f):
            origin = row["origin"].strip()
            assert origin in ORIGINS, f"bad origin {origin!r} for {row['brand']!r}"
            seed[norm(row["brand"])] = (row["brand"].strip(), origin, (row.get("note") or "").strip())
    return seed


def classify_brand(brand: str, stats: dict, seed: dict) -> Classification:
    key = norm(brand)
    if key in seed:
        _, origin, note = seed[key]
        return Classification(brand, origin, "seed", False, f"seed list{': ' + note if note else ''}", stats["n"])
    if stats.get("kstore", 0) > 0:
        return Classification(brand, "kbeauty", "auto", False,
                              f"{stats['kstore']}/{stats['n']} products in Nykaa Korean Beauty store", stats["n"])
    if _K_PATTERNS.search(brand):
        return Classification(brand, "kbeauty", "auto", False, "brand name pattern (korea/seoul)", stats["n"])
    if _LOCAL_PATTERNS.search(brand):
        return Classification(brand, "local", "auto", False, "brand name pattern (ayurveda/herbal/india)", stats["n"])
    return Classification(brand, "unknown", "auto", False, "no signal — needs owner classification", stats["n"])


def brand_stats(rows: list[dict]) -> dict[str, dict]:
    stats: dict[str, dict] = defaultdict(lambda: {"n": 0, "kstore": 0})
    for r in rows:
        s = stats[r["brand"]]
        s["n"] += 1
        s["kstore"] += 1 if r.get("in_kbeauty_store") else 0
    return stats


def classify_all(rows: list[dict], seed: dict | None = None) -> list[Classification]:
    seed = seed if seed is not None else load_seed()
    stats = brand_stats(rows)
    return sorted((classify_brand(b, s, seed) for b, s in stats.items()),
                  key=lambda c: (c.origin, -c.products_seen, c.brand.lower()))


def to_rows(cls: list[Classification]) -> list[dict]:
    return [asdict(c) for c in cls]
