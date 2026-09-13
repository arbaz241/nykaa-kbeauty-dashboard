"""Plotly figure builders. One place for mark specs, palette, and chart chrome."""
from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go

from . import config as C

FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'


def _base(fig: go.Figure, height: int = 340, legend: bool = True) -> go.Figure:
    fig.update_layout(
        height=height, margin=dict(l=8, r=8, t=28, b=8),
        paper_bgcolor=C.SURFACE, plot_bgcolor=C.SURFACE,
        font=dict(family=FONT, color=C.INK_2, size=12),
        hovermode="x unified" if legend else "closest",
        hoverlabel=dict(bgcolor="#ffffff", bordercolor=C.GRID, font=dict(family=FONT, color=C.INK, size=12)),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0, font=dict(size=12),
                    title=None, traceorder="normal") if legend else dict(visible=False),
        xaxis=dict(showgrid=False, linecolor=C.GRID, tickfont=dict(color=C.MUTED), zeroline=False),
        yaxis=dict(gridcolor=C.GRID, gridwidth=1, linecolor=C.SURFACE, tickfont=dict(color=C.MUTED), zeroline=False),
        bargap=0.35,
    )
    return fig


def origin_label(o: str) -> str:
    return C.ORIGIN_LABELS.get(o, o)


def _time_axis(fig: go.Figure, dates: pd.Series) -> go.Figure:
    """Daily data: day ticks, and a padded range so a single day does not zoom to milliseconds."""
    d = pd.to_datetime(dates)
    lo, hi = d.min(), d.max()
    pad = pd.Timedelta(days=1) if lo == hi else (hi - lo) * 0.03
    fig.update_xaxes(type="date", tickformat="%d %b", range=[lo - pad, hi + pad], dtick=None if lo != hi else 86400000)
    return fig


# ------------------------------------------------------------ share of shelf

def share_trend(share: pd.DataFrame) -> go.Figure:
    """share: columns scrape_date, origin, share (0-1). Stacked 100% area, fixed origin order."""
    fig = go.Figure()
    for o in C.ORIGIN_ORDER:
        s = share[share.origin == o]
        if s.empty:
            continue
        fig.add_trace(go.Scatter(
            x=s.scrape_date, y=s.share * 100, name=origin_label(o), stackgroup="one",
            mode="lines", line=dict(width=2, color=C.ORIGIN_COLORS[o]),
            fillcolor=C.ORIGIN_COLORS[o] + "66",
            hovertemplate="%{y:.0f}%<extra>" + origin_label(o) + "</extra>",
        ))
    fig.update_yaxes(range=[0, 100], ticksuffix="%", title=None)
    return _time_axis(_base(fig), share.scrape_date)


def share_by_subcategory(latest: pd.DataFrame) -> go.Figure:
    """latest: columns subcategory, origin, share. Horizontal 100% stacked bars, one per subcategory."""
    fig = go.Figure()
    subs = list(latest.subcategory.unique())
    for o in C.ORIGIN_ORDER:
        s = latest[latest.origin == o].set_index("subcategory").reindex(subs)
        if s.share.isna().all():
            continue
        fig.add_trace(go.Bar(
            y=[C.SUBCATEGORY_LABELS.get(x, x) for x in subs], x=s.share.fillna(0) * 100, orientation="h",
            name=origin_label(o), marker=dict(color=C.ORIGIN_COLORS[o], line=dict(color=C.SURFACE, width=2)),
            text=[f"{v:.0f}%" if v >= 8 else "" for v in s.share.fillna(0) * 100], textposition="inside",
            insidetextfont=dict(color="#ffffff", size=11),
            hovertemplate="%{x:.0f}%<extra>" + origin_label(o) + "</extra>",
        ))
    fig.update_layout(barmode="stack")
    fig.update_xaxes(range=[0, 100], ticksuffix="%")
    fig.update_yaxes(autorange="reversed", showgrid=False)
    return _base(fig, height=max(220, 34 * len(subs) + 80))


# --------------------------------------------------------------- rank tracking

