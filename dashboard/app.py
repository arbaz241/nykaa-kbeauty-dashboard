"""Nykaa K-Beauty Intelligence — Streamlit entry point.

Run locally:  DASHBOARD_AUTH_DISABLED=1 .venv/bin/streamlit run dashboard/app.py
"""
from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dashboard import auth, config as C, data, ui as U  # noqa: E402
from dashboard.views import about, admin, brands, demand, launches, market  # noqa: E402

st.set_page_config(page_title="Nykaa K-Beauty Intelligence", page_icon="🧴", layout="wide", initial_sidebar_state="collapsed")
U.inject()
USER = auth.require_login()
SUB = C.SUBCATEGORY_LABELS

lo, hi = data.date_bounds()
if hi is None:
    st.warning("No scrape data in the database yet."); st.stop()

pages = [
    st.Page(lambda: market.render(ctx), title="Market", default=True),
    st.Page(lambda: demand.render(ctx), title="Demand", url_path="demand"),
    st.Page(lambda: brands.render(ctx), title="Brands", url_path="brands"),
    st.Page(lambda: launches.render(ctx), title="Launches", url_path="launches"),
    st.Page(lambda: about.render(ctx), title="Data", url_path="data"),
]
if data.is_admin(USER):
    pages.append(st.Page(lambda: admin.render(ctx), title="Admin", url_path="admin"))
nav = st.navigation(pages, position="hidden")

raw_all = data.snapshots(lo, hi)
n_days = raw_all.scrape_date.nunique()
U.shell(hi, n_days, USER)

bar = st.columns([0.75, 0.75, 0.75, 0.8, 0.6, 0.6, 1.5, 1.2, 0.9, 0.9, 0.7])
for col, p in zip(bar, pages):
    with col:
        st.page_link(p, label=p.title)
with bar[7]:
    cat = st.selectbox("Category", ["all"] + list(SUB), format_func=lambda s: "All categories" if s == "all" else SUB[s], label_visibility="collapsed")
with bar[8]:
    top_n = st.selectbox("Depth", [100, 50, 20], format_func=lambda n: f"Top {n}", label_visibility="collapsed")
with bar[9]:
    paid = st.selectbox("Paid", ["Incl. paid", "Excl. paid"], label_visibility="collapsed")
with bar[10]:
    if st.button("Sign out", use_container_width=True):
        st.session_state.pop("user_email", None); st.rerun()

raw = raw_all
base = raw[raw.subcategory.isin(SUB) & (raw["rank"] <= top_n)]
if paid == "Excl. paid":
    base = base[~base.is_paid]
if cat != "all":
    base = base[base.subcategory == cat]
latest_date, first_date = raw.scrape_date.max(), raw.scrape_date.min()
ctx = {
    "raw": raw, "base": base, "latest": base[base.scrape_date == latest_date], "det": data.details(),
    "top_n": top_n, "latest_date": latest_date, "first_date": first_date, "multi_day": n_days > 1,
    "user_email": USER, "cat": cat, "cat_label": SUB.get(cat),
}

runs = data.runs(2)
if not runs.empty:
    last = runs.iloc[0]
    if last.blocked:
        st.error(f"The latest collection ({pd.to_datetime(last.scraped_at):%d %b %H:%M} UTC) was blocked by Nykaa. Figures are from the last successful run.")
    elif (date.today() - pd.to_datetime(last.scrape_date).date()).days > 2:
        st.warning(f"Data is stale: last collection {pd.to_datetime(last.scrape_date):%d %b %Y}.")

nav.run()
