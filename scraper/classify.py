"""CLI: python -m scraper.classify [--date YYYY-MM-DD]

Classifies every brand in that day's products.json, writes
data/<date>/brand_classification.csv, and prints a review summary.
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from datetime import date
from pathlib import Path

from . import config
from .brands import classify_all, to_rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=date.today().isoformat())
    ap.add_argument("--data", default=config.DATA_DIR)
    args = ap.parse_args()
    day_dir = Path(args.data) / args.date
    rows = json.loads((day_dir / "products.json").read_text())
    cls = classify_all(rows)
    out = day_dir / "brand_classification.csv"
    with out.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(to_rows(cls)[0].keys()))
        w.writeheader(); w.writerows(to_rows(cls))

    by_origin = Counter(c.origin for c in cls)
    by_source = Counter((c.origin, c.source) for c in cls)
    print(f"{len(cls)} brands from {len(rows)} product rows -> {out}")
    print("by origin:", dict(by_origin))
    print("by (origin, source):", {f"{o}/{s}": n for (o, s), n in sorted(by_source.items())})
    # share of listing rows (not brands) per origin — the number that matters
    row_share = Counter()
    origin_of = {c.brand: c.origin for c in cls}
    for r in rows:
        row_share[origin_of[r["brand"]]] += 1
    print("share of top-100 slots by origin:", {o: f"{n} ({n/len(rows):.0%})" for o, n in row_share.most_common()})
    auto = [c for c in cls if c.source == "auto"]
    if auto:
        print(f"\nAUTO-CLASSIFIED (unconfirmed) — {len(auto)} brands, please review:")
        for c in auto:
            print(f"  {c.brand:32s} -> {c.origin:8s} n={c.products_seen:>2}  {c.evidence}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