def rank_lines(df: pd.DataFrame, context: pd.DataFrame | None, top_n: int) -> go.Figure:
    """df: one line per product (columns scrape_date, label, rank). context: origin-average rank line."""
    fig = go.Figure()
    if context is not None and not context.empty:
        fig.add_trace(go.Scatter(x=context.scrape_date, y=context["rank"], name=context["label"].iloc[0],
                                 mode="lines+markers", line=dict(width=2, color=C.DEEMPHASIS, dash="dot"),
                                 marker=dict(size=8, color=C.DEEMPHASIS),
                                 hovertemplate="avg rank %{y:.0f}<extra>%{fullData.name}</extra>"))
    palette = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"]
    for i, (label, g) in enumerate(df.groupby("label", sort=False)):
        color = palette[i % len(palette)] if i < len(palette) else C.DEEMPHASIS
        fig.add_trace(go.Scatter(x=g.scrape_date, y=g["rank"], name=label, mode="lines+markers",
                                 line=dict(width=2, color=color), marker=dict(size=8, line=dict(color=C.SURFACE, width=2)),
                                 hovertemplate="rank %{y}<extra>" + label + "</extra>"))
    fig.update_yaxes(autorange=False, range=[top_n + 1, 0], title="Rank (1 = top)", dtick=10 if top_n > 20 else 5)
    return _time_axis(_base(fig, height=380), df.scrape_date)


# ----------------------------------------------------------------- pricing

def price_box(latest: pd.DataFrame, value_col: str = "price") -> go.Figure:
    """Distribution of price by origin, one box per origin per subcategory."""
    fig = go.Figure()
    for o in C.ORIGIN_ORDER:
        s = latest[latest.origin == o]
        if s.empty or o == "unknown":
            continue
        fig.add_trace(go.Box(
            x=[C.SUBCATEGORY_LABELS.get(x, x) for x in s.subcategory], y=s[value_col], name=origin_label(o),
            marker=dict(color=C.ORIGIN_COLORS[o], size=4), line=dict(width=1.5, color=C.ORIGIN_COLORS[o]),
            fillcolor=C.ORIGIN_COLORS[o] + "33", boxmean=False, boxpoints=False,
            hovertemplate="median ₹%{median:.0f}<br>IQR ₹%{q1:.0f}–₹%{q3:.0f}<extra>" + origin_label(o) + "</extra>",
        ))
    fig.update_layout(boxmode="group", hovermode="closest")
    fig.update_yaxes(tickprefix="₹", title=None)
    return _base(fig, height=360)


def grouped_bar(tbl: pd.DataFrame, value_col: str, fmt: str, suffix: str = "", prefix: str = "") -> go.Figure:
    """tbl: columns subcategory, origin, <value_col>. Grouped bars by origin, fixed order."""
    fig = go.Figure()
    subs = list(dict.fromkeys(tbl.subcategory))
    for o in C.ORIGIN_ORDER:
        s = tbl[tbl.origin == o].set_index("subcategory").reindex(subs)
        if s[value_col].isna().all() or o == "unknown":
            continue
        fig.add_trace(go.Bar(
            x=[C.SUBCATEGORY_LABELS.get(x, x) for x in subs], y=s[value_col], name=origin_label(o),
            marker=dict(color=C.ORIGIN_COLORS[o], line=dict(color=C.SURFACE, width=2)),
            hovertemplate=prefix + "%{y:" + fmt + "}" + suffix + "<extra>" + origin_label(o) + "</extra>",
        ))
    fig.update_layout(barmode="group", bargroupgap=0.08)
    fig.update_yaxes(tickprefix=prefix, ticksuffix=suffix, title=None)
    return _base(fig, height=320)


# ---------------------------------------------------------------- ratings

def metric_lines(df: pd.DataFrame, value_col: str, fmt: str, by: str = "origin") -> go.Figure:
    """df: columns scrape_date, <by>, <value_col>. One line per group; origin groups use origin colors."""
    fig = go.Figure()
    groups = list(dict.fromkeys(df[by]))
    palette = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"]
    for i, g in enumerate(groups):
        s = df[df[by] == g]
        color = C.ORIGIN_COLORS.get(g, palette[i % len(palette)]) if by == "origin" else palette[i % len(palette)]
        fig.add_trace(go.Scatter(x=s.scrape_date, y=s[value_col], name=origin_label(g) if by == "origin" else g,
                                 mode="lines+markers", line=dict(width=2, color=color),
                                 marker=dict(size=8, line=dict(color=C.SURFACE, width=2)),
                                 hovertemplate="%{y:" + fmt + "}<extra>%{fullData.name}</extra>"))
    fig.update_yaxes(title=None)
    return _time_axis(_base(fig, height=320), df.scrape_date)


