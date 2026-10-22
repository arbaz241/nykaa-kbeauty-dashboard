-- 033 (22 Oct 2026, owner: "go ahead" on adjusted reviews): reviews each product received in the calibration window,
-- 13 Sep - 9 Oct 2026, the last stretch when Nykaa still updated its public rating counts. The dashboard divides these
-- by the same products' new ratings to learn each brand's reviews per 100 buyers (per brand x category), then turns
-- live reviews into estimated buyers. One row per product with a review in the window (~1,000 rows, a few KB).
-- Additive: nothing collected, changed or removed. Window fixed until Nykaa's rating counts move again.

create or replace view web_review_window with (security_invoker = true) as
 SELECT product_id, count(*)::int AS reviews
   FROM review_texts
  WHERE created_on >= '2026-09-13' AND created_on < '2026-10-10'
  GROUP BY product_id;

grant select on web_review_window to authenticated;
grant select on web_review_window to service_role;

drop materialized view if exists web_review_window_snap;
create materialized view web_review_window_snap as select * from web_review_window;
revoke all on web_review_window_snap from public, anon, authenticated;
grant select on web_review_window_snap to authenticated, service_role;
create index on web_review_window_snap (product_id);

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
    when 'web_review_window' then 'product_id'
  end $$;

insert into web_blobs (view, body, built_at) values ('web_review_window', public.web_blob_build('web_review_window'), now())
on conflict (view) do update set body = excluded.body, built_at = excluded.built_at;
