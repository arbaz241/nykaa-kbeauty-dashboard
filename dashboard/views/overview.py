"""Overview: the whole story on one page, in reading order. Simple bars only."""
from __future__ import annotations

import html

import pandas as pd
import streamlit as st

from .. import charts, config as C, metrics as M, styles as S

L = C.SUBCATEGORY_LABELS
O = C.ORIGIN_LABELS
HEX = C.ORIGIN_COLORS


def _b(x) -> str:
    return f"<b>{html.escape(str(x))}</b>"


def render(ctx: dict) -> None:
    latest, base, det, top_n = ctx["latest"], ctx["base"], ctx["det"], ctx["top_n"]
    as_of, first_date, multi = ctx["latest_date"], ctx["first_date"], ctx["multi_day"]
    cat_label = ctx["cat_label"]

    snap = M.category_snapshot(latest)
    radar = M.launch_radar(latest, as_of)
    lb = M.brand_leaderboard(latest, base if multi else None, top=200)
    k = latest[latest.origin == "kbeauty"]; loc = latest[latest.origin == "local"]; glo = latest[latest.origin == "global"]

    S.hero("How K-beauty is doing on Nykaa" + (f" in {cat_label}" if cat_label else ""),
           "Korean brands versus Indian and global brands in Nykaa's best-selling listings: how visible they are, "
           "how they are priced, whether that visibility is paid for, and which new products are catching on.")

    # ------------------------------------------------------------ the picture in numbers
    k_share = (latest.origin == "kbeauty").mean()
    k_first = (base[base.scrape_date == first_date].origin == "kbeauty").mean() if multi else None
    mk, ml_ = k.price.median(), loc.price.median()
    paid_k, paid_l = k.is_paid.mean(), loc.is_paid.mean()
    S.num_row([
        S.num(f"{k_share:.0%}", "of the shelf is K-beauty", f"{len(k)} of {len(latest)} top-{top_n} slots" + (f" · {k.brand.nunique()} brands" if len(k) else ""),
              delta=((k_share - k_first) * 100) if multi else None, ref=f"{first_date:%d %b}"),
        S.num(f"{mk / ml_:.1f}×" if ml_ and mk == mk else "–", "the Local price", f"K-beauty median ₹{mk:,.0f} vs Local ₹{ml_:,.0f}" if ml_ and mk == mk else "no K-beauty products here"),
        S.num(f"{paid_k:.0%}", "of K-beauty slots are paid", f"AD or featured pins · Local brands {paid_l:.0%}"),
        S.num(f"{len(radar)}", "new products in the listings", f"first reviewed within {C.NEW_WINDOW_DAYS} days · {int((radar.origin == 'kbeauty').sum())} K-beauty"),
    ])

    # ------------------------------------------------------------ 01 visibility
    if cat_label:
        take = (f"K-beauty holds {_b(f'{k_share:.0%}')} of the top {top_n} in {cat_label}. In the top 20, where most clicks happen, it holds "
                f"{_b(f'{(latest[latest['rank'] <= 20].origin == 'kbeauty').mean():.0%}')}.")
    else:
        hi, lo = snap.sort_values("share_kbeauty", ascending=False).iloc[0], snap.sort_values("share_kbeauty").iloc[0]
        t20 = (latest[latest["rank"] <= 20].origin == "kbeauty").mean()
        take = (f"K-beauty is strongest in {_b(L.get(hi.subcategory))} ({hi.share_kbeauty:.0%} of slots) and weakest in "
                f"{_b(L.get(lo.subcategory))} ({lo.share_kbeauty:.0%}). In the top 20 positions overall it holds {_b(f'{t20:.0%}')}, "
                + ("more than its overall share: where it competes, it ranks well." if t20 > k_share + 0.02 else
                   "less than its overall share: its products sit deeper in the lists." if t20 < k_share - 0.02 else "in line with its overall share."))
    S.section("01 · Visibility", "Who owns the shelf", take)
    S.legend()
    if cat_label:
        st.plotly_chart(charts.rank_band_bars(latest), width="stretch")
        S.note("Share of slots by origin in rank bands. Top 20 is the part of the list most shoppers see.")
    else:
        st.plotly_chart(charts.share_by_subcategory(M.share_table(latest, ["subcategory"]), show_legend=False), width="stretch")
        S.note(f"Share of the top {top_n} listing slots in each category, by brand origin.")

    # ------------------------------------------------------------ 02 leaders
    kb = lb[lb.origin == "kbeauty"].head(6); lc = lb[lb.origin == "local"].head(6)
    lead_k = kb.iloc[0] if len(kb) else None; lead_l = lc.iloc[0] if len(lc) else None
    take = ""
    if lead_k is not None:
        take += f"{_b(lead_k.brand)} is the most visible K-beauty brand with {int(lead_k.slots)} listed products (best rank #{int(lead_k.best_rank)}). "
    if lead_l is not None:
        take += f"On the Indian side {_b(lead_l.brand)} leads with {int(lead_l.slots)} products. "
    if lead_k is not None and lead_l is not None:
        take += f"The gap between them, {int(lead_l.slots - lead_k.slots)} products, is the scale difference K-beauty faces."
    S.section("02 · Leaders", "The brands that hold the positions", take)
    c1, c2 = st.columns(2)
    for col, d, title, o in ((c1, kb, "Top K-beauty brands", "kbeauty"), (c2, lc, "Top Local brands", "local")):
        with col:
            st.markdown(f"**{title}**")
            rows = [{"label": r.brand, "meta": f"best #{int(r.best_rank)} · ★ {r.avg_rating:.1f} · ₹{r.median_price:,.0f}", "value": int(r.slots), "value_text": f"{int(r.slots)} products", "color": HEX[o]} for r in d.itertuples()]
            st.markdown(S.rowlist(rows, max_value=max(int(lb.slots.max()), 1)), unsafe_allow_html=True)
    S.note("Products in the top listings per brand. Bars are on the same scale in both lists.")

    # ------------------------------------------------------------ 03 price
    dk, dl = k.discount_pct.mean(), loc.discount_pct.mean()
    if ml_ and mk == mk:
        take = (f"K-beauty sells at {_b(f'{mk / ml_:.1f}× the Local median')} (₹{mk:,.0f} vs ₹{ml_:,.0f}) and discounts less "
                f"({dk:.0f}% vs {dl:.0f}% off MRP). It is not competing on price; it is charging for origin and formulation.")
        if len(glo):
            mg = glo.price.median()
            take += f" Global brands sit at ₹{mg:,.0f}, so K-beauty is {'above' if mk > mg else 'below'} them too."
    else:
        take = "No K-beauty products in this selection to price against."
    S.section("03 · Price", "What each origin charges", take)
    S.legend()
    med = latest[latest.origin != "unknown"].groupby(["subcategory", "origin"]).price.median().rename("median_price").reset_index()
    st.plotly_chart(charts.grouped_bar(med, "median_price", ",.0f", prefix="₹", show_legend=False), width="stretch")
    S.note("Median selling price of listed products, by category and origin.")

    # ------------------------------------------------------------ 04 launches
    hot = radar[radar.ratings_per_day.notna()].head(1)
    kn = radar[radar.origin == "kbeauty"]
    take = f"{_b(len(radar))} products in these listings were first reviewed in the last {C.NEW_WINDOW_DAYS} days, {len(kn)} of them K-beauty. "
    if len(hot):
        h = hot.iloc[0]
        take += (f"The fastest mover is {_b(h.brand + ' ' + M.short_name(h['name'], h.brand)[:40])} in {L.get(h.subcategory)}, "
                 f"already at #{int(h['rank'])} and adding about {h.ratings_per_day:.0f} ratings a day.")
    S.section("04 · Launches", "What is new and catching on", take)
    dmap = det.set_index("product_id").to_dict("index") if not det.empty else {}
    top = radar[radar.ratings_per_day.notna()].head(4)
    if len(top):
        for col, (_, r) in zip(st.columns(4), top.iterrows()):
            col.markdown(S.product_card(r.to_dict(), dmap.get(r.product_id), as_of, compact=True), unsafe_allow_html=True)
    with st.expander(f"All {len(radar)} new products"):
        t = radar.copy(); t["Product"] = [M.short_name(n, b) for n, b in zip(t.name, t.brand)]
        t["Category"] = t.subcategory.map(lambda s: L.get(s, s)); t["Origin"] = t.origin.map(O)
        st.dataframe(t[["Category", "rank", "brand", "Product", "Origin", "price", "rating_count", "first_review_date", "ratings_per_day"]].rename(columns={
            "rank": "Rank", "brand": "Brand", "price": "Price", "rating_count": "Ratings", "first_review_date": "First review", "ratings_per_day": "Ratings/day"}),
            width="stretch", hide_index=True, column_config={"Price": st.column_config.NumberColumn(format="₹%d"),
                                                             "First review": st.column_config.DateColumn(format="DD MMM YYYY"),
                                                             "Ratings/day": st.column_config.NumberColumn(format="%.1f")})

    # ------------------------------------------------------------ 05 movers (multi-day) or watch-outs
    if multi:
        g, l = M.movers(base)
        S.section("05 · Movement", f"What changed since {first_date:%d %b}",
                  f"Rank changes between {first_date:%d %b} and {as_of:%d %b}. Gains on the left, losses on the right.")
        c1, c2 = st.columns(2)
        for col, d, title in ((c1, g, "Climbing"), (c2, l, "Falling")):
            with col:
                st.markdown(f"**{title}**")
                rows = [{"label": f"{r.brand} {M.short_name(r.name, r.brand)[:34]}", "meta": f"{L.get(r.subcategory)} · #{int(r.rank_start)} → #{int(r['rank'])}",
                         "value": abs(int(r.change)), "value_text": f"{int(r.change):+d}", "color": HEX.get(r.origin, "#17171A")} for _, r in d.iterrows()]
                st.markdown(S.rowlist(rows), unsafe_allow_html=True)

    km = latest[latest.k_marketing & (latest.origin != "kbeauty")]
    kmb = km.brand.value_counts()
    take = (f"{_b(len(kmb))} Indian and global brands sell products as Korean in these listings"
            + (f", led by {', '.join(kmb.index[:3])}" if len(kmb) else "")
            + f". They target the K-beauty shopper at Local prices (median ₹{km.price.median():,.0f})." if len(kmb) else "No non-Korean brand is positioning as Korean in this selection.")
    S.section("06 · Watch-outs" if multi else "05 · Watch-outs", "Who is borrowing the K-beauty story", take)
    if len(kmb):
        dm = det.set_index("product_id") if not det.empty else None
        rows = []
        for b, n in kmb.head(8).items():
            ex = km[km.brand == b].sort_values("rank").iloc[0]
            rows.append({"label": b, "meta": f"e.g. {M.short_name(ex['name'], b)[:48]} · #{int(ex['rank'])} {L.get(ex.subcategory)}", "value": int(n), "value_text": f"{int(n)} products", "color": HEX["local"]})
        st.markdown(S.rowlist(rows), unsafe_allow_html=True)
    if not multi:
        S.note(f"Rank movement and share trends appear automatically once tomorrow's scrape adds a second day (data starts {first_date:%d %b %Y}).")
