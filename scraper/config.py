"""Scraper configuration. Edit CATEGORIES / TOP_N here; secrets live in .env."""
import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Category:
    key: str          # short stable identifier used in data + dashboard
    nykaa_id: int     # Nykaa category id (the number after /c/ in the URL)
    url: str          # canonical listing URL (used to establish the browser session)
    vertical: str     # "skin" | "makeup"


# Confirmed with Nykaa's own navigation on 2026-09-13.
CATEGORIES: list[Category] = [
    Category("face_moisturizer", 8394, "https://www.nykaa.com/skin/moisturizers/face-moisturizer-day-cream/c/8394", "skin"),
    Category("serum",            8397, "https://www.nykaa.com/skin/serums/serums-essence/c/8397", "skin"),
    Category("sunscreen",        8429, "https://www.nykaa.com/skin/sun-care/face-sunscreen/c/8429", "skin"),
    Category("face_wash",        8379, "https://www.nykaa.com/skin/cleansers/face-wash/c/8379", "skin"),
    Category("masks",            8400, "https://www.nykaa.com/skin/masks/masks-peels/c/8400", "skin"),
    Category("lipstick",          249, "https://www.nykaa.com/makeup/lips/lipstick/c/249", "makeup"),
    Category("foundation",        228, "https://www.nykaa.com/makeup/face/face-foundation/c/228", "makeup"),
    # Added 2026-09-27 on the owner's brief: the routine steps K-beauty actually competes on.
    # Toners & Mists is the third-largest Korean category (90 of the 765 catalogued Korean products)
    # and had no rank coverage at all; Nykaa files lip tints under "Lip Stain".
    Category("toner",            8391, "https://www.nykaa.com/skin/toners-mists/c/8391", "skin"),
    Category("sheet_mask",       8401, "https://www.nykaa.com/skin/masks/face-masks/c/8401", "skin"),
    Category("cleansing_balm",   8383, "https://www.nykaa.com/skin/cleansers/cleansing-balm-oil/c/8383", "skin"),
    Category("eye_care",         8403, "https://www.nykaa.com/skin/eye-care/under-eye-cream-serums/c/8403", "skin"),
    Category("lip_tint",          253, "https://www.nykaa.com/makeup/lips/lip-stain/c/253", "makeup"),
    # Nykaa's own Korean Beauty store: the shelf the K-beauty shopper browses. Not a
    # product category; excluded from cross-category shares in the dashboard.
    Category("kbeauty_store",   30710, "https://www.nykaa.com/korean-beauty/c/30710", "store"),
]
STORE_KEYS = {"kbeauty_store"}

# Deeper signals (2026-09-16)
# Owner's brand set. Innisfree is the anchor; everything is measured against it.
# Tiers set how deep each brand is tracked (review history is the expensive part):
#   ANCHOR          — the brand being defended, deepest coverage
#   KBEAUTY_CORE    — Korean brands that compete head-on, full catalogue + deep review history
#   KBEAUTY_WATCH   — smaller / newer Korean brands, top products only (they graduate into CORE if they grow)
# Indian and global rivals are not listed by hand: they are whichever brands hold the most
# shelf slots in the anchor's own categories on the day (see signals.key_products).
ANCHOR_BRAND = "Innisfree"
KBEAUTY_CORE = [ANCHOR_BRAND, "Laneige", "Etude", "Beauty of Joseon", "SKIN1004", "TIRTIR", "Anua",
                "The Face Shop", "Sulwhasoo", "Mamonde", "COSRX", "Klairs", "Dr.Althea", "Celimax",
                "d'Alba Piedmont", "Numbuzin", "Round Lab", "Torriden", "Biodance", "Medicube",
                "Skinfood", "TONYMOLY"]
KBEAUTY_WATCH = ["Aestura", "Arencia", "Mixsoon", "La'dor", "Rom&nd", "Illiyoon", "belif", "RYO",
                 "mise en scene", "Parnell", "Mirabelle Korea", "Biodance", "Moira"]
