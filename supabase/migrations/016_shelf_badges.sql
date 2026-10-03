-- 016 (2026-10-03): the Top-per-category tab shows Nykaa's own badges and the sub-category Nykaa files a
-- product under. Columns are appended, so existing readers of the view are unaffected. Idempotent.
create or replace view web_latest_shelf with (security_invoker = true) as
select v.scrape_date, v.subcategory, v.rank, v.product_id, v.name, v.brand, v.origin, v.k_marketing,
       v.mrp, v.price, v.discount_pct, v.rating, v.rating_count, v.in_stock, v.is_ad, v.is_pinned,
       v.has_offer, v.offer_message, v.url, v.first_review_date, v.review_count,
       p.pack_size, d.country_name, d.formulation, d.skin_types, d.concerns, d.key_ingredients, d.preferences,
       d.usp_summary, d.usp_points, d.review_key_phrases, d.review_splitup, d.review_count as detail_review_count,
       d.image_url, d.description_text,
       v.is_bestseller, v.is_new_tag, v.tags, v.nykaa_l3
from v_snapshots v
join products p using (product_id)
left join product_details d using (product_id)
where v.scrape_date = (select max(scrape_date) from scrape_snapshots);
