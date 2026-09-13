from __future__ import annotations

import pandas as pd
import streamlit as st

from .. import charts, config as C, metrics as M, styles as S

L = C.SUBCATEGORY_LABELS
O = C.ORIGIN_LABELS


def render(ctx: dict) -> None:
    latest, base, det, top_n = ctx["latest"], ctx["base"], ctx["det"], ctx["top_n"]
    as_of, first_date, multi = ctx["latest_date"], ctx["first_date"], ctx["multi_day"]

    S.eyebrow(f"Nykaa India · {latest.subcategory.nunique()} categories · top {top_n} listings · as of {as_of:%d %B %Y}")
    st.title("K-beauty on Nykaa: market position")
    S.lede("Where Korean brands stand against Indian and global competitors on Nykaa's app listings: "
           "visibility, price positioning, paid placement, and launch momentum.")

    snap = M.category_snapshot(latest)
    radar = M.launch_radar(latest, as_of)
    lb = M.brand_leaderboard(latest, base if multi else None, top=40)
    kbrands = lb[lb.origin == "kbeauty"]

    k_now = (latest.origin == "kbeauty").mean()
    first = base[base.scrape_date == first_date]
    k_first = (first.origin == "kbeauty").mean() if multi else None
    mk, ml = latest[latest.origin == "kbeauty"].price.median(), latest[latest.origin == "local"].price.median()
    paid_k = latest[latest.origin == "kbeauty"].is_paid.mean()
    paid_l = latest[latest.origin == "local"].is_paid.mean()
    new_n = int(radar.shape[0])
    km = latest[latest.k_marketing & (latest.origin != "kbeauty")].brand.nunique()

    S.kpi_row([
        S.kpi("K-beauty share of shelf", f"{k_now:.0%}", sub=f"of top-{top_n} slots" + (f" · vs {first_date:%d %b}" if multi else ""),
              delta=((k_now - k_first) * 100) if multi else None),
        S.kpi("K-beauty brands present", f"{latest[latest.origin == 'kbeauty'].brand.nunique()}", sub=f"of {latest.brand.nunique()} brands listed"),
        S.kpi("Price premium vs Local", f"{mk / ml:.1f}×" if ml else "–", sub=f"median ₹{mk:,.0f} vs ₹{ml:,.0f}"),
        S.kpi("Paid placement", f"{paid_k:.0%}", sub=f"of K-beauty slots · Local {paid_l:.0%}", ),
        S.kpi("Launches in top listings", f"{new_n}", sub=f"first review within {C.NEW_WINDOW_DAYS} days"),
        S.kpi("Korean-positioned Indian brands", f"{km}", sub="market products as Korean"),
    ])

    S.insights(M.narrative(latest, base, snap, radar, kbrands))

    st.header("Category snapshot")
    S.sowhat("Share of listing slots by origin, who leads each side, and how K-beauty is priced against Local. Top-20 share is where most clicks happen.")
    t = snap.copy()
    t["Category"] = t.subcategory.map(lambda s: L.get(s, s))
    show = pd.DataFrame({
        "Category": t.Category, "K-beauty": t.share_kbeauty, "K in top 20": t.kbeauty_top20, "Local": t.share_local, "Global": t.share_global,
        "Leading K-beauty brand": t.lead_kbeauty, "Leading Local brand": t.lead_local,
        "K median ₹": t.median_kbeauty, "Local median ₹": t.median_local, "Premium": t.premium_vs_local, "Paid slots": t.paid_share,
    }).set_index("Category")
    st.dataframe(show, width="stretch", column_config={
        "K-beauty": st.column_config.ProgressColumn(format="percent", min_value=0, max_value=1),
        "K in top 20": st.column_config.NumberColumn(format="percent"),
        "Local": st.column_config.NumberColumn(format="percent"), "Global": st.column_config.NumberColumn(format="percent"),
        "K median ₹": st.column_config.NumberColumn(format="₹%d"), "Local median ₹": st.column_config.NumberColumn(format="₹%d"),
        "Premium": st.column_config.NumberColumn(format="%.1f×"), "Paid slots": st.column_config.NumberColumn(format="percent"),
    })
    # percentages: Streamlit NumberColumn % expects 0-100 for "%.0f%%"; convert
    # (handled by displaying fractions*100 below if needed)

    c1, c2 = st.columns([1.15, 1])
    with c1:
        st.header("Brand leaderboard")
        S.sowhat("Brands by number of top-listing slots. Paid share shows how much of that visibility is bought.")
        b = lb.head(15).copy()
        b["Origin"] = b.origin.map(O)
        cols = {"brand": "Brand", "Origin": "Origin", "slots": "Slots", "categories": "Categories", "best_rank": "Best rank",
                "median_price": "Median ₹", "avg_rating": "Rating", "paid_share": "Paid"}
        if multi:
            cols["slots_change"] = "Δ slots"; cols["ratings_added"] = "Ratings added"
        st.dataframe(b[list(cols)].rename(columns=cols), width="stretch", hide_index=True, column_config={
            "Median ₹": st.column_config.NumberColumn(format="₹%d"), "Rating": st.column_config.NumberColumn(format="%.2f"),
            "Paid": st.column_config.NumberColumn(format="percent"), "Ratings added": st.column_config.NumberColumn(format="%+d")})
    with c2:
        st.header("Launch radar")
        S.sowhat("New products already inside the top listings, ranked by ratings gained per day since their first review.")
        r = radar.head(10).copy()
        r["Category"] = r.subcategory.map(lambda s: L.get(s, s)); r["Origin"] = r.origin.map(O)
        st.dataframe(r[["brand", "name", "Category", "Origin", "rank", "price", "ratings_per_day", "first_review_date"]].rename(columns={
            "brand": "Brand", "name": "Product", "rank": "Rank", "price": "₹", "ratings_per_day": "Ratings/day", "first_review_date": "First review"}),
            width="stretch", hide_index=True, column_config={
                "Product": st.column_config.TextColumn(width="medium"), "₹": st.column_config.NumberColumn(format="₹%d"),
                "Ratings/day": st.column_config.NumberColumn(format="%.1f"), "First review": st.column_config.DateColumn(format="DD MMM YY")})

    st.header("Movers")
    if multi:
        g, l = M.movers(base)
        c1, c2 = st.columns(2)
        for col, d, title in ((c1, g, "Biggest rank gains"), (c2, l, "Biggest rank losses")):
            with col:
                st.subheader(title)
                d = d.copy(); d["Category"] = d.subcategory.map(lambda s: L.get(s, s)); d["Origin"] = d.origin.map(O)
                st.dataframe(d[["brand", "name", "Category", "Origin", "rank_start", "rank", "change"]].rename(columns={
                    "brand": "Brand", "name": "Product", "rank_start": f"Rank {first_date:%d %b}", "rank": f"Rank {as_of:%d %b}", "change": "Change"}),
                    width="stretch", hide_index=True, column_config={"Change": st.column_config.NumberColumn(format="%+d")})
    else:
        st.caption(f"Rank gains and losses appear once more than one scrape day is in range (data starts {first_date:%d %b %Y}).")