FOCUS_BRANDS = KBEAUTY_CORE          # dashboard defaults, autosuggest seeds, full catalogue collection
TRACKED_BRANDS = list(dict.fromkeys(KBEAUTY_CORE + KBEAUTY_WATCH))
SEARCH_SAMPLES = int(os.getenv("SEARCH_SAMPLES", "1"))          # extra fresh-session samples showed identical ads (22 Sep test): ads vary by time and location, not per visitor
SUGGESTED_KEYWORDS_MAX = int(os.getenv("SUGGESTED_KEYWORDS_MAX", "10"))
REVIEW_TEXT_DAYS = int(os.getenv("REVIEW_TEXT_DAYS", "400"))     # keep review text this far back
KEY_COMPETITORS = int(os.getenv("KEY_COMPETITORS", "10"))
KEY_PRODUCTS_PER_BRAND = int(os.getenv("KEY_PRODUCTS_PER_BRAND", "15"))        # anchor + core K-beauty brands
KEY_PRODUCTS_PER_WATCH = int(os.getenv("KEY_PRODUCTS_PER_WATCH", "4"))         # smaller Korean brands
KEY_PRODUCTS_PER_COMPETITOR = int(os.getenv("KEY_PRODUCTS_PER_COMPETITOR", "6"))  # Indian/global rivals on the anchor's shelves
REVIEW_HISTORY_MAX_PRODUCTS_PER_RUN = int(os.getenv("REVIEW_HISTORY_MAX_PRODUCTS_PER_RUN", "40"))
# Wall-clock budgets keep the daily job inside its 60-minute workflow timeout. Nykaa answers 429 to
# roughly every other review request under load, so a product count alone cannot bound the run.
REVIEW_HISTORY_MAX_MINUTES = float(os.getenv("REVIEW_HISTORY_MAX_MINUTES", "28"))
REVIEW_TEXT_MAX_MINUTES = float(os.getenv("REVIEW_TEXT_MAX_MINUTES", "8"))
REVIEW_TEXT_MAX_PRODUCTS_PER_RUN = int(os.getenv("REVIEW_TEXT_MAX_PRODUCTS_PER_RUN", "10"))  # text-only catch-up for products crawled before text capture existed
ASSORTMENT_WEEKDAY = int(os.getenv("ASSORTMENT_WEEKDAY", "0"))   # Monday: refresh brand assortment weekly

# Nykaa's own "Korean Beauty" store category. Products listed in it carry
# this id in category_ids — a strong K-beauty signal for brand classification.
KBEAUTY_STORE_CATEGORY_ID = "30710"

TOP_N = int(os.getenv("SCRAPE_TOP_N", "100"))
PAGE_SIZE = 20  # fixed by Nykaa; page_size param is ignored server-side
MIN_DELAY = float(os.getenv("SCRAPE_MIN_DELAY_SEC", "2"))
MAX_DELAY = float(os.getenv("SCRAPE_MAX_DELAY_SEC", "5"))
MAX_RETRIES = int(os.getenv("SCRAPE_MAX_RETRIES", "4"))
NAV_TIMEOUT_MS = 60_000
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Review enrichment (reviews API, one browser fetch per page of 50 reviews).
# Only products with rating_count below this threshold are enriched — those
# are the only plausible "new" products, and it bounds daily request volume.
ENRICH_MAX_RATING_COUNT = int(os.getenv("ENRICH_MAX_RATING_COUNT", "300"))
ENRICH_MAX_PAGES = int(os.getenv("ENRICH_MAX_PAGES", "6"))       # 6 x 50 reviews
ENRICH_DELAY_SEC = float(os.getenv("ENRICH_DELAY_SEC", "1.5"))
# review_count is refreshed at most once per this many days per product;
# first_review_date is fetched once and cached forever.
ENRICH_REFRESH_DAYS = int(os.getenv("ENRICH_REFRESH_DAYS", "7"))
# Hard cap on products enriched per run; the rest wait for the next run.
ENRICH_MAX_PRODUCTS_PER_RUN = int(os.getenv("ENRICH_MAX_PRODUCTS_PER_RUN", "80"))
# Random delay before the run starts (seconds). 0 locally; the scheduled job
# sets it so the daily run does not land at the same minute every day.
START_JITTER_SEC = int(os.getenv("SCRAPE_START_JITTER_SEC", "0"))
NEW_WINDOW_DAYS = int(os.getenv("NEW_WINDOW_DAYS", "90"))

# Product-details enrichment: one fetch per product, ever. Daily cap covers
# new products; the one-time backfill runs locally with --all.
DETAILS_MAX_PER_RUN = int(os.getenv("DETAILS_MAX_PER_RUN", "40"))
DETAILS_DELAY_SEC = float(os.getenv("DETAILS_DELAY_SEC", "2.0"))        # "new" = first review within N days
REVIEWS_URL = ("https://www.nykaa.com/gateway-api/products/{product_id}/reviews"
               "?pageNo={page_no}&size=50&sort=MOST_RECENT&domain=nykaa&source=react")
DATA_DIR = os.getenv("SCRAPE_DATA_DIR", "data")

API_URL = ("https://www.nykaa.com/app-api/index.php/products/list"
           "?category_id={category_id}&page_no={page_no}&sort=popularity")
# ^ Without platform=dweb this returns the *app* ranking (primary, per owner
#   decision 2026-09-13: most Nykaa shoppers are on the app). Adding
#   &platform=dweb would return the desktop-website ranking instead.

# If the API fails for a category, optionally re-scrape that whole category
# from the website pages (web ranking, tagged listing_source="web").
# Off by default: mixed sources across days make rank trends misleading.
WEB_FALLBACK = os.getenv("SCRAPE_WEB_FALLBACK", "0") == "1"

# Realistic, recent desktop Chrome user agents. One is chosen per run so the
# whole session is self-consistent (per-request rotation looks *more* bot-like).
USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
]
