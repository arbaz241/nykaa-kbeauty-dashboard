-- 034 (22 Oct 2026): review bursts. Niconi's Tan Vanish polish got 277 and 370 reviews in single July weeks against
-- its usual 5-20 (its lifetime rating count is only ~4,000), so adjusted reviews gave it 58% of masks. A week far
-- above a product's usual weeks is cut back: each week's reviews count at most 4 x the product's median week since its
-- first review in the last 10 months (at least 5 a week). Every review carries a weight min(1, cap / that week's count); the dashboard sums weights.
-- Used by adjusted reviews only (share of buying); review growth keeps the plain monthly counts. Additive.

create or replace view review_weights with (security_invoker = true) as
with r as (
  select product_id, created_on, date_trunc('week', created_on) as wk
    from review_texts
   where created_on >= date_trunc('month', current_date) - interval '10 months'
), wk as (
  select product_id, wk, count(*) as n from r group by 1, 2
), grid as (
  select p.product_id, g.wk
    from (select distinct product_id from wk) p
   cross join generate_series(date_trunc('week', current_date - interval '10 months'), date_trunc('week', current_date), interval '1 week') g(wk)
), first as (
  select product_id, min(wk) as wk0 from wk group by 1
), dense as (
  select g.product_id, g.wk, coalesce(w.n, 0) as n
    from grid g join first f on f.product_id = g.product_id and g.wk >= f.wk0
    left join wk w on w.product_id = g.product_id and w.wk = g.wk
), usual as (
  select product_id, percentile_cont(0.5) within group (order by n) as med from dense group by 1
), cap as (
  select w.product_id, w.wk, w.n, greatest(5, 4 * u.med) as cap
    from wk w join usual u on u.product_id = w.product_id
)
select r.product_id, r.created_on, least(1.0, c.cap / c.n)::numeric as w
  from r join cap c on c.product_id = r.product_id and c.wk = r.wk;

grant select on review_weights to service_role;

-- monthly reviews after the burst cut, last 7 months
create or replace view web_review_capped with (security_invoker = true) as
 SELECT product_id, date_trunc('month', created_on)::date AS month, round(sum(w), 1) AS reviews
   FROM review_weights
  WHERE created_on >= date_trunc('month', current_date) - interval '7 months'
  GROUP BY 1, 2;
grant select on web_review_capped to authenticated, service_role;

-- the calibration window, on the same footing (column becomes a weighted count, so the view is rebuilt)
drop materialized view if exists web_review_window_snap;
drop view if exists web_review_window;
create view web_review_window with (security_invoker = true) as
 SELECT product_id, round(sum(w), 1)::numeric AS reviews
   FROM review_weights
  WHERE created_on >= '2026-09-13' AND created_on < '2026-10-10'
  GROUP BY product_id;
grant select on web_review_window to authenticated, service_role;

drop materialized view if exists web_review_capped_snap;
create materialized view web_review_capped_snap as select * from web_review_capped;
revoke all on web_review_capped_snap from public, anon, authenticated;
grant select on web_review_capped_snap to authenticated, service_role;
create index on web_review_capped_snap (product_id, month);

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
    when 'web_review_capped' then 'product_id, month'
  end $$;

insert into web_blobs (view, body, built_at) values ('web_review_capped', public.web_blob_build('web_review_capped'), now())
on conflict (view) do update set body = excluded.body, built_at = excluded.built_at;
insert into web_blobs (view, body, built_at) values ('web_review_window', public.web_blob_build('web_review_window'), now())
on conflict (view) do update set body = excluded.body, built_at = excluded.built_at;
