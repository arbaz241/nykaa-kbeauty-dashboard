# Nykaa K-Beauty Market Analysis Dashboard

Tracks the competitive landscape of K-beauty vs Local (India) vs Global brands
on Nykaa's public skincare and makeup listings over time: share-of-shelf,
pricing positioning, and ratings/review trends.

Build plan and phase checkpoints: `nykaa-kbeauty-dashboard-instructions.md`.

## Status

- Phase 0 (setup): done
- Phase 1 (scraper): done — headless-Chromium scraper in `scraper/`, findings in `docs/phase1-feasibility.md`
- Phase 2 (brand classification): done — seed list in `scraper/seed/brand_classification.csv`,
  classifier in `scraper/brands.py`, Korean-positioning flag, reviews enrichment and
  new-brand/product detection (`scraper/reviews.py`, `scraper/newness.py`). Seed list
  still open for owner review (7 brands are `unknown`).
- **Phase 3 (Supabase schema + writes): next — paused 2026-09-13.**

### Resuming at Phase 3

1. Owner creates a free Supabase project and provides: Project URL, anon key,
   service role key (Project Settings > API). Put them in `.env` (never commit).
2. Design schema per the instructions file: `products`, `brand_classification`
   (seeded once from the CSV, then the source of truth), `scrape_snapshots`
   (one row per product per scrape date, incl. rank, listing_source, is_ad,
   is_pinned, review_count, first_review_date), `scrape_runs`. Confirm with owner.
3. Add a Supabase writer to `scraper/run.py` alongside the file outputs.
4. Decisions already made: rank = Nykaa **app** ordering; web fallback opt-in;
   enrichment volume capped (see constraints below); Phase 4 must test
   whether GitHub Actions IPs get through Akamai before relying on them.
5. Local data from 2026-09-13 (`data/`, git-ignored) is real and can be
   back-filled as the first snapshot.

## Local setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/playwright install chromium
cp .env.example .env   # then fill in values
```

## Brand classification

```bash
.venv/bin/python -m scraper.classify            # classifies brands in today's scrape
```

Origins are `kbeauty`, `local` (India), `global`, or `unknown`. The seed list
in `scraper/seed/brand_classification.csv` is the curated default; brands not
in it are auto-classified using Nykaa's own "Korean Beauty" store membership
and name patterns, and are flagged `source=auto, confirmed=false`. Nothing is
`confirmed` until the owner confirms it (dashboard review screen, Phase 5).
From Phase 3 on, the Supabase `brand_classification` table is the source of
truth; the CSV only seeds it once.

**Korean positioning flag.** A non-Korean brand is flagged `k_marketing` when
its product names sell the product as Korean ("Korean", "K-beauty", "glass
skin", "Seoul", "Jeju", "hanbang"), when its products are placed in Nykaa's
Korean Beauty store, or when `k_positioned` is set in the seed CSV. Ingredient
words alone (cica, snail, rice water) do not trigger it. The evidence string
says which product triggered it.

**New brands / new products.** Listings have no launch date, so the scraper
enriches low-rating-count products from Nykaa's reviews API with the text
review count and the date of the oldest review (`first_review_date`), cached
permanently once found. A product is new if its first review is within
`NEW_WINDOW_DAYS` (90). A brand whose listed products are all new is a
**new entrant** to the tracked categories (`is_new_entrant`); it is only a
**new brand** (`is_new_brand`) if it is also absent from the seed list, since
an established brand launching one product in these categories (e.g. SK-II)
is not a new brand. Nykaa's own `NEW` tag is recorded (`is_new_tag`) but not
trusted. Once daily snapshots
exist (Phase 3+), first-seen-in-top-N becomes a third signal.

## Running the scraper

```bash
.venv/bin/python -m scraper.run                       # all categories, top 100, + reviews enrichment
.venv/bin/python -m scraper.run --no-enrich           # listings only (~3.5 min instead of ~15)
.venv/bin/python -m scraper.run --categories serum,lipstick --top-n 40
```

Output lands in `data/<date>/products.csv|json` and `data/<date>/run.json`;
`scraper.classify` then writes `brand_classification.csv` and
`products_enriched.csv` (origin + newness flags) next to them.
Categories and top-N live in `scraper/config.py`; delays in `.env`.

## Known scraping constraints (read this before trusting a gap in the data)

- Nykaa sits behind Akamai Bot Manager. Plain HTTP clients get 403; the
  scraper must drive full Chromium. Akamai rules can change any day, so a
  run can start failing without any code change. Failed pages are logged
  loudly and recorded in `run.json`; they are never filled with fake data.
- All testing so far was from a residential IP. Whether GitHub Actions
  (data-centre IPs) is allowed through is unknown until Phase 4.
- **Block handling:** a 403 aborts the whole run immediately with no retries
  (retrying against an active block prolongs it). Remaining categories are
  recorded as skipped in `run.json`; the next scheduled run tries again.
- **Volume budget:** listings are 42 requests/day. Reviews enrichment is
  capped at `ENRICH_MAX_PRODUCTS_PER_RUN` products (default 80) per run,
  only for products with fewer than `ENRICH_MAX_RATING_COUNT` (300) ratings,
  refreshed at most every `ENRICH_REFRESH_DAYS` (7) days; first-review
  dates are cached forever. Steady state is roughly 50–120 requests/day.
- **Jitter:** scheduled runs set `SCRAPE_START_JITTER_SEC` so the daily run
  does not start at the same minute every day.
- The scraper never logs in. A block can only ever affect the IP it runs
  from, never a Nykaa account.
- Ranks are the **Nykaa app** ordering (where most shoppers are). The
  website orders listings differently; each row's `listing_source` says
  which one it came from. Do not compare ranks across sources.
- Listings include paid "featured pinning" slots (`is_pinned`). Rank and
  share-of-shelf should be reported both with and without them.
- Nykaa exposes rating count on listings, not a separate text-review count.
