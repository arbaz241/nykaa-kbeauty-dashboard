-- 023: Demand's "new this week" suggestion history joins the ready-made copies (020-022).
--
-- It was the one read left on the raw search_suggestions table: two weeks of typed suggestions, fetched 1,000 rows
-- at a time one after another on every visit, which kept Demand slow after the other tabs were fast. Now it is a
-- view, copied nightly like the rest and served in the page's single bundle request.

create or replace view web_suggestion_history with (security_invoker = true) as
select scrape_date, seed, position, suggestion, kind
from search_suggestions
where kind <> 'product' and scrape_date >= current_date - 15;
grant select on web_suggestion_history to authenticated;

drop materialized view if exists web_suggestion_history_snap;
create materialized view web_suggestion_history_snap as select * from web_suggestion_history;
revoke all on web_suggestion_history_snap from public, anon, authenticated;
grant select on web_suggestion_history_snap to authenticated, service_role;
create index on web_suggestion_history_snap (scrape_date, seed, position);

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
  end $$;

select public.refresh_web_snapshots();

notify pgrst, 'reload schema';
