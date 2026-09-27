-- 2026-09-27: review history is now collected for catalogue products too — a brand's biggest sellers
-- often never enter a tracked top-100 (most of Innisfree's range). `products` holds shelf products
-- only, so the FK to it no longer applies (same reasoning as 008 for product_details). Idempotent.
alter table review_history drop constraint if exists review_history_product_id_fkey;
alter table review_cursor  drop constraint if exists review_cursor_product_id_fkey;
alter table review_texts   drop constraint if exists review_texts_product_id_fkey;

-- Every product we can name: shelf products, plus catalogue products that never reached a shelf.
create or replace view product_dim with (security_invoker = true) as
select p.product_id, p.brand, p.name, p.url, true as on_shelf from products p
union all
select c.product_id, c.brand, c.name, c.url, false
from brand_catalog c
where c.scrape_date = (select max(scrape_date) from brand_catalog)
  and not exists (select 1 from products p where p.product_id = c.product_id);

-- Monthly review history: same as 007, but products outside the shelves keep their name and link.
create or replace view web_review_months with (security_invoker = true) as
with h as (select h.*, min(h.month) over (partition by h.product_id) as oldest from review_history h)
select h.product_id, h.month, h.reviews, h.avg_rating, p.brand,
       case when c.reported_reviews is not null and c.reviews_fetched < 0.95 * c.reported_reviews
            then (h.oldest + interval '1 month')::date else date '1900-01-01' end as coverage_start,
       p.name, p.url
from h
join product_dim p using (product_id)
join review_cursor c using (product_id);

grant select on product_dim to authenticated;
grant select on web_review_months to authenticated;
revoke all on product_dim, web_review_months from anon;
