from __future__ import annotations

import pandas as pd
import streamlit as st

from .. import charts, config as C, data, metrics as M, styles as S
from scraper.brands import brand_stats
from scraper.newness import brand_newness

L = C.SUBCATEGORY_LABELS
O = C.ORIGIN_LABELS


def render(ctx: dict) -> None:
    latest, det, top_n, as_of = ctx["latest"], ctx["det"], ctx["top_n"], ctx["latest_date"]
    S.eyebrow("Launches and entrants")
    st.title("What is new, and is it working")
    S.lede(f"Products whose first Nykaa review is within {C.NEW_WINDOW_DAYS} days, ranked by the ratings they gain per day. "
           "New brands, brands entering these categories, and Indian brands positioning as Korean.")

    radar = M.launch_radar(latest, as_of)
    st.header("Launch traction")
    S.sowhat("Ratings per day since the first review is the cleanest early read on sell-through Nykaa exposes.")
    if radar.ratings_per_day.notna().any():
        st.plotly_chart(charts.velocity_bars(radar), width="stretch")
    dmap = det.set_index("product_id").to_dict("index") if not det.empty else {}
    top = radar[radar.ratings_per_day.notna()].head(4)
    if len(top):
        cols = st.columns(len(top))
        for col, (_, r) in zip(cols, top.iterrows()):
            col.markdown(S.product_card(r.to_dict(), dmap.get(r.product_id), as_of), unsafe_allow_html=True)

    st.header("All new products in the top listings")
    t = radar.copy(); t["name"] = [M.short_name(n, b) for n, b in zip(t.name, t.brand)]
    t["Category"] = t.subcategory.map(lambda s: L.get(s, s)); t["Origin"] = t.origin.map(O)
    st.dataframe(t[["Category", "rank", "brand", "Origin", "name", "price", "rating", "rating_count", "review_count", "first_review_date", "ratings_per_day", "is_new_tag"]].rename(columns={
        "rank": "Rank", "brand": "Brand", "name": "Product", "price": "₹", "rating": "Rating", "rating_count": "Ratings", "review_count": "Text reviews",
        "first_review_date": "First review", "ratings_per_day": "Ratings/day", "is_new_tag": "Nykaa NEW tag"}),
        width="stretch", hide_index=True, column_config={
            "₹": st.column_config.NumberColumn(format="₹%d"), "First review": st.column_config.DateColumn(format="DD MMM YYYY"),
            "Ratings/day": st.column_config.NumberColumn(format="%.1f"), "Product": st.column_config.TextColumn(width="large")})

    st.header("New brands and category entrants")
    rows = latest.to_dict("records")
    for r in rows:
        r["first_review_date"] = None if pd.isna(r["first_review_date"]) else str(r["first_review_date"])[:10]
        r["review_count"] = None if pd.isna(r["review_count"]) else int(r["review_count"])
    stats = brand_stats(rows)
    bsrc = data.brands().set_index("brand").source
    nb = []
    for b, s in stats.items():
        n = brand_newness(s, as_of.date(), known_brand=(bsrc.get(b) == "seed"))
        if n["is_new_entrant"]:
            nb.append({"Brand": b, "Origin": O.get(latest[latest.brand == b].origin.iloc[0], "?"),
                       "Status": "New brand" if n["is_new_brand"] else "Known brand, new to these categories",
                       "Oldest first review": n["brand_first_review_date"], "Products listed": s["n"], "Basis": n["newness_basis"]})
    if nb:
        st.dataframe(pd.DataFrame(nb).sort_values(["Status", "Oldest first review"]), width="stretch", hide_index=True)
    else:
        st.caption("None detected in the current top listings.")

    st.header("Indian and global brands with Korean positioning")
    S.sowhat("Brands whose product names or placement sell the product as Korean without being Korean. They compete for the K-beauty shopper at lower price points.")
    km = data.brands()
    km = km[km.k_marketing & (km.origin != "kbeauty")][["brand", "origin", "k_marketing_evidence", "n_products"]].copy()
    km["origin"] = km.origin.map(O)
    st.dataframe(km.rename(columns={"brand": "Brand", "origin": "Origin", "k_marketing_evidence": "Evidence", "n_products": "Products seen"}),
                 width="stretch", hide_index=True, column_config={"Evidence": st.column_config.TextColumn(width="large")})
