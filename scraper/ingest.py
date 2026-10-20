"""Ingest one day's local scrape output into Supabase.

    python -m scraper.ingest --date 2026-09-13          # backfill / re-ingest a day
    python -m scraper.ingest --date 2026-09-13 --dry-run

Reads data/<date>/{products.json, run.json} and classifies brands on the fly
(same code as scraper.classify) so the brand table gets every brand seen.
Called automatically at the end of `scraper.run` when SUPABASE_URL is set.
Idempotent: re-ingesting a day overwrites that day's snapshot rows only.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date
from pathlib import Path

from . import config
from .brands import classify_all, to_rows
from .db import build_brand_payload, build_row_payload, build_run_payload, connect, fetch_country_map, fetch_variant_sizes, fill_pack_sizes, ingest
from .reviews import load_cache

log = logging.getLogger("ingest")


def load_day(day_dir: Path) -> tuple[dict, list[dict]]:
    run_meta = json.loads((day_dir / "run.json").read_text())
    rows = json.loads((day_dir / "products.json").read_text())
    return run_meta, rows


def payloads_for_day(day_dir: Path, country_by_product: dict[str, str] | None = None) -> tuple[dict, list[dict], list[dict]]:
    run_meta, rows = load_day(day_dir)
    run_payload = build_run_payload(run_meta)
    row_payload = build_row_payload(rows, load_cache())
    brand_payload = build_brand_payload(to_rows(classify_all(rows, country_by_product=country_by_product)), run_payload["scrape_date"])
    return run_payload, row_payload, brand_payload


def ingest_day(day_dir: Path, client=None) -> int:
    client = client or connect()
    run_payload, row_payload, brand_payload = payloads_for_day(day_dir, fetch_country_map(client))
    try:  # a fill-in only: never let it stop the night's ingest
        filled = fill_pack_sizes(row_payload, fetch_variant_sizes(client))
        log.info("pack size taken from the product page for %d listings that left it out", filled)
    except Exception as e:  # noqa: BLE001
        log.warning("pack-size fill skipped: %s", e)
    if not row_payload:
        log.warning("%s has no rows; recording the run only", day_dir)
    run_id = ingest(client, run_payload, row_payload, brand_payload)
    log.info("ingested %s: run_id=%s rows=%d brands=%d", day_dir.name, run_id, len(row_payload), len(brand_payload))
    return run_id


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=date.today().isoformat())
    ap.add_argument("--data", default=config.DATA_DIR)
    ap.add_argument("--dry-run", action="store_true", help="build payloads and print sizes, write nothing")
    args = ap.parse_args()
    logging.basicConfig(level=config.LOG_LEVEL, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
                        datefmt="%H:%M:%S", stream=sys.stdout)
    day_dir = Path(args.data) / args.date
    if not (day_dir / "run.json").exists():
        log.error("no run.json in %s", day_dir); return 2
    if args.dry_run:
        run_payload, row_payload, brand_payload = payloads_for_day(day_dir)
        print(json.dumps({"run": {k: v for k, v in run_payload.items() if k not in ("categories", "enrichment")},
                          "rows": len(row_payload), "brands": len(brand_payload),
                          "sample_row": row_payload[0] if row_payload else None}, indent=1, default=str))
        return 0
    ingest_day(day_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
