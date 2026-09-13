"""Visual system for the Streamlit app: typography, surfaces, cards, and chrome removal."""
from __future__ import annotations

import html

import streamlit as st

from . import config as C

CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

html, body, [class*="css"], .stApp, .stMarkdown, .stDataFrame, .stTable {
  font-family: 'Inter', system-ui, -apple-system, "Segoe UI", sans-serif !important;
}
.stApp { background: #FAFAF8; }
[data-testid="stHeader"] { background: transparent; }
#MainMenu, footer, [data-testid="stToolbar"], .stDeployButton, [data-testid="stDecoration"] { display: none !important; }
[data-testid="stSidebar"] { background: #F3F2EE; border-right: 1px solid #E6E4DD; }
[data-testid="stSidebar"] .stMarkdown p { font-size: 13px; }
.block-container { padding-top: 1.6rem; padding-bottom: 3rem; max-width: 1280px; }

h1 { font-size: 30px !important; font-weight: 700 !important; letter-spacing: -0.02em; color: #111110 !important; margin-bottom: 0.2rem !important; }
h2 { font-size: 20px !important; font-weight: 600 !important; letter-spacing: -0.01em; color: #111110 !important; margin-top: 1.4rem !important; }
h3 { font-size: 15px !important; font-weight: 600 !important; color: #111110 !important; }
p, li { color: #2B2A27; line-height: 1.55; }

.eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #8A887F; margin-bottom: 2px; }
.lede { font-size: 15px; color: #5B5A55; margin: 0 0 1.2rem 0; max-width: 820px; }
.sowhat { font-size: 13.5px; color: #5B5A55; margin: -0.4rem 0 0.8rem 0; }

.kpi { background: #FFFFFF; border: 1px solid #E6E4DD; border-radius: 12px; padding: 14px 16px 12px; height: 100%; }
.kpi .label { font-size: 12px; color: #6E6C65; font-weight: 500; margin-bottom: 6px; }
.kpi .value { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; color: #111110; line-height: 1.1; }
.kpi .sub { font-size: 12px; color: #8A887F; margin-top: 6px; }
.kpi .delta-up { color: #0B6B2E; font-weight: 600; } .kpi .delta-down { color: #B3261E; font-weight: 600; } .kpi .delta-flat { color: #8A887F; }

.insights { background: #FFFFFF; border: 1px solid #E6E4DD; border-left: 3px solid #1F3A5F; border-radius: 10px; padding: 14px 18px; margin: 0.4rem 0 1rem; }
.insights ul { margin: 0; padding-left: 18px; } .insights li { margin: 5px 0; font-size: 14px; }

.card { background: #FFFFFF; border: 1px solid #E6E4DD; border-radius: 12px; padding: 14px; height: 100%; }
.card img { width: 100%; aspect-ratio: 1/1; object-fit: contain; border-radius: 8px; background: #F6F5F1; }
.card .brand { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #6E6C65; margin-top: 10px; }
.card .name { font-size: 14px; font-weight: 600; color: #111110; line-height: 1.3; margin: 2px 0 8px; min-height: 2.6em; }
.card .price { font-size: 18px; font-weight: 700; color: #111110; } .card .mrp { font-size: 12px; color: #8A887F; text-decoration: line-through; margin-left: 6px; }
.card .meta { font-size: 12px; color: #5B5A55; margin-top: 4px; }
.card .usp { font-size: 13px; color: #2B2A27; margin: 10px 0 6px; line-height: 1.45; }
.card .k { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #8A887F; margin-top: 8px; }
.card .v { font-size: 12.5px; color: #2B2A27; }

.pill { display: inline-block; font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 999px; margin: 2px 4px 2px 0; border: 1px solid #E6E4DD; background: #F6F5F1; color: #2B2A27; }
.pill.pos { background: #EAF6EE; border-color: #CFE9D8; color: #0B6B2E; } .pill.neg { background: #FBECEB; border-color: #F2CFCC; color: #B3261E; }
.pill.rank { background: #111110; color: #FFFFFF; border-color: #111110; }
.pill.ad { background: #FFF4E5; border-color: #F7DDB3; color: #8A5A00; }
.origin-kbeauty { color: #2a78d6; font-weight: 600; } .origin-local { color: #eb6834; font-weight: 600; } .origin-global { color: #1baf7a; font-weight: 600; } .origin-unknown { color: #898781; }

.stTabs [data-baseweb="tab-list"] { gap: 18px; border-bottom: 1px solid #E6E4DD; }
.stTabs [data-baseweb="tab"] { font-weight: 500; font-size: 14px; padding: 8px 0; }
div[data-testid="stMetric"] { background: #FFFFFF; border: 1px solid #E6E4DD; border-radius: 12px; padding: 12px 16px; }
div[data-testid="stDataFrame"] { border: 1px solid #E6E4DD; border-radius: 10px; overflow: hidden; }
.stButton > button { border-radius: 8px; font-weight: 500; }
hr { border-color: #E6E4DD; margin: 1.2rem 0; }
</style>
"""


def inject() -> None:
    st.markdown(CSS, unsafe_allow_html=True)


def eyebrow(text: str) -> None:
    st.markdown(f'<div class="eyebrow">{html.escape(text)}</div>', unsafe_allow_html=True)


def lede(text: str) -> None:
    st.markdown(f'<p class="lede">{html.escape(text)}</p>', unsafe_allow_html=True)


def sowhat(text: str) -> None:
    st.markdown(f'<p class="sowhat">{html.escape(text)}</p>', unsafe_allow_html=True)


def kpi(label: str, value: str, sub: str | None = None, delta: float | None = None, delta_fmt: str = "{:+.1f} pts", good_up: bool = True) -> str:
    d = ""
    if delta is not None and not (isinstance(delta, float) and delta != delta):
        cls = "delta-flat" if abs(delta) < 1e-9 else ("delta-up" if (delta > 0) == good_up else "delta-down")
        arrow = "" if abs(delta) < 1e-9 else ("▲ " if delta > 0 else "▼ ")
        d = f'<span class="{cls}">{arrow}{delta_fmt.format(delta)}</span> '
    sub_html = f'<div class="sub">{d}{html.escape(sub) if sub else ""}</div>' if (sub or d) else ""
    return f'<div class="kpi"><div class="label">{html.escape(label)}</div><div class="value">{html.escape(value)}</div>{sub_html}</div>'


def kpi_row(cards: list[str]) -> None:
    cols = st.columns(len(cards))
    for c, h in zip(cols, cards):
        c.markdown(h, unsafe_allow_html=True)


def insights(points: list[str], title: str = "What the data says") -> None:
    items = "".join(f"<li>{html.escape(p)}</li>" for p in points)
    st.markdown(f'<div class="insights"><div class="eyebrow">{html.escape(title)}</div><ul>{items}</ul></div>', unsafe_allow_html=True)


def origin_tag(o: str) -> str:
    return f'<span class="origin-{o}">{html.escape(C.ORIGIN_LABELS.get(o, o))}</span>'


def pills(items: list[str], cls: str = "") -> str:
    return "".join(f'<span class="pill {cls}">{html.escape(str(i))}</span>' for i in items if i)


def product_card(r: dict, det: dict | None, as_of) -> str:
    """r: snapshot row dict; det: product_details row dict or None."""
    det = det or {}
    img = f'<img src="{html.escape(det["image_url"])}" alt="">' if det.get("image_url") else '<div style="aspect-ratio:1/1;background:#F6F5F1;border-radius:8px"></div>'
    tags = f'<span class="pill rank">#{int(r["rank"])}</span>'
    if r.get("is_ad"):
        tags += '<span class="pill ad">AD</span>'
    if r.get("is_pinned"):
        tags += '<span class="pill ad">Featured</span>'
    mrp = f'<span class="mrp">₹{r["mrp"]:,.0f}</span>' if not pd_isna(r.get("mrp")) and r["mrp"] > r["price"] else ""
    disc = f' · {r["discount_pct"]:.0f}% off' if not pd_isna(r.get("discount_pct")) and r["discount_pct"] else ""
    from .metrics import pack_ml, short_name
    ml = pack_ml(r.get("pack_size"))
    per_ml = f' · ₹{r["price"] / ml:.1f}/ml' if ml else ""
    rating = (f'★ {r["rating"]:.1f} · {int(r["rating_count"] or 0):,} ratings' if not pd_isna(r.get("rating")) else "No ratings yet")
    frd = r.get("first_review_date")
    launch = ""
    if frd is not None and not pd_isna(frd):
        days = max(1, (as_of - frd).days)
        vel = (r.get("rating_count") or 0) / days
        launch = f' · first review {frd:%b %Y}' + (f' · {vel:.1f} ratings/day' if days <= 180 else "")
    usp = det.get("usp_summary") or ""
    concerns = pills(det.get("concerns") or [])
    ings = pills((det.get("key_ingredients") or [])[:4])
    phr = det.get("review_key_phrases") or []
    pos = pills([p["text"] for p in phr if p.get("sentiment") == "Positive"][:3], "pos")
    neg = pills([p["text"] for p in phr if p.get("sentiment") == "Negative"][:2], "neg")
    country = det.get("country_name")
    pack = r.get("pack_size")
    meta2 = " · ".join(str(x) for x in [det.get("formulation"), f'Made in {country}' if country else None, pack]
                       if isinstance(x, str) and x)
    return (f'<div class="card">{img}<div>{tags}</div><div class="brand">{html.escape(r["brand"])}</div>'
            f'<div class="name">{html.escape(short_name(r["name"], r["brand"])[:90])}</div>'
            f'<div><span class="price">₹{r["price"]:,.0f}</span>{mrp}</div>'
            f'<div class="meta">{html.escape(rating)}{disc}{per_ml}</div>'
            f'<div class="meta">{html.escape(meta2)}{launch}</div>'
            + (f'<div class="usp">{html.escape(usp)}</div>' if usp else "")
            + (f'<div class="k">Concerns</div><div>{concerns}</div>' if concerns else "")
            + (f'<div class="k">Key ingredients</div><div>{ings}</div>' if ings else "")
            + (f'<div class="k">Shoppers say</div><div>{pos}{neg}</div>' if (pos or neg) else "")
            + '</div>')


def pd_isna(v) -> bool:
    try:
        import pandas as pd
        return bool(pd.isna(v))
    except Exception:  # noqa: BLE001
        return v is None
