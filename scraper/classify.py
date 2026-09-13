"""CLI: python -m scraper.classify [--date YYYY-MM-DD]

Classifies every brand in that day's products.json, writes
data/<date>/brand_classification.csv and data/<date>/products_enriched.csv
(products + newness flags), and prints a review summary.
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from datetime import date
from pathlib import Path

from . import config
from .brands import brand_stats, classify_all, to_rows
from .newness import brand_newness, product_newness


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=date.today().isoformat())
    ap.add_argument("--data", default=config.DATA_DIR)
    args = ap.parse_args()
    today = date.fromisoformat(args.date)
    day_dir = Path(args.data) / args.date
    rows = json.loads((day_dir / "products.json").read_text())
    stats = brand_stats(rows)
    cls = classify_all(rows)
    brand_rows = []
    for c in cls:
        d = {**c.__dict__, **brand_newness(stats[c.brand], today, known_brand=(c.source == "seed"))}
        brand_rows.append(d)
    out = day_dir / "brand_classification.csv"
    with out.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(brand_rows[0].keys())); w.writeheader(); w.writerows(brand_rows)

    origin_of = {c.brand: c.origin for c in cls}
    prod_rows = [{**r, "origin": origin_of[r["brand"]], **product_newness(r, today)} for r in rows]
    pout = day_dir / "products_enriched.csv"
    with pout.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(prod_rows[0].keys())); w.writeheader(); w.writerows(prod_rows)

    print(f"{len(cls)} brands from {len(rows)} product rows -> {out}")
    print("by origin:", dict(Counter(c.origin for c in cls)))
    share = Counter(origin_of[r["brand"]] for r in rows)
    print("share of top-100 slots by origin:", {o: f"{n} ({n/len(rows):.0%})" for o, n in share.most_common()})
    enriched = sum(1 for r in rows if r.get("first_review_date"))
    print(f"products with first_review_date: {enriched}/{len(rows)}")

    km = [c for c in cls if c.k_marketing]
    print(f"\nNON-KOREAN BRANDS WITH KOREAN POSITIONING — {len(km)}:")
    for c in sorted(km, key=lambda c: -c.products_seen):
        print(f"  {c.brand:20s} [{c.origin}] n={c.products_seen:>2}  {c.k_marketing_evidence}")

    nb = [b for b in brand_rows if b["is_new_brand"]]
    print(f"\nNEW BRANDS (not in seed list; all listed products new within {config.NEW_WINDOW_DAYS} days) — {len(nb)}:")
    for b in sorted(nb, key=lambda b: b["brand_first_review_date"] or "9999", reverse=True):
        print(f"  {b['brand']:24s} [{b['origin']}] first review {b['brand_first_review_date'] or 'none yet':10s} products={b['products_seen']}  ({b['newness_basis']})")
    ne = [b for b in brand_rows if b["is_new_entrant"] and not b["is_new_brand"]]
    print(f"\nKNOWN BRANDS NEW TO THE TRACKED CATEGORIES — {len(ne)}:")
    for b in sorted(ne, key=lambda b: b["brand_first_review_date"] or "9999", reverse=True):
        print(f"  {b['brand']:24s} [{b['origin']}] first review {b['brand_first_review_date'] or 'none yet':10s} products={b['products_seen']}")

    np_ = [r for r in prod_rows if r["is_new_product"]]
    print(f"\nNEW PRODUCTS — {len(np_)} (showing newest 25):")
    for r in sorted(np_, key=lambda r: r.get("first_review_date") or "9999", reverse=True)[:25]:
        print(f"  {r.get('first_review_date') or 'no reviews':10s} #{r['rank']:>3} {r['subcategory']:16s} {r['brand'][:16]:16s} "
              f"[{r['origin']}] ratings={r['rating_count'] or 0:>4} reviews={r.get('review_count') if r.get('review_count') is not None else '-':>4} "
              f"newtag={'Y' if r['is_new_tag'] else '-'} {r['name'][:40]}")

    auto = [c for c in cls if c.source == "auto"]
    if auto:
        print(f"\nAUTO-CLASSIFIED (unconfirmed) — {len(auto)} brands, please review:")
        for c in auto:
            print(f"  {c.brand:32s} -> {c.origin:8s} n={c.products_seen:>2}  {c.evidence}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
