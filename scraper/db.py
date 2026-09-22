"""Supabase writer.

All writes go through two Postgres functions defined in
supabase/migrations/001_initial_schema.sql and called via RPC with the
service role key:

  ingest_run(p_run, p_rows)             -> run id   (atomic: run + products + snapshots)
  upsert_brand_classifications(p_rows)  -> count    (never overwrites owner edits)

Nothing here ever deletes or rewrites history: snapshots are keyed on
(scrape_date, subcategory, product_id), so re-ingesting a day overwrites that
day's rows only.

`connect()` returns a Supabase client. For local testing the same payloads can
be sent to any Postgres via `ingest_with_psycopg()` (used by tests).
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
from datetime import date

from . import config

log = logging.getLogger("db")

ROW_FIELDS = (  # columns ingest_run reads from each product row
    "product_id", "sku", "name", "brand", "brand_id", "url", "pack_size",
    "subcategory", "category_id", "rank", "listing_source",
    "mrp", "price", "discount_pct", "rating", "rating_count", "in_stock",
    "is_pinned", "is_ad", "is_new_tag", "is_bestseller", "in_kbeauty_store",
    "popularity_score", "nykaa_l2", "nykaa_l3", "tags", "scraped_at",
    "review_count", "first_review_date", "first_review_complete", "has_offer", "offer_message",
)


def _git_sha() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True,
                                       stderr=subprocess.DEVNULL).strip()
    except Exception:  # noqa: BLE001
        return None


def build_run_payload(run_meta: dict) -> dict:
    """run.json (as written by scraper.run) -> p_run for ingest_run."""
    blocked = any(any(str(e).startswith("BLOCKED") for e in c.get("errors", []))
                  for c in run_meta.get("categories", []))
    errors = [f"{c['key']}: {e}" for c in run_meta.get("categories", []) for e in c.get("errors", [])]
    return {
        "scrape_date": run_meta["scraped_at"][:10],
        "scraped_at": run_meta["scraped_at"],
        "finished_at": run_meta.get("finished_at"),
        "success": bool(run_meta.get("success")),
        "blocked": blocked,
        "top_n": run_meta.get("top_n"),
        "total_rows": run_meta.get("total_rows"),
        "categories": run_meta.get("categories"),
        "enrichment": run_meta.get("enrichment"),
        "error_log": "\n".join(errors) or None,
        "runner": os.getenv("SCRAPE_RUNNER", "github-actions" if os.getenv("GITHUB_ACTIONS") else "local"),
        "git_sha": _git_sha(),
    }


def build_row_payload(rows: list[dict], first_review_cache: dict | None = None) -> list[dict]:
    """products.json rows -> p_rows. Adds first_review_complete from the cache when known."""
    cache = first_review_cache or {}
    out = []
    for r in rows:
        d = {k: r.get(k) for k in ROW_FIELDS}
        c = cache.get(r["product_id"])
        if c is not None:
            d["first_review_complete"] = c.get("complete")
        out.append(d)
    return out


def build_brand_payload(brand_rows: list[dict], scrape_date: str) -> list[dict]:
    """Output of scraper.classify (Classification dicts) -> p_rows for upsert_brand_classifications."""
    return [{
        "brand": b["brand"], "origin": b["origin"], "source": b["source"],
        "k_marketing": bool(b.get("k_marketing")), "k_marketing_evidence": b.get("k_marketing_evidence") or None,
        "evidence": b.get("evidence"), "note": None, "first_seen_date": scrape_date,
    } for b in brand_rows]


# ------------------------------------------------------------------ Supabase

def connect():
    from supabase import create_client  # imported lazily so tests don't need network config
    url = os.getenv("SUPABASE_URL"); key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example)")
    return create_client(url, key)


def ingest(client, run_payload: dict, row_payload: list[dict], brand_payload: list[dict] | None = None) -> int:
    run_id = client.rpc("ingest_run", {"p_run": run_payload, "p_rows": row_payload}).execute().data
    log.info("ingest_run -> run_id=%s (%d rows)", run_id, len(row_payload))
    if brand_payload:
        n = client.rpc("upsert_brand_classifications", {"p_rows": brand_payload}).execute().data
        log.info("upsert_brand_classifications -> %s rows", n)
    return int(run_id)


# --------------------------------------------------------- plain Postgres path

def ingest_with_psycopg(conn, run_payload: dict, row_payload: list[dict], brand_payload: list[dict] | None = None) -> int:
    """Same operations over a direct Postgres connection (tests / manual backfill)."""
    with conn.cursor() as cur:
        cur.execute("select ingest_run(%s::jsonb, %s::jsonb)", (json.dumps(run_payload), json.dumps(row_payload)))
        run_id = cur.fetchone()[0]
        if brand_payload:
            cur.execute("select upsert_brand_classifications(%s::jsonb)", (json.dumps(brand_payload),))
    conn.commit()
    return int(run_id)


def upsert_product_details(client, rows: list[dict]) -> int:
    """Upsert parsed product_details rows (service role; RLS bypassed)."""
    if not rows:
        return 0
    n = 0
    for i in range(0, len(rows), 100):
        chunk = rows[i:i + 100]
        client.table("product_details").upsert(chunk, on_conflict="product_id").execute()
        n += len(chunk)
    log.info("product_details upsert -> %d rows", n)
    return n


def fetch_country_map(client) -> dict[str, str]:
    """product_id -> country_of_origin from product_details (empty if none yet)."""
    try:
        data = client.table("product_details").select("product_id,country_of_origin").limit(20000).execute().data
        return {d["product_id"]: d["country_of_origin"] for d in data if d.get("country_of_origin")}
    except Exception as e:  # noqa: BLE001
        log.warning("could not load country map: %s", e)
        return {}


def _upsert(client, table: str, rows: list[dict], on_conflict: str) -> int:
    n = 0
    for i in range(0, len(rows), 200):
        chunk = rows[i:i + 200]
        client.table(table).upsert(chunk, on_conflict=on_conflict).execute(); n += len(chunk)
    return n


def write_search(client, rows: list[dict]) -> int:
    return _upsert(client, "search_snapshots", rows, "scrape_date,query,sample,product_id") if rows else 0


def write_suggestions(client, rows: list[dict]) -> int:
    rows = [r for r in rows if r.get("suggestion")]
    return _upsert(client, "search_suggestions", rows, "scrape_date,seed,kind,position") if rows else 0


def write_review_texts(client, rows: list[dict]) -> int:
    return _upsert(client, "review_texts", rows, "review_id") if rows else 0


def write_assortment(client, rows: list[dict]) -> int:
    return _upsert(client, "brand_assortment", rows, "brand,scrape_date") if rows else 0


def write_review_history(client, hist: list[dict], cursors: list[dict]) -> int:
    # monthly counts are additive across incremental fetches: read existing, add, upsert
    if not hist:
        return 0
    pids = list({h["product_id"] for h in hist})
    existing = client.table("review_history").select("product_id,month,reviews").in_("product_id", pids).execute().data
    have = {(e["product_id"], e["month"]): e["reviews"] for e in existing}
    merged = [{**h, "reviews": h["reviews"] + have.get((h["product_id"], h["month"]), 0)} for h in hist]
    n = _upsert(client, "review_history", merged, "product_id,month")
    if cursors:
        _upsert(client, "review_cursor", cursors, "product_id")
    return n


def read_review_cursors(client) -> dict[str, dict]:
    try:
        return {r["product_id"]: r for r in client.table("review_cursor").select("*").limit(10000).execute().data}
    except Exception as e:  # noqa: BLE001
        log.warning("no review cursors: %s", e); return {}
