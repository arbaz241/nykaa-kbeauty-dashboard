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
]

TOP_N = int(os.getenv("SCRAPE_TOP_N", "100"))
PAGE_SIZE = 20  # fixed by Nykaa; page_size param is ignored server-side
MIN_DELAY = float(os.getenv("SCRAPE_MIN_DELAY_SEC", "2"))
MAX_DELAY = float(os.getenv("SCRAPE_MAX_DELAY_SEC", "5"))
MAX_RETRIES = int(os.getenv("SCRAPE_MAX_RETRIES", "4"))
NAV_TIMEOUT_MS = 60_000
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
DATA_DIR = os.getenv("SCRAPE_DATA_DIR", "data")

API_URL = ("https://www.nykaa.com/app-api/index.php/products/list"
           "?category_id={category_id}&page_no={page_no}&sort=popularity&platform=dweb")

# Realistic, recent desktop Chrome user agents. One is chosen per run so the
# whole session is self-consistent (per-request rotation looks *more* bot-like).
USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
]
