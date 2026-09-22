"""Brands: head-to-head scorecard, range conversion across the market, products side by side."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from .. import config as C, data, metrics as M, ui as U
from ..data import norm

L = C.SUBCATEGORY_LABELS


def _scorecard(picked, latest, det, assort, mom, search) -> str:
    rows_def = []
    prof = {b: M.brand_profile(latest, det, b) for b in picked}
    asrt = assort.set_index("brand").total_products.to_dict() if len(assort) else {}
    momd = mom.set_index("brand").to_dict("index") if len(mom) else {}
    org = search[~search.is_ad & (search["sample"] == 1)].copy() if len(search) else search
    if len(org):
        org["organic_rank"] = org.groupby("query")["rank"].rank(method="first").astype(int)
    sq = org.groupby("brand").agg(terms=("query", "nunique"), hits=("product_id", "size"), best=("organic_rank", "min")).to_dict("index") if len(org) else {}
    offers = latest.groupby("brand").has_offer.mean().to_dict() if "has_offer" in latest else {}

    def row(label, fn):
        rows_def.append([f'<span class="m">{label}</span>'] + [fn(b) for b in picked])

    row("Origin", lambda b: U.origin_chip(prof[b]["origin"]) + (U.chip("sells as Korean", "i") if prof[b]["k_marketing"] else ""))
    row("Made in", lambda b: U.esc(prof[b].get("country") or "–"))
    row("Products on the shelf", lambda b: f'<b class="mono">{prof[b]["slots"]}</b> <span class="m">in {len(prof[b]["categories"])} categories</span>')
    row("Range on Nykaa", lambda b: f'<span class="mono">{asrt.get(b, "–")}</span>' + (f' <span class="m">· {prof[b]["slots"] / asrt[b]:.0%} reach the shelf</span>' if asrt.get(b) else ""))
    row("Best / typical rank", lambda b: f'#{prof[b]["best_rank"]} <span class="m">/ #{prof[b]["avg_rank"]:.0f}</span>')
    row("Typical price", lambda b: f'{U.inr(prof[b]["median_price"])} <span class="m">{U.inr(prof[b]["min_price"])}–{U.inr(prof[b]["max_price"])}</span>')
    row("Discount / offers", lambda b: f'{prof[b]["avg_discount"]:.0f}% off <span class="m">· {offers.get(b, 0):.0%} with offers</span>')
    row("Paid visibility", lambda b: f'{prof[b]["paid_share"]:.0%} <span class="m">of slots</span>')
    row("Rating", lambda b: f'★ {prof[b]["avg_rating"]:.2f} <span class="m">· {prof[b]["ratings"]:,}</span>')
    row("Demand, last 3 mo", lambda b: (f'<span class="mono">{int(momd[b]["last3"]):,}</span> ' + U.delta_html(momd[b]["growth"] * 100 if momd[b]["growth"] == momd[b]["growth"] else None, "{:+.0f}%")
                                         + U.sparkline(momd[b]["spark"], 70, 18, U.ORIGIN.get(prof[b]["origin"], U.INK2))) if b in momd else '<span class="m">not tracked</span>')
    row("In K-beauty searches", lambda b: f'{sq[b]["terms"]} terms <span class="m">· best #{sq[b]["best"]} unpaid</span>' if b in sq else '<span class="m">absent from unpaid results</span>')
    row("Sells against", lambda b: "".join(U.chip(c) for c in prof[b]["top_concerns"][:4]) or "–")
    row("Hero ingredients", lambda b: "".join(U.chip(c) for c in prof[b]["top_ingredients"][:4]) or "–")
    row("Shoppers praise", lambda b: "".join(U.chip(c, "pos") for c in prof[b]["positive_phrases"][:3]) or "–")
    row("Shoppers criticise", lambda b: "".join(U.chip(c, "neg") for c in prof[b]["negative_phrases"][:3]) or "–")
    return U.table([("", "")] + [(b, "") for b in picked], rows_def)


def render(ctx: dict) -> None:
    latest, det, as_of = ctx["latest"], ctx["det"], ctx["latest_date"]
    assort, rm, search = data.assortment_latest(), data.review_months(), data.search_latest()
    mom = M.brand_momentum(rm)

    U.page_head("Brand comparison", "A head-to-head scorecard for up to four brands, how well each brand's range converts into shelf presence, "
                "and their leading products side by side.")

    all_brands = sorted(latest.brand.unique(), key=str.lower)
    tracked = [b for b in all_brands if norm(b) in {norm(t) for t in C.TRACKED_BRANDS}]
    lb = M.brand_leaderboard(latest, None, top=300)
    default = list(dict.fromkeys(tracked[:2] + list(lb[lb.origin == "kbeauty"].brand[:1]) + list(lb[lb.origin == "local"].brand[:1])))[:4]
    picked = st.multiselect("Compare", all_brands, default=[b for b in default if b in all_brands], max_selections=4)
    if len(picked) < 2:
        st.info("Pick at least two brands."); return

    U.md(U.panel("Scorecard", _scorecard(picked, latest, det, assort, mom, search), detail=f"{as_of:%d %b %Y}",
                 foot="Shelf = top listings across tracked categories. Range = all products the brand lists on Nykaa. Demand = dated reviews on the brand's leading products."))

    c1, c2 = st.columns([1.2, 1])
    conv = M.assortment_conversion(assort, latest)
    with c1:
        if len(conv):
            big = conv[conv.total_products >= 15].sort_values("conversion", ascending=False)
            rows = [[f"<b>{U.esc(r.brand)}</b>", U.origin_chip(r.origin), f'<span class="mono">{int(r.on_shelf)}</span> / {int(r.total_products)}',
                     U.hbar(r.conversion / max(big.conversion.max(), 1e-9), U.ORIGIN.get(r.origin, U.INK2)), U.pct(r.conversion)] for r in big.head(14).itertuples()]
            k_conv = big[big.origin == "kbeauty"].conversion.median(); l_conv = big[big.origin == "local"].conversion.median()
            U.md(U.panel("Range conversion", U.table([("Brand", ""), ("Origin", ""), ("Shelf / range", "n"), ("", ""), ("Converts", "n")], rows),
                         detail="brands with 15+ products",
                         insight=f"Median K-beauty brand gets <b>{k_conv:.0%}</b> of its Nykaa range onto the top shelves; the median Local brand gets <b>{l_conv:.0%}</b>. "
                                 "Low conversion with a big range means the problem is ranking, not assortment.",
                         foot="Range counts every product on the brand page, including categories this dashboard does not track, so conversion is a lower bound."))
        else:
            U.md(U.panel("Range conversion", '<div class="foot">Brand ranges are collected weekly; appears after the first collection.</div>'))
    with c2:
        promo = M.promo_intensity(latest)
        if len(promo):
            rows = [[U.origin_chip(r.origin), U.hbar(r.offer, U.ORIGIN[r.origin]), U.pct(r.offer), f"{r.discount:.0f}%", U.pct(r.paid)] for r in promo.itertuples()]
            U.md(U.panel("Promotion intensity", U.table([("Origin", ""), ("", ""), ("With offers", "n"), ("Avg discount", "n"), ("Paid slots", "n")], rows),
                         detail="shelf products",
                         insight="How hard each origin pushes: listing offers (gifts, bundles, coupons), markdowns off MRP, and paid placement.",
                         foot="Offer flags are collected from 16 Sep 2026 onward."))

    subs = [s for s in L if s in set(latest[latest.brand.isin(picked)].subcategory)]
    c1, c2 = st.columns([2, 1])
    sub = c1.selectbox("Products in category", subs, format_func=lambda s: L.get(s, s))
    n_show = c2.selectbox("Per brand", [1, 2, 3], index=1)
    dmap = det.set_index("product_id").to_dict("index") if not det.empty else {}
    for col, b in zip(st.columns(len(picked)), picked):
        g = latest[(latest.subcategory == sub) & (latest.brand == b)].sort_values("rank").head(n_show)
        with col:
            if g.empty:
                U.md(f'<div class="panel"><div class="ptitle"><span class="h">{U.esc(b)}</span></div><div class="foot">Not in this category\'s top listings.</div></div>')
            for _, r in g.iterrows():
                U.md(U.product_card(r.to_dict(), dmap.get(r.product_id), as_of))
