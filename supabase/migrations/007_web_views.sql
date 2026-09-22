-- 2026-09-22: read-only views for the Next.js front end. security_invoker = true so the caller's
-- row-level security applies (logged-in users can read; anonymous users get nothing). Idempotent.

-- Latest day's shelf, joined to product-page details
create or replace view web_latest_shelf with (security_invoker = true) as
select v.scrape_date, v.subcategory, v.rank, v.product_id, v.name, v.brand, v.origin, v.k_marketing,
       v.mrp, v.price, v.discount_pct, v.rating, v.rating_count, v.in_stock, v.is_ad, v.is_pinned,
       v.has_offer, v.offer_message, v.url, v.first_review_date, v.review_count,
       p.pack_size, d.country_name, d.formulation, d.skin_types, d.concerns, d.key_ingredients, d.preferences,
       d.usp_summary, d.usp_points, d.review_key_phrases, d.review_splitup, d.review_count as detail_review_count,
       d.image_url, d.description_text
from v_snapshots v
join products p using (product_id)
left join product_details d using (product_id)
where v.scrape_date = (select max(scrape_date) from scrape_snapshots);

-- Monthly review history with each product's reliable coverage start (Nykaa serves ~1,000 reviews
-- per product; when fewer were fetched than Nykaa reports, the oldest month is partial).
create or replace view web_review_months with (security_invoker = true) as
with h as (select h.*, min(h.month) over (partition by h.product_id) as oldest from review_history h)
select h.product_id, h.month, h.reviews, h.avg_rating, p.brand,
       case when c.reported_reviews is not null and c.reviews_fetched < 0.95 * c.reported_reviews
            then (h.oldest + interval '1 month')::date else date '1900-01-01' end as coverage_start
from h
join products p using (product_id)
join review_cursor c using (product_id);

-- Latest search results, unpaid order from one sample, with brand origin
create or replace view web_latest_search with (security_invoker = true) as
select s.query, s.rank, s.sample, s.product_id, s.brand, s.name, s.price, s.is_ad, s.total_found, s.scrape_date,
       coalesce(b.origin, 'unknown') as origin
from search_snapshots s
left join brand_classification b on b.brand = s.brand
where s.scrape_date = (select max(scrape_date) from search_snapshots);

-- Latest brand range on Nykaa
create or replace view web_latest_assortment with (security_invoker = true) as
select brand, total_products, scrape_date from brand_assortment
where scrape_date = (select max(scrape_date) from brand_assortment);

grant select on web_latest_shelf, web_review_months, web_latest_search, web_latest_assortment to authenticated;
revoke all on web_latest_shelf, web_review_months, web_latest_search, web_latest_assortment from anon;
