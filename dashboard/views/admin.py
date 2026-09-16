from __future__ import annotations

import streamlit as st

from .. import config as C, data, ui as U


def render(ctx: dict) -> None:
    can_edit = data.is_admin(ctx["user_email"])
    U.page_head("Brand classification", "Auto-classified and unconfirmed brands first. Change origin, tick confirmed, add a note, then save. "
                "Confirmed rows are never overwritten by the scraper." if can_edit else "Read-only: only admins can change brand classifications.")
    bdf = data.brands()
    only_unconfirmed = st.checkbox("Show only unconfirmed", value=True)
    verify_first = st.checkbox("Show 'VERIFY' conflicts first (seed origin disagrees with country of origin)", value=True)
    view = bdf[~bdf.confirmed] if only_unconfirmed else bdf
    view = view.assign(_verify=view.evidence.fillna("").str.contains("VERIFY"))
    view = view.sort_values(["_verify", "source", "confirmed", "n_products"], ascending=[not verify_first, True, True, False])
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
    changed = edited[(edited.origin != editable.origin) | (edited.confirmed != editable.confirmed) | (edited.note.fillna("") != editable.note.fillna(""))]
    if can_edit and st.button(f"Save {len(changed)} change{'s' if len(changed) != 1 else ''}", disabled=changed.empty, type="primary"):
        n = data.save_brand_edits(changed[["brand", "origin", "confirmed", "note"]].to_dict("records"), ctx["user_email"])
        st.success(f"Saved {n} brand{'s' if n != 1 else ''}.")
        st.rerun()
