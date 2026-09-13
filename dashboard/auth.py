"""Supabase Auth (email + password) gate for the Streamlit app.

Per-person logins, not a shared password, so access can be granted and revoked
per user and audit fields (brand edits' `updated_by`) carry a real email.

Configuration (Streamlit secrets or env):
  SUPABASE_URL, SUPABASE_ANON_KEY   -> required for auth
  DASHBOARD_AUTH_DISABLED=1         -> local development only: skips login,
                                       user shows as 'local-dev'. Never set on
                                       Streamlit Cloud.

Users are created by the owner in Supabase: Authentication > Users > Add user
(with "auto confirm"), or by inviting them by email. Self-signup is not offered
by this app.
"""
from __future__ import annotations

import os

import streamlit as st


def _setting(name: str) -> str | None:
    try:
        if name in st.secrets:
            return str(st.secrets[name])
    except Exception:  # noqa: BLE001 — no secrets file locally
        pass
    return os.getenv(name)


def _client():
    from supabase import create_client
    return create_client(_setting("SUPABASE_URL"), _setting("SUPABASE_ANON_KEY"))


def require_login() -> str:
    """Render the login form until the user is signed in; return their email."""
    if st.session_state.get("user_email"):
        return st.session_state["user_email"]

    if _setting("DASHBOARD_AUTH_DISABLED") == "1":
        st.session_state["user_email"] = "local-dev"
        return "local-dev"

    if not (_setting("SUPABASE_URL") and _setting("SUPABASE_ANON_KEY")):
        st.title("Nykaa K-Beauty Market")
        st.error("Login is not configured: set SUPABASE_URL and SUPABASE_ANON_KEY "
                 "(or DASHBOARD_AUTH_DISABLED=1 for local development).")
        st.stop()

    st.title("Nykaa K-Beauty Market")
    st.caption("Sign in with the email and password you were given.")
    with st.form("login"):
        email = st.text_input("Email", autocomplete="username")
        password = st.text_input("Password", type="password", autocomplete="current-password")
        submitted = st.form_submit_button("Sign in", type="primary")
    if submitted:
        try:
            res = _client().auth.sign_in_with_password({"email": email.strip(), "password": password})
            user_email = (res.user.email if res and res.user else None)
            if not user_email:
                raise RuntimeError("no user in response")
            st.session_state["user_email"] = user_email
            st.rerun()
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            friendly = "Invalid email or password." if "Invalid login credentials" in msg else f"Sign-in failed: {msg[:200]}"
            st.error(friendly)
    st.stop()


def logout_button() -> None:
    with st.sidebar:
        st.caption(f"Signed in as {st.session_state.get('user_email', '?')}")
        if st.button("Sign out"):
            st.session_state.pop("user_email", None)
            st.rerun()
