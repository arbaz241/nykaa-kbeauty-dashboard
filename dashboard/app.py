"""Nykaa K-Beauty Market Dashboard — Streamlit entry point.

Run locally:  DATABASE_URL=... DASHBOARD_AUTH_DISABLED=1 .venv/bin/streamlit run dashboard/app.py
"""
from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dashboard import auth, config as C, data, styles as S  # noqa: E402
from dashboard.views import about, admin, brands, overview  # noqa: E402

st.set_page_config(page_title="Nykaa K-Beauty Market", page_icon="🧴", layout="wide", initial_sidebar_state="collapsed")
S.inject()
USER_EMAIL = auth.require_login()
SUB = C.SUBCATEGORY_LABELS

lo, hi = data.date_bounds()
if hi is None:
    st.title("Nykaa K-Beauty Market"); st.warning("No scrape data in the database yet."); st.stop()

is_admin = data.is_admin(USER_EMAIL)
pages = [
    st.Page(lambda: overview.render(ctx), title="Overview", default=True),
    st.Page(lambda: brands.render(ctx), title="Compare brands", url_path="brands"),
    st.Page(lambda: about.render(ctx), title="About the data", url_path="about"),
]
if is_admin:
    pages.append(st.Page(lambda: admin.render(ctx), title="Admin", url_path="admin"))
nav = st.navigation(pages, position="hidden")

# ------------------------------------------------------------------ top bar + nav
S.topbar(hi)
ncols = st.columns([1.1, 1.5, 1.5, 1.0, 3.2, 1.0])
for col, p in zip(ncols, pages):
    with col:
        st.page_link(p, label=p.title)
with ncols[-1]:
    if st.button("Sign out", key="signout", help=USER_EMAIL):
        st.session_state.pop("user_email", None); st.rerun()

# ------------------------------------------------------------------ filters (one row)
f1, f2, f3, f4 = st.columns([1.4, 1, 1, 1.2])
with f1:
    cat_opts = ["all"] + list(SUB)
    cat = st.selectbox("Category", cat_opts, format_func=lambda s: "All categories" if s == "all" else SUB[s])
with f2:
    preset = st.selectbox("Period", ["Last 7 days", "Last 30 days", "Last 90 days", "All data"], index=1)
with f3:
    top_n = st.selectbox("Listing depth", [20, 50, 100], index=2, format_func=lambda n: f"Top {n}")
with f4:
    paid = st.selectbox("Paid slots", ["Include", "Exclude AD + featured"], index=0)

if preset == "All data":
    d_from, d_to = lo, hi
else:
    days = int(preset.split()[1]); d_from, d_to = max(lo, hi - timedelta(days=days - 1)), hi

raw = data.snapshots(d_from, d_to)
if raw.empty:
    st.warning("No rows in the selected period."); st.stop()
raw = raw[raw.subcategory.isin(SUB)]
base = raw[raw["rank"] <= top_n]
if paid.startswith("Exclude"):
    base = base[~base.is_paid]
if cat != "all":
    base = base[base.subcategory == cat]
n_days = raw.scrape_date.nunique()
latest_date, first_date = raw.scrape_date.max(), raw.scrape_date.min()
ctx = {
    "raw": raw, "base": base, "filtered": base, "latest": base[base.scrape_date == latest_date],
    "det": data.details(), "top_n": top_n, "latest_date": latest_date, "first_date": first_date,
    "multi_day": n_days > 1, "user_email": USER_EMAIL, "cat": cat, "cat_label": SUB.get(cat) if cat != "all" else None,
}

runs = data.runs(3)
if not runs.empty:
    last = runs.iloc[0]
    if last.blocked:
        st.error(f"Latest scrape ({pd.to_datetime(last.scraped_at):%d %b %H:%M} UTC) was blocked by Nykaa. Showing the last successful run.")
    if (date.today() - pd.to_datetime(last.scrape_date).date()).days > 2:
        st.warning(f"Data is stale: last scrape {pd.to_datetime(last.scrape_date):%d %b %Y}.")

nav.run()
