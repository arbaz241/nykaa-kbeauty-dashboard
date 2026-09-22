"""Consultant-level calculations on top of the snapshot frame. Pure pandas, no Streamlit."""
from __future__ import annotations

import re

import numpy as np
import pandas as pd

from . import config as C

PRICE_TIERS = [(0, 500, "Under ₹500"), (500, 1000, "₹500–1,000"), (1000, 2000, "₹1,000–2,000"), (2000, 1e9, "₹2,000+")]

_PACK = re.compile(r"(\d+(?:\.\d+)?)\s*(ml|g|gm|gms|oz|l)\b", re.I)


def short_name(name: str, brand: str) -> str:
    """Drop a leading brand name from a product title ("SUROSKIE Glow Cream" -> "Glow Cream")."""
    if not name:
        return ""
    n = re.sub(r"^\s*" + re.escape(brand or "") + r"[\s:\-–·,]*", "", name, flags=re.I) if brand else name
    return (n or name).strip()


def pack_ml(pack: str | None) -> float | None:
    """'50ml' -> 50; '100 g' -> 100 (treat g as ml); '1.7 oz' -> 50.3; else None."""
    if not pack:
        return None
    m = _PACK.search(str(pack))
    if not m:
        return None
    v, unit = float(m.group(1)), m.group(2).lower()
    return v * 1000 if unit == "l" else v * 29.57 if unit == "oz" else v


def price_tier(p: float | None) -> str | None:
    if p is None or pd.isna(p):
        return None
    for lo, hi, label in PRICE_TIERS:
        if lo <= p < hi:
            return label
    return None


def share_table(df: pd.DataFrame, by: list[str]) -> pd.DataFrame:
    """Share of listing slots by origin within each group in `by`."""
    tot = df.groupby(by).size().rename("total")
    part = df.groupby(by + ["origin"]).size().rename("n").reset_index().join(tot, on=by)
    part["share"] = part.n / part.total
    return part


def category_snapshot(latest: pd.DataFrame) -> pd.DataFrame:
    """One row per subcategory: origin shares, leading brands, price medians, paid share."""
    rows = []
    for sub, g in latest.groupby("subcategory"):
        n = len(g)
        row = {"subcategory": sub, "slots": n}
        for o in ("kbeauty", "local", "global"):
            row[f"share_{o}"] = (g.origin == o).mean() if n else np.nan
        for o in ("kbeauty", "local", "global"):
            bc = g[g.origin == o].brand.value_counts()
            row[f"lead_{o}"] = f"{bc.index[0]} ({bc.iloc[0]})" if len(bc) else "–"
        med_k = g[g.origin == "kbeauty"].price.median(); med_l = g[g.origin == "local"].price.median(); med_g = g[g.origin == "global"].price.median()
        row.update({"median_kbeauty": med_k, "median_local": med_l, "median_global": med_g,
                    "premium_vs_local": (med_k / med_l) if med_l and not pd.isna(med_k) else np.nan,
                    "paid_share": g.is_paid.mean() if n else np.nan,
                    "kbeauty_top20": (g[g["rank"] <= 20].origin == "kbeauty").mean() if n else np.nan})
        rows.append(row)
    return pd.DataFrame(rows)


def brand_leaderboard(latest: pd.DataFrame, history: pd.DataFrame | None = None, top: int = 20) -> pd.DataFrame:
    g = latest.groupby(["brand", "origin"])
    lb = g.agg(slots=("product_id", "size"), categories=("subcategory", "nunique"), best_rank=("rank", "min"),
               avg_rank=("rank", "mean"), median_price=("price", "median"), avg_rating=("rating", "mean"),
               ratings=("rating_count", "sum"), paid_slots=("is_paid", "sum"), k_marketing=("k_marketing", "max")).reset_index()
    lb["paid_share"] = lb.paid_slots / lb.slots
    if history is not None and history.scrape_date.nunique() > 1:
        first = history[history.scrape_date == history.scrape_date.min()].groupby("brand").size()
        lb["slots_change"] = lb.brand.map(first).rsub(lb.slots).fillna(lb.slots)  # vs first day in range
        rc = history.groupby(["brand", "scrape_date"]).rating_count.sum().unstack()
        lb["ratings_added"] = lb.brand.map(rc.iloc[:, -1] - rc.iloc[:, 0])
    return lb.sort_values(["slots", "avg_rank"], ascending=[False, True]).head(top)


