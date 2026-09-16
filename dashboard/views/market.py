"""Market: where K-beauty stands on the shelf and in K-beauty search, and what moved."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from .. import config as C, data, metrics as M, ui as U

L = C.SUBCATEGORY_LABELS


def render(ctx: dict) -> None:
    latest, base, raw, top_n = ctx["latest"], ctx["base"], ctx["raw"], ctx["top_n"]
    as_of, first, multi = ctx["latest_date"], ctx["first_date"], ctx["multi_day"]
    search = data.search_latest(); rm = data.review_months()

    k = latest[latest.origin == "kbeauty"]; loc = latest[latest.origin == "local"]
    share = (latest.origin == "kbeauty").mean()
    daily = base.groupby("scrape_date").apply(lambda g: (g.origin == "kbeauty").mean(), include_groups=False)
    top20_daily = base[base["rank"] <= 20].groupby("scrape_date").apply(lambda g: (g.origin == "kbeauty").mean(), include_groups=False)
    d_share = (daily.iloc[-1] - daily.iloc[0]) * 100 if len(daily) > 1 else None
    t20 = (latest[latest["rank"] <= 20].origin == "kbeauty").mean()
    mk, ml = k.price.median(), loc.price.median()
    cap = M.search_capture(search)
    mom = M.brand_momentum(rm)
    idx, dem = M.demand_by_origin(rm)
    k_growth = None
    if dem.get("kbeauty") and len(dem["kbeauty"]) >= 6:
        a, b = sum(dem["kbeauty"][-3:]), sum(dem["kbeauty"][-6:-3])
        k_growth = (a - b) / b if b else None

    U.page_head("Market position",
                f"K-beauty against Indian and global brands across {latest.subcategory.nunique()} categories of Nykaa's app listings (top {top_n}), "
                f"in K-beauty search results, and inside Nykaa's own Korean Beauty store.")

    U.kpi_row([
        U.kpi("K-beauty shelf share", U.pct(share, 1),
              (U.delta_html(d_share, "{:+.1f} pts") + f" since {first:%d %b}" if d_share is not None else "") + f"<br>{len(k)} of {len(latest)} slots · {k.brand.nunique()} brands",
              spark=list(daily.values), color=U.ORIGIN["kbeauty"]),
        U.kpi("Share of top-20 positions", U.pct(t20, 1),
              ("above" if t20 > share else "below") + " its overall share<br>top 20 is where most clicks land", spark=list(top20_daily.values), color=U.ORIGIN["kbeauty"]),
        U.kpi("Price vs Local", f"{mk / ml:.1f}×" if ml and mk == mk else "–", f"median {U.inr(mk)} vs {U.inr(ml)}<br>discount {k.discount_pct.mean():.0f}% vs {loc.discount_pct.mean():.0f}% off MRP"),
        U.kpi("K-beauty demand, last 3 mo", U.pct(k_growth, 0) if k_growth is not None else "–",
              "review volume vs prior 3 months<br>key K-beauty products" if k_growth is not None else "review history still loading",
              spark=dem.get("kbeauty"), color=U.ORIGIN["kbeauty"]),
        U.kpi("K-beauty share of Korean searches", U.pct(cap.kbeauty.mean(), 0) if len(cap) else "–",
              (f"{U.pct(cap.imitator.mean(), 0)} goes to Indian brands selling as Korean<br>{len(cap)} K-beauty search terms" if len(cap) else "search capture not yet collected")),
    ])

    c1, c2 = st.columns([1.65, 1])
    with c1:
        rows = []
        first_day = base[base.scrape_date == first]
        for sub in [s for s in L if s in set(latest.subcategory)]:
            g = latest[latest.subcategory == sub]; n = len(g)
            sh = {o: (g.origin == o).mean() for o in ("kbeauty", "local", "global", "unknown")}
            f = first_day[first_day.subcategory == sub]
            dlt = ((g.origin == "kbeauty").mean() - (f.origin == "kbeauty").mean()) * 100 if multi and len(f) else None
            kb = g[g.origin == "kbeauty"].brand.value_counts()
            gk, gl = g[g.origin == "kbeauty"].price.median(), g[g.origin == "local"].price.median()
            rows.append([
                f"<b>{U.esc(L[sub])}</b>",
                U.stack([(sh[o], U.ORIGIN[o], f"{U.ORIGIN_LABEL[o]} {sh[o]:.0%}") for o in ("kbeauty", "local", "global", "unknown")]),
                U.pct(sh["kbeauty"]),
                U.pct((g[g["rank"] <= 20].origin == "kbeauty").mean()),
                U.delta_html(dlt, "{:+.0f} pts") if dlt is not None else '<span class="flat">–</span>',
                f'{U.esc(kb.index[0])} <span class="m">({kb.iloc[0]})</span>' if len(kb) else '<span class="flat">none</span>',
                f"{gk / gl:.1f}×" if gk == gk and gl else "–",
            ])
        weakest = min(rows, key=lambda r: float(r[2].rstrip("%")) if r[2] != "–" else 99)
        strongest = max(rows, key=lambda r: float(r[2].rstrip("%")) if r[2] != "–" else -1)
        U.md(U.panel("Shelf share by category", U.origin_legend(("kbeauty", "local", "global", "unknown")) + U.table(
            [("Category", ""), ("Mix of top-" + str(top_n) + " slots", ""), ("K", "n"), ("K top 20", "n"), ("Δ", "n"), ("Leading K brand", ""), ("K price ×", "n")], rows),
            detail=f"{as_of:%d %b}" + (f" · Δ vs {first:%d %b}" if multi else ""),
            insight=f"Strongest in {strongest[0]} at {strongest[2]}; weakest in {weakest[0]} at {weakest[2]}. "
                    f"The price multiple is K-beauty's median selling price over Local's in the same category.",
            foot="Hover a bar segment for its share. Unclassified are brands still awaiting origin evidence."))
    with c2:
        store = raw[(raw.subcategory == "kbeauty_store") & (raw.scrape_date == raw.scrape_date.max())]
        if len(store):
            bc = store.groupby("brand").agg(n=("product_id", "size"), best=("rank", "min"), price=("price", "median")).sort_values(["n", "best"], ascending=[False, True]).head(10)
            top = bc.n.max()
            rows = [[f"<b>{U.esc(b)}</b>", U.hbar(r.n / top, U.ORIGIN["kbeauty"], f"{r.n} of top 100"), f'<span class="mono">{int(r.n)}</span>', f"#{int(r.best)}", U.inr(r.price)]
                    for b, r in bc.iterrows()]
            conc = bc.n.head(3).sum() / len(store)
            U.md(U.panel("Inside Nykaa's Korean Beauty store", U.table([("Brand", ""), ("", ""), ("Slots", "n"), ("Best", "n"), ("Median", "n")], rows),
                         detail=f"top 100 of {int(store.shape[0])}",
                         insight=f"The shelf the K-beauty shopper browses. The top three brands hold <b>{conc:.0%}</b> of it; "
                                 f"<b>{store.brand.nunique()}</b> brands appear in the top 100.",
                         foot="Nykaa's own K-beauty storefront, ranked by its popularity sort."))
        else:
            U.md(U.panel("Inside Nykaa's Korean Beauty store", '<div class="foot">Collected from the next daily run.</div>'))

    if len(cap):
        rows = []
        for _, r in cap.sort_values("kbeauty").iterrows():
            rows.append([f'<span class="mono">{U.esc(r.query)}</span>',
                         U.stack([(r.kbeauty, U.ORIGIN["kbeauty"], f"K-beauty {r.kbeauty:.0%}"), (r.imitator, U.IMITATOR, f"Indian brands selling as Korean {r.imitator:.0%}"),
                                  (r.local, U.ORIGIN["local"], f"Other Local {r.local:.0%}"), (r["global"], U.ORIGIN["global"], f"Global {r['global']:.0%}"),
                                  (r.unknown, U.ORIGIN["unknown"], f"Unclassified {r.unknown:.0%}")]),
                         U.pct(r.kbeauty), U.pct(r.imitator), U.esc(r.top_brand) + " " + U.origin_chip(r.top_origin),
                         U.esc(r.non_k_leader or "–"), f'<span class="m">{int(r.results):,}</span>' if r.results == r.results and r.results else '<span class="m">redirect</span>'])
        worst = cap.sort_values("kbeauty").iloc[0]
        U.md(U.panel("Who wins K-beauty search",
                     U.legend([("K-beauty", U.ORIGIN["kbeauty"]), ("Indian brands selling as Korean", U.IMITATOR), ("Other Local", U.ORIGIN["local"]), ("Global", U.ORIGIN["global"])])
                     + U.table([("Search term", ""), ("Top-20 results", ""), ("K", "n"), ("Imitators", "n"), ("#1 result", ""), ("Best non-Korean", ""), ("Results", "n")], rows),
                     detail=f"{len(cap)} terms · {pd.to_datetime(search.scrape_date.max()):%d %b}",
                     insight=f"Korean brands hold <b>{cap.kbeauty.mean():.0%}</b> of top-20 results for Korean-intent searches on average. "
                             f"The weakest term is <b>{U.esc(worst.query)}</b>, where K-beauty holds {worst.kbeauty:.0%} and Indian brands selling as Korean hold {worst.imitator:.0%}.",
                     foot="Each shopper search is one demand signal Nykaa routes to products. Where imitators rank, K-beauty demand converts into Indian brands' sales."))

    if multi:
        g, l = M.movers(base, top=8)
        cols = st.columns(2)
        for col, d, title in ((cols[0], g, "Biggest climbers"), (cols[1], l, "Biggest fallers")):
            rows = [[f"<b>{U.esc(r['brand'])}</b> {U.esc(M.short_name(r['name'], r['brand'])[:40])}", U.origin_chip(r["origin"]), U.esc(L.get(r["subcategory"])),
                     f'<span class="m">#{int(r["rank_start"])}</span> → #{int(r["rank"])}', U.delta_html(r["change"], "{:+.0f}")] for _, r in d.iterrows()]
            with col:
                U.md(U.panel(title, U.table([("Product", ""), ("Origin", ""), ("Category", ""), ("Rank", "n"), ("Places", "n")], rows), detail=f"{first:%d %b} → {as_of:%d %b}"))
