-- 2026-09-27: Nykaa's per-review aspect tags (texture, fragrance, ...) and photo count. Idempotent.
alter table review_texts add column if not exists aspects jsonb;
alter table review_texts add column if not exists images integer;
alter table review_texts add column if not exists likes integer;

create or replace view web_review_texts with (security_invoker = true) as
select review_id, product_id, created_on, rating, title, body, is_buyer, aspects, images, likes from review_texts;
grant select on web_review_texts to authenticated;
