"""Demand: 12 months of review volume as a sales-momentum proxy, by origin and by brand."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from .. import data, metrics as M, ui as U


def render(ctx: dict) -> None:
    rm = data.review_months()
    U.page_head("Demand momentum",
                "Monthly review volume for the leading products of the tracked brands and the most visible competitors, "
                "reconstructed from review dates. Review volume moves with sales, so a rising line is rising demand.")
    if rm.empty:
        U.md(U.panel("Review history", '<div class="foot">Review history is still being collected. It appears after the next backfill completes.</div>'))
        return

    idx, dem = M.demand_by_origin(rm)
    mom = M.brand_momentum(rm)
    if not dem or mom.empty:
        U.md(U.panel("Review history", f'<div class="foot">History collected for {rm.product_id.nunique()} products so far; charts appear once enough products cover the last six months.</div>'))
        return
    labels = [m.strftime("%b %y") for m in idx]
    tot = {o: sum(v) for o, v in dem.items()}
    growth = {o: ((sum(v[-3:]) - sum(v[-6:-3])) / sum(v[-6:-3])) if sum(v[-6:-3]) else None for o, v in dem.items()}

    cards = []
    for o in ("kbeauty", "local", "global"):
        if o in dem:
            g = growth[o]
            cards.append(U.kpi(f"{U.ORIGIN_LABEL[o]} review volume", f"{int(sum(dem[o][-3:])):,}",
                               f"last 3 months · {U.delta_html(g * 100 if g is not None else None, '{:+.0f}%')} vs prior 3<br>{int(tot[o]):,} over 12 months",
                               spark=dem[o], color=U.ORIGIN[o]))
    covered = rm.product_id.nunique(); brands = rm.brand.nunique()
    trunc = rm.groupby("product_id").truncated.first().sum()
    cards.append(U.kpi("Coverage", f"{covered}", f"products · {brands} brands · {int(rm.reviews.sum()):,} reviews<br>{int(trunc)} bestsellers with partial history"))
    U.kpi_row(cards)

    series = [{"name": U.ORIGIN_LABEL[o], "color": U.ORIGIN[o], "values": dem[o], "width": 2.4} for o in ("kbeauty", "local", "global") if o in dem]
    lead = max(growth, key=lambda o: growth[o] if growth[o] is not None else -9)
    U.md(U.panel("Monthly reviews by origin", U.line_chart(labels, series, height=250, y_label="reviews / month"),
                 detail="last 12 complete months",
                 insight=f"<b>{U.ORIGIN_LABEL[lead]}</b> is growing fastest over the last quarter ({growth[lead]:+.0%}). "
                         "Absolute levels reflect how many products per origin are tracked, so read the slopes, not the gap.",
                 foot="Sum of dated reviews across tracked products whose history covers all 12 months. Nykaa serves about 1,000 reviews per product, "
                      "so very large bestsellers only cover recent months and are excluded from this line. The current month is incomplete and excluded."))

    c1, c2 = st.columns([1.5, 1])
    with c1:
        rows = []
        for r in mom.head(20).itertuples():
            rows.append([f"<b>{U.esc(r.brand)}</b>", U.origin_chip(r.origin), U.sparkline(r.spark, 110, 24, U.ORIGIN.get(r.origin, U.INK2)),
                         f'<span class="mono">{int(r.last3):,}</span>',
                         U.delta_html(r.growth * 100 if r.growth == r.growth else None, "{:+.0f}%"),
                         U.hbar(r.share_last3 / mom.share_last3.max(), U.ORIGIN.get(r.origin, U.INK2), f"{r.share_last3:.1%} of tracked demand"),
                         f'<span class="m">{int(r.products)}</span>'])
        rising = mom[(mom.last3 >= 30) & mom.growth.notna()].sort_values("growth", ascending=False)
        ins = ""
        if len(rising):
            a = rising.iloc[0]; z = rising.iloc[-1]
            ins = (f"Fastest riser with meaningful volume: <b>{U.esc(a.brand)}</b> ({a.growth:+.0%}). "
                   f"Sharpest decline: <b>{U.esc(z.brand)}</b> ({z.growth:+.0%}).")
        U.md(U.panel("Brand momentum", U.table([("Brand", ""), ("Origin", ""), ("12 months", ""), ("Last 3 mo", "n"), ("vs prior 3", "n"), ("Share", ""), ("Products", "n")], rows),
                     detail="sorted by last-3-month volume", insight=ins,
                     foot="Brands with under 30 reviews in the last quarter are excluded from the riser and decliner call-outs."))
    with c2:
        prods = rm.groupby(["product_id", "brand", "name", "origin"]).apply(
            lambda g: pd.Series({"last3": g[g.month >= g.month.max() - pd.DateOffset(months=2)].reviews.sum(), "rating": (g.avg_rating * g.reviews).sum() / max(1, g.reviews.sum())}),
            include_groups=False).reset_index()
        cur = pd.Timestamp.today().normalize().replace(day=1)
        recent = rm[(rm.month < cur) & (rm.month >= cur - pd.DateOffset(months=3))].groupby("product_id").reviews.sum()
        prods["last3"] = prods.product_id.map(recent).fillna(0)
        top = prods.sort_values("last3", ascending=False).head(12)
        mx = top.last3.max() or 1
        rows = [[f"<b>{U.esc(r.brand)}</b><br><span class='m'>{U.esc(M.short_name(r.name, r.brand)[:42])}</span>",
                 U.hbar(r.last3 / mx, U.ORIGIN.get(r.origin, U.INK2)), f'<span class="mono">{int(r.last3):,}</span>', f"★ {r.rating:.1f}"] for r in top.itertuples()]
        U.md(U.panel("Highest-demand products", U.table([("Product", ""), ("", ""), ("Reviews", "n"), ("Recent ★", "n")], rows),
                     detail="last 3 complete months",
                     foot="Recent ★ is the average star rating of reviews written in the tracked period, a fresher read than the lifetime rating."))
