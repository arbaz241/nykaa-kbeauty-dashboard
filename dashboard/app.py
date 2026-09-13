"""Nykaa K-Beauty Market Dashboard — Streamlit entry point.

Run locally:  DATABASE_URL=... .venv/bin/streamlit run dashboard/app.py
"""
from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # so `scraper` and `dashboard` import when run by streamlit

from dashboard import auth, charts, config as C, data  # noqa: E402
from scraper.brands import brand_stats, norm  # noqa: E402
from scraper.newness import brand_newness  # noqa: E402

st.set_page_config(page_title="Nykaa K-Beauty Market", page_icon="🧴", layout="wide")
USER_EMAIL = auth.require_login()

SUB = C.SUBCATEGORY_LABELS
ORIGIN = C.ORIGIN_LABELS


def fmt_inr(v) -> str:
    return "–" if pd.isna(v) else f"₹{v:,.0f}"


def pct(v, digits=0) -> str:
    return "–" if pd.isna(v) else f"{v * 100:.{digits}f}%"


# ------------------------------------------------------------------ sidebar
lo, hi = data.date_bounds()
if hi is None:
    st.title("Nykaa K-Beauty Market")
    st.warning("No scrape data in the database yet. Run the scraper (`python -m scraper.run`) or backfill a day "
               "(`python -m scraper.ingest --date YYYY-MM-DD`).")
    st.stop()

with st.sidebar:
    st.markdown("### Filters")
    preset = st.radio("Date range", ["Last 7 days", "Last 30 days", "Last 90 days", "All", "Custom"], index=1,
                      label_visibility="collapsed", horizontal=True)
    if preset == "Custom":
        d_from, d_to = st.date_input("Custom range", (max(lo, hi - timedelta(days=30)), hi), min_value=lo, max_value=hi)
    elif preset == "All":
        d_from, d_to = lo, hi
    else:
        days = {"Last 7 days": 7, "Last 30 days": 30, "Last 90 days": 90}[preset]
        d_from, d_to = max(lo, hi - timedelta(days=days - 1)), hi
    st.caption(f"{d_from:%d %b %Y} → {d_to:%d %b %Y}")

    top_n = st.radio("Listing depth", [20, 50, 100], index=2, horizontal=True, format_func=lambda n: f"Top {n}")
    excl_ads = st.checkbox("Exclude paid 'AD' slots", value=False)
    excl_pinned = st.checkbox("Exclude 'featured' pinned slots", value=False)

raw = data.snapshots(d_from, d_to)
if raw.empty:
    st.warning("No rows in the selected date range.")
    st.stop()

with st.sidebar:
    subs_all = [s for s in SUB if s in set(raw.subcategory)] + sorted(set(raw.subcategory) - set(SUB))
    subs = st.multiselect("Subcategories", subs_all, default=subs_all, format_func=lambda s: SUB.get(s, s))
    origins = st.multiselect("Brand origin", C.ORIGIN_ORDER, default=C.ORIGIN_ORDER, format_func=lambda o: ORIGIN[o])
    brand_opts = sorted(raw.brand.unique(), key=str.lower)
    brand_sel = st.multiselect("Brands (blank = all)", brand_opts, default=[])
    st.divider()
    n_days = raw.scrape_date.nunique()
    st.caption(f"{n_days} scrape day{'s' if n_days != 1 else ''} in range · data through {hi:%d %b %Y}")
auth.logout_button()

# base = everything in top-N after ad/pinned exclusion (denominator for shares)
base = raw[raw["rank"] <= top_n]
if excl_ads:
    base = base[~base.is_ad]
if excl_pinned:
    base = base[~base.is_pinned]
base = base[base.subcategory.isin(subs)]
f = base[base.origin.isin(origins)]
if brand_sel:
    f = f[f.brand.isin(brand_sel)]

latest_date = raw.scrape_date.max()
first_date = raw.scrape_date.min()
latest = base[base.scrape_date == latest_date]
multi_day = n_days > 1

# ------------------------------------------------------------------ header
st.title("Nykaa K-Beauty Market")
runs = data.runs(5)
if not runs.empty:
    last = runs.iloc[0]
    stale = (date.today() - pd.to_datetime(last.scrape_date).date()).days > 2
    if last.blocked:
        st.error(f"Latest scrape on {pd.to_datetime(last.scraped_at):%d %b %H:%M} UTC was **blocked by Nykaa** "
                 f"(Akamai 403). Data shown is from the last successful run. See Data health.")
    elif not last.success:
        st.warning(f"Latest scrape on {pd.to_datetime(last.scraped_at):%d %b} had failures. See Data health.")
    if stale:
        st.warning(f"Data is stale: last scrape {pd.to_datetime(last.scrape_date):%d %b %Y}.")

