"""New-product / new-brand detection.

Signals, strongest first:
  1. first_review_date (reviews API; proxy for launch on Nykaa) within
     NEW_WINDOW_DAYS -> new. A product with zero text reviews and a tiny
     rating_count is "likely new, unverified".
  2. first_seen_date in our own snapshots (Phase 3+, once history exists):
     a product/brand entering the top-N for the first time.
  3. Nykaa's own NEW tag (is_new_tag) — recorded but NOT trusted on its own:
     products with tens of thousands of ratings carry it.

Brand launch date = oldest first_review_date across the brand's products we
have enriched. A brand whose oldest known product is younger than the window
is a new brand (within the tracked categories).
"""
from __future__ import annotations

from datetime import date, timedelta

from . import config


def product_newness(row: dict, today: date) -> dict:
    cutoff = today - timedelta(days=config.NEW_WINDOW_DAYS)
    frd = row.get("first_review_date")
    rc = row.get("rating_count") or 0
    if frd:
        is_new = date.fromisoformat(frd) >= cutoff
        return {"is_new_product": is_new, "new_product_basis": "first_review_date" if is_new else None,
                "days_since_first_review": (today - date.fromisoformat(frd)).days}
    if row.get("review_count") == 0 and rc < 20:
        return {"is_new_product": True, "new_product_basis": "no reviews yet, <20 ratings (unverified)",
                "days_since_first_review": None}
    return {"is_new_product": False, "new_product_basis": None, "days_since_first_review": None}


def brand_newness(stats: dict, today: date, known_brand: bool) -> dict:
    """stats: brand_stats() entry (first_review_dates, unenriched, zero_review, n).

    Two distinct flags, because we only see the top-N of a few categories:
      is_new_entrant  — every product this brand has in the tracked listings
                        is new (first review within the window). True for an
                        established brand that just entered these categories
                        (e.g. SK-II launching one serum) AND for a truly new brand.
      is_new_brand    — is_new_entrant AND the brand is not in the seed list
                        (known_brand=False). A seeded brand is by definition
                        already known to the owner, so it cannot be "new".
    """
    cutoff = today - timedelta(days=config.NEW_WINDOW_DAYS)
    dates = stats.get("first_review_dates") or []
    oldest = min(dates) if dates else None
    out = {"brand_first_review_date": oldest, "is_new_entrant": False, "is_new_brand": False, "newness_basis": None}
    if stats.get("unenriched", 0):
        out["newness_basis"] = f"has {stats['unenriched']} established product(s)"
        return out
    if oldest:
        if date.fromisoformat(oldest) >= cutoff:
            out["is_new_entrant"] = True
            out["newness_basis"] = "all listed products first reviewed within window"
    elif stats.get("zero_review", 0) == stats["n"]:
        out["is_new_entrant"] = True
        out["newness_basis"] = "no text reviews on any listed product yet (unverified)"
    out["is_new_brand"] = out["is_new_entrant"] and not known_brand
    if out["is_new_entrant"] and known_brand:
        out["newness_basis"] += "; brand is in seed list -> new to tracked categories, not a new brand"
    return out
