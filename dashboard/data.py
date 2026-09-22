"""Data access for the dashboard: plain SQL over psycopg, cached by Streamlit."""
from __future__ import annotations

import json
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


@st.cache_data(ttl=600, show_spinner="Loading market data…")
def snapshots(date_from: date, date_to: date) -> pd.DataFrame:
    df = _df(
        """select scrape_date, subcategory, product_id, name, brand, origin, origin_confirmed, k_marketing,
                  rank, listing_source, mrp, price, discount_pct, rating, rating_count, in_stock,
                  is_pinned, is_ad, is_new_tag, is_bestseller, in_kbeauty_store, pack_size, has_offer, offer_message,
                  first_seen_date, first_review_date, review_count, url
           from v_snapshots v
           left join lateral (select pack_size from products p where p.product_id = v.product_id) pp on true
           where scrape_date between %s and %s""",
        (date_from, date_to),
    )
    for col in ("mrp", "price", "discount_pct", "rating"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["scrape_date"] = pd.to_datetime(df["scrape_date"])
    df["first_review_date"] = pd.to_datetime(df["first_review_date"])
    df["first_seen_date"] = pd.to_datetime(df["first_seen_date"])
    df["origin"] = df["origin"].fillna("unknown")
    df["brand_key"] = df["brand"].map(norm)
    df["is_paid"] = df.is_ad | df.is_pinned
    return df


@st.cache_data(ttl=900, show_spinner=False)
def details() -> pd.DataFrame:
    """One row per product with detail attributes (empty frame if none fetched yet)."""
    df = _df(
        """select product_id, country_of_origin, country_name, manufacturer_name, formulation, skin_types, concerns,
                  key_ingredients, preferences, usp_summary, usp_points, description_text, how_to_use,
                  review_key_phrases, review_splitup, review_count as detail_review_count, variants, image_url, fetched_at
           from product_details"""
    )
    for col in ("skin_types", "concerns", "key_ingredients", "preferences", "usp_points"):
        df[col] = df[col].apply(lambda v: list(v) if isinstance(v, (list, tuple)) else [])
    for col in ("review_key_phrases", "variants", "review_splitup"):
        df[col] = df[col].apply(lambda v: v if isinstance(v, (list, dict)) else (json.loads(v) if isinstance(v, str) else ([] if col != "review_splitup" else {})))
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
                  p.review_count, p.url, p.pack_size
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


@st.cache_data(ttl=300, show_spinner=False)
def admin_emails() -> set[str]:
    try:
        return {e.lower() for e in _df("select email from app_admins").email}
    except Exception:  # noqa: BLE001
        return set()


def is_admin(email: str | None) -> bool:
    return bool(email) and (email.lower() in admin_emails() or email == "local-dev")


def save_brand_edits(edits: list[dict], updated_by: str) -> int:
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


# ------------------------------------------------------------------ deeper signals (2026-09-16)

@st.cache_data(ttl=900, show_spinner=False)
def search_latest() -> pd.DataFrame:
    df = _df(
        """select s.scrape_date, s.query, s.sample, s.rank, s.product_id, s.brand, s.name, s.price, s.rating, s.rating_count, s.is_ad, s.total_found,
                  coalesce(b.origin, 'unknown') as origin, coalesce(b.k_marketing, false) as k_marketing
           from search_snapshots s left join brand_classification b on b.brand = s.brand
           where s.scrape_date = (select max(scrape_date) from search_snapshots)"""
    )
    for c in ("price", "rating"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


@st.cache_data(ttl=900, show_spinner=False)
def assortment_latest() -> pd.DataFrame:
    return _df(
        """select a.brand, a.total_products, a.scrape_date, coalesce(b.origin,'unknown') as origin
           from brand_assortment a left join brand_classification b on b.brand = a.brand
           where a.scrape_date = (select max(scrape_date) from brand_assortment)"""
    )


@st.cache_data(ttl=900, show_spinner=False)
def review_months() -> pd.DataFrame:
    """Monthly dated reviews per product, with each product's reliable coverage start.

    Nykaa's reviews endpoint stops serving new reviews after roughly 1,000 per product. When fewer reviews
    were fetched than Nykaa reports, the oldest fetched month is partial and earlier months are unknown,
    so coverage starts the month after the oldest one fetched."""
    df = _df(
        """select h.product_id, h.month, h.reviews, h.avg_rating, p.brand, p.name, coalesce(b.origin,'unknown') as origin,
                  c.reviews_fetched, coalesce(c.reported_reviews, d.review_count) as reported_reviews,
                  min(h.month) over (partition by h.product_id) as oldest_month
           from review_history h join products p using (product_id)
           left join brand_classification b on b.brand = p.brand
           left join review_cursor c using (product_id)
           left join product_details d using (product_id)"""
    )
    if df.empty:
        return df
    df["month"] = pd.to_datetime(df["month"]); df["oldest_month"] = pd.to_datetime(df["oldest_month"])
    df["avg_rating"] = pd.to_numeric(df["avg_rating"], errors="coerce")
    truncated = df.reported_reviews.notna() & (df.reviews_fetched.fillna(0) < 0.95 * df.reported_reviews.fillna(0))
    df["truncated"] = truncated
    df["coverage_start"] = df.oldest_month.where(~truncated, df.oldest_month + pd.offsets.MonthBegin(1))
    df.loc[~truncated, "coverage_start"] = pd.Timestamp("1900-01-01")
    return df[df.month >= df.coverage_start]
