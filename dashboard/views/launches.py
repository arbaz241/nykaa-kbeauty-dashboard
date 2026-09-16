"""Launches: new products already on the shelf, ranked by early traction."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from .. import config as C, data, metrics as M, ui as U

L = C.SUBCATEGORY_LABELS


def render(ctx: dict) -> None:
    latest, det, as_of = ctx["latest"], ctx["det"], ctx["latest_date"]
    radar = M.launch_radar(latest, as_of)
    U.page_head("Launches", f"Products whose first Nykaa review is within {C.NEW_WINDOW_DAYS} days and that already sit in the top listings, "
                "ranked by ratings gained per day. Early traction is the best available read on whether a launch is working.")

    rated = radar[radar.ratings_per_day.notna()]
    by_o = radar.origin.value_counts()
    fastest = rated.iloc[0] if len(rated) else None
    U.kpi_row([
        U.kpi("New products on the shelf", f"{len(radar)}", f"{int(by_o.get('kbeauty', 0))} K-beauty · {int(by_o.get('local', 0))} Local · {int(by_o.get('global', 0))} Global"),
        U.kpi("K-beauty share of launches", U.pct(by_o.get("kbeauty", 0) / max(1, len(radar))), f"vs {U.pct((latest.origin == 'kbeauty').mean())} of the whole shelf"),
        U.kpi("Fastest launch", f"{fastest.ratings_per_day:.1f}/day" if fastest is not None else "–",
              f"{U.esc(fastest.brand)} · #{int(fastest['rank'])} {U.esc(L.get(fastest.subcategory))}" if fastest is not None else ""),
        U.kpi("Median launch price", U.inr(radar.price.median()), f"shelf median {U.inr(latest.price.median())}"),
    ])

    dmap = det.set_index("product_id").to_dict("index") if not det.empty else {}
    c1, c2 = st.columns([1.35, 1])
    with c1:
        mx = rated.ratings_per_day.max() if len(rated) else 1
        rows = []
        for _, r in radar.head(25).iterrows():
            v = r.ratings_per_day
            rows.append([f"<b>{U.esc(r.brand)}</b> <span class='m'>{U.esc(M.short_name(r['name'], r.brand)[:40])}</span>", U.origin_chip(r.origin),
                         U.esc(L.get(r.subcategory)), f"#{int(r['rank'])}", U.inr(r.price),
                         (U.hbar(v / mx, U.ORIGIN.get(r.origin, U.INK2)) if v == v else '<span class="m">no reviews yet</span>'),
                         f'<span class="mono">{v:.1f}</span>' if v == v else "–",
                         f'<span class="m">{r.first_review_date:%d %b}</span>' if pd.notna(r.first_review_date) else "–"])
        U.md(U.panel("Launch traction", U.table([("Product", ""), ("Origin", ""), ("Category", ""), ("Rank", "n"), ("Price", "n"), ("", ""), ("Ratings/day", "n"), ("First review", "n")], rows),
                     detail=f"{len(radar)} launches · top 25 shown",
                     foot="Ratings per day = ratings ÷ days since the first review. Products with no reviews yet and under 20 ratings are listed last."))
    with c2:
        km = latest[latest.k_marketing & (latest.origin != "kbeauty")]
        bc = km.groupby("brand").agg(n=("product_id", "size"), best=("rank", "min"), price=("price", "median")).sort_values("n", ascending=False).head(10)
        rows = [[f"<b>{U.esc(b)}</b>", U.hbar(r.n / bc.n.max(), U.IMITATOR), f'<span class="mono">{int(r.n)}</span>', f"#{int(r.best)}", U.inr(r.price)] for b, r in bc.iterrows()]
        U.md(U.panel("Indian brands selling as Korean", U.table([("Brand", ""), ("", ""), ("Shelf", "n"), ("Best", "n"), ("Median", "n")], rows),
                     detail=f"{km.brand.nunique()} brands",
                     insight=f"They hold <b>{len(km)}</b> shelf slots at a median <b>{U.inr(km.price.median())}</b>, against K-beauty's {U.inr(latest[latest.origin == 'kbeauty'].price.median())}: "
                             "the Korean story at an Indian price point.",
                     foot="Flagged when product names claim Korean positioning (Korean, glass skin, Jeju…) or products are made in South Korea."))

    top = rated.head(4)
    if len(top):
        for col, (_, r) in zip(st.columns(4), top.iterrows()):
            with col:
                U.md(U.product_card(r.to_dict(), dmap.get(r.product_id), as_of))
