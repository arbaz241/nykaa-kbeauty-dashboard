from __future__ import annotations

import pandas as pd
import streamlit as st

from .. import charts, config as C, metrics as M, styles as S

L = C.SUBCATEGORY_LABELS
O = C.ORIGIN_LABELS


def render(ctx: dict) -> None:
    latest, base, multi, as_of = ctx["latest"], ctx["base"], ctx["multi_day"], ctx["latest_date"]
    S.eyebrow("Pricing")
    st.title("Price positioning")
    S.lede("Selling-price distributions, the K-beauty premium by category, discount depth, and price per millilitre where pack sizes allow it.")

    lp = latest[latest.origin != "unknown"]
    st.header(f"Price distribution by origin · {as_of:%d %b %Y}")
    S.sowhat("Box = middle 50% of listed products, line = median.")
    st.plotly_chart(charts.price_box(lp), width="stretch")

    med = lp.groupby(["subcategory", "origin"]).agg(median_price=("price", "median"), mean_discount=("discount_pct", "mean")).reset_index()
    piv = med.pivot(index="subcategory", columns="origin", values="median_price")
    prem = pd.DataFrame({"Category": [L.get(s, s) for s in piv.index], "K-beauty": piv.get("kbeauty"), "Local": piv.get("local"), "Global": piv.get("global")})
    prem["K vs Local"] = piv.get("kbeauty") / piv.get("local") if "kbeauty" in piv and "local" in piv else pd.NA
    prem["K vs Global"] = piv.get("kbeauty") / piv.get("global") if "kbeauty" in piv and "global" in piv else pd.NA
    c1, c2 = st.columns([1, 1])
    with c1:
        st.header("K-beauty premium")
        S.sowhat("Median selling price by origin and the K-beauty multiple.")
        st.dataframe(prem.set_index("Category"), width="stretch", column_config={
            "K-beauty": st.column_config.NumberColumn(format="₹%d"), "Local": st.column_config.NumberColumn(format="₹%d"),
            "Global": st.column_config.NumberColumn(format="₹%d"), "K vs Local": st.column_config.NumberColumn(format="%.2f×"),
            "K vs Global": st.column_config.NumberColumn(format="%.2f×")})
    with c2:
        st.header("Discount depth")
        S.sowhat("Average % off MRP. Deep discounting signals price-led competition.")
        st.plotly_chart(charts.grouped_bar(med, "mean_discount", ".0f", suffix="%"), width="stretch")

    st.header("Price per millilitre")
    S.sowhat("Normalises for pack size. Only products whose pack size parses (ml, g, oz) are included.")
    d = lp.copy(); d["ml"] = d.pack_size.map(M.pack_ml); d = d[d.ml.notna() & (d.ml > 0)]
    d["per_ml"] = d.price / d.ml
    if d.empty:
        st.caption("No parseable pack sizes yet.")
    else:
        pm = d.groupby(["subcategory", "origin"]).per_ml.median().rename("per_ml").reset_index()
        st.plotly_chart(charts.grouped_bar(pm, "per_ml", ".1f", prefix="₹"), width="stretch")
        st.caption(f"Based on {len(d)} of {len(lp)} listed products with a parseable pack size.")

    if multi:
        st.header("Median price over time")
        mt = base[base.origin != "unknown"].groupby(["scrape_date", "origin"]).price.median().reset_index()
        st.plotly_chart(charts.metric_lines(mt, "price", ",.0f"), width="stretch")
