"""Did tonight's run actually land? Checks the database, not the logs.

A collector can fail inside a green run (28-29 Sep: search stopped for two days while every run
passed). Nykaa keeps no history, so a day that is not collected is gone; this makes the job fail
the same night, which makes GitHub email the owner.

    python -m scraper.freshness            # exit 1 if any dataset is stale or thin
"""
from __future__ import annotations

import logging
import os
import sys
from datetime import date, datetime, timedelta, timezone

from . import config

log = logging.getLogger("freshness")

THIN = 0.7          # today's breadth below 70% of the previous collection counts as a failed collection
WEEKLY_MAX_AGE = 8  # days; the catalogue and assortment refresh on Mondays


def _latest_dates(client, table: str, n: int = 2) -> list[str]:
    """The n most recent distinct scrape dates (one row per date via descending order)."""
    out: list[str] = []
    q = client.table(table).select("scrape_date").order("scrape_date", desc=True)
    while len(out) < n:
        q2 = q.lt("scrape_date", out[-1]) if out else q
        r = q2.limit(1).execute().data
        if not r:
            break
        out.append(r[0]["scrape_date"])
    return out


def _breadth(client, table: str, col: str, day: str) -> int:
    rows, off = set(), 0
    while True:
        d = client.table(table).select(col).eq("scrape_date", day).range(off, off + 999).execute().data
        rows |= {r[col] for r in d}
        if len(d) < 1000:
            return len(rows)
        off += 1000


def _daily(client, table: str, col: str, label: str, today: str, unit: str) -> dict:
    """A daily dataset must have today's date, and cover roughly as much as last time."""
    dates = _latest_dates(client, table)
    if not dates or dates[0] != today:
        return {"check": label, "ok": False, "detail": f"last collected {dates[0] if dates else 'never'}, expected {today}"}
    now = _breadth(client, table, col, today)
    prev = _breadth(client, table, col, dates[1]) if len(dates) > 1 else 0
    if prev and now < THIN * prev:
        return {"check": label, "ok": False, "detail": f"only {now} {unit} today vs {prev} on {dates[1]}"}
    return {"check": label, "ok": True, "detail": f"{now} {unit} today" + (f" ({prev} on {dates[1]})" if prev else "")}


def _weekly(client, table: str, label: str, today: date) -> dict:
    dates = _latest_dates(client, table, 1)
    if not dates:
        return {"check": label, "ok": False, "detail": "never collected"}
    age = (today - date.fromisoformat(dates[0])).days
    return {"check": label, "ok": age <= WEEKLY_MAX_AGE, "detail": f"last collected {dates[0]} ({age} days ago, limit {WEEKLY_MAX_AGE})"}


def _touched(client, table: str, label: str, now: datetime, hours: int, backlog: int | None = None) -> dict:
    """Time-boxed crawls: something must have been written recently. With a known backlog of zero there
    is nothing to do, so no write is fine."""
    r = client.table(table).select("fetched_at").order("fetched_at", desc=True).limit(1).execute().data
    if backlog == 0:
        return {"check": label, "ok": True, "detail": "nothing waiting"}
    if not r:
        return {"check": label, "ok": False, "detail": "never written"}
    last = datetime.fromisoformat(r[0]["fetched_at"])
    age = (now - last).total_seconds() / 3600
    tail = f", {backlog} waiting" if backlog else ""
    return {"check": label, "ok": age <= hours, "detail": f"last write {last:%Y-%m-%d %H:%M} UTC ({age:.0f}h ago, limit {hours}h{tail})"}


def _ids_on(client, day: str) -> set[str]:
    ids, off = set(), 0
    while True:
        d = client.table("scrape_snapshots").select("product_id").eq("scrape_date", day).range(off, off + 999).execute().data
        ids |= {r["product_id"] for r in d}
        if len(d) < 1000:
            return ids
        off += 1000


def run_checks(client) -> list[dict]:
    now = datetime.now(timezone.utc)
    today = now.date()
    t = today.isoformat()
    from .details import missing_product_ids
    checks = [
        _daily(client, "scrape_snapshots", "subcategory", "Shelf rankings", t, "shelves"),
        _daily(client, "scrape_snapshots", "product_id", "Shelf products", t, "products"),
        _daily(client, "search_snapshots", "query", "Search results", t, "search terms"),
        _daily(client, "search_suggestions", "seed", "Autosuggest", t, "seed terms"),
        _touched(client, "review_cursor", "Review history", now, 30),
        # the daily run only fetches details for products on the latest shelves, so that is the backlog that matters
        _touched(client, "product_details", "Product details", now, 54,
                 backlog=len(set(missing_product_ids(client)) & _ids_on(client, (_latest_dates(client, "scrape_snapshots", 1) or [t])[0]))),
        _weekly(client, "brand_catalog", "Brand catalogues", today),
        _weekly(client, "brand_assortment", "Brand assortment", today),
    ]
    # the shelf must also have every configured category, not merely as many as yesterday
    cats = _breadth(client, "scrape_snapshots", "subcategory", t)
    if checks[0]["ok"] and cats < len(config.CATEGORIES):
        checks[0] = {"check": "Shelf rankings", "ok": False, "detail": f"{cats} of {len(config.CATEGORIES)} shelves today"}
    return checks


def report(checks: list[dict]) -> str:
    lines = ["## Data freshness", "", "| | Dataset | Detail |", "|---|---|---|"]
    lines += [f"| {'✅' if c['ok'] else '❌'} | {c['check']} | {c['detail']} |" for c in checks]
    bad = [c["check"] for c in checks if not c["ok"]]
    lines += ["", f"**Stale: {', '.join(bad)}** — a day not collected cannot be recovered later." if bad else "All datasets current."]
    return "\n".join(lines)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s", datefmt="%H:%M:%S")
    from .db import connect
    checks = run_checks(connect())
    md = report(checks)
    print(md)
    if path := os.getenv("GITHUB_STEP_SUMMARY"):
        with open(path, "a") as f:
            f.write(md + "\n")
    for c in checks:
        if not c["ok"]:
            # ::error:: surfaces on the run page and in the failure email
            print(f"::error title=Stale data: {c['check']}::{c['detail']}")
    return 0 if all(c["ok"] for c in checks) else 1


if __name__ == "__main__":
    sys.exit(main())
