-- 025 (Round 4, 17 Oct 2026): the market story. Additive only: new tables and views, no change to existing ones.
--
-- 1. The nightly "Refresh dashboard copies" step ran into the 8 s request limit on 14 Oct (it takes ~12 s).
--    Requests made with the service key (the scraper) now get up to 5 minutes; signed-in users keep 8 s.
-- 2. New nightly data (owner OK 17 Oct): every brand in each category with its product count (Nykaa's brand
--    filter, free with the listing we already fetch), the homepage banners (which brands and sales Nykaa is
--    pushing), and the offers each brand runs.
-- 3. The owner's event log gains a source (owner / homepage / estimate) and a status (confirmed / estimated).
-- 4. Views for the dashboard, each with a nightly copy (020-023 pattern) so the tabs stay fast:
--    web_shelf_daily (every top-100 place by day, for the period picker), web_shelf_products (names for them),
--    web_category_stats, web_category_brands, web_homepage_features, web_brand_offers.

alter role service_role set statement_timeout = '300s';
notify pgrst, 'reload config';

-- ------------------------------------------------------------------ new data
create table if not exists category_brands (
  scrape_date date not null,
  subcategory text not null,
  brand_id    text not null,
  brand       text not null,
  products    integer not null default 0,
  primary key (scrape_date, subcategory, brand_id)
);
create table if not exists homepage_features (
  scrape_date date not null,
  section     text not null,     -- the homepage strip (carousel, coupon strip, ...)
  position    integer not null,
  kind        text not null,     -- brand | brand_range | sale | campaign
  target      text not null,     -- Nykaa brand id, sale slug or page id
  label       text,
  brand       text,
  url         text,
  is_ad       boolean not null default false,   -- served by Nykaa's ad system (a brand paid for it)
  primary key (scrape_date, section, kind, target)
);
create table if not exists brand_offers (
  scrape_date date not null,
  brand       text not null,
  offer_id    text not null,     -- 'none' = brand checked that day, no offer running
  title       text,
  description text,
  product_id  text,
  primary key (scrape_date, brand, offer_id)
);
do $$ declare t text; begin
  foreach t in array array['category_brands', 'homepage_features', 'brand_offers'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "read %s" on %I', t, t);
    execute format('create policy "read %s" on %I for select to authenticated using (true)', t, t);
    execute format('grant select on %I to authenticated', t);
  end loop;
end $$;

-- ------------------------------------------------------------------ event log: where an event came from
alter table market_events add column if not exists source text not null default 'owner';   -- owner | homepage | estimate
alter table market_events add column if not exists status text not null default 'confirmed'; -- confirmed | estimated

-- Nykaa's big sales this year, from deal-site calendars (not confirmed by Nykaa): marked estimated until the owner confirms.
insert into market_events (happened_on, ends_on, label, kind, note, created_by, source, status)
select * from (values
  (date '2026-02-07', date '2026-02-14', 'Pink Love Sale (estimated dates)', 'sale', 'Valentine''s sale. Dates from deal-site calendars, not confirmed by Nykaa.', 'round4', 'estimate', 'estimated'),
  (date '2026-05-01', date '2026-05-31', 'Probable May sale (unconfirmed)', 'sale', 'Review counts peak in May across the market; the sale itself is not confirmed.', 'round4', 'estimate', 'estimated'),
  (date '2026-07-10', date '2026-07-31', 'Hot Pink Sale (estimated dates)', 'sale', 'Mid-year sale. Deal sites give 10-19 July or 17-31 July; review counts peak 13-27 July.', 'round4', 'estimate', 'estimated')
) v(happened_on, ends_on, label, kind, note, created_by, source, status)
where not exists (select 1 from market_events e where e.created_by = 'round4' and e.label = v.label);

-- ------------------------------------------------------------------ views
create or replace view web_shelf_daily with (security_invoker = true) as
select s.scrape_date, s.subcategory, s.product_id, s.rank, s.price, s.mrp, s.rating_count,
       s.is_ad, s.has_offer, s.in_stock
from scrape_snapshots s
where s.scrape_date >= current_date - 120;

create or replace view web_shelf_products with (security_invoker = true) as
select p.product_id, p.name, p.brand, coalesce(b.origin, 'unknown') as origin, p.url, p.first_review_date
from products p
left join brand_classification b on b.brand = p.brand
where exists (select 1 from scrape_snapshots s where s.product_id = p.product_id and s.scrape_date >= current_date - 120);

create or replace view web_category_stats with (security_invoker = true) as
select scrape_date, subcategory, count(*) as brands, sum(products) as products
from category_brands group by 1, 2;

create or replace view web_category_brands with (security_invoker = true) as
select c.subcategory, c.brand, coalesce(b.origin, 'unknown') as origin,
       min(c.scrape_date) as first_seen, max(c.scrape_date) as last_seen,
       (array_agg(c.products order by c.scrape_date desc))[1] as products
from category_brands c
left join brand_classification b on b.brand = c.brand
group by 1, 2, 3;

create or replace view web_homepage_features with (security_invoker = true) as
select scrape_date, section, position, kind, target, label, brand, url, is_ad
from homepage_features where scrape_date >= current_date - 120;

create or replace view web_brand_offers with (security_invoker = true) as
select scrape_date, brand, offer_id, title, description
from brand_offers where scrape_date >= current_date - 120;

grant select on web_shelf_daily, web_shelf_products, web_category_stats, web_category_brands,
  web_homepage_features, web_brand_offers to authenticated;

-- ------------------------------------------------------------------ nightly copies (020-023 pattern)
do $$
declare v text;
begin
  foreach v in array array['web_shelf_daily', 'web_shelf_products', 'web_category_stats', 'web_category_brands',
                           'web_homepage_features', 'web_brand_offers'] loop
    execute format('drop materialized view if exists %I', v || '_snap');
    execute format('create materialized view %I as select * from %I', v || '_snap', v);
    execute format('revoke all on %I from public, anon, authenticated', v || '_snap');
    execute format('grant select on %I to authenticated, service_role', v || '_snap');
  end loop;
end $$;
create index on web_shelf_daily_snap (scrape_date, subcategory, rank, product_id);
create index on web_shelf_products_snap (product_id);
create index on web_category_stats_snap (scrape_date, subcategory);
create index on web_category_brands_snap (subcategory, brand);
create index on web_homepage_features_snap (scrape_date, section, position);
create index on web_brand_offers_snap (scrape_date, brand, offer_id);

create or replace function public.web_blob_order(v text) returns text language sql immutable as $$
  select case v
    when 'web_latest_shelf' then 'subcategory, rank, product_id'
    when 'web_review_months' then 'product_id, month'
    when 'web_latest_search' then 'query, sample, rank, product_id'
    when 'web_latest_assortment' then 'brand'
    when 'web_brand_catalog' then 'brand, product_id'
    when 'web_share_daily' then 'scrape_date, subcategory, origin'
    when 'web_brand_daily' then 'scrape_date, brand, subcategory'
    when 'web_search_history' then 'scrape_date, query, sample, rank, product_id'
    when 'web_suggestions_latest' then 'seed, kind, position'
    when 'web_suggestion_history' then 'scrape_date, seed, position'
    when 'web_movement' then 'category, product_id'
    when 'web_brand_shares' then 'scrape_date, brand'
    when 'web_product_demand' then 'product_id'
    when 'web_availability' then 'brand, product_id'
    when 'web_category_coverage' then 'category'
    when 'web_thumbnails' then 'product_id'
    when 'web_usp_products' then 'product_id'
    when 'web_usp_comparisons' then 'anchor_product_id'
    when 'web_shelf_daily' then 'scrape_date, subcategory, rank, product_id'
    when 'web_shelf_products' then 'product_id'
    when 'web_category_stats' then 'scrape_date, subcategory'
    when 'web_category_brands' then 'subcategory, brand'
    when 'web_homepage_features' then 'scrape_date, section, position'
    when 'web_brand_offers' then 'scrape_date, brand, offer_id'
  end $$;

select public.refresh_web_snapshots();

notify pgrst, 'reload schema';
