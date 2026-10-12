"""Rebuild the dashboard's ready-made copies of the web_* views (migration 020). Run by scrape.yml after the
scraper, whether or not it succeeded, so the site always shows whatever reached the database.

    python -m scraper.refresh
"""
from __future__ import annotations

import logging
import sys

from dotenv import load_dotenv

from .db import refresh_snapshots


def main() -> int:
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s", datefmt="%H:%M:%S", stream=sys.stdout)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    return 0 if refresh_snapshots() else 1


if __name__ == "__main__":
    sys.exit(main())
