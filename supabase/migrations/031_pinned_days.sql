-- 031 (owner 19 Oct 2026: "make the change, but make it at the same time or even faster"): the days Nykaa pinned a
-- product to the top of a list, as one more nightly copy, so the pages get them in the same single request as the
-- rest of their data. Until now (audit 19 Oct) the pages read them from web_product_history, a live view outside the
-- nightly copies, in three extra requests. Pinned rows only (about 2,600; the daily view has 41,000 rows), same
-- 120-day window as web_shelf_daily. Additive: nothing is collected, changed or removed.

create or replace view web_pinned_days with (security_invoker = true) as
 SELECT scrape_date, subcategory, product_id
   FROM scrape_snapshots
  WHERE is_pinned AND scrape_date >= (CURRENT_DATE - 120);

grant select on web_pinned_days to authenticated;

drop materialized view if exists web_pinned_days_snap;
create materialized view web_pinned_days_snap as select * from web_pinned_days;
revoke all on web_pinned_days_snap from public, anon, authenticated;
grant select on web_pinned_days_snap to authenticated, service_role;
create index on web_pinned_days_snap (scrape_date, subcategory, product_id);

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
  end $$;

-- build the new copy's document now (the nightly refresh keeps it current from here on)
insert into web_blobs (view, body, built_at) values ('web_pinned_days', public.web_blob_build('web_pinned_days'), now())
on conflict (view) do update set body = excluded.body, built_at = excluded.built_at;
