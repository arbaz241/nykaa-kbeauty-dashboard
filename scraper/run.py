"""CLI entrypoint: python -m scraper.run [--categories a,b] [--top-n 100]

Phase 1/2: writes results to data/<date>/ as JSON + CSV and prints a summary.
Phase 3 will add the Supabase writer alongside (same rows, same run summary).
Idempotent: re-running on the same day overwrites that day's files.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

from . import config
from .nykaa import scrape_all


def setup_logging() -> None:
    logging.basicConfig(
        level=config.LOG_LEVEL,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
        stream=sys.stdout,
    )


def write_outputs(scraped_at: str, results, out_root: Path) -> Path:
    day = scraped_at[:10]
    out = out_root / day
    out.mkdir(parents=True, exist_ok=True)
    rows = [p for r in results for p in r.products]
    (out / "products.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False))
    if rows:
        with (out / "products.csv").open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader(); w.writerows(rows)
    run_meta = {
        "scraped_at": scraped_at,
        "finished_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "top_n": config.TOP_N,
        "categories": [
            {"key": r.category.key, "nykaa_id": r.category.nykaa_id, "products": len(r.products),
             "total_found": r.total_found, "listing_source": r.listing_source, "pages_ok": r.pages_ok, "pages_failed": r.pages_failed,
             "errors": r.errors} for r in results
        ],
        "total_rows": len(rows),
        "success": all(r.pages_failed == 0 for r in results),
    }
    (out / "run.json").write_text(json.dumps(run_meta, indent=1))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--categories", help="comma-separated category keys (default: all)")
    ap.add_argument("--top-n", type=int, default=config.TOP_N)
    ap.add_argument("--out", default=config.DATA_DIR)
    args = ap.parse_args()
    setup_logging()
    log = logging.getLogger("run")

    cats = config.CATEGORIES
    if args.categories:
        wanted = set(args.categories.split(","))
        cats = [c for c in cats if c.key in wanted]
        missing = wanted - {c.key for c in cats}
        if missing:
            log.error("unknown categories: %s", sorted(missing)); return 2

    log.info("starting: %d categories, top %d each", len(cats), args.top_n)
    scraped_at, results = asyncio.run(scrape_all(cats, args.top_n))
    out = write_outputs(scraped_at, results, Path(args.out))

    ok = True
    for r in results:
        status = "OK " if r.pages_failed == 0 else "ERR"
        ok &= r.pages_failed == 0
        log.info("%s %-17s products=%3d pages_ok=%d pages_failed=%d total_found=%s source=%s",
                 status, r.category.key, len(r.products), r.pages_ok, r.pages_failed, r.total_found, r.listing_source)
        for e in r.errors:
            log.error("   %s", e)
    log.info("wrote %s (%d rows)", out, sum(len(r.products) for r in results))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