tab_over, tab_rank, tab_price, tab_rating, tab_new, tab_brands, tab_health = st.tabs(
    ["Overview", "Rank tracking", "Pricing", "Ratings & reviews", "New entrants", "Brand review", "Data health"])


# ---------------------------------------------------------------- overview
def share_table(df: pd.DataFrame, by: list[str]) -> pd.DataFrame:
    tot = df.groupby(by).size().rename("total")
    part = df.groupby(by + ["origin"]).size().rename("n").reset_index()
    part = part.join(tot, on=by)
    part["share"] = part.n / part.total
    return part


with tab_over:
    # KPIs, latest day, K-beauty focus
    k_share_now = (latest.origin == "kbeauty").mean() if len(latest) else float("nan")
    first_day = base[base.scrape_date == first_date]
    k_share_first = (first_day.origin == "kbeauty").mean() if len(first_day) else float("nan")
    k_brands = latest[latest.origin == "kbeauty"].brand.nunique()
    tracked_keys = {norm(b) for b in C.TRACKED_BRANDS}
    tracked_rows = latest[latest.brand_key.isin(tracked_keys)]
    med_k = latest[latest.origin == "kbeauty"].price.median()
    med_l = latest[latest.origin == "local"].price.median()

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("K-beauty share of shelf", pct(k_share_now),
              delta=(f"{(k_share_now - k_share_first) * 100:+.1f} pts vs {first_date:%d %b}" if multi_day else None))
    c2.metric("K-beauty brands in top listings", k_brands)
    c3.metric("K-beauty median price vs Local", f"{med_k / med_l:.1f}×" if med_l and not pd.isna(med_l) else "–",
              help=f"K-beauty median {fmt_inr(med_k)} · Local median {fmt_inr(med_l)}")
    c4.metric("Tracked-brand products in top listings", len(tracked_rows),
              help="Tracked: " + ", ".join(C.TRACKED_BRANDS))

    st.subheader(f"Share of shelf by subcategory · {latest_date:%d %b %Y}")
    st.caption(f"Share of the top {top_n} listing slots held by each brand origin"
               + (" (paid AD slots excluded)" if excl_ads else "") + (" (pinned slots excluded)" if excl_pinned else "") + ".")
    st.plotly_chart(charts.share_by_subcategory(share_table(latest, ["subcategory"])), width="stretch")

    st.subheader("Share of shelf over time")
    if multi_day:
        trend = share_table(base, ["scrape_date"])
        st.plotly_chart(charts.share_trend(trend), width="stretch")
        per_sub = st.selectbox("Trend for one subcategory", ["(all selected)"] + subs, format_func=lambda s: SUB.get(s, s))
        if per_sub != "(all selected)":
            st.plotly_chart(charts.share_trend(share_table(base[base.subcategory == per_sub], ["scrape_date"])),
                            width="stretch")
    else:
        st.info("Only one scrape day in range. The trend chart appears once daily scrapes accumulate.")

    with st.expander("Table: share of shelf by subcategory and origin"):
        t = share_table(latest, ["subcategory"]).pivot(index="subcategory", columns="origin", values="share").reindex(columns=C.ORIGIN_ORDER)
        t.index = [SUB.get(s, s) for s in t.index]; t.columns = [ORIGIN[o] for o in t.columns]
        st.dataframe(t.style.format(lambda v: pct(v)), width="stretch")


