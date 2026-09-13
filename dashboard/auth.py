"""Supabase Auth (email + password) gate for the Streamlit app.

Per-person logins, not a shared password, so access can be granted and revoked
per user and audit fields (brand edits' `updated_by`) carry a real email.

Configuration (Streamlit secrets or env):
  SUPABASE_URL, SUPABASE_ANON_KEY   -> required for auth
  DASHBOARD_AUTH_DISABLED=1         -> local development only: skips login,
                                       user shows as 'local-dev'. Never set on
                                       Streamlit Cloud.

Open sign-up (owner decision 2026-09-14): anyone can create an account and
view the dashboard. Editing brand classifications is limited to emails in the
`app_admins` table (migration 002). If Supabase's "Confirm email" setting is
on, new users must click the verification link before they can sign in.
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
    tab_in, tab_up = st.tabs(["Sign in", "Create account"])
    with tab_in:
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
                if "Invalid login credentials" in msg:
                    friendly = "Invalid email or password."
                elif "Email not confirmed" in msg:
                    friendly = "Email not confirmed yet: open the verification link we sent you, then sign in."
                else:
                    friendly = f"Sign-in failed: {msg[:200]}"
                st.error(friendly)
    with tab_up:
        st.caption("Anyone can create an account to view the dashboard. Editing is limited to admins.")
        with st.form("signup"):
            email2 = st.text_input("Email", key="su_email", autocomplete="email")
            pw2 = st.text_input("Password (8+ characters)", type="password", key="su_pw", autocomplete="new-password")
            pw3 = st.text_input("Repeat password", type="password", key="su_pw2", autocomplete="new-password")
            created = st.form_submit_button("Create account", type="primary")
        if created:
            if pw2 != pw3:
                st.error("Passwords do not match.")
            elif len(pw2) < 8:
                st.error("Password must be at least 8 characters.")
            else:
                try:
                    res = _client().auth.sign_up({"email": email2.strip(), "password": pw2})
                    if res.session and res.user and res.user.email:
                        st.session_state["user_email"] = res.user.email   # confirm-email is off: signed in
                        st.rerun()
                    else:
                        st.success("Account created. Check your inbox for the verification link, then sign in.")
                except Exception as e:  # noqa: BLE001
                    msg = str(e)
                    friendly = "An account with this email already exists. Sign in instead." if "already registered" in msg.lower() else f"Sign-up failed: {msg[:200]}"
                    st.error(friendly)
    st.stop()


def logout_button() -> None:
    with st.sidebar:
        st.caption(f"Signed in as {st.session_state.get('user_email', '?')}")
        if st.button("Sign out"):
            st.session_state.pop("user_email", None)
            st.rerun()
