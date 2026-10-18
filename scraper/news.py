"""Daily outside news for the main brands and the day's movers (plan v4, owner 18 Oct 2026: "should refresh
automatically daily and show that it is external info").

Source: Google News' free search feed (RSS, no key, no AI). One search per brand, India edition, last 30 days.
A headline is kept only when it names the brand; brand names that are also everyday words (Plum, Simple, MARS...)
also need a beauty word in the headline. The dashboard shows these as "External": context next to a move, never
a proven cause.

    python -m scraper.news                 # local test: today's brands, prints what it would keep
"""
from __future__ import annotations

import logging
import re
import time
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import httpx

from . import config
from .db import _upsert, connect, fetch_all

log = logging.getLogger("news")

FEED = "https://news.google.com/rss/search?q={q}&hl=en-IN&gl=IN&ceid=IN:en"
CONTEXT = "(skincare OR makeup OR beauty OR Nykaa OR cosmetics OR launch OR brand)"
BEAUTY = re.compile(r"\b(skin|skincare|makeup|cosmetics?|nykaa|serums?|sunscreens?|lip|creams?|toners?|masks?|d2c|k-beauty|korean beauty)\b", re.I)
# searches for names that are everyday words: the brand's own fuller name or its company
QUERY = {"Minimalist": '"Minimalist" (skincare OR serum OR sunscreen OR HUL OR "Hindustan Unilever")', "Plum": '"Plum Goodness" OR "Plum skincare"',
         "Ponds": '"Pond\'s" (skin OR cream OR HUL)', "Simple": '"Simple skincare" OR "Simple face wash"', "MARS": '"MARS Cosmetics"',
         "The Ordinary": '"The Ordinary" (skincare OR serum OR Deciem)', "Hyphen": '"Hyphen" (skincare OR "Kriti Sanon")',
         "Deconstruct": '"Deconstruct" (skincare OR sunscreen OR serum)', "Sugar": '"SUGAR Cosmetics"', "Lakme": '"Lakme" -fashion'}
PER_BRAND = 8
# brand names that are also ordinary words or other companies: the headline must also be about beauty
AMBIGUOUS = {"plum", "simple", "mars", "minimalist", "ponds", "pond's", "deconstruct", "hyphen", "foxtale", "o3+",
             "pilgrim", "nivea", "vaseline", "garnier", "lakme", "sugar", "insight cosmetics", "earth rhythm", "dot & key"}
MAIN_SHELF_BRANDS = 10      # Indian and global brands holding the most top-100 places, besides the Korean set
MAX_MOVERS = 12
DAYS_BACK = 30


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def brands_for(client, day: str) -> tuple[list[str], list[str]]:
    """(main brands, movers): the Korean brands we follow, the shelf's biggest other brands, and brands with a
    product that climbed 20+ places (or into the top 30) against three collected days earlier."""
    shelf = fetch_all(lambda: client.table("web_latest_shelf").select("product_id,brand,subcategory,rank,origin"))
    shelf = [r for r in shelf if r.get("subcategory") not in config.STORE_KEYS]
    counts: dict[str, int] = {}
    for r in shelf:
        if r.get("origin") != "kbeauty":
            counts[r["brand"]] = counts.get(r["brand"], 0) + 1
    main = list(dict.fromkeys(config.KBEAUTY_CORE + sorted(counts, key=lambda b: -counts[b])[:MAIN_SHELF_BRANDS]))
    # one row per collected day: the #1 sunscreen (sunscreen is tracked from the first day)
    days = sorted({r["scrape_date"] for r in client.table("scrape_snapshots").select("scrape_date")
                   .eq("subcategory", "sunscreen").eq("rank", 1).lt("scrape_date", day)
                   .gte("scrape_date", (date.fromisoformat(day) - timedelta(days=10)).isoformat()).execute().data})
    movers: dict[str, int] = {}
    if len(days) >= 3:
        then = days[-3]
        before = {(r["subcategory"], r["product_id"]): r["rank"] for r in fetch_all(
            lambda: client.table("scrape_snapshots").select("subcategory,product_id,rank").eq("scrape_date", then))}
        for r in shelf:
            was = before.get((r["subcategory"], r["product_id"]))
            gain = (was or 101) - r["rank"]
            if (was and gain >= 20) or (not was and r["rank"] <= 30):
                movers[r["brand"]] = max(movers.get(r["brand"], 0), gain)
    moving = [b for b in sorted(movers, key=lambda b: -movers[b]) if b not in main][:MAX_MOVERS]
    return main, moving


def search(brand: str) -> list[dict]:
    q = urllib.parse.quote(f'{QUERY.get(brand) or chr(34) + brand + chr(34) + " " + CONTEXT} when:{DAYS_BACK}d')
    resp = httpx.get(FEED.format(q=q), headers={"User-Agent": "Mozilla/5.0 (market-dashboard news check)"}, timeout=20, follow_redirects=True)
    resp.raise_for_status()
    root = ET.fromstring(resp.content)
    out = []
    nb = _norm(brand)
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        src = (it.findtext("source") or "").strip()
        if src and title.endswith(" - " + src):
            title = title[: -len(src) - 3]
        if nb not in _norm(title) and not (brand == "Ponds" and "pond s" in _norm(title)):
            continue
        if brand.lower() in AMBIGUOUS and (not BEAUTY.search(title) or brand.split()[0].strip("'") not in title):
            continue
        try:
            pub = parsedate_to_datetime(it.findtext("pubDate") or "")
        except (TypeError, ValueError):
            pub = None
        out.append({"url": (it.findtext("link") or "").strip(), "brand": brand, "title": title[:400], "source": src or None,
                    "published_at": pub.astimezone(timezone.utc).isoformat() if pub else None})
    seen: set[str] = set(); keep = []
    for x in sorted(out, key=lambda x: x["published_at"] or "", reverse=True):
        t = _norm(x["title"])[:80]
        if x["url"] and t not in seen:
            seen.add(t); keep.append(x)
    return keep[:PER_BRAND]


def run(client, day: str, dry: bool = False) -> dict:
    main, movers = brands_for(client, day)
    stats = {"brands": len(main) + len(movers), "movers": len(movers), "kept": 0, "failed": 0}
    rows: dict[str, dict] = {}
    for b in main + movers:
        try:
            for x in search(b):
                x.update(first_seen=day, query=("mover" if b in movers else "main"))
                rows.setdefault(x["url"], x)
        except Exception as e:  # noqa: BLE001
            stats["failed"] += 1; log.warning("news %s failed: %s", b, e)
        time.sleep(1.0)
    stats["kept"] = len(rows)
    if dry:
        for x in sorted(rows.values(), key=lambda x: (x["brand"], x["published_at"] or "")):
            print(f"{x['brand']:18} {str(x['published_at'])[:10]}  {x['title'][:90]}  [{x['source']}]")
    elif rows:
        # first_seen stays as the day we first saw a headline (ignore re-sightings)
        known = {r["url"] for r in fetch_all(lambda: client.table("external_news").select("url"))}
        new = [x for x in rows.values() if x["url"] not in known]
        if new:
            _upsert(client, "external_news", new, "url")
        stats["new"] = len(new)
    return stats


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s", datefmt="%H:%M:%S")
    import sys
    client = connect()
    day = datetime.now(timezone.utc).date().isoformat()
    log.info("news: %s", run(client, day, dry="--save" not in sys.argv))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