# ------------------------------------------------------------- rank tracking
with tab_rank:
    st.subheader("Rank over time for tracked brands")
    sub_r = st.selectbox("Subcategory", subs, format_func=lambda s: SUB.get(s, s), key="rank_sub")
    present = base[base.subcategory == sub_r]
    default_brands = sorted({b for b in present.brand.unique() if norm(b) in tracked_keys}, key=str.lower)
    pick = st.multiselect("Brands", sorted(present.brand.unique(), key=str.lower), default=default_brands,
                          help="Defaults to the tracked brands that appear in this subcategory.")
    sel = present[present.brand.isin(pick)].copy()
    if sel.empty:
        st.info("None of the selected brands appear in the top listings for this subcategory in the date range."
                if pick else "Pick one or more brands.")
    else:
        sel["label"] = sel.brand + " · " + sel.name.str.slice(0, 38)
        # context: average rank of the same origin in this subcategory
        origin_ctx = sel.origin.mode().iloc[0]
        ctx = (present[present.origin == origin_ctx].groupby("scrape_date")["rank"].mean().reset_index())
        ctx["label"] = f"Average rank of all {ORIGIN[origin_ctx]} products"
        st.plotly_chart(charts.rank_lines(sel.sort_values("scrape_date"), ctx, top_n), width="stretch")
        cur = sel[sel.scrape_date == sel.scrape_date.max()]
        first = sel[sel.scrape_date == sel.scrape_date.min()].set_index("product_id")["rank"]
        best = sel.groupby("product_id")["rank"].min()
        tbl = cur[["brand", "name", "rank", "price", "rating", "rating_count", "is_ad", "is_pinned", "product_id"]].copy()
        tbl["best rank"] = tbl.product_id.map(best)
        tbl["change vs start"] = tbl.product_id.map(first) - tbl["rank"] if multi_day else pd.NA
        st.dataframe(tbl.drop(columns="product_id").sort_values("rank").rename(columns={
            "rank": "rank now", "rating_count": "ratings", "is_ad": "AD", "is_pinned": "pinned"}),
            width="stretch", hide_index=True,
            column_config={"price": st.column_config.NumberColumn(format="₹%d"), "name": st.column_config.TextColumn(width="large")})
        if not multi_day:
            st.caption("Rank change appears once there is more than one scrape day.")


# -------------------------------------------------------------------- pricing
with tab_price:
    st.subheader(f"Price positioning by origin · {latest_date:%d %b %Y}")
    st.caption("Selling price of every product in the top listings. Box = middle 50%, line = median.")
    lp = latest[latest.origin != "unknown"]
    st.plotly_chart(charts.price_box(lp), width="stretch")

    med = lp.groupby(["subcategory", "origin"]).agg(median_price=("price", "median"), median_mrp=("mrp", "median"),
                                                     mean_discount=("discount_pct", "mean"), n=("price", "size")).reset_index()
    st.subheader("Discount depth (average % off MRP)")
    st.plotly_chart(charts.grouped_bar(med, "mean_discount", ".0f", suffix="%"), width="stretch")

    st.subheader("K-beauty price premium vs Local and Global")
    piv = med.pivot(index="subcategory", columns="origin", values="median_price")
    prem = pd.DataFrame({
        "Subcategory": [SUB.get(s, s) for s in piv.index],
        "K-beauty median": piv.get("kbeauty"), "Local median": piv.get("local"), "Global median": piv.get("global"),
    })
    prem["K vs Local"] = piv.get("kbeauty") / piv.get("local") if "kbeauty" in piv and "local" in piv else pd.NA
    prem["K vs Global"] = piv.get("kbeauty") / piv.get("global") if "kbeauty" in piv and "global" in piv else pd.NA
    st.dataframe(prem.set_index("Subcategory"), width="stretch", column_config={
        "K-beauty median": st.column_config.NumberColumn(format="₹%d"),
        "Local median": st.column_config.NumberColumn(format="₹%d"),
        "Global median": st.column_config.NumberColumn(format="₹%d"),
        "K vs Local": st.column_config.NumberColumn(format="%.2f×"),
        "K vs Global": st.column_config.NumberColumn(format="%.2f×"),
    })
    if multi_day:
        st.subheader("Median price over time by origin")
        mt = base[base.origin != "unknown"].groupby(["scrape_date", "origin"]).price.median().reset_index()
        st.plotly_chart(charts.metric_lines(mt, "price", ",.0f"), width="stretch")


