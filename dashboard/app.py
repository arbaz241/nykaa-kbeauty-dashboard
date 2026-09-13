"""Nykaa K-Beauty Market Dashboard — Streamlit entry point.

Run locally:  DATABASE_URL=... .venv/bin/streamlit run dashboard/app.py
"""
from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dashboard import auth, config as C, data, styles as S  # noqa: E402
from dashboard.views import admin, brands, data_health, launches, market, momentum, overview, pricing  # noqa: E402

st.set_page_config(page_title="Nykaa K-Beauty Market", page_icon="🧴", layout="wide", initial_sidebar_state="expanded")
S.inject()
USER_EMAIL = auth.require_login()

SUB = C.SUBCATEGORY_LABELS

lo, hi = data.date_bounds()
if hi is None:
    st.title("Nykaa K-Beauty Market")
    st.warning("No scrape data in the database yet.")
    st.stop()

# ------------------------------------------------------------------ sidebar (global scope)
with st.sidebar:
    st.markdown('<div class="eyebrow">Nykaa K-Beauty Market</div>', unsafe_allow_html=True)
    st.caption(f"Data through {hi:%d %b %Y}")
    st.markdown("**Scope**")
    preset = st.radio("Period", ["7 days", "30 days", "90 days", "All", "Custom"], index=1, horizontal=True, label_visibility="collapsed")
    if preset == "Custom":
        d_from, d_to = st.date_input("Range", (max(lo, hi - timedelta(days=30)), hi), min_value=lo, max_value=hi)
    elif preset == "All":
        d_from, d_to = lo, hi
    else:
        days = int(preset.split()[0]); d_from, d_to = max(lo, hi - timedelta(days=days - 1)), hi
    top_n = st.radio("Listing depth", [20, 50, 100], index=2, horizontal=True, format_func=lambda n: f"Top {n}")
    excl_ads = st.checkbox("Exclude AD slots", value=False)
    excl_pinned = st.checkbox("Exclude featured pins", value=False)

raw = data.snapshots(d_from, d_to)
if raw.empty:
    st.warning("No rows in the selected date range."); st.stop()

with st.sidebar:
    subs_all = [s for s in SUB if s in set(raw.subcategory)] + sorted(set(raw.subcategory) - set(SUB))
    subs = st.multiselect("Categories", subs_all, default=subs_all, format_func=lambda s: SUB.get(s, s))
    origins = st.multiselect("Origins (tables and momentum)", C.ORIGIN_ORDER, default=C.ORIGIN_ORDER, format_func=lambda o: C.ORIGIN_LABELS[o])
    brand_sel = st.multiselect("Brands (blank = all)", sorted(raw.brand.unique(), key=str.lower), default=[])
    n_days = raw.scrape_date.nunique()
    st.caption(f"{n_days} scrape day{'s' if n_days != 1 else ''} in range")

base = raw[raw["rank"] <= top_n]
if excl_ads:
    base = base[~base.is_ad]
if excl_pinned:
    base = base[~base.is_pinned]
base = base[base.subcategory.isin(subs)]
filtered = base[base.origin.isin(origins)]
if brand_sel:
    filtered = filtered[filtered.brand.isin(brand_sel)]

latest_date, first_date = raw.scrape_date.max(), raw.scrape_date.min()
ctx = {
    "raw": raw, "base": base, "filtered": filtered, "latest": base[base.scrape_date == latest_date],
    "det": data.details(), "top_n": top_n, "latest_date": latest_date, "first_date": first_date,
    "multi_day": n_days > 1, "user_email": USER_EMAIL, "subs": subs,
}

# status banner
runs = data.runs(3)
if not runs.empty:
    last = runs.iloc[0]
    if last.blocked:
        st.error(f"Latest scrape ({pd.to_datetime(last.scraped_at):%d %b %H:%M} UTC) was blocked by Nykaa. Showing the last successful run.")
    elif not last.success:
        st.warning(f"Latest scrape ({pd.to_datetime(last.scraped_at):%d %b}) had failures. See Data & method.")
    if (date.today() - pd.to_datetime(last.scrape_date).date()).days > 2:
        st.warning(f"Data is stale: last scrape {pd.to_datetime(last.scrape_date):%d %b %Y}.")

pages = [
    st.Page(lambda: overview.render(ctx), title="Overview", default=True),
    st.Page(lambda: market.render(ctx), title="Market structure", url_path="market"),
    st.Page(lambda: brands.render(ctx), title="Brand comparison", url_path="brands"),
    st.Page(lambda: launches.render(ctx), title="Launches", url_path="launches"),
    st.Page(lambda: pricing.render(ctx), title="Pricing", url_path="pricing"),
    st.Page(lambda: momentum.render(ctx), title="Ratings & momentum", url_path="momentum"),
    st.Page(lambda: data_health.render(ctx), title="Data & method", url_path="data"),
]
if data.is_admin(USER_EMAIL):
    pages.append(st.Page(lambda: admin.render(ctx), title="Admin · brands", url_path="admin"))
nav = st.navigation(pages, position="sidebar")
auth.logout_button()
nav.run()
