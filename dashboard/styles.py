"""Visual system: report-like layout, generous whitespace, plain-language numbers."""
from __future__ import annotations

import html

import streamlit as st

from . import config as C

CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

html, body, [class*="css"], .stApp, .stMarkdown, .stDataFrame { font-family: 'Inter', system-ui, -apple-system, "Segoe UI", sans-serif !important; }
.stApp { background: #FFFFFF; }
[data-testid="stHeader"], #MainMenu, footer, [data-testid="stToolbar"], .stDeployButton, [data-testid="stDecoration"],
[data-testid="stSidebar"], [data-testid="stSidebarCollapsedControl"], [data-testid="collapsedControl"] { display: none !important; }
.block-container { padding-top: 1.2rem; padding-bottom: 4rem; max-width: 1080px; }
h1, h2, h3, p, li, div { color: #17171A; }

.topbar { display: flex; align-items: baseline; justify-content: space-between; padding: 6px 0 14px; border-bottom: 1px solid #ECEBE6; margin-bottom: 8px; }
.topbar .brand { font-size: 13px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #17171A; }
.topbar .asof { font-size: 12.5px; color: #7A786F; }
div[data-testid="stPageLink"] a, div[data-testid="stPageLink"] a p { font-size: 14px !important; font-weight: 500; color: #4A4943 !important; text-decoration: none; }
div[data-testid="stPageLink"] a[aria-current="page"] p { color: #17171A !important; font-weight: 700; }
div[data-testid="stPageLink"] a { padding: 6px 12px; border-radius: 999px; white-space: nowrap; }
div[data-testid="stPageLink"] { overflow: visible; }
.stButton > button[kind="secondary"] { border-color: #ECEBE6; color: #4A4943; font-weight: 500; padding: 4px 12px; min-height: 0; }
div[data-testid="stPageLink"] a[aria-current="page"] { background: #F1F0EB; }
div[data-testid="stSelectbox"] label, div[data-testid="stMultiSelect"] label { font-size: 11px !important; letter-spacing: 0.08em; text-transform: uppercase; color: #8A887F !important; }

.hero-title { font-size: 34px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.12; margin: 26px 0 8px; color: #17171A; }
.hero-sub { font-size: 16px; color: #5B5A55; max-width: 760px; line-height: 1.5; margin-bottom: 26px; }

.num { padding: 18px 20px; border: 1px solid #ECEBE6; border-radius: 14px; background: #FBFBF9; height: 100%; }
.num .v { font-size: 34px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; color: #17171A; }
.num .l { font-size: 13px; font-weight: 600; color: #17171A; margin-top: 10px; }
.num .e { font-size: 12.5px; color: #6E6C65; margin-top: 4px; line-height: 1.45; }
.num .d-up { color: #0B6B2E; font-weight: 700; font-size: 13px; margin-top: 6px; } .num .d-down { color: #B3261E; font-weight: 700; font-size: 13px; margin-top: 6px; }

.sec { margin-top: 44px; padding-top: 22px; border-top: 1px solid #ECEBE6; }
.sec .n { font-size: 12px; font-weight: 700; letter-spacing: 0.14em; color: #B3261E; text-transform: uppercase; }
.sec .t { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin: 4px 0 6px; color: #17171A; }
.sec .k { font-size: 16.5px; color: #17171A; line-height: 1.5; max-width: 820px; margin-bottom: 14px; }
.sec .k b { font-weight: 700; }
.note { font-size: 13px; color: #7A786F; margin-top: 6px; }

.rowlist { border: 1px solid #ECEBE6; border-radius: 12px; overflow: hidden; }
.rowlist .r { display: grid; grid-template-columns: 28px 1fr auto; gap: 12px; align-items: center; padding: 10px 14px; border-top: 1px solid #F1F0EB; font-size: 14px; }
.rowlist .r:first-child { border-top: 0; }
.rowlist .i { color: #A8A69E; font-weight: 600; font-size: 12px; }
.rowlist .m { color: #7A786F; font-size: 12.5px; margin-left: 8px; }
.rowlist .b { font-weight: 600; }
.rowlist .x { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.bar { height: 6px; border-radius: 3px; background: #ECEBE6; margin-top: 6px; }
.bar > span { display: block; height: 6px; border-radius: 3px; }

.card { background: #FFFFFF; border: 1px solid #ECEBE6; border-radius: 14px; padding: 16px; height: 100%; }
.card img { width: 100%; aspect-ratio: 1/1; object-fit: contain; border-radius: 10px; background: #F6F5F1; }
.card .brand { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #6E6C65; margin-top: 12px; }
.card .name { font-size: 15px; font-weight: 600; line-height: 1.3; margin: 3px 0 10px; }
.card .price { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; } .card .mrp { font-size: 12px; color: #8A887F; text-decoration: line-through; margin-left: 6px; }
.card .meta { font-size: 12.5px; color: #5B5A55; margin-top: 4px; }
.card .usp { font-size: 13.5px; color: #17171A; margin: 12px 0 4px; line-height: 1.5; }
.card .k { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8A887F; margin-top: 10px; }
.pill { display: inline-block; font-size: 11.5px; font-weight: 500; padding: 3px 9px; border-radius: 999px; margin: 3px 4px 0 0; border: 1px solid #ECEBE6; background: #F8F7F3; color: #2B2A27; }
.pill.pos { background: #EAF6EE; border-color: #CFE9D8; color: #0B6B2E; } .pill.neg { background: #FBECEB; border-color: #F2CFCC; color: #B3261E; }
.pill.rank { background: #17171A; color: #FFFFFF; border-color: #17171A; } .pill.ad { background: #FFF4E5; border-color: #F7DDB3; color: #8A5A00; }
.o-kbeauty { color: #2a78d6; font-weight: 700; } .o-local { color: #eb6834; font-weight: 700; } .o-global { color: #1baf7a; font-weight: 700; } .o-unknown { color: #898781; }
.legend { font-size: 12.5px; color: #5B5A55; margin: 2px 0 8px; } .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin: 0 6px 0 14px; vertical-align: -1px; }
.legend i:first-child { margin-left: 0; }

div[data-testid="stDataFrame"] { border: 1px solid #ECEBE6; border-radius: 12px; overflow: hidden; }
.stButton > button { border-radius: 8px; font-weight: 600; }
</style>
"""

ORIGIN_HEX = C.ORIGIN_COLORS


def inject() -> None:
    st.markdown(CSS, unsafe_allow_html=True)


def topbar(as_of) -> None:
    st.markdown(f'<div class="topbar"><span class="brand">Nykaa K-Beauty Market</span>'
                f'<span class="asof">Nykaa India · app listings · data as of {as_of:%d %B %Y}</span></div>', unsafe_allow_html=True)


def hero(title: str, sub: str) -> None:
    st.markdown(f'<div class="hero-title">{html.escape(title)}</div><div class="hero-sub">{html.escape(sub)}</div>', unsafe_allow_html=True)


def num(value: str, label: str, explain: str, delta: float | None = None, delta_fmt: str = "{:+.1f} pts vs {}", ref: str = "", good_up: bool = True) -> str:
    d = ""
    if delta is not None and delta == delta:
        if abs(delta) > 1e-9:
            cls = "d-up" if (delta > 0) == good_up else "d-down"
            d = f'<div class="{cls}">{"▲" if delta > 0 else "▼"} {delta_fmt.format(delta, ref)}</div>'
        else:
            d = '<div class="e">no change</div>'
    return f'<div class="num"><div class="v">{html.escape(value)}</div><div class="l">{html.escape(label)}</div><div class="e">{html.escape(explain)}</div>{d}</div>'


def num_row(cards: list[str]) -> None:
    for c, h in zip(st.columns(len(cards)), cards):
        c.markdown(h, unsafe_allow_html=True)


def section(n: str, title: str, takeaway_html: str) -> None:
    st.markdown(f'<div class="sec"><div class="n">{html.escape(n)}</div><div class="t">{html.escape(title)}</div><div class="k">{takeaway_html}</div></div>', unsafe_allow_html=True)


def note(text: str) -> None:
    st.markdown(f'<div class="note">{html.escape(text)}</div>', unsafe_allow_html=True)


def legend(origins=("kbeauty", "local", "global")) -> None:
    st.markdown('<div class="legend">' + "".join(f'<i style="background:{ORIGIN_HEX[o]}"></i>{html.escape(C.ORIGIN_LABELS[o])}' for o in origins) + '</div>', unsafe_allow_html=True)


def rowlist(rows: list[dict], max_value: float | None = None) -> str:
    """rows: [{label, meta, value_text, value(float), color}] -> ranked list with a small bar."""
    if not rows:
        return '<div class="note">Nothing to show.</div>'
    mx = max_value or max((r.get("value") or 0) for r in rows) or 1
    out = []
    for i, r in enumerate(rows, 1):
        w = 100 * (r.get("value") or 0) / mx
        bar = f'<div class="bar"><span style="width:{w:.0f}%;background:{r.get("color", "#17171A")}"></span></div>' if r.get("value") is not None else ""
        out.append(f'<div class="r"><span class="i">{i:02d}</span><span><span class="b">{html.escape(r["label"])}</span>'
                   f'<span class="m">{html.escape(r.get("meta", ""))}</span>{bar}</span><span class="x">{html.escape(r["value_text"])}</span></div>')
    return '<div class="rowlist">' + "".join(out) + '</div>'


def origin_tag(o: str) -> str:
    return f'<span class="o-{o}">{html.escape(C.ORIGIN_LABELS.get(o, o))}</span>'


def pills(items, cls: str = "") -> str:
    return "".join(f'<span class="pill {cls}">{html.escape(str(i))}</span>' for i in items if i)


def _isna(v) -> bool:
    try:
        import pandas as pd
        return bool(pd.isna(v))
    except Exception:  # noqa: BLE001
        return v is None


def _s(v) -> str | None:
    """Text field from a pandas row: NaN/None -> None."""
    return v if isinstance(v, str) and v else None


def product_card(r: dict, det: dict | None, as_of, compact: bool = False) -> str:
    from .metrics import pack_ml, short_name
    det = {k: (_s(v) if k in ("image_url", "usp_summary", "country_name", "formulation") else v) for k, v in (det or {}).items()}
    img = f'<img src="{html.escape(det["image_url"])}" alt="">' if det.get("image_url") else ""
    tags = f'<span class="pill rank">#{int(r["rank"])}</span>' + ('<span class="pill ad">Paid slot</span>' if (r.get("is_ad") or r.get("is_pinned")) else "")
    mrp = f'<span class="mrp">₹{r["mrp"]:,.0f}</span>' if not _isna(r.get("mrp")) and r["mrp"] > r["price"] else ""
    ml = pack_ml(r.get("pack_size"))
    per_ml = f' · ₹{r["price"] / ml:.1f} per ml' if ml else ""
    rating = f'★ {r["rating"]:.1f} from {int(r["rating_count"] or 0):,} ratings' if not _isna(r.get("rating")) else "No ratings yet"
    frd = r.get("first_review_date"); launch = ""
    if not _isna(frd):
        days = max(1, (as_of - frd).days)
        launch = f' · on Nykaa since {frd:%b %Y}' + (f', gaining {(r.get("rating_count") or 0) / days:.1f} ratings a day' if days <= 180 else "")
    usp = det.get("usp_summary") or ""
    country = det.get("country_name")
    facts = " · ".join(x for x in [det.get("formulation"), f"Made in {country}" if country else None, r.get("pack_size") if isinstance(r.get("pack_size"), str) else None] if x)
    phr = det.get("review_key_phrases") or []
    pos = [p["text"] for p in phr if p.get("sentiment") == "Positive"][:3]; neg = [p["text"] for p in phr if p.get("sentiment") == "Negative"][:2]
    body = (f'<div class="card">{img}<div style="margin-top:{"10px" if img else "2px"}">{tags}</div>'
            f'<div class="brand">{html.escape(r["brand"])}</div><div class="name">{html.escape(short_name(r["name"], r["brand"])[:80])}</div>'
            f'<div><span class="price">₹{r["price"]:,.0f}</span>{mrp}</div><div class="meta">{html.escape(rating)}{per_ml}</div>'
            + (f'<div class="meta">{html.escape(facts)}{html.escape(launch)}</div>' if (facts or launch) else "")
            + (f'<div class="usp">{html.escape(usp)}</div>' if usp else ""))
    if not compact:
        body += (f'<div class="k">Targets</div><div>{pills(det.get("concerns") or [])}</div>' if det.get("concerns") else "")
        body += (f'<div class="k">Key ingredients</div><div>{pills((det.get("key_ingredients") or [])[:4])}</div>' if det.get("key_ingredients") else "")
        body += (f'<div class="k">Shoppers say</div><div>{pills(pos, "pos")}{pills(neg, "neg")}</div>' if (pos or neg) else "")
    return body + "</div>"
