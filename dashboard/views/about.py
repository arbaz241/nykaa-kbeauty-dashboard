from __future__ import annotations

import pandas as pd
import streamlit as st

from .. import data, ui as U


def render(ctx: dict) -> None:
    latest, det = ctx["latest"], ctx["det"]
    U.page_head("Data and method", "Everything comes from Nykaa's app listings, search results, brand pages, product pages and reviews, collected daily. Nothing is estimated except where stated.")
    c1, c2 = st.columns([1.3, 1])
    with c1:
        defs = [
            ("Shelf", "Top-N products in a category on Nykaa's app popularity listing. Share = fraction of slots held by an origin."),
            ("Origin", "K-beauty, Local (India) or Global, from a curated list, product-page country of origin, and Nykaa's Korean Beauty store."),
            ("Sells as Korean", "An Indian brand whose product names claim Korean positioning or whose products are made in South Korea."),
            ("K-beauty search", "Top 20 results for Korean-intent searches (e.g. korean sunscreen, glass skin). Terms Nykaa redirects to a page are read from that page."),
            ("Demand", "Monthly count of dated reviews on the leading products of tracked and top competitor brands. A proxy for sales momentum."),
            ("Range conversion", "Products on the shelf ÷ products the brand lists on Nykaa in total (weekly)."),
            ("Paid slot / offers", "Nykaa's AD tag or featured pin; offers are listing promotions such as gifts and coupons."),
            ("Launch", "First review within 90 days. Ratings/day = ratings ÷ days since first review."),
        ]
        U.md(U.panel("Definitions", U.table([("Term", ""), ("Meaning", "")], [[f"<b>{k}</b>", U.esc(v)] for k, v in defs])))
    with c2:
        r = data.runs(12)
        rows = []
        for x in r.itertuples():
            status = '<span class="down">blocked</span>' if x.blocked else ('<span class="up">ok</span>' if x.success else '<span class="down">failed</span>')
            mins = (pd.to_datetime(x.finished_at) - pd.to_datetime(x.scraped_at)).total_seconds() / 60 if x.finished_at else None
            rows.append([f"{pd.to_datetime(x.scrape_date):%d %b}", status, f'<span class="mono">{x.total_rows}</span>', f"{mins:.0f} min" if mins else "–", f'<span class="m">{U.esc(x.runner)}</span>'])
        n_det = int(latest.product_id.isin(det.product_id).sum()) if not det.empty else 0
        U.md(U.panel("Collection runs", U.table([("Date", ""), ("Status", ""), ("Rows", "n"), ("Took", "n"), ("Runner", "")], rows),
                     foot=f"{n_det} of {len(latest)} shelf products have product-page details. Nykaa sits behind Akamai: a blocked run is recorded as a gap, never back-filled."))
