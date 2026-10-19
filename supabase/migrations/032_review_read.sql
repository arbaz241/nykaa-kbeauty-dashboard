-- 032 (20 Oct 2026, owner: month-on-month review growth beside every compared product; "check and recheck"): the
-- day each product's review history was last read, so the dashboard knows whether a month was already over when we
-- read it. Without it a month read half-way (a product last read on 25 Sep) would show as a fall in September. One
-- row per followed product (~700, a few KB in the same single request). Additive: nothing collected, changed or removed.

create or replace view web_review_read with (security_invoker = true) as
 SELECT product_id, (fetched_at AT TIME ZONE 'Asia/Kolkata')::date AS read_on
   FROM review_cursor
  WHERE fetched_at IS NOT NULL;

grant select on web_review_read to authenticated;

drop materialized view if exists web_review_read_snap;
create materialized view web_review_read_snap as select * from web_review_read;
revoke all on web_review_read_snap from public, anon, authenticated;
grant select on web_review_read_snap to authenticated, service_role;
create index on web_review_read_snap (product_id);

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
    when 'web_pinned_days' then 'scrape_date, subcategory, product_id'
    when 'web_review_read' then 'product_id'
  end $$;

insert into web_blobs (view, body, built_at) values ('web_review_read', public.web_blob_build('web_review_read'), now())
on conflict (view) do update set body = excluded.body, built_at = excluded.built_at;
