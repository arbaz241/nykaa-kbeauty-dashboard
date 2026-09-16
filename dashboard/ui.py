"""Analytics-product UI kit: dark theme, dense panels, HTML bars and hand-drawn SVG lines.

Everything renders through st.markdown(unsafe_allow_html=True). No Plotly.
Palette: validated reference categorical slots, dark steps (K-beauty blue, Local orange, Global aqua).
"""
from __future__ import annotations

import html
import math

import streamlit as st

# ---------------------------------------------------------------- tokens
BG, PANEL, PANEL2 = "#0E0E0D", "#161615", "#1C1C1A"
LINE, GRID, BASE = "#262624", "#2C2C2A", "#383835"
INK, INK2, MUTED = "#F4F3EE", "#C3C2B7", "#8C8A82"
UP, DOWN = "#3FB950", "#F0716F"
ORIGIN = {"kbeauty": "#3987e5", "local": "#d95926", "global": "#199e70", "unknown": "#6E6C66"}
ORIGIN_LABEL = {"kbeauty": "K-beauty", "local": "Local", "global": "Global", "unknown": "Unclassified"}
IMITATOR = "#c98500"   # slot 4 (yellow, dark step): Local brands selling as Korean

CSS = f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap');
html, body, .stApp, [class*="css"] {{ font-family: 'Inter', system-ui, -apple-system, "Segoe UI", sans-serif !important; }}
.stApp {{ background: {BG}; color: {INK}; }}
[data-testid="stHeader"], #MainMenu, footer, [data-testid="stToolbar"], .stDeployButton, [data-testid="stDecoration"],
[data-testid="stSidebar"], [data-testid="stSidebarCollapsedControl"], [data-testid="collapsedControl"] {{ display: none !important; }}
.block-container {{ padding: 0.8rem 1.6rem 4rem !important; max-width: 1440px; }}
p, li, span, div, label {{ color: {INK}; }}
[data-testid="stMarkdownContainer"] p {{ margin: 0; }}
div[data-testid="stVerticalBlock"] {{ gap: 0.7rem; }}

/* controls */
div[data-baseweb="select"] > div {{ background: {PANEL2} !important; border: 1px solid {LINE} !important; border-radius: 8px !important; min-height: 34px; }}
div[data-baseweb="select"] * {{ color: {INK} !important; font-size: 13px !important; }}
div[data-baseweb="popover"] ul {{ background: {PANEL2} !important; }}
div[data-baseweb="tag"] {{ background: {BASE} !important; border-radius: 6px !important; }}
.stSelectbox label, .stMultiSelect label, .stRadio label {{ font-size: 10.5px !important; letter-spacing: .1em; text-transform: uppercase; color: {MUTED} !important; }}
div[data-testid="stPageLink"] a {{ padding: 5px 12px; border-radius: 7px; white-space: nowrap; }}
div[data-testid="stPageLink"] a p {{ font-size: 13.5px !important; font-weight: 500; color: {INK2} !important; }}
div[data-testid="stPageLink"] a[aria-current="page"] {{ background: {PANEL2}; box-shadow: inset 0 0 0 1px {LINE}; }}
div[data-testid="stPageLink"] a[aria-current="page"] p {{ color: {INK} !important; font-weight: 600; }}
.stButton > button {{ background: {PANEL2}; color: {INK2}; border: 1px solid {LINE}; border-radius: 7px; font-size: 13px; padding: 4px 12px; min-height: 0; }}
.stButton > button:hover {{ border-color: {BASE}; color: {INK}; }}
div[data-testid="stExpander"] {{ background: {PANEL}; border: 1px solid {LINE} !important; border-radius: 10px; }}
div[data-testid="stExpander"] summary p {{ font-size: 13px; color: {INK2}; }}
div[data-testid="stDataFrame"] {{ border: 1px solid {LINE}; border-radius: 10px; overflow: hidden; }}

