from __future__ import annotations

import pandas as pd
import streamlit as st

from .. import config as C, data, styles as S


def render(ctx: dict) -> None:
    S.hero("About the data", "Everything here comes from Nykaa's own app listings and product pages, collected once a day. "
           "Nothing is estimated except where stated.")
    S.section("01 · What is measured", "Definitions", "")
    st.markdown("""
- **Shelf / share of shelf**: the top-N products in a category on Nykaa's app "popularity" listing. Share is the fraction of those slots held by brands of one origin.
- **Origin**: K-beauty, Local (India) or Global, from a curated list plus the product page's country of origin and Nykaa's own Korean Beauty store placement. Unconfirmed cases are reviewed in Admin.
- **Sells as Korean**: an Indian or global brand whose product names or placement present the product as Korean (e.g. "Korean", "glass skin", Jeju) or whose products are made in South Korea.
- **Paid slot**: Nykaa's AD tag or a "featured" pinned position. Both are recorded; the Paid filter excludes them.
- **Price**: selling price on the listing; MRP is the list price. Typical = median.
- **Ratings vs reviews**: ratings is Nykaa's star count on the listing; text reviews come from the reviews endpoint.
- **New product / on Nykaa since**: Nykaa shows no launch date, so the oldest review is the proxy. **Ratings a day** = ratings ÷ days since that first review, a traction measure for products under about six months old.
- **USP, targets, key ingredients, shoppers say**: from Nykaa product pages (highlight attributes, Nykaa's own product summary, review key phrases with sentiment). Fetched once per product.
""")
    S.section("02 · Collection", "Scraper runs", "")
    r = data.runs(20).copy()
    if not r.empty:
        r["status"] = r.apply(lambda x: "blocked" if x.blocked else ("ok" if x.success else "failed"), axis=1)
        r["minutes"] = ((pd.to_datetime(r.finished_at) - pd.to_datetime(r.scraped_at)).dt.total_seconds() / 60).round(1)
        st.dataframe(r[["scrape_date", "status", "total_rows", "review_requests", "minutes", "runner"]].rename(columns={
            "scrape_date": "Date", "status": "Status", "total_rows": "Rows", "review_requests": "Review calls", "minutes": "Minutes", "runner": "Runner"}),
            width="stretch", hide_index=True, column_config={"Date": st.column_config.DateColumn(format="DD MMM YYYY")})
    latest, det = ctx["latest"], ctx["det"]
    n_det = int(latest.product_id.isin(det.product_id).sum()) if not det.empty else 0
    S.note(f"{int(latest.first_review_date.notna().sum())} of {len(latest)} listed products have a first-review date "
           f"(only products under 300 ratings are checked); {n_det} of {len(latest)} have product-page details.")
    S.note("Nykaa is protected by Akamai. A blocked run is recorded and shown as a gap, never filled with estimates.")