def dot_plot(tbl: pd.DataFrame, value_col: str, fmt: str, y_range: tuple[float, float]) -> go.Figure:
    """Values that live in a narrow band (ratings 3.5–5): dots, not bars, so no truncated-baseline lie."""
    fig = go.Figure()
    subs = list(dict.fromkeys(tbl.subcategory))
    for o in C.ORIGIN_ORDER:
        s = tbl[tbl.origin == o].set_index("subcategory").reindex(subs)
        if s[value_col].isna().all() or o == "unknown":
            continue
        fig.add_trace(go.Scatter(
            x=[C.SUBCATEGORY_LABELS.get(x, x) for x in subs], y=s[value_col], name=origin_label(o), mode="markers",
            marker=dict(color=C.ORIGIN_COLORS[o], size=12, line=dict(color=C.SURFACE, width=2)),
            hovertemplate="%{y:" + fmt + "}<extra>" + origin_label(o) + "</extra>",
        ))
    fig.update_yaxes(range=list(y_range), title=None, dtick=0.25)
    fig.update_xaxes(showgrid=True, gridcolor=C.GRID)
    return _base(fig, height=320)


# ------------------------------------------------------------- market extras

SEQ_BLUE = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab"]   # sequential ramp, light -> dark


def tier_stack(t: pd.DataFrame, origin: str, tiers: list[str]) -> go.Figure:
    """Price-tier mix for one origin: 100% stacked horizontal bars per subcategory, one hue light->dark."""
    fig = go.Figure()
    subs = list(dict.fromkeys(t.subcategory))
    d = t[t.origin == origin]
    for i, tier in enumerate(tiers):
        s = d[d.tier == tier].set_index("subcategory").reindex(subs)
        fig.add_trace(go.Bar(
            y=[C.SUBCATEGORY_LABELS.get(x, x) for x in subs], x=s.share.fillna(0) * 100, orientation="h", name=tier,
            marker=dict(color=SEQ_BLUE[i % len(SEQ_BLUE)], line=dict(color=C.SURFACE, width=2)),
            text=[f"{v:.0f}%" if v >= 10 else "" for v in s.share.fillna(0) * 100], textposition="inside",
            insidetextfont=dict(color="#ffffff" if i >= 2 else C.INK, size=11),
            hovertemplate="%{x:.0f}%<extra>" + tier + "</extra>",
        ))
    fig.update_layout(barmode="stack")
    fig.update_xaxes(range=[0, 100], ticksuffix="%")
    fig.update_yaxes(autorange="reversed", showgrid=False)
    return _base(fig, height=max(200, 30 * len(subs) + 80))


def concern_bars(t: pd.DataFrame, top: int = 8) -> go.Figure:
    """Top concerns in one subcategory, grouped bars by origin (count of products claiming it)."""
    order = t.groupby("concerns").n.sum().sort_values(ascending=False).index[:top]
    fig = go.Figure()
    for o in C.ORIGIN_ORDER:
        s = t[t.origin == o].set_index("concerns").reindex(order)
        if s.n.isna().all() or o == "unknown":
            continue
        fig.add_trace(go.Bar(y=list(order), x=s.n.fillna(0), orientation="h", name=origin_label(o),
                             marker=dict(color=C.ORIGIN_COLORS[o], line=dict(color=C.SURFACE, width=2)),
                             hovertemplate="%{x} products<extra>" + origin_label(o) + "</extra>"))
    fig.update_layout(barmode="group", bargroupgap=0.05)
    fig.update_yaxes(autorange="reversed", showgrid=False)
    fig.update_xaxes(title="products in top listings claiming the concern")
    return _base(fig, height=max(240, 34 * len(order) + 90))


def velocity_bars(radar: pd.DataFrame, top: int = 10) -> go.Figure:
    """Launch traction: ratings per day since first review, colored by origin (entity color, fixed)."""
    from .metrics import short_name
    d = radar[radar.ratings_per_day.notna()].head(top).iloc[::-1]
    d = d.assign(name=[short_name(n, b) for n, b in zip(d.name, d.brand)])
    fig = go.Figure()
    for o in C.ORIGIN_ORDER:
        s = d[d.origin == o]
        if s.empty:
            continue
        fig.add_trace(go.Bar(y=[f"{b} · {n[:32]}" for b, n in zip(s.brand, s.name)], x=s.ratings_per_day, orientation="h",
                             name=origin_label(o), marker=dict(color=C.ORIGIN_COLORS[o], line=dict(color=C.SURFACE, width=2)),
                             hovertemplate="%{x:.1f} ratings/day<extra>" + origin_label(o) + "</extra>"))
    fig.update_layout(barmode="overlay")
    fig.update_yaxes(showgrid=False, categoryorder="array", categoryarray=[f"{b} · {n[:32]}" for b, n in zip(d.brand, d.name)])
    fig.update_xaxes(title="ratings per day since first review")
    return _base(fig, height=max(240, 30 * len(d) + 90))