# --------------------------------------------------------- ratings & reviews
with tab_rating:
    st.subheader(f"Average rating by origin · {latest_date:%d %b %Y}")
    rt = latest[latest.origin != "unknown"].groupby(["subcategory", "origin"]).agg(avg_rating=("rating", "mean")).reset_index()
    st.plotly_chart(charts.dot_plot(rt, "avg_rating", ".2f", (3.5, 5)), width="stretch")
    st.caption("Mean star rating of the products in the top listings. Shown as dots on a 3.5–5 scale because nearly every product rates between 3.8 and 4.7.")

    st.subheader("Rating-count growth (sales-momentum proxy)")
    if multi_day:
        fl = f[f.scrape_date.isin([first_date, latest_date])]
        g = fl.pivot_table(index=["brand", "origin"], columns="scrape_date", values="rating_count", aggfunc="sum")
        g.columns = ["start", "end"]
        g = g.dropna()
        g["added"] = g.end - g.start
        g["growth"] = g.added / g.start.replace(0, pd.NA)
        g = g.reset_index().sort_values("added", ascending=False)
        g["origin"] = g.origin.map(ORIGIN)
        st.dataframe(g.head(40), width="stretch", hide_index=True, column_config={
            "start": st.column_config.NumberColumn(f"ratings {first_date:%d %b}", format="localized"),
            "end": st.column_config.NumberColumn(f"ratings {latest_date:%d %b}", format="localized"),
            "added": st.column_config.NumberColumn("ratings added", format="%+d"),
            "growth": st.column_config.NumberColumn("growth", format="%.1%")})
        ot = base.groupby(["scrape_date", "origin"]).rating.mean().reset_index()
        st.subheader("Average rating over time by origin")
        st.plotly_chart(charts.metric_lines(ot, "rating", ".2f"), width="stretch")
    else:
        st.info("Growth needs at least two scrape days. Today's snapshot is below.")
        cur = latest.groupby(["brand", "origin"]).agg(products=("product_id", "nunique"), ratings=("rating_count", "sum"),
                                                     avg_rating=("rating", "mean")).reset_index().sort_values("ratings", ascending=False)
        cur["origin"] = cur.origin.map(ORIGIN)
        st.dataframe(cur.head(40), width="stretch", hide_index=True,
                     column_config={"ratings": st.column_config.NumberColumn(format="localized"),
                                    "avg_rating": st.column_config.NumberColumn("avg rating", format="%.2f")})


# -------------------------------------------------------------- new entrants
with tab_new:
    prods = data.products()
    all_lo, all_hi = data.date_bounds()
    window_start = latest_date - pd.Timedelta(days=C.NEW_WINDOW_DAYS)

    st.subheader(f"Newly in the top {top_n} on {latest_date:%d %b %Y}")
    if all_lo == all_hi:
        st.info("Needs at least two scrape days: a product is 'newly in' when its first appearance is the latest scrape.")
    else:
        fs = prods.set_index("product_id").first_seen_date
        newly = latest[latest.product_id.map(fs) == latest_date]
        if newly.empty:
            st.write("No new products entered the top listings on the latest scrape.")
        else:
            t = newly[["subcategory", "rank", "brand", "origin", "name", "price", "rating", "rating_count", "first_review_date"]].sort_values(["subcategory", "rank"])
            t["subcategory"] = t.subcategory.map(SUB); t["origin"] = t.origin.map(ORIGIN)
            st.dataframe(t, width="stretch", hide_index=True)

    st.subheader(f"New products (first review within {C.NEW_WINDOW_DAYS} days)")
    st.caption("Launch date is estimated from the oldest review on Nykaa. Products with no text reviews and under 20 ratings are 'likely new, unverified'.")
    lp = latest.copy()
    lp["first_review_date"] = pd.to_datetime(lp.first_review_date)
    is_new = (lp.first_review_date >= window_start) | ((lp.review_count == 0) & (lp.rating_count.fillna(0) < 20))
    newp = lp[is_new].sort_values("first_review_date", ascending=False, na_position="first")
    t = newp[["subcategory", "rank", "brand", "origin", "name", "first_review_date", "rating_count", "review_count", "is_new_tag", "price"]].copy()
    t["subcategory"] = t.subcategory.map(SUB); t["origin"] = t.origin.map(ORIGIN)
    st.dataframe(t.rename(columns={"first_review_date": "first review", "rating_count": "ratings", "review_count": "text reviews",
                                   "is_new_tag": "Nykaa NEW tag"}),
                 width="stretch", hide_index=True,
                 column_config={"first review": st.column_config.DateColumn(format="DD MMM YYYY"),
                                "price": st.column_config.NumberColumn(format="₹%d")})

    st.subheader("New brands")
    rows = latest.to_dict("records")
    for r in rows:
        r["first_review_date"] = None if pd.isna(r["first_review_date"]) else str(r["first_review_date"])[:10]
        r["review_count"] = None if pd.isna(r["review_count"]) else int(r["review_count"])
    stats = brand_stats(rows)
    bsrc = data.brands().set_index("brand").source
    nb = []
    for b, s in stats.items():
        n = brand_newness(s, latest_date.date(), known_brand=(bsrc.get(b) == "seed"))
        if n["is_new_entrant"]:
            nb.append({"brand": b, "origin": ORIGIN.get(latest[latest.brand == b].origin.iloc[0], "?"),
                       "new brand" if n["is_new_brand"] else "x": n["is_new_brand"],
                       "is_new_brand": n["is_new_brand"], "oldest first review": n["brand_first_review_date"],
                       "products listed": s["n"], "basis": n["newness_basis"]})
    if nb:
        t = pd.DataFrame(nb)
        t["status"] = t.is_new_brand.map({True: "New brand", False: "Known brand, new to these categories"})
        st.dataframe(t[["brand", "origin", "status", "oldest first review", "products listed", "basis"]].sort_values(["status", "oldest first review"]),
                     width="stretch", hide_index=True)
    else:
        st.write("No new brands or new entrants detected in the current top listings.")

    st.subheader("Non-Korean brands with Korean positioning")
    km = data.brands()
    km = km[km.k_marketing & (km.origin != "kbeauty")][["brand", "origin", "k_marketing_evidence", "n_products"]].copy()
    km["origin"] = km.origin.map(ORIGIN)
    st.dataframe(km.rename(columns={"k_marketing_evidence": "evidence", "n_products": "products seen"}),
                 width="stretch", hide_index=True,
                 column_config={"evidence": st.column_config.TextColumn(width="large")})


