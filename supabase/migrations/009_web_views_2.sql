-- 2026-09-23: views for the Demand, Search & Ads and Market pages and the product drawer. Idempotent.
-- security_invoker: caller's row-level security applies (signed-in users only).

create or replace view web_share_daily with (security_invoker = true) as
select s.scrape_date, s.subcategory, coalesce(b.origin, 'unknown') as origin,
       count(*) as slots, count(*) filter (where s.rank <= 20) as top20
from scrape_snapshots s join products p using (product_id)
left join brand_classification b on b.brand = p.brand
where s.subcategory <> 'kbeauty_store'
group by 1, 2, 3;

create or replace view web_brand_daily with (security_invoker = true) as
select s.scrape_date, p.brand, coalesce(b.origin, 'unknown') as origin, s.subcategory,
       count(*) as slots, min(s.rank) as best_rank, count(*) filter (where s.rank <= 20) as top20
from scrape_snapshots s join products p using (product_id)
left join brand_classification b on b.brand = p.brand
group by 1, 2, 3, 4;

create or replace view web_search_history with (security_invoker = true) as
select s.scrape_date, s.query, s.sample, s.rank, s.product_id, s.brand, s.name, s.price, s.rating, s.rating_count,
       s.is_ad, s.total_found, coalesce(b.origin, 'unknown') as origin
from search_snapshots s left join brand_classification b on b.brand = s.brand;

create or replace view web_suggestions_latest with (security_invoker = true) as
select * from search_suggestions where scrape_date = (select max(scrape_date) from search_suggestions);

create or replace view web_product_history with (security_invoker = true) as
select scrape_date, subcategory, product_id, rank, price, mrp, discount_pct, rating, rating_count, is_ad, is_pinned, has_offer
from scrape_snapshots;

create or replace view web_review_texts with (security_invoker = true) as
select review_id, product_id, created_on, rating, title, body, is_buyer from review_texts;

grant select on web_share_daily, web_brand_daily, web_search_history, web_suggestions_latest, web_product_history, web_review_texts to authenticated;
revoke all on web_share_daily, web_brand_daily, web_search_history, web_suggestions_latest, web_product_history, web_review_texts from anon;
