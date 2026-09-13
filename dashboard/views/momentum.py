from __future__ import annotations

import pandas as pd
import streamlit as st

from .. import charts, config as C, metrics as M, styles as S

L = C.SUBCATEGORY_LABELS
O = C.ORIGIN_LABELS


def render(ctx: dict) -> None:
    latest, base, f, det, multi = ctx["latest"], ctx["base"], ctx["filtered"], ctx["det"], ctx["multi_day"]
    as_of, first_date = ctx["latest_date"], ctx["first_date"]
    S.eyebrow("Ratings and reviews")
    st.title("Quality and momentum")
    S.lede("Average ratings by origin, rating-count growth as a sales proxy, and what shoppers praise or complain about.")

    st.header(f"Average rating by origin · {as_of:%d %b %Y}")
    rt = latest[latest.origin != "unknown"].groupby(["subcategory", "origin"]).agg(avg_rating=("rating", "mean")).reset_index()
    st.plotly_chart(charts.dot_plot(rt, "avg_rating", ".2f", (3.5, 5)), width="stretch")
    S.sowhat("Shown on a 3.5–5 scale because nearly every listed product rates between 3.8 and 4.7.")

    st.header("Rating-count growth")
    if multi:
        fl = f[f.scrape_date.isin([first_date, as_of])]
        g = fl.pivot_table(index=["brand", "origin"], columns="scrape_date", values="rating_count", aggfunc="sum")
        g.columns = ["start", "end"]; g = g.dropna()
        g["added"] = g.end - g.start; g["growth"] = g.added / g.start.replace(0, pd.NA)
        g = g.reset_index().sort_values("added", ascending=False); g["origin"] = g.origin.map(O)
        st.dataframe(g.head(40), width="stretch", hide_index=True, column_config={
            "brand": "Brand", "origin": "Origin",
            "start": st.column_config.NumberColumn(f"Ratings {first_date:%d %b}", format="localized"),
            "end": st.column_config.NumberColumn(f"Ratings {as_of:%d %b}", format="localized"),
            "added": st.column_config.NumberColumn("Added", format="%+d"), "growth": st.column_config.NumberColumn("Growth", format="percent")})
        ot = base.groupby(["scrape_date", "origin"]).rating.mean().reset_index()
        st.subheader("Average rating over time by origin")
        st.plotly_chart(charts.metric_lines(ot, "rating", ".2f"), width="stretch")
    else:
        st.caption("Growth needs at least two scrape days. Today's totals by brand:")
        cur = latest.groupby(["brand", "origin"]).agg(products=("product_id", "nunique"), ratings=("rating_count", "sum"), avg_rating=("rating", "mean")).reset_index().sort_values("ratings", ascending=False)
        cur["origin"] = cur.origin.map(O)
        st.dataframe(cur.head(40), width="stretch", hide_index=True, column_config={
            "brand": "Brand", "origin": "Origin", "products": "Products", "ratings": st.column_config.NumberColumn("Ratings", format="localized"),
            "avg_rating": st.column_config.NumberColumn("Avg rating", format="%.2f")})

    st.header("What shoppers say")
    if det.empty:
        st.caption("Appears once product details have been fetched.")
        return
    S.sowhat("Review themes Nykaa extracts per product, aggregated by origin. Negative themes are where a competitor is vulnerable.")
    m = latest.merge(det[["product_id", "review_key_phrases"]], on="product_id", how="inner")
    rows = [(r.origin, p.get("text"), p.get("sentiment")) for _, r in m.iterrows() for p in (r.review_key_phrases or [])]
    ph = pd.DataFrame(rows, columns=["origin", "phrase", "sentiment"])
    cols = st.columns(3)
    for col, o in zip(cols, ("kbeauty", "local", "global")):
        with col:
            st.subheader(O[o])
            d = ph[ph.origin == o]
            pos = d[d.sentiment == "Positive"].phrase.value_counts().head(6)
            neg = d[d.sentiment == "Negative"].phrase.value_counts().head(4)
            st.markdown('<div class="k">Praised</div>' + S.pills([f"{k} ({v})" for k, v in pos.items()], "pos"), unsafe_allow_html=True)
            st.markdown('<div class="k">Criticised</div>' + (S.pills([f"{k} ({v})" for k, v in neg.items()], "neg") or "<span class='v'>–</span>"), unsafe_allow_html=True)
