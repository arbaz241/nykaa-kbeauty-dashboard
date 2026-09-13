from __future__ import annotations

import pandas as pd
import streamlit as st

from .. import charts, config as C, metrics as M, styles as S

L = C.SUBCATEGORY_LABELS
O = C.ORIGIN_LABELS


def render(ctx: dict) -> None:
    latest, base, det, top_n, multi = ctx["latest"], ctx["base"], ctx["det"], ctx["top_n"], ctx["multi_day"]
    as_of = ctx["latest_date"]

    S.eyebrow("Market structure")
    st.title("Who owns the shelf")
    S.lede("Visibility by origin in each category, how it is trending, how much of it is paid for, and where each origin prices.")

    st.header(f"Share of shelf by category · {as_of:%d %b %Y}")
    S.sowhat(f"Share of the top {top_n} listing slots held by each origin.")
    st.plotly_chart(charts.share_by_subcategory(M.share_table(latest, ["subcategory"])), width="stretch")

    c1, c2 = st.columns(2)
    with c1:
        st.header("Top 20 vs top 100")
        S.sowhat("Where an origin's share is higher in the top 20 than overall, it wins the positions that get seen.")
        t20 = M.share_table(latest[latest["rank"] <= 20], ["subcategory"]).pivot(index="subcategory", columns="origin", values="share")
        tall = M.share_table(latest, ["subcategory"]).pivot(index="subcategory", columns="origin", values="share")
        cmp = pd.DataFrame({"K top 20": t20.get("kbeauty"), f"K top {top_n}": tall.get("kbeauty"),
                            "Local top 20": t20.get("local"), f"Local top {top_n}": tall.get("local")})
        cmp.index = [L.get(s, s) for s in cmp.index]
        st.dataframe(cmp, width="stretch", column_config={c: st.column_config.NumberColumn(format="percent") for c in cmp.columns})
    with c2:
        st.header("Paid placement by origin")
        S.sowhat("Share of an origin's slots that are AD or featured-pinned. High paid share means visibility is bought, not earned.")
        p = latest[latest.origin != "unknown"].groupby(["subcategory", "origin"]).is_paid.mean().rename("paid").reset_index()
        p["paid"] = p.paid * 100
        st.plotly_chart(charts.grouped_bar(p, "paid", ".0f", suffix="%"), width="stretch")

    st.header("Share of shelf over time")
    if multi:
        st.plotly_chart(charts.share_trend(M.share_table(base, ["scrape_date"])), width="stretch")
        sub = st.selectbox("One category", list(dict.fromkeys(base.subcategory)), format_func=lambda s: L.get(s, s))
        st.plotly_chart(charts.share_trend(M.share_table(base[base.subcategory == sub], ["scrape_date"])), width="stretch")
    else:
        st.caption("Appears once more than one scrape day is in range.")

    st.header("Price tiers")
    S.sowhat("Where each origin's listed products sit by selling price. K-beauty concentrates in the ₹1,000+ tiers; Local under ₹1,000.")
    tiers = [t[2] for t in M.PRICE_TIERS]
    tm = M.tier_mix(latest)
    cols = st.columns(3)
    for col, o in zip(cols, ("kbeauty", "local", "global")):
        with col:
            st.subheader(O[o])
            st.plotly_chart(charts.tier_stack(tm, o, tiers), width="stretch")

    st.header("Concern landscape")
    if det.empty:
        st.caption("Appears once product details have been fetched (skin concerns come from Nykaa product pages).")
    else:
        S.sowhat("What the listed products claim to solve, by origin. Reveals where K-beauty competes on claims and where it is absent.")
        sub = st.selectbox("Category", list(dict.fromkeys(latest.subcategory)), format_func=lambda s: L.get(s, s), key="concern_sub")
        cl = M.concern_landscape(latest[latest.subcategory == sub], det)
        if cl.empty:
            st.caption("No concern attributes for this category yet.")
        else:
            st.plotly_chart(charts.concern_bars(cl), width="stretch")