def movers(history: pd.DataFrame, top: int = 8) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Rank change per product between first and last date in range: (gainers, losers)."""
    if history.scrape_date.nunique() < 2:
        return pd.DataFrame(), pd.DataFrame()
    d0, d1 = history.scrape_date.min(), history.scrape_date.max()
    a = history[history.scrape_date == d0].set_index(["subcategory", "product_id"])["rank"]
    b = history[history.scrape_date == d1].set_index(["subcategory", "product_id"])
    b = b.assign(rank_start=a.reindex(b.index).values)
    b["change"] = b.rank_start - b["rank"]
    b = b.dropna(subset=["change"]).reset_index()
    cols = ["subcategory", "brand", "origin", "name", "rank_start", "rank", "change", "price", "rating_count"]
    return b.nlargest(top, "change")[cols], b.nsmallest(top, "change")[cols]


def launch_radar(latest: pd.DataFrame, as_of: pd.Timestamp, window_days: int = C.NEW_WINDOW_DAYS) -> pd.DataFrame:
    """New products (first review within window) with rating velocity = ratings per day since first review."""
    d = latest.copy()
    d["days_live"] = (as_of - d.first_review_date).dt.days.clip(lower=1)
    new = d[(d.first_review_date >= as_of - pd.Timedelta(days=window_days)) | ((d.review_count == 0) & (d.rating_count.fillna(0) < 20))].copy()
    new["ratings_per_day"] = (new.rating_count.fillna(0) / new.days_live).where(new.first_review_date.notna())
    return new.sort_values(["ratings_per_day", "rating_count"], ascending=False, na_position="last")


def tier_mix(latest: pd.DataFrame) -> pd.DataFrame:
    d = latest[latest.origin != "unknown"].copy()
    d["tier"] = d.price.map(price_tier)
    t = d.groupby(["subcategory", "origin", "tier"]).size().rename("n").reset_index()
    tot = d.groupby(["subcategory", "origin"]).size().rename("total")
    t = t.join(tot, on=["subcategory", "origin"]); t["share"] = t.n / t.total
    return t


def concern_landscape(latest: pd.DataFrame, det: pd.DataFrame, top: int = 8) -> pd.DataFrame:
    """Top concerns claimed per subcategory, split by origin. Needs product details."""
    if det.empty:
        return pd.DataFrame()
    m = latest.merge(det[["product_id", "concerns"]], on="product_id", how="inner")
    m = m[m.concerns.map(len) > 0].explode("concerns")
    t = m.groupby(["subcategory", "concerns", "origin"]).size().rename("n").reset_index()
    tot = m.groupby(["subcategory", "concerns"]).size().rename("total")
    t = t.join(tot, on=["subcategory", "concerns"])
    return t


def brand_profile(latest: pd.DataFrame, det: pd.DataFrame, brand: str, history: pd.DataFrame | None = None) -> dict:
    g = latest[latest.brand == brand]
    if g.empty:
        return {}
    dm = det[det.product_id.isin(g.product_id)] if not det.empty else det
    countries = dm.country_name.dropna().value_counts() if not dm.empty else pd.Series(dtype=int)
    concerns = pd.Series([c for cs in dm.concerns for c in cs]).value_counts() if not dm.empty else pd.Series(dtype=int)
    ings = pd.Series([i for ks in dm.key_ingredients for i in ks]).value_counts() if not dm.empty else pd.Series(dtype=int)
    pos, neg = [], []
    for phr in (dm.review_key_phrases if not dm.empty else []):
        for p in phr or []:
            (pos if p.get("sentiment") == "Positive" else neg).append(p.get("text"))
    prof = {
        "brand": brand, "origin": g.origin.iloc[0], "k_marketing": bool(g.k_marketing.max()),
        "slots": len(g), "categories": sorted(g.subcategory.unique(), key=list(C.SUBCATEGORY_LABELS).index),
        "best_rank": int(g["rank"].min()), "avg_rank": float(g["rank"].mean()),
        "median_price": float(g.price.median()), "min_price": float(g.price.min()), "max_price": float(g.price.max()),
        "avg_discount": float(g.discount_pct.mean()) if g.discount_pct.notna().any() else np.nan,
        "avg_rating": float(g.rating.mean()), "ratings": int(g.rating_count.fillna(0).sum()),
        "paid_share": float(g.is_paid.mean()),
        "country": countries.index[0] if len(countries) else None,
        "top_concerns": list(concerns.index[:5]), "top_ingredients": list(ings.index[:6]),
        "positive_phrases": list(pd.Series(pos).value_counts().index[:5]) if pos else [],
        "negative_phrases": list(pd.Series(neg).value_counts().index[:4]) if neg else [],
        "new_products": int(((latest.scrape_date.max() - g.first_review_date).dt.days <= C.NEW_WINDOW_DAYS).sum()),
    }
    if history is not None and history.scrape_date.nunique() > 1:
        h = history[history.brand == brand].groupby("scrape_date").agg(slots=("product_id", "size"), ratings=("rating_count", "sum"))
        prof["slots_change"] = int(h.slots.iloc[-1] - h.slots.iloc[0]); prof["ratings_added"] = int(h.ratings.iloc[-1] - h.ratings.iloc[0])
    return prof


def narrative(latest: pd.DataFrame, history: pd.DataFrame, snap: pd.DataFrame, radar: pd.DataFrame, kbrands: pd.DataFrame) -> list[str]:
    """Factual, data-derived statements for the overview. Each is a complete sentence."""
    out: list[str] = []
    L = C.SUBCATEGORY_LABELS
    k = (latest.origin == "kbeauty").mean()
    strongest = snap.sort_values("share_kbeauty", ascending=False).iloc[0]; weakest = snap.sort_values("share_kbeauty").iloc[0]
    out.append(f"K-beauty holds {k:.0%} of top-{int(latest['rank'].max())} slots across the tracked categories, strongest in "
               f"{L.get(strongest.subcategory, strongest.subcategory)} ({strongest.share_kbeauty:.0%}) and weakest in "
               f"{L.get(weakest.subcategory, weakest.subcategory)} ({weakest.share_kbeauty:.0%}).")
    top20 = (latest[latest['rank'] <= 20].origin == "kbeauty").mean()
    out.append(f"In the top 20 positions, where most clicks happen, K-beauty's share is {top20:.0%}"
               + (", above its overall share: it wins visibility where it competes." if top20 > k + 0.02 else
                  ", below its overall share: K-beauty products sit deeper in the listings." if top20 < k - 0.02 else ", in line with its overall share."))
    if len(kbrands):
        lead = kbrands.iloc[0]
        out.append(f"{lead.brand} is the most visible K-beauty brand with {int(lead.slots)} listed products across "
                   f"{int(lead.categories)} categor{'y' if lead.categories == 1 else 'ies'}, best rank #{int(lead.best_rank)}.")
    mk, ml = latest[latest.origin == "kbeauty"].price.median(), latest[latest.origin == "local"].price.median()
    dk, dl = latest[latest.origin == "kbeauty"].discount_pct.mean(), latest[latest.origin == "local"].discount_pct.mean()
    if ml:
        out.append(f"K-beauty is priced at {mk / ml:.1f}× the Local median (₹{mk:,.0f} vs ₹{ml:,.0f}) and discounts less "
                   f"({dk:.0f}% vs {dl:.0f}% off MRP): it competes on positioning, not price.")
    paid_k = latest[latest.origin == "kbeauty"].is_paid.mean(); paid_l = latest[latest.origin == "local"].is_paid.mean()
    out.append(f"Paid placement (AD or featured pinning) backs {paid_l:.0%} of Local slots versus {paid_k:.0%} of K-beauty slots.")
    km = latest[latest.k_marketing & (latest.origin != "kbeauty")].brand.nunique()
    if km:
        names = ", ".join(latest[latest.k_marketing & (latest.origin != "kbeauty")].brand.value_counts().index[:3])
        out.append(f"{km} non-Korean brands market products as Korean in these listings (e.g. {names}), competing for the K-beauty shopper at Local price points.")
    hot = radar[radar.ratings_per_day.notna()].head(1)
    if len(hot):
        h = hot.iloc[0]
        out.append(f"Fastest-moving launch: {h.brand} {short_name(h['name'], h.brand)[:45]} ({L.get(h.subcategory, h.subcategory)}, #{int(h['rank'])}) "
                   f"is adding about {h.ratings_per_day:.0f} ratings a day since its first review on {h.first_review_date:%d %b}.")
    if history.scrape_date.nunique() < 2:
        out.append("Trend statements (share movement, rank gains and losses, rating growth) unlock automatically once a second daily scrape lands.")
    return out


# ------------------------------------------------------------------ deeper signals

def search_capture(search: pd.DataFrame) -> pd.DataFrame:
    """Per query, on UNPAID results only: share held by K-beauty, Local selling as Korean ('imitators'),
    other Local, Global. Paid AD slots rotate per visitor (a shopper and our collector see different ads),
    so they are reported separately and never counted as earned positions."""
    if search.empty:
        return pd.DataFrame()
    d = search.copy()
    d["seg"] = np.where(d.origin == "kbeauty", "kbeauty",
                np.where((d.origin == "local") & d.k_marketing, "imitator",
                np.where(d.origin == "local", "local", np.where(d.origin == "global", "global", "unknown"))))
    out = []
    for q, g in d.groupby("query"):
        org = g[~g.is_ad].sort_values("rank").copy()
        org["organic_rank"] = range(1, len(org) + 1)
        ads = g[g.is_ad].sort_values("rank")
        tf = pd.to_numeric(g.total_found, errors="coerce").max()
        row = {"query": q, "results": int(tf) if tf == tf else 0, "n": len(org), "ads": len(ads)}
        for s_ in ("kbeauty", "imitator", "local", "global", "unknown"):
            row[s_] = (org.seg == s_).mean() if len(org) else np.nan
        top5 = org[org.organic_rank <= 5]
        row["kbeauty_top5"] = (top5.seg == "kbeauty").mean() if len(top5) else np.nan
        lead = org.iloc[0] if len(org) else None
        row["top_brand"] = lead.brand if lead is not None else None
        row["top_origin"] = lead.origin if lead is not None else "unknown"
        row["non_k_leader"] = next((b for b, o in zip(org.brand, org.origin) if o != "kbeauty"), None)
        row["ad_brands"] = list(dict.fromkeys(ads.brand))
        row["ad_origins"] = list(ads.origin)
        out.append(row)
    return pd.DataFrame(out).sort_values("kbeauty", ascending=True)


def demand_by_origin(rm: pd.DataFrame, months: int = 12) -> tuple[list[pd.Timestamp], dict[str, list[float]]]:
    """Monthly reviews summed by origin over the last `months` complete months (current partial month excluded)."""
    if rm.empty:
        return [], {}
    cur = pd.Timestamp.today().normalize().replace(day=1)
    idx = pd.date_range(end=cur - pd.offsets.MonthBegin(1), periods=months, freq="MS")
    d = rm[(rm.month < cur) & (rm.coverage_start <= idx[0])]   # only products with the full window covered
    t = d.groupby(["month", "origin"]).reviews.sum().unstack().reindex(idx).fillna(0)
    return list(idx), {o: list(t[o]) for o in ("kbeauty", "local", "global") if o in t}


def brand_momentum(rm: pd.DataFrame) -> pd.DataFrame:
    """Per brand: reviews in the last 3 complete months vs the 3 before; 12-month sparkline."""
    if rm.empty:
        return pd.DataFrame()
    cur = pd.Timestamp.today().normalize().replace(day=1)
    idx = pd.date_range(end=cur - pd.offsets.MonthBegin(1), periods=12, freq="MS")
    six = idx[-6]
    rm = rm[rm.coverage_start <= six]   # momentum compares 6 months: require products covering them
    if rm.empty:
        return pd.DataFrame()
    t = rm[rm.month < cur].groupby(["brand", "month"]).reviews.sum().unstack().reindex(columns=idx).fillna(0)
    # months before a brand's coverage are unknown, not zero: blank them for the sparkline
    cov = rm.groupby("brand").coverage_start.min()
    for b in t.index:
        t.loc[b, t.columns < cov[b]] = np.nan
    meta = rm.groupby("brand").agg(origin=("origin", "first"), products=("product_id", "nunique"))
    out = pd.DataFrame({"last3": t.iloc[:, -3:].sum(axis=1), "prev3": t.iloc[:, -6:-3].sum(axis=1), "last12": t.sum(axis=1, min_count=1)}).join(meta)
    out["growth"] = (out.last3 - out.prev3) / out.prev3.replace(0, np.nan)
    out["spark"] = [[None if v != v else v for v in r] for r in t.values]
    out["share_last3"] = out.last3 / out.last3.sum() if out.last3.sum() else np.nan
    return out.reset_index().sort_values("last3", ascending=False)


def assortment_conversion(assort: pd.DataFrame, latest: pd.DataFrame) -> pd.DataFrame:
    """Brand range on Nykaa vs products that reach the top-100 shelves (distinct products across tracked categories)."""
    if assort.empty:
        return pd.DataFrame()
    shelf = latest.groupby("brand").product_id.nunique().rename("on_shelf")
    d = assort.set_index("brand").join(shelf).fillna({"on_shelf": 0}).reset_index()
    d = d[d.total_products.fillna(0) > 0]
    d["conversion"] = d.on_shelf / d.total_products
    return d


def promo_intensity(latest: pd.DataFrame) -> pd.DataFrame:
    if "has_offer" not in latest:
        return pd.DataFrame()
    d = latest[latest.origin != "unknown"]
    return d.groupby("origin").agg(offer=("has_offer", "mean"), discount=("discount_pct", "mean"), paid=("is_paid", "mean"), n=("product_id", "size")).reset_index()
