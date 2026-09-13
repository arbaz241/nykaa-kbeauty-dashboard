-- Nykaa K-Beauty Market Dashboard — initial schema
-- Apply in Supabase: SQL Editor > paste > Run  (or `supabase db push` later).
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------- brands
create table if not exists brand_classification (
  brand                 text primary key,                 -- exactly as Nykaa spells it
  brand_key             text generated always as (regexp_replace(lower(brand), '[^a-z0-9]', '', 'g')) stored,
  origin                text not null check (origin in ('kbeauty', 'local', 'global', 'unknown')),
  source                text not null check (source in ('seed', 'auto', 'manual')),
  confirmed             boolean not null default false,   -- owner has confirmed origin
  k_marketing           boolean not null default false,   -- non-Korean brand marketing products as Korean
  k_marketing_evidence  text,
  evidence              text,                             -- why the classifier chose this origin
  note                  text,
  first_seen_date       date,
  updated_at            timestamptz not null default now(),
  updated_by            text                              -- 'scraper' | user email
);
create unique index if not exists brand_classification_key_idx on brand_classification (brand_key);

-- -------------------------------------------------------------- products
create table if not exists products (
  product_id            text primary key,                 -- Nykaa product id
  sku                   text,
  name                  text not null,
  brand                 text not null,
  brand_id              text,
  url                   text,
  pack_size             text,
  first_seen_date       date not null,                    -- first scrape that saw it in any tracked top-N
  last_seen_date        date not null,
  first_review_date     date,                             -- oldest review on Nykaa (launch proxy)
  first_review_complete boolean,                          -- false = hit page cap; date is an upper bound
  review_count          integer,                          -- text reviews (distinct from rating_count)
  review_count_at       timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists products_brand_idx on products (brand);

-- ------------------------------------------------------------ scrape runs
create table if not exists scrape_runs (
  id            bigserial primary key,
  scrape_date   date not null,
  scraped_at    timestamptz not null,
  finished_at   timestamptz,
  success       boolean not null,
  blocked       boolean not null default false,
  top_n         integer,
  total_rows    integer,
  categories    jsonb,        -- per-category status from run.json
  enrichment    jsonb,        -- enrichment stats from run.json
  error_log     text,
  runner        text,         -- 'local' | 'github-actions'
  git_sha       text,
  created_at    timestamptz not null default now()
);
create index if not exists scrape_runs_date_idx on scrape_runs (scrape_date desc);

-- --------------------------------------------------------- snapshots (facts)
create table if not exists scrape_snapshots (
  id                bigserial primary key,
  run_id            bigint references scrape_runs (id) on delete set null,
  scrape_date       date not null,
  product_id        text not null references products (product_id),
  subcategory       text not null,      -- our key, e.g. 'serum'
  category_id       integer not null,   -- Nykaa category id
  rank              integer not null,   -- 1-based position in the listing
  listing_source    text not null check (listing_source in ('app', 'web')),
  mrp               numeric(10,2),
  price             numeric(10,2),
  discount_pct      numeric(5,2),
  rating            numeric(3,2),
  rating_count      integer,
  in_stock          boolean,
  is_pinned         boolean not null default false,   -- Nykaa "featured pinning" slot
  is_ad             boolean not null default false,   -- AD tag (paid placement)
  is_new_tag        boolean not null default false,   -- Nykaa NEW tag (unreliable)
  is_bestseller     boolean not null default false,
  in_kbeauty_store  boolean not null default false,   -- listed in Nykaa's Korean Beauty store
  popularity_score  numeric,
  nykaa_l2          text,
  nykaa_l3          text,
  tags              text,
  scraped_at        timestamptz not null,
  -- one row per product per subcategory per day: re-running the same day overwrites, never duplicates
  unique (scrape_date, subcategory, product_id)
);
create index if not exists snapshots_date_subcat_idx on scrape_snapshots (scrape_date, subcategory);
create index if not exists snapshots_product_idx on scrape_snapshots (product_id, scrape_date);

-- ------------------------------------------------------------- ingest RPC
-- One atomic call per run: insert run, upsert products (preserving first_seen),
-- upsert snapshots. Called by the scraper with the service role key.
create or replace function ingest_run(p_run jsonb, p_rows jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id bigint;
  v_date   date := (p_run->>'scrape_date')::date;
begin
  insert into scrape_runs (scrape_date, scraped_at, finished_at, success, blocked, top_n, total_rows,
                           categories, enrichment, error_log, runner, git_sha)
  values (v_date, (p_run->>'scraped_at')::timestamptz, (p_run->>'finished_at')::timestamptz,
          (p_run->>'success')::boolean, coalesce((p_run->>'blocked')::boolean, false),
          (p_run->>'top_n')::int, (p_run->>'total_rows')::int,
          p_run->'categories', p_run->'enrichment', p_run->>'error_log', p_run->>'runner', p_run->>'git_sha')
  returning id into v_run_id;

  -- products: insert new, update mutable fields on existing (first_seen_date untouched)
  insert into products (product_id, sku, name, brand, brand_id, url, pack_size,
                        first_seen_date, last_seen_date,
                        first_review_date, first_review_complete, review_count, review_count_at)
  select distinct on (r->>'product_id')
         r->>'product_id', r->>'sku', r->>'name', r->>'brand', r->>'brand_id', r->>'url', r->>'pack_size',
         v_date, v_date,
         (r->>'first_review_date')::date, (r->>'first_review_complete')::boolean,
         (r->>'review_count')::int,
         case when r->>'review_count' is not null then (p_run->>'scraped_at')::timestamptz end
  from jsonb_array_elements(p_rows) r
  on conflict (product_id) do update set
    sku                   = excluded.sku,
    name                  = excluded.name,
    brand                 = excluded.brand,
    brand_id              = excluded.brand_id,
    url                   = excluded.url,
    pack_size             = excluded.pack_size,
    last_seen_date        = greatest(products.last_seen_date, excluded.last_seen_date),
    first_seen_date       = least(products.first_seen_date, excluded.first_seen_date),  -- backfills only move it earlier
    first_review_date     = coalesce(excluded.first_review_date, products.first_review_date),
    first_review_complete = coalesce(excluded.first_review_complete, products.first_review_complete),
    review_count          = coalesce(excluded.review_count, products.review_count),
    review_count_at       = coalesce(excluded.review_count_at, products.review_count_at),
    updated_at            = now();

  insert into scrape_snapshots (run_id, scrape_date, product_id, subcategory, category_id, rank, listing_source,
                                mrp, price, discount_pct, rating, rating_count, in_stock,
                                is_pinned, is_ad, is_new_tag, is_bestseller, in_kbeauty_store,
                                popularity_score, nykaa_l2, nykaa_l3, tags, scraped_at)
  select v_run_id, v_date, r->>'product_id', r->>'subcategory', (r->>'category_id')::int, (r->>'rank')::int,
         r->>'listing_source',
         (r->>'mrp')::numeric, (r->>'price')::numeric, (r->>'discount_pct')::numeric,
         (r->>'rating')::numeric, (r->>'rating_count')::int, (r->>'in_stock')::boolean,
         coalesce((r->>'is_pinned')::boolean, false), coalesce((r->>'is_ad')::boolean, false),
         coalesce((r->>'is_new_tag')::boolean, false), coalesce((r->>'is_bestseller')::boolean, false),
         coalesce((r->>'in_kbeauty_store')::boolean, false),
         (r->>'popularity_score')::numeric, r->>'nykaa_l2', r->>'nykaa_l3', r->>'tags',
         (r->>'scraped_at')::timestamptz
  from jsonb_array_elements(p_rows) r
  on conflict (scrape_date, subcategory, product_id) do update set
    run_id = excluded.run_id, rank = excluded.rank, listing_source = excluded.listing_source,
    mrp = excluded.mrp, price = excluded.price, discount_pct = excluded.discount_pct,
    rating = excluded.rating, rating_count = excluded.rating_count, in_stock = excluded.in_stock,
    is_pinned = excluded.is_pinned, is_ad = excluded.is_ad, is_new_tag = excluded.is_new_tag,
    is_bestseller = excluded.is_bestseller, in_kbeauty_store = excluded.in_kbeauty_store,
    popularity_score = excluded.popularity_score, nykaa_l2 = excluded.nykaa_l2, nykaa_l3 = excluded.nykaa_l3,
    tags = excluded.tags, scraped_at = excluded.scraped_at;

  return v_run_id;
end;
$$;

-- Brand classifications from the scraper never overwrite owner edits:
--   * new brand           -> inserted
--   * existing, source='auto' and not confirmed -> evidence/origin refreshed
--   * existing seed/manual or confirmed          -> only k_marketing evidence refreshed if newly true
create or replace function upsert_brand_classifications(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  with src as (
    select r->>'brand' as brand, r->>'origin' as origin, r->>'source' as source,
           coalesce((r->>'k_marketing')::boolean, false) as k_marketing,
           r->>'k_marketing_evidence' as k_marketing_evidence,
           r->>'evidence' as evidence, r->>'note' as note,
           (r->>'first_seen_date')::date as first_seen_date
    from jsonb_array_elements(p_rows) r
  ),
  ins as (
    insert into brand_classification (brand, origin, source, confirmed, k_marketing, k_marketing_evidence,
                                      evidence, note, first_seen_date, updated_by)
    select brand, origin, source, false, k_marketing, k_marketing_evidence, evidence, note, first_seen_date, 'scraper'
    from src
    on conflict (brand) do update set
      origin               = case when brand_classification.source = 'auto' and not brand_classification.confirmed
                                  then excluded.origin else brand_classification.origin end,
      evidence             = case when brand_classification.source = 'auto' and not brand_classification.confirmed
                                  then excluded.evidence else brand_classification.evidence end,
      k_marketing          = brand_classification.k_marketing or excluded.k_marketing,
      k_marketing_evidence = coalesce(excluded.k_marketing_evidence, brand_classification.k_marketing_evidence),
      first_seen_date      = least(brand_classification.first_seen_date, excluded.first_seen_date),
      updated_at           = now()
    returning 1
  )
  select count(*) into v_n from ins;
  return v_n;
end;
$$;

-- ----------------------------------------------------------- convenience view
create or replace view v_snapshots as
select s.*, p.name, p.brand, p.url, p.first_seen_date, p.first_review_date, p.review_count,
       coalesce(b.origin, 'unknown') as origin, b.confirmed as origin_confirmed,
       coalesce(b.k_marketing, false) as k_marketing
from scrape_snapshots s
join products p on p.product_id = s.product_id
left join brand_classification b on b.brand = p.brand;

-- ------------------------------------------------------------------ RLS
-- Service role (scraper) bypasses RLS. Logged-in dashboard users can read
-- everything and may edit brand classifications (Phase 5 review screen).
alter table brand_classification enable row level security;
alter table products             enable row level security;
alter table scrape_runs          enable row level security;
alter table scrape_snapshots     enable row level security;

drop policy if exists "read brands"    on brand_classification;
drop policy if exists "edit brands"    on brand_classification;
drop policy if exists "read products"  on products;
drop policy if exists "read runs"      on scrape_runs;
drop policy if exists "read snapshots" on scrape_snapshots;

create policy "read brands"    on brand_classification for select to authenticated using (true);
create policy "edit brands"    on brand_classification for update to authenticated using (true) with check (true);
create policy "read products"  on products             for select to authenticated using (true);
create policy "read runs"      on scrape_runs          for select to authenticated using (true);
create policy "read snapshots" on scrape_snapshots     for select to authenticated using (true);

-- Supabase grants these to authenticated by default; stated explicitly so the
-- intent is visible and so the schema behaves the same on plain Postgres.
grant usage on schema public to authenticated;
grant select on products, scrape_runs, scrape_snapshots, brand_classification, v_snapshots to authenticated;
grant update (origin, source, confirmed, k_marketing, k_marketing_evidence, note, updated_at, updated_by)
  on brand_classification to authenticated;
revoke all on products, scrape_runs, scrape_snapshots, brand_classification, v_snapshots from anon;

revoke execute on function ingest_run(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function upsert_brand_classifications(jsonb) from public, anon, authenticated;
