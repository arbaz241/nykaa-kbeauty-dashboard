"""Data access for the dashboard: plain SQL over psycopg, cached by Streamlit.

Reads come from v_snapshots / products / brand_classification / scrape_runs.
The only write is the brand-classification review screen.
"""
from __future__ import annotations

import re
from datetime import date, timedelta

import pandas as pd
import psycopg
import streamlit as st

from . import config


def _conn():
    return psycopg.connect(config.database_url(), connect_timeout=10)


def _df(sql: str, params: tuple = ()) -> pd.DataFrame:
    with _conn() as c, c.cursor() as cur:
        cur.execute(sql, params)
        cols = [d.name for d in cur.description]
        return pd.DataFrame(cur.fetchall(), columns=cols)


def norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (name or "").lower())


@st.cache_data(ttl=600, show_spinner=False)
def date_bounds() -> tuple[date | None, date | None]:
    d = _df("select min(scrape_date), max(scrape_date) from scrape_snapshots")
    return (d.iloc[0, 0], d.iloc[0, 1]) if not d.empty else (None, None)


@st.cache_data(ttl=600, show_spinner="Loading snapshots…")
def snapshots(date_from: date, date_to: date) -> pd.DataFrame:
    df = _df(
        """select scrape_date, subcategory, product_id, name, brand, origin, origin_confirmed, k_marketing,
                  rank, listing_source, mrp, price, discount_pct, rating, rating_count, in_stock,
                  is_pinned, is_ad, is_new_tag, is_bestseller, in_kbeauty_store,
                  first_seen_date, first_review_date, review_count, url
           from v_snapshots where scrape_date between %s and %s""",
        (date_from, date_to),
    )
    for col in ("mrp", "price", "discount_pct", "rating"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["scrape_date"] = pd.to_datetime(df["scrape_date"])
    df["origin"] = df["origin"].fillna("unknown")
    df["brand_key"] = df["brand"].map(norm)
    return df


@st.cache_data(ttl=600, show_spinner=False)
def brands() -> pd.DataFrame:
    return _df(
        """select b.brand, b.origin, b.source, b.confirmed, b.k_marketing, b.k_marketing_evidence,
                  b.evidence, b.note, b.first_seen_date, b.updated_at, b.updated_by,
                  coalesce(p.n_products, 0) as n_products
           from brand_classification b
           left join (select brand, count(*) n_products from products group by brand) p on p.brand = b.brand
           order by b.confirmed, b.source desc, b.brand"""
    )


@st.cache_data(ttl=600, show_spinner=False)
def products() -> pd.DataFrame:
    df = _df(
        """select p.product_id, p.name, p.brand, coalesce(b.origin, 'unknown') as origin, b.source as brand_source,
                  p.first_seen_date, p.last_seen_date, p.first_review_date, p.first_review_complete,
                  p.review_count, p.url
           from products p left join brand_classification b on b.brand = p.brand"""
    )
    for col in ("first_seen_date", "last_seen_date", "first_review_date"):
        df[col] = pd.to_datetime(df[col])
    return df


@st.cache_data(ttl=120, show_spinner=False)
def runs(limit: int = 30) -> pd.DataFrame:
    return _df(
        """select scrape_date, scraped_at, finished_at, success, blocked, total_rows, runner, git_sha,
                  enrichment->>'requests' as review_requests, error_log
           from scrape_runs order by scraped_at desc limit %s""",
        (limit,),
    )


def save_brand_edits(edits: list[dict], updated_by: str) -> int:
    """edits: [{brand, origin, confirmed, note}] -> rows updated. Clears caches."""
    n = 0
    with _conn() as c, c.cursor() as cur:
        for e in edits:
            cur.execute(
                """update brand_classification
                   set origin = %s, confirmed = %s, note = %s,
                       source = case when %s then 'manual' else source end,
                       updated_at = now(), updated_by = %s
                   where brand = %s""",
                (e["origin"], bool(e["confirmed"]), e.get("note") or None, bool(e["confirmed"]), updated_by, e["brand"]),
            )
            n += cur.rowcount
        c.commit()
    brands.clear(); snapshots.clear(); products.clear()
    return n


def default_range() -> tuple[date, date]:
    lo, hi = date_bounds()
    if hi is None:
        today = date.today()
        return today - timedelta(days=30), today
    return max(lo, hi - timedelta(days=30)), hi