# --------------------------------------------------------------- brand review
with tab_brands:
    st.subheader("Brand classification review")
    can_edit = data.is_admin(USER_EMAIL)
    if can_edit:
        st.caption("Auto-classified and unconfirmed brands first. Change origin, tick 'confirmed', add a note, then Save. "
                   "Confirmed rows are never overwritten by the scraper.")
    else:
        st.info("Read-only: only admins can change brand classifications. Auto-classified and unconfirmed brands are listed first.")
    bdf = data.brands()
    only_unconfirmed = st.checkbox("Show only unconfirmed", value=True)
    view = bdf[~bdf.confirmed] if only_unconfirmed else bdf
    view = view.sort_values(["source", "confirmed", "n_products"], ascending=[True, True, False])  # 'auto' before 'seed'
    editable = view[["brand", "origin", "confirmed", "note", "source", "evidence", "k_marketing", "n_products"]].reset_index(drop=True)
    edited = st.data_editor(
        editable, width="stretch", hide_index=True, num_rows="fixed", key="brand_editor",
        disabled=(not can_edit) or ["brand", "source", "evidence", "k_marketing", "n_products"],
        column_config={
            "origin": st.column_config.SelectboxColumn("origin", options=C.ORIGIN_ORDER, required=True),
            "confirmed": st.column_config.CheckboxColumn("confirmed"),
            "note": st.column_config.TextColumn("note", width="medium"),
            "evidence": st.column_config.TextColumn("evidence", width="large"),
            "k_marketing": st.column_config.CheckboxColumn("K positioning"),
            "n_products": st.column_config.NumberColumn("products"),
        })
    changed = edited[(edited.origin != editable.origin) | (edited.confirmed != editable.confirmed)
                     | (edited.note.fillna("") != editable.note.fillna(""))]
    if can_edit and st.button(f"Save {len(changed)} change{'s' if len(changed) != 1 else ''}", disabled=changed.empty, type="primary"):
        who = USER_EMAIL
        n = data.save_brand_edits(changed[["brand", "origin", "confirmed", "note"]].to_dict("records"), who)
        st.success(f"Saved {n} brand{'s' if n != 1 else ''}.")
        st.rerun()


# ---------------------------------------------------------------- data health
with tab_health:
    st.subheader("Scraper runs")
    r = data.runs(30).copy()
    if r.empty:
        st.write("No runs recorded.")
    else:
        r["status"] = r.apply(lambda x: "blocked" if x.blocked else ("ok" if x.success else "failed"), axis=1)
        r["duration (min)"] = ((pd.to_datetime(r.finished_at) - pd.to_datetime(r.scraped_at)).dt.total_seconds() / 60).round(1)
        st.dataframe(r[["scrape_date", "scraped_at", "status", "total_rows", "review_requests", "duration (min)", "runner", "git_sha", "error_log"]],
                     width="stretch", hide_index=True,
                     column_config={"scraped_at": st.column_config.DatetimeColumn(format="DD MMM YYYY HH:mm"),
                                    "error_log": st.column_config.TextColumn(width="large")})
    st.subheader("Coverage")
    cov = raw.groupby("scrape_date").agg(rows=("product_id", "size"), subcategories=("subcategory", "nunique"),
                                         web_fallback_rows=("listing_source", lambda s: (s == "web").sum())).reset_index()
    st.dataframe(cov.sort_values("scrape_date", ascending=False), width="stretch", hide_index=True,
                 column_config={"scrape_date": st.column_config.DateColumn(format="DD MMM YYYY")})
    st.caption("Ranks come from the Nykaa app listing. `web_fallback_rows` > 0 means that day was served from the website "
               "ordering instead and should not be compared with app-ranked days.")
