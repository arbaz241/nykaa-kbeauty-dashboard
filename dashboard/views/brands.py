from __future__ import annotations

import html

import pandas as pd
import streamlit as st

from .. import config as C, metrics as M, styles as S
from ..data import norm

L = C.SUBCATEGORY_LABELS
O = C.ORIGIN_LABELS


def _profile_card(p: dict) -> str:
    def row(k, v):
        return f'<div class="k">{html.escape(k)}</div><div class="v">{v}</div>'
    cats = ", ".join(L.get(c, c) for c in p["categories"])
    hdr = f'<div class="brand">{S.origin_tag(p["origin"])}' + (' · <span class="pill ad">Korean positioning</span>' if p["k_marketing"] else "") + '</div>'
    top = (f'<div class="name" style="font-size:18px;min-height:0">{html.escape(p["brand"])}</div>'
           f'<div class="meta">{"Made in " + html.escape(p["country"]) if p.get("country") else ""}</div>')
    slots = f'{p["slots"]} slots' + (f' ({p["slots_change"]:+d})' if "slots_change" in p else "")
    body = (row("Visibility", f'{slots} · best #{p["best_rank"]} · avg #{p["avg_rank"]:.0f}')
            + row("Categories", html.escape(cats))
            + row("Price point", f'₹{p["median_price"]:,.0f} median · ₹{p["min_price"]:,.0f}–{p["max_price"]:,.0f}' + (f' · {p["avg_discount"]:.0f}% off' if p["avg_discount"] == p["avg_discount"] else ""))
            + row("Rating", f'★ {p["avg_rating"]:.2f} · {p["ratings"]:,} ratings' + (f' ({p["ratings_added"]:+,} in range)' if "ratings_added" in p else ""))
            + row("Paid placement", f'{p["paid_share"]:.0%} of slots')
            + row("Launches (90d)", f'{p["new_products"]}'))
    if p["top_concerns"]:
        body += row("Claims to solve", S.pills(p["top_concerns"]))
    if p["top_ingredients"]:
        body += row("Hero ingredients", S.pills(p["top_ingredients"]))
    if p["positive_phrases"] or p["negative_phrases"]:
        body += row("Shoppers say", S.pills(p["positive_phrases"], "pos") + S.pills(p["negative_phrases"], "neg"))
    return f'<div class="card">{hdr}{top}{body}</div>'


def render(ctx: dict) -> None:
    latest, base, det, multi = ctx["latest"], ctx["base"], ctx["det"], ctx["multi_day"]
    as_of = ctx["latest_date"]

    S.eyebrow("Brand comparison")
    st.title("Brand vs brand")
    S.lede("Compare up to four brands on visibility, price point, ratings, paid placement, and what their products claim. "
           "Then drill into one category to see their leading products side by side.")

    all_brands = sorted(latest.brand.unique(), key=str.lower)
    tracked = [b for b in all_brands if norm(b) in {norm(t) for t in C.TRACKED_BRANDS}]
    lb = M.brand_leaderboard(latest, None, top=200)
    top_k = list(lb[lb.origin == "kbeauty"].brand[:2]); top_l = list(lb[lb.origin == "local"].brand[:1]); top_g = list(lb[lb.origin == "global"].brand[:1])
    default = list(dict.fromkeys((tracked[:1] + top_k + top_l + top_g)))[:4]
    picked = st.multiselect("Brands to compare (2 to 4)", all_brands, default=default, max_selections=4)
    if len(picked) < 2:
        st.info("Pick at least two brands.")
        return

    st.header("Portfolio")
    profiles = [M.brand_profile(latest, det, b, base if multi else None) for b in picked]
    cols = st.columns(len(picked))
    for col, p in zip(cols, profiles):
        col.markdown(_profile_card(p), unsafe_allow_html=True)

    st.header("Presence by category")
    S.sowhat("Products in the top listings, best rank, and median price per category. A blank cell means the brand is absent from that category's top listings.")
    rows = []
    for sub in [s for s in L if s in set(latest.subcategory)]:
        row = {"Category": L[sub]}
        for b in picked:
            g = latest[(latest.subcategory == sub) & (latest.brand == b)]
            row[b] = f"{len(g)} · best #{int(g['rank'].min())} · ₹{g.price.median():,.0f}" if len(g) else ""
        rows.append(row)
    st.dataframe(pd.DataFrame(rows).set_index("Category"), width="stretch")

    st.header("Products side by side")
    subs_with = [s for s in L if s in set(latest[latest.brand.isin(picked)].subcategory)]
    sub = st.selectbox("Category", subs_with, format_func=lambda s: L.get(s, s), key="cmp_sub")
    n_show = st.radio("Products per brand", [1, 2, 3], index=1, horizontal=True)
    S.sowhat("Each brand's best-ranked products in this category. USP, concerns, ingredients and shopper sentiment come from Nykaa product pages.")
    dmap = det.set_index("product_id").to_dict("index") if not det.empty else {}
    cols = st.columns(len(picked))
    for col, b in zip(cols, picked):
        g = latest[(latest.subcategory == sub) & (latest.brand == b)].sort_values("rank").head(n_show)
        with col:
            st.markdown(f"**{html.escape(b)}**")
            if g.empty:
                st.caption("Not in this category's top listings.")
            for _, r in g.iterrows():
                st.markdown(S.product_card(r.to_dict(), dmap.get(r.product_id), as_of), unsafe_allow_html=True)
                st.write("")
