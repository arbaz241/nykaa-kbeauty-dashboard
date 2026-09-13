"""Dashboard configuration: connection, tracked brands, palette."""
from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


def database_url() -> str:
    """Supabase Postgres connection string (Project Settings > Database > Connection string,
    'Session pooler' for IPv4 hosts like Streamlit Cloud). Streamlit secrets win over env."""
    try:
        import streamlit as st
        if "DATABASE_URL" in st.secrets:
            return st.secrets["DATABASE_URL"]
    except Exception:  # noqa: BLE001 — no secrets file locally
        pass
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set (see .env.example)")
    return url


# Brands the owner tracks by name. Matching is case/punctuation-insensitive.
TRACKED_BRANDS = ["Innisfree", "Etude", "Laneige", "Sulwhasoo", "Mamonde"]

ORIGIN_LABELS = {"kbeauty": "K-beauty", "local": "Local (India)", "global": "Global", "unknown": "Unclassified"}
ORIGIN_ORDER = ["kbeauty", "local", "global", "unknown"]

# Categorical slots 1-3 of the validated reference palette (blue, orange, aqua),
# in fixed order: K-beauty is always blue, Local always orange, Global always aqua.
# Unclassified is the de-emphasis gray, never a fourth hue.
ORIGIN_COLORS = {"kbeauty": "#2a78d6", "local": "#eb6834", "global": "#1baf7a", "unknown": "#898781"}
EMPHASIS = "#2a78d6"     # the one highlighted series
DEEMPHASIS = "#c3c2b7"   # everything that is context
INK = "#0b0b0b"
INK_2 = "#52514e"
MUTED = "#898781"
GRID = "#e1e0d9"
SURFACE = "#fcfcfb"

SUBCATEGORY_LABELS = {
    "face_moisturizer": "Face moisturizer", "serum": "Serum", "sunscreen": "Sunscreen",
    "face_wash": "Face wash", "masks": "Masks & peels", "lipstick": "Lipstick", "foundation": "Foundation",
}
NEW_WINDOW_DAYS = 90
