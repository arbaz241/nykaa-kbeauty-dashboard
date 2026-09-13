# Nykaa K-Beauty Market Analysis Dashboard

Tracks the competitive landscape of K-beauty vs Local (India) vs Global brands
on Nykaa's public skincare and makeup listings over time: share-of-shelf,
pricing positioning, and ratings/review trends.

Build plan and phase checkpoints: `nykaa-kbeauty-dashboard-instructions.md`.

## Status

- Phase 0 (setup): done
- Phase 1 (scraper): done — headless-Chromium scraper in `scraper/`, findings in `docs/phase1-feasibility.md`
- Phase 2 (brand classification): next

## Local setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/playwright install chromium
cp .env.example .env   # then fill in values
```

## Running the scraper

```bash
.venv/bin/python -m scraper.run                       # all categories, top 100
.venv/bin/python -m scraper.run --categories serum,lipstick --top-n 40
```

Output lands in `data/<date>/products.csv|json` and `data/<date>/run.json`.
Categories and top-N live in `scraper/config.py`; delays in `.env`.

## Known scraping constraints (read this before trusting a gap in the data)

- Nykaa sits behind Akamai Bot Manager. Plain HTTP clients get 403; the
  scraper must drive full Chromium. Akamai rules can change any day, so a
  run can start failing without any code change. Failed pages are logged
  loudly and recorded in `run.json`; they are never filled with fake data.
- All testing so far was from a residential IP. Whether GitHub Actions
  (data-centre IPs) is allowed through is unknown until Phase 4.
- Listings include paid "featured pinning" slots (`is_pinned`). Rank and
  share-of-shelf should be reported both with and without them.
- Nykaa exposes rating count on listings, not a separate text-review count.
