-- 026 (Round 4 plan v4, owner OK 18 Oct 2026): additive only, no change to existing tables.
--
-- 1. review_counts: Nykaa froze its rating counts on 10 Oct, but the count of written reviews still moves. Each
--    night the scraper reads it for every list's top 30, and for ranks 31-100 every third night (owner: stay inside
--    the free Actions minutes). Not used for any figure until the owner has seen it compared with ratings.
-- 2. external_news: headlines about the main brands and the day's movers, from Google News' free search feed,
--    read nightly. Shown on the dashboard as outside context ("External"), never as a proven cause.
-- 3. Views and their nightly copies (020-025 pattern).

create table if not exists review_counts (
  scrape_date  date not null,
  product_id   text not null,
  review_count integer not null,
  rating_count integer,
  primary key (scrape_date, product_id)
);
create table if not exists external_news (
  url          text primary key,
  brand        text not null,
  title        text not null,
  source       text,
  published_at timestamptz,
  first_seen   date not null,
  query        text
);
create index if not exists external_news_brand on external_news (brand, published_at desc);
do $$ declare t text; begin
  foreach t in array array['review_counts', 'external_news'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "read %s" on %I', t, t);
    execute format('create policy "read %s" on %I for select to authenticated using (true)', t, t);
    execute format('grant select on %I to authenticated', t);
  end loop;
end $$;

create or replace view web_review_counts with (security_invoker = true) as
select scrape_date, product_id, review_count, rating_count
from review_counts where scrape_date >= current_date - 120;

create or replace view web_external_news with (security_invoker = true) as
select brand, published_at, title, source, url, first_seen
from external_news where coalesce(published_at::date, first_seen) >= current_date - 60;

grant select on web_review_counts, web_external_news to authenticated;

do $$
declare v text;
begin
  foreach v in array array['web_review_counts', 'web_external_news'] loop
    execute format('drop materialized view if exists %I', v || '_snap');
    execute format('create materialized view %I as select * from %I', v || '_snap', v);
    execute format('revoke all on %I from public, anon, authenticated', v || '_snap');
    execute format('grant select on %I to authenticated, service_role', v || '_snap');
  end loop;
end $$;
create index on web_review_counts_snap (scrape_date, product_id);
create index on web_external_news_snap (brand, published_at);

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
    when 'web_review_counts' then 'scrape_date, product_id'
    when 'web_external_news' then 'brand, published_at, url'
  end $$;


select public.refresh_web_snapshots();

notify pgrst, 'reload schema';