/* shell */
.shell {{ display:flex; align-items:center; justify-content:space-between; padding:6px 0 10px; border-bottom:1px solid {LINE}; }}
.logo {{ display:flex; align-items:center; gap:10px; }}
.logo .mark {{ width:22px; height:22px; border-radius:6px; background:linear-gradient(135deg,#3987e5,#199e70); }}
.logo .name {{ font-weight:700; font-size:14px; letter-spacing:-.01em; }}
.logo .tag {{ font-size:11px; color:{MUTED}; border:1px solid {LINE}; padding:1px 7px; border-radius:999px; }}
.meta {{ font-size:12px; color:{MUTED}; }} .meta b {{ color:{INK2}; font-weight:600; }}
.dot {{ display:inline-block; width:7px; height:7px; border-radius:50%; background:{UP}; margin-right:6px; vertical-align:1px; box-shadow:0 0 0 3px rgba(63,185,80,.15); }}

.ph {{ margin: 10px 0 2px; }} .ph .t {{ font-size:22px; font-weight:700; letter-spacing:-.02em; }}
.ph .s {{ font-size:13px; color:{INK2}; margin-top:3px; max-width:900px; line-height:1.5; }}

/* panels */
.panel {{ background:{PANEL}; border:1px solid {LINE}; border-radius:12px; padding:14px 16px; height:100%; }}
.ptitle {{ display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px; gap:12px; }}
.ptitle .h {{ font-size:13px; font-weight:600; color:{INK}; }} .ptitle .d {{ font-size:11.5px; color:{MUTED}; text-align:right; }}
.insight {{ font-size:13px; color:{INK2}; line-height:1.55; margin:-2px 0 12px; }}
.insight b {{ color:{INK}; font-weight:600; }}
.foot {{ font-size:11px; color:{MUTED}; margin-top:10px; line-height:1.45; }}

/* KPI */
.kpi {{ background:{PANEL}; border:1px solid {LINE}; border-radius:12px; padding:12px 14px 10px; height:100%; }}
.kpi .l {{ font-size:11px; color:{MUTED}; letter-spacing:.06em; text-transform:uppercase; font-weight:600; }}
.kpi .row {{ display:flex; align-items:flex-end; justify-content:space-between; gap:8px; margin-top:6px; }}
.kpi .v {{ font-size:26px; font-weight:700; letter-spacing:-.03em; line-height:1; font-variant-numeric:tabular-nums; }}
.kpi .c {{ font-size:11.5px; color:{MUTED}; margin-top:7px; line-height:1.4; }}
.up {{ color:{UP} !important; font-weight:600; }} .down {{ color:{DOWN} !important; font-weight:600; }} .flat {{ color:{MUTED} !important; }}

/* tables */
table.t {{ width:100%; border-collapse:collapse; font-size:12.5px; }}
table.t th {{ text-align:left; font-weight:600; color:{MUTED}; font-size:10.5px; letter-spacing:.07em; text-transform:uppercase; padding:0 8px 8px; border-bottom:1px solid {LINE}; white-space:nowrap; }}
table.t td {{ padding:7px 8px; border-bottom:1px solid {GRID}; vertical-align:middle; color:{INK}; }}
table.t tr:last-child td {{ border-bottom:0; }}
table.t td.n, table.t th.n {{ text-align:right; font-variant-numeric:tabular-nums; }}
table.t td.m {{ color:{MUTED}; }} table.t tr:hover td {{ background:{PANEL2}; }}
.mono {{ font-family:'JetBrains Mono', ui-monospace, monospace; font-size:12px; }}

/* bars */
.stack {{ display:flex; height:14px; border-radius:3px; overflow:hidden; background:{GRID}; min-width:120px; }}
.stack > span {{ display:block; height:100%; border-right:2px solid {PANEL}; }} .stack > span:last-child {{ border-right:0; }}
.hbar {{ height:6px; background:{GRID}; border-radius:3px; overflow:hidden; min-width:60px; }} .hbar > span {{ display:block; height:100%; border-radius:3px; }}
.chip {{ display:inline-block; font-size:10.5px; font-weight:600; padding:1px 7px; border-radius:5px; background:{PANEL2}; border:1px solid {LINE}; color:{INK2}; margin:0 4px 2px 0; white-space:nowrap; }}
.chip.k {{ color:#8FBBF2; border-color:#23406A; background:#15243A; }} .chip.l {{ color:#F2A07C; border-color:#5A2E1B; background:#2C1A12; }}
.chip.g {{ color:#7ED3B2; border-color:#1C4A3A; background:#11261E; }} .chip.i {{ color:#E8C06A; border-color:#4E3C12; background:#2A210D; }}
.chip.pos {{ color:#7EE0A0; border-color:#1D4A2B; background:#11261A; }} .chip.neg {{ color:#F5A3A2; border-color:#5A2626; background:#2A1414; }}
.legend {{ display:flex; gap:14px; flex-wrap:wrap; font-size:11.5px; color:{INK2}; margin:0 0 8px; }}
.legend i {{ display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:6px; vertical-align:0; }}

/* product card */
.pc {{ background:{PANEL}; border:1px solid {LINE}; border-radius:12px; overflow:hidden; height:100%; }}
.pc .img {{ background:#F4F3EE; aspect-ratio:4/3; display:flex; align-items:center; justify-content:center; }}
.pc .img img {{ max-width:78%; max-height:88%; object-fit:contain; }}
.pc .b {{ padding:11px 13px 13px; }}
.pc .br {{ font-size:10.5px; font-weight:700; letter-spacing:.09em; text-transform:uppercase; color:{MUTED}; }}
.pc .nm {{ font-size:13.5px; font-weight:600; line-height:1.3; margin:3px 0 8px; }}
.pc .pr {{ font-size:17px; font-weight:700; font-variant-numeric:tabular-nums; }} .pc .mrp {{ font-size:11.5px; color:{MUTED}; text-decoration:line-through; margin-left:6px; }}
.pc .kv {{ display:grid; grid-template-columns:auto 1fr; gap:3px 10px; font-size:11.5px; margin-top:8px; }}
.pc .kv .k {{ color:{MUTED}; }} .pc .usp {{ font-size:12.5px; color:{INK2}; line-height:1.45; margin-top:9px; }}
.pc .sec {{ font-size:10px; letter-spacing:.09em; text-transform:uppercase; color:{MUTED}; font-weight:700; margin:10px 0 3px; }}
</style>
"""


def inject() -> None:
    st.markdown(CSS, unsafe_allow_html=True)


def esc(x) -> str:
    return html.escape("" if x is None else str(x))


def md(h: str) -> None:
    st.markdown(h, unsafe_allow_html=True)


# ---------------------------------------------------------------- shell
def shell(as_of, n_days: int, user: str) -> None:
    md(f'<div class="shell"><div class="logo"><div class="mark"></div><span class="name">Nykaa K-Beauty Intelligence</span>'
       f'<span class="tag">India · app listings</span></div>'
       f'<div class="meta"><span class="dot"></span>Updated <b>{as_of:%d %b %Y}</b> · {n_days} day{"s" if n_days != 1 else ""} of history · {esc(user)}</div></div>')


def page_head(title: str, sub: str) -> None:
    md(f'<div class="ph"><div class="t">{esc(title)}</div><div class="s">{sub}</div></div>')


# ---------------------------------------------------------------- formatting
def pct(v, d=0) -> str:
    return "–" if v is None or v != v else f"{v * 100:.{d}f}%"


def inr(v) -> str:
    return "–" if v is None or v != v else f"₹{v:,.0f}"


def delta_html(v, fmt="{:.1f} pts", good_up=True, zero="±0") -> str:
    """Arrow carries the sign; the number is shown unsigned."""
    if v is None or v != v:
        return ""
    if abs(v) < 1e-9:
        return f'<span class="flat">{zero}</span>'
    cls = "up" if (v > 0) == good_up else "down"
    return f'<span class="{cls}">{"▲" if v > 0 else "▼"} {fmt.replace(":+", ":").format(abs(v))}</span>'


# ---------------------------------------------------------------- components
def kpi(label: str, value: str, context: str = "", spark: list[float] | None = None, color: str = INK2) -> str:
    sp = sparkline(spark, 84, 26, color) if spark and len(spark) > 1 else ""
    return f'<div class="kpi"><div class="l">{esc(label)}</div><div class="row"><div class="v">{esc(value)}</div>{sp}</div><div class="c">{context}</div></div>'


def kpi_row(cards: list[str]) -> None:
    for col, h in zip(st.columns(len(cards)), cards):
        with col:
            md(h)


def panel(title: str, body: str, detail: str = "", insight: str = "", foot: str = "") -> str:
    return (f'<div class="panel"><div class="ptitle"><span class="h">{esc(title)}</span><span class="d">{detail}</span></div>'
            + (f'<div class="insight">{insight}</div>' if insight else "") + body
            + (f'<div class="foot">{foot}</div>' if foot else "") + "</div>")


def legend(items: list[tuple[str, str]]) -> str:
    return '<div class="legend">' + "".join(f'<span><i style="background:{c}"></i>{esc(n)}</span>' for n, c in items) + "</div>"


def origin_legend(origins=("kbeauty", "local", "global")) -> str:
    return legend([(ORIGIN_LABEL[o], ORIGIN[o]) for o in origins])


def stack(parts: list[tuple[float, str, str]]) -> str:
    """parts: (share 0-1, color, tooltip)."""
    return '<div class="stack">' + "".join(
        f'<span title="{esc(t)}" style="width:{max(0, s) * 100:.2f}%;background:{c}"></span>' for s, c, t in parts if s and s > 0) + "</div>"


def hbar(frac: float, color: str, title: str = "") -> str:
    return f'<div class="hbar" title="{esc(title)}"><span style="width:{max(0, min(1, frac)) * 100:.1f}%;background:{color}"></span></div>'


def chip(text: str, cls: str = "") -> str:
    return f'<span class="chip {cls}">{esc(text)}</span>'


def origin_chip(o: str) -> str:
    return chip(ORIGIN_LABEL.get(o, o), {"kbeauty": "k", "local": "l", "global": "g"}.get(o, ""))


def table(headers: list[tuple[str, str]], rows: list[list[str]]) -> str:
    """headers: [(label, 'n' for numeric or '')]; rows: pre-rendered cell HTML."""
    th = "".join(f'<th class="{c}">{esc(h)}</th>' for h, c in headers)
    body = "".join("<tr>" + "".join(f'<td class="{headers[i][1]}">{cell}</td>' for i, cell in enumerate(r)) + "</tr>" for r in rows)
    return f'<table class="t"><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>'


# ---------------------------------------------------------------- SVG
def sparkline(values: list[float], w: int = 84, h: int = 26, color: str = INK2) -> str:
    full = list(values or [])
    vals = [v for v in full if v is not None and v == v]
    if len(vals) < 2:
        return ""
    lo, hi = min(vals), max(vals)
    rng = (hi - lo) or 1
    n = len(full)   # keep x positions for unknown leading months, so partial histories start late on the axis
    pts = [(i * (w - 4) / (n - 1) + 2, h - 3 - (v - lo) / rng * (h - 6)) for i, v in enumerate(full) if v is not None and v == v]
    path = " ".join(f"{'M' if i == 0 else 'L'}{x:.1f},{y:.1f}" for i, (x, y) in enumerate(pts))
    x, y = pts[-1]
    return (f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg">'
            f'<path d="{path}" fill="none" stroke="{color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>'
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="2.4" fill="{color}"/></svg>')


def _nice_max(v: float) -> float:
    if v <= 0:
        return 1
    e = 10 ** math.floor(math.log10(v))
    for m in (1, 2, 2.5, 5, 10):
        if v <= m * e:
            return m * e
    return 10 * e


def line_chart(x_labels: list[str], series: list[dict], height: int = 240, y_fmt=lambda v: f"{v:,.0f}", y_label: str = "") -> str:
    """series: [{name, color, values (len == x_labels), width?}]. One y-axis, direct end labels, <title> tooltips."""
    W, H = 900, height
    L, R, T, B = 44, 120, 26, 26
    ymax = _nice_max(max((v for s in series for v in s["values"] if v is not None), default=1))
    n = len(x_labels)
    xs = [L + (i * (W - L - R) / max(1, n - 1)) for i in range(n)]
    Y = lambda v: T + (H - T - B) * (1 - v / ymax)
    g = [f'<svg viewBox="0 0 {W} {H}" width="100%" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible">']
    for i in range(5):
        v = ymax * i / 4; y = Y(v)
        g.append(f'<line x1="{L}" x2="{W - R}" y1="{y:.1f}" y2="{y:.1f}" stroke="{GRID if i else BASE}" stroke-width="1"/>')
        g.append(f'<text x="{L - 8}" y="{y + 4:.1f}" fill="{MUTED}" font-size="11" text-anchor="end">{esc(y_fmt(v))}</text>')
    step = max(1, n // 12)
    for i, lab in enumerate(x_labels):
        if i % step == 0 or i == n - 1:
            g.append(f'<text x="{xs[i]:.1f}" y="{H - 6}" fill="{MUTED}" font-size="11" text-anchor="middle">{esc(lab)}</text>')
    ends = []
    for s in series:
        pts = [(xs[i], Y(v), v, x_labels[i]) for i, v in enumerate(s["values"]) if v is not None]
        if not pts:
            continue
        d = " ".join(f"{'M' if j == 0 else 'L'}{x:.1f},{y:.1f}" for j, (x, y, _, _) in enumerate(pts))
        g.append(f'<path d="{d}" fill="none" stroke="{s["color"]}" stroke-width="{s.get("width", 2)}" stroke-linejoin="round" stroke-linecap="round"/>')
        for x, y, v, lab in pts:
            g.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="9" fill="transparent"><title>{esc(s["name"])} · {esc(lab)}: {esc(y_fmt(v))}</title></circle>')
        x, y, v, _ = pts[-1]
        g.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.5" fill="{s["color"]}" stroke="{PANEL}" stroke-width="2"/>')
        ends.append([y, s["name"], s["color"], v])
    ends.sort(key=lambda e: e[0])
    for i in range(1, len(ends)):  # de-collide end labels
        if ends[i][0] - ends[i - 1][0] < 15:
            ends[i][0] = ends[i - 1][0] + 15
    for y, name, color, v in ends:
        g.append(f'<text x="{W - R + 10}" y="{y + 4:.1f}" fill="{INK2}" font-size="11.5"><tspan fill="{color}" font-weight="700">■</tspan> {esc(name[:14])} <tspan fill="{MUTED}">{esc(y_fmt(v))}</tspan></text>')
    if y_label:
        g.append(f'<text x="{L - 40}" y="11" fill="{MUTED}" font-size="10.5">{esc(y_label)}</text>')
    g.append("</svg>")
    return "".join(g)


# ---------------------------------------------------------------- product card
def product_card(r: dict, det: dict | None, as_of) -> str:
    from .metrics import pack_ml, short_name
    det = det or {}
    s = lambda k: det.get(k) if isinstance(det.get(k), str) and det.get(k) else None
    import pandas as pd
    isna = lambda v: v is None or bool(pd.isna(v)) if not isinstance(v, (list, dict)) else False
    img = f'<div class="img"><img src="{esc(s("image_url"))}" alt=""></div>' if s("image_url") else ""
    mrp = f'<span class="mrp">{inr(r["mrp"])}</span>' if not isna(r.get("mrp")) and r["mrp"] > r["price"] else ""
    ml = pack_ml(r.get("pack_size"))
    kv = [("Rank", f'#{int(r["rank"])}' + (' <span class="chip i">paid</span>' if (r.get("is_ad") or r.get("is_pinned")) else "")),
          ("Rating", f'★ {r["rating"]:.1f} · {int(r["rating_count"] or 0):,}' if not isna(r.get("rating")) else "–")]
    if ml:
        kv.append(("Per ml", f'₹{r["price"] / ml:.1f}'))
    if s("country_name"):
        kv.append(("Made in", esc(s("country_name"))))
    frd = r.get("first_review_date")
    if not isna(frd):
        days = max(1, (as_of - frd).days)
        kv.append(("Live since", f'{frd:%b %Y}' + (f' · {(r.get("rating_count") or 0) / days:.1f}/day' if days <= 180 else "")))
    usp = s("usp_summary") or ""
    if not usp and s("description_text"):
        first = next((x.strip() for x in s("description_text").replace("\n", ". ").split(". ") if len(x.strip()) > 40
                      and not x.lower().startswith(("explore the entire", "shop more", "you can browse"))), "")
        usp = first[:170] + ("…" if len(first) > 170 else "")
    phr = det.get("review_key_phrases") or []
    pos = "".join(chip(p["text"], "pos") for p in phr if p.get("sentiment") == "Positive")[:600]
    neg = "".join(chip(p["text"], "neg") for p in phr if p.get("sentiment") == "Negative")[:300]
    concerns = "".join(chip(c) for c in (det.get("concerns") or [])[:4])
    ings = "".join(chip(i) for i in (det.get("key_ingredients") or [])[:4])
    return (f'<div class="pc">{img}<div class="b"><div class="br">{esc(r["brand"])}</div><div class="nm">{esc(short_name(r["name"], r["brand"])[:78])}</div>'
            f'<span class="pr">{inr(r["price"])}</span>{mrp}'
            f'<div class="kv">' + "".join(f'<span class="k">{k}</span><span>{v}</span>' for k, v in kv) + "</div>"
            + (f'<div class="usp">{esc(usp)}</div>' if usp else "")
            + (f'<div class="sec">Targets</div>{concerns}' if concerns else "")
            + (f'<div class="sec">Key ingredients</div>{ings}' if ings else "")
            + (f'<div class="sec">Shoppers say</div>{pos}{neg}' if (pos or neg) else "")
            + "</div></div>")
