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
- Phase 3 (Supabase): **live since 2026-09-13.** Schema applied to the
  project, 2026-09-13 snapshot backfilled. Schema in
  `supabase/migrations/001_initial_schema.sql`, writer in `scraper/db.py`,
  backfill/ingest CLI in `scraper/ingest.py`.
- Phase 4 (GitHub Actions): workflow in `.github/workflows/scrape.yml`, daily
  at 07:00 IST with up to 30 min jitter. **Dry-run on a GitHub runner succeeded
  on 2026-09-13** (Akamai let the data-centre IP through). **Secrets added and
  the first full run (scrape + enrich + ingest) succeeded from GitHub on
  2026-09-13.** The daily schedule is active.
- Phase 5 (Streamlit dashboard): simplified 2026-09-14 after owner feedback
  to three pages (`dashboard/views/`): **Overview** tells the story in order
  (numbers → visibility → leaders → price → launches → movement → watch-outs),
  each section led by a data-derived takeaway sentence and one plain bar
  chart or ranked list; **Compare brands** (profile cards, presence by
  category, products side by side with USP / targets / ingredients / shopper
  sentiment); **About the data**; Admin for admins. Filters are one row:
  category, period, listing depth, paid slots. No sidebar. Trend elements
  appear once more than one scrape day exists.
- Product details (2026-09-14): `scraper/product_details.py` fetches Nykaa's
  product-details endpoint once per product (country of origin, highlight
  attributes, AI summary as USP proxy, ingredients, review key phrases,
  variants, image) into `product_details` (migration 003). Daily cap
  `DETAILS_MAX_PER_RUN` (40); one-time backfill `python -m scraper.details --all`.
  Country of origin now feeds brand classification (KR → K-beauty, IN → Local)
  and flags seed entries that disagree with "VERIFY" in the admin screen.
- Phase 6 (auth + hosting): Supabase email/password sign-in + sign-up in
  `dashboard/auth.py`, verified against the live project on 2026-09-14
  (sign-in, wrong-password rejection, non-admin read-only review screen).
  Remaining owner step: deploy on Streamlit Community Cloud and sign in.

### Going live with Phase 3 (owner steps)

1. Create a free project at supabase.com (region: Mumbai / ap-south-1 is
   closest). From **Project Settings > API** copy: Project URL, `anon` key,
   `service_role` key.
2. Locally: `cp .env.example .env` and fill `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`. Never commit `.env`.
3. In the Supabase dashboard open **SQL Editor**, paste the whole of
   `supabase/migrations/001_initial_schema.sql`, Run. It is idempotent.
4. Backfill the first real snapshot:
   `.venv/bin/python -m scraper.ingest --date 2026-09-13`
5. From then on `scraper.run` ingests automatically whenever `SUPABASE_URL`
   is set (`--no-db` to skip).
6. GitHub Actions: in the repo go to **Settings > Secrets and variables >
   Actions > New repository secret** and add `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`. Then **Actions > Daily Nykaa scrape > Run
   workflow** (mode: full) for the first scheduled-style run, and check the
   `scrape_runs` table afterwards. (Streamlit Cloud secrets come in Phase 6.)

### Schema summary

| table | grain | notes |
|---|---|---|
| `scrape_runs` | one row per run | success/blocked flags, per-category status, enrichment stats, git sha |
| `products` | one row per Nykaa product | `first_seen_date` (never moves later), `last_seen_date`, `first_review_date`, `review_count` |
| `scrape_snapshots` | one row per product × subcategory × day | rank, listing_source, prices, rating, ad/pinned flags. Unique on (date, subcategory, product) so re-runs overwrite that day only |
| `brand_classification` | one row per brand | origin, source (seed/auto/manual), confirmed, k_marketing. Scraper upserts never overwrite owner edits |
| `v_snapshots` | view | snapshots joined to product + brand origin, what the dashboard reads |

Writes go through two Postgres functions (`ingest_run`,
`upsert_brand_classifications`) callable only with the service role key.
Logged-in dashboard users can read everything and update
`brand_classification` (the review screen); anonymous users see nothing.

## Local setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/playwright install chromium
cp .env.example .env   # then fill in values
```

## Dashboard

```bash
DATABASE_URL=postgresql://... .venv/bin/streamlit run dashboard/app.py
```

`DATABASE_URL` is the Supabase Postgres connection string (Project Settings >
Database > Connection string > Session pooler). On Streamlit Cloud it goes in
the app's Secrets as `DATABASE_URL = "..."`. Tracked brands and the palette are
in `dashboard/config.py`. Data is cached for 10 minutes.

### Deploying to Streamlit Community Cloud (owner steps, Phase 6)

1. Access model (owner decision 2026-09-14): **open sign-up**. Anyone can
   create an account from the login page and view everything; only emails in
   the `app_admins` table (migration `002_admins.sql`) can edit brand
   classifications. Add admins with
   `insert into app_admins (email) values ('x@y.com');` in the SQL editor.
   In Supabase **Authentication > Sign In / Providers > Email**: keep Email
   enabled and "Allow new users to sign up" on. **Confirm email**: if on, new
   users must click a verification link; Supabase's built-in mailer is
   rate-limited (a few emails per hour) and meant for testing, so for real
   traffic either turn Confirm email off (accounts work instantly, unverified
   addresses) or configure a custom SMTP provider under Project Settings >
   Authentication. Create your own account from the app's "Create account"
   tab or under Authentication > Users > Add user (auto-confirm).
2. At share.streamlit.io: New app → this GitHub repo → branch `main` →
   main file `dashboard/app.py` → Python 3.12.
3. App settings → **Secrets**, paste (TOML):
   ```toml
   DATABASE_URL = "postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
   SUPABASE_URL = "https://<ref>.supabase.co"
   SUPABASE_ANON_KEY = "<anon key>"
   ```
   Never put the service role key in the dashboard.
4. Deploy, open the URL, sign in as the test user, walk every tab.

### Known ceilings of this setup (read before sharing widely)

| Layer | Free-tier limit | What it means here |
|---|---|---|
| Streamlit Community Cloud | ~1 GB RAM per app, shared CPU; apps **sleep after inactivity** (currently ~12 h without visitors) and take ~30 s to wake; public URL by default (the login gate is the only barrier, and the app must stay a *private* Streamlit app to hide the URL, which requires the GitHub repo to be private, as it is) | Fine for a handful of users. A cold start on first visit each morning is normal. At tens of concurrent users it will feel slow: move to Streamlit for Teams, a small VPS, or a container host. |
| Supabase (free) | 500 MB database, 5 GB egress/month, 50k monthly active users, **project pauses after 7 days with no activity** (the daily scraper counts as activity), 2 projects per org | Snapshots grow ~0.25 MB/day (~90 MB/year), so the 500 MB fits several years. Pausing only happens if the scraper stops for a week: unpause manually in the dashboard. Pro is $25/month when needed. |
| GitHub Actions (free, private repo) | 2,000 minutes/month | A run is ~10 min → ~300 min/month. Comfortable. |
| Nykaa / Akamai | no SLA; can block any day | See constraints above. Runs are logged, gaps are visible in Data health. |
| Data model | top-100 of 7 categories once a day | Not the whole market. Products outside these lists are invisible; ranks are the app's ordering at scrape time. |

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
- Residential IP and a GitHub Actions runner (Azure data-centre IP) both got
  through Akamai on 2026-09-13. That is one data point, not a guarantee: if
  scheduled runs start failing with 403, the fallback is running the scraper
  from a home machine or via a residential proxy.
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
