"""Compare brands: profile cards, presence by category, then products side by side."""
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
        return f'<div class="k">{html.escape(k)}</div><div style="font-size:13.5px;margin-top:2px">{v}</div>'
    hdr = f'<div class="brand">{S.origin_tag(p["origin"])}' + (' · <span class="pill ad">Sells as Korean</span>' if p["k_marketing"] else "") + '</div>'
    top = (f'<div class="name" style="font-size:20px;font-weight:800;margin-top:4px">{html.escape(p["brand"])}</div>'
           f'<div class="meta">{"Made in " + html.escape(p["country"]) if p.get("country") else ""}</div>')
    slots = f'{p["slots"]} products in the top listings' + (f' ({p["slots_change"]:+d} vs period start)' if "slots_change" in p else "")
    body = (row("Visibility", f'{slots}<br>best rank #{p["best_rank"]}, typical #{p["avg_rank"]:.0f}')
            + row("Price point", f'₹{p["median_price"]:,.0f} typical · ₹{p["min_price"]:,.0f}–{p["max_price"]:,.0f}' + (f' · {p["avg_discount"]:.0f}% off MRP' if p["avg_discount"] == p["avg_discount"] else ""))
            + row("Rating", f'★ {p["avg_rating"]:.2f} from {p["ratings"]:,} ratings' + (f' · {p["ratings_added"]:+,} new' if "ratings_added" in p else ""))
            + row("Paid visibility", f'{p["paid_share"]:.0%} of its slots are AD or featured')
            + row("Categories", html.escape(", ".join(L.get(c, c) for c in p["categories"]))))
    if p["top_concerns"]:
        body += row("Sells against", S.pills(p["top_concerns"]))
    if p["top_ingredients"]:
        body += row("Leans on", S.pills(p["top_ingredients"]))
    if p["positive_phrases"] or p["negative_phrases"]:
        body += row("Shoppers say", S.pills(p["positive_phrases"], "pos") + S.pills(p["negative_phrases"], "neg"))
    return f'<div class="card">{hdr}{top}{body}</div>'


def render(ctx: dict) -> None:
    latest, base, det, multi, as_of = ctx["latest"], ctx["base"], ctx["det"], ctx["multi_day"], ctx["latest_date"]
    S.hero("Compare brands", "Pick two to four brands. See how visible each is, what it charges, how shoppers rate it, "
           "and then its leading products side by side with what they claim and what buyers say.")

    all_brands = sorted(latest.brand.unique(), key=str.lower)
    tracked = [b for b in all_brands if norm(b) in {norm(t) for t in C.TRACKED_BRANDS}]
    lb = M.brand_leaderboard(latest, None, top=300)
    default = list(dict.fromkeys(tracked[:1] + list(lb[lb.origin == "kbeauty"].brand[:2]) + list(lb[lb.origin == "local"].brand[:1])))[:4]
    picked = st.multiselect("Brands", all_brands, default=[b for b in default if b in all_brands], max_selections=4, label_visibility="collapsed")
    if len(picked) < 2:
        st.info("Pick at least two brands."); return

    S.section("01 · At a glance", "The brands side by side", "Visibility, price point, ratings and paid placement from the listings; claims, ingredients and shopper sentiment from Nykaa product pages.")
    for col, b in zip(st.columns(len(picked)), picked):
        col.markdown(_profile_card(M.brand_profile(latest, det, b, base if multi else None)), unsafe_allow_html=True)

    S.section("02 · Where they compete", "Presence by category", "Products in the top listings, best rank and typical price. Blank means the brand is absent from that category's top listings.")
    rows = []
    for sub in [s for s in L if s in set(latest.subcategory)]:
        row = {"Category": L[sub]}
        for b in picked:
            g = latest[(latest.subcategory == sub) & (latest.brand == b)]
            row[b] = f"{len(g)} · best #{int(g['rank'].min())} · ₹{g.price.median():,.0f}" if len(g) else ""
        rows.append(row)
    st.dataframe(pd.DataFrame(rows).set_index("Category"), width="stretch")

    subs_with = [s for s in L if s in set(latest[latest.brand.isin(picked)].subcategory)]
    S.section("03 · Product versus product", "Their leading products in one category", "Each brand's best-ranked products. Price per ml normalises pack sizes; 'targets' are the concerns the product page claims.")
    c1, c2 = st.columns([2, 1])
    sub = c1.selectbox("Category", subs_with, format_func=lambda s: L.get(s, s), key="cmp_sub")
    n_show = c2.selectbox("Products per brand", [1, 2, 3], index=1)
    dmap = det.set_index("product_id").to_dict("index") if not det.empty else {}
    for col, b in zip(st.columns(len(picked)), picked):
        g = latest[(latest.subcategory == sub) & (latest.brand == b)].sort_values("rank").head(n_show)
        with col:
            if g.empty:
                st.markdown(f"**{html.escape(b)}**"); st.caption("Not in this category's top listings.")
            for _, r in g.iterrows():
                st.markdown(S.product_card(r.to_dict(), dmap.get(r.product_id), as_of), unsafe_allow_html=True)
                st.write("")
