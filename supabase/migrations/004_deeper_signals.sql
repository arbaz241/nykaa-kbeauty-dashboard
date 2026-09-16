-- Deeper signals (2026-09-16): search-intent shelf, brand assortment, review history, offers. Idempotent.

-- Offers on listings (promo intensity), free from the listing API
alter table scrape_snapshots add column if not exists has_offer boolean not null default false;
alter table scrape_snapshots add column if not exists offer_message text;

-- ------------------------------------------------ search-intent shelf
create table if not exists search_snapshots (
  id            bigserial primary key,
  scrape_date   date not null,
  query         text not null,
  rank          integer not null,
  product_id    text not null,
  brand         text not null,
  name          text not null,
  price         numeric(10,2),
  rating        numeric(3,2),
  rating_count  integer,
  is_ad         boolean not null default false,
  total_found   integer,
  scraped_at    timestamptz not null,
  unique (scrape_date, query, product_id)
);
create index if not exists search_snapshots_q_idx on search_snapshots (query, scrape_date);
alter table search_snapshots enable row level security;
drop policy if exists "read search" on search_snapshots;
create policy "read search" on search_snapshots for select to authenticated using (true);
grant select on search_snapshots to authenticated;

-- ------------------------------------------------ brand assortment breadth
create table if not exists brand_assortment (
  brand         text not null,
  scrape_date   date not null,
  brand_id      text,
  total_products integer,
  primary key (brand, scrape_date)
);
alter table brand_assortment enable row level security;
drop policy if exists "read assortment" on brand_assortment;
create policy "read assortment" on brand_assortment for select to authenticated using (true);
grant select on brand_assortment to authenticated;

-- ------------------------------------------------ review history (demand curve)
create table if not exists review_history (
  product_id    text not null references products (product_id) on delete cascade,
  month         date not null,          -- first day of month
  reviews       integer not null,
  avg_rating    numeric(3,2),
  primary key (product_id, month)
);
create table if not exists review_cursor (
  product_id        text primary key references products (product_id) on delete cascade,
  newest_review_id  bigint,
  reviews_fetched   integer,
  complete          boolean not null default false,   -- reached the oldest review
  fetched_at        timestamptz not null default now()
);
alter table review_history enable row level security;
alter table review_cursor enable row level security;
drop policy if exists "read rh" on review_history;
drop policy if exists "read rc" on review_cursor;
create policy "read rh" on review_history for select to authenticated using (true);
create policy "read rc" on review_cursor for select to authenticated using (true);
grant select on review_history, review_cursor to authenticated;

-- ingest_run: carry has_offer / offer_message
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
    sku = excluded.sku, name = excluded.name, brand = excluded.brand, brand_id = excluded.brand_id,
    url = excluded.url, pack_size = excluded.pack_size,
    last_seen_date = greatest(products.last_seen_date, excluded.last_seen_date),
    first_seen_date = least(products.first_seen_date, excluded.first_seen_date),
    first_review_date = coalesce(excluded.first_review_date, products.first_review_date),
    first_review_complete = coalesce(excluded.first_review_complete, products.first_review_complete),
    review_count = coalesce(excluded.review_count, products.review_count),
    review_count_at = coalesce(excluded.review_count_at, products.review_count_at),
    updated_at = now();

  insert into scrape_snapshots (run_id, scrape_date, product_id, subcategory, category_id, rank, listing_source,
                                mrp, price, discount_pct, rating, rating_count, in_stock,
                                is_pinned, is_ad, is_new_tag, is_bestseller, in_kbeauty_store,
                                popularity_score, nykaa_l2, nykaa_l3, tags, scraped_at, has_offer, offer_message)
  select v_run_id, v_date, r->>'product_id', r->>'subcategory', (r->>'category_id')::int, (r->>'rank')::int,
         r->>'listing_source',
         (r->>'mrp')::numeric, (r->>'price')::numeric, (r->>'discount_pct')::numeric,
         (r->>'rating')::numeric, (r->>'rating_count')::int, (r->>'in_stock')::boolean,
         coalesce((r->>'is_pinned')::boolean, false), coalesce((r->>'is_ad')::boolean, false),
         coalesce((r->>'is_new_tag')::boolean, false), coalesce((r->>'is_bestseller')::boolean, false),
         coalesce((r->>'in_kbeauty_store')::boolean, false),
         (r->>'popularity_score')::numeric, r->>'nykaa_l2', r->>'nykaa_l3', r->>'tags',
         (r->>'scraped_at')::timestamptz, coalesce((r->>'has_offer')::boolean, false), r->>'offer_message'
  from jsonb_array_elements(p_rows) r
  on conflict (scrape_date, subcategory, product_id) do update set
    run_id = excluded.run_id, rank = excluded.rank, listing_source = excluded.listing_source,
    mrp = excluded.mrp, price = excluded.price, discount_pct = excluded.discount_pct,
    rating = excluded.rating, rating_count = excluded.rating_count, in_stock = excluded.in_stock,
    is_pinned = excluded.is_pinned, is_ad = excluded.is_ad, is_new_tag = excluded.is_new_tag,
    is_bestseller = excluded.is_bestseller, in_kbeauty_store = excluded.in_kbeauty_store,
    popularity_score = excluded.popularity_score, nykaa_l2 = excluded.nykaa_l2, nykaa_l3 = excluded.nykaa_l3,
    tags = excluded.tags, scraped_at = excluded.scraped_at, has_offer = excluded.has_offer, offer_message = excluded.offer_message;

  delete from scrape_snapshots s
  where s.scrape_date = v_date
    and s.subcategory in (select distinct r->>'subcategory' from jsonb_array_elements(p_rows) r)
    and not exists (select 1 from jsonb_array_elements(p_rows) r
                    where r->>'subcategory' = s.subcategory and r->>'product_id' = s.product_id);
  return v_run_id;
end;
$$;

-- views select s.*: new table columns change the column list, so drop and recreate
drop view if exists v_snapshots_detailed;
drop view if exists v_snapshots;
create view v_snapshots as
select s.*, p.name, p.brand, p.url, p.first_seen_date, p.first_review_date, p.review_count,
       coalesce(b.origin, 'unknown') as origin, b.confirmed as origin_confirmed,
       coalesce(b.k_marketing, false) as k_marketing
from scrape_snapshots s
join products p on p.product_id = s.product_id
left join brand_classification b on b.brand = p.brand;
create view v_snapshots_detailed as
select v.*, d.country_of_origin, d.country_name, d.formulation, d.skin_types, d.concerns, d.key_ingredients,
       d.preferences, d.usp_summary, d.usp_points, d.review_key_phrases, d.review_splitup, d.variants,
       d.image_url, d.review_count as detail_review_count
from v_snapshots v
left join product_details d on d.product_id = v.product_id;
grant select on v_snapshots, v_snapshots_detailed to authenticated;
