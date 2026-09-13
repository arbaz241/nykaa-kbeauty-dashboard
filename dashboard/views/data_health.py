from __future__ import annotations

import pandas as pd
import streamlit as st

from .. import config as C, data, styles as S


def render(ctx: dict) -> None:
    raw, det = ctx["raw"], ctx["det"]
    S.eyebrow("Data and method")
    st.title("Where the numbers come from")
    S.lede("Daily scrapes of Nykaa's app listings, enriched from Nykaa's reviews and product-detail endpoints. "
           "Nothing is modelled or estimated except where stated.")

    st.header("Scraper runs")
    r = data.runs(30).copy()
    if r.empty:
        st.write("No runs recorded.")
    else:
        r["status"] = r.apply(lambda x: "blocked" if x.blocked else ("ok" if x.success else "failed"), axis=1)
        r["duration (min)"] = ((pd.to_datetime(r.finished_at) - pd.to_datetime(r.scraped_at)).dt.total_seconds() / 60).round(1)
        st.dataframe(r[["scrape_date", "scraped_at", "status", "total_rows", "review_requests", "duration (min)", "runner", "git_sha", "error_log"]],
                     width="stretch", hide_index=True, column_config={
                         "scrape_date": st.column_config.DateColumn("Date", format="DD MMM YYYY"),
                         "scraped_at": st.column_config.DatetimeColumn("Started (UTC)", format="DD MMM HH:mm"),
                         "error_log": st.column_config.TextColumn(width="large")})

    c1, c2 = st.columns(2)
    with c1:
        st.header("Coverage")
        cov = raw.groupby("scrape_date").agg(rows=("product_id", "size"), categories=("subcategory", "nunique"),
                                             web_fallback_rows=("listing_source", lambda s: (s == "web").sum())).reset_index()
        st.dataframe(cov.sort_values("scrape_date", ascending=False), width="stretch", hide_index=True,
                     column_config={"scrape_date": st.column_config.DateColumn("Date", format="DD MMM YYYY")})
    with c2:
        st.header("Enrichment")
        latest = ctx["latest"]
        st.markdown(S.kpi("Products with first-review date", f"{int(latest.first_review_date.notna().sum())} / {len(latest)}",
                          sub=f"only products under {300} ratings are enriched"), unsafe_allow_html=True)
        st.write("")
        n_det = int(latest.product_id.isin(det.product_id).sum()) if not det.empty else 0
        st.markdown(S.kpi("Products with detail attributes", f"{n_det} / {len(latest)}", sub="country of origin, concerns, ingredients, USP"), unsafe_allow_html=True)

    st.header("Definitions")
    st.markdown("""
- **Share of shelf**: share of the top-N listing slots in a category held by brands of an origin, on Nykaa's **app** ordering ("popularity" sort). Website ordering differs and is never mixed in.
- **Origin**: K-beauty / Local (India) / Global, from a curated seed list, Nykaa's Korean Beauty store placement, and the product page's country of origin. Unconfirmed classifications are marked in the admin screen.
- **Korean positioning**: a non-Korean brand whose product names or placement sell the product as Korean ("Korean", "K-beauty", "glass skin", Seoul, Jeju, hanbang), or whose products are made in South Korea.
- **Paid placement**: Nykaa's `AD` tag or "featured pinning" slot. Both are stored; filters let you exclude them.
- **Ratings vs reviews**: *ratings* is Nykaa's star-count on the listing; *text reviews* is the count from the reviews endpoint.
- **First review / launch date**: Nykaa exposes no launch date; the oldest review is the proxy. Fetched once per product for products under 300 ratings.
- **Ratings per day**: ratings ÷ days since first review. Meaningful for products under ~6 months old.
- **Price premium**: median selling price of one origin divided by another's, within a category.
- **USP, concerns, ingredients, shopper themes**: from Nykaa product pages (Highlights attributes, Nykaa's AI summary, review key phrases). Fetched once per product.
""")
    st.caption("Nykaa is protected by Akamai. A blocked run is recorded, never back-filled with estimates; gaps show as missing days.")
