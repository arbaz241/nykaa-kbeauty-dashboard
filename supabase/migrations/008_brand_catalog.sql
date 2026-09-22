-- 2026-09-23: full product catalogue of the focus brands (brand pages), so products outside the
-- top-100 shelves can be compared. Idempotent.

create table if not exists brand_catalog (
  scrape_date    date not null,
  brand          text not null,
  brand_id       text,
  product_id     text not null,
  catalog_rank   integer,            -- position on the brand page (popularity sort)
  name           text not null,
  subcategories  text[] not null default '{}',   -- tracked category keys the product belongs to
  l3             text,
  price          numeric(10,2),
  mrp            numeric(10,2),
  discount_pct   numeric(5,2),
  rating         numeric(3,2),
  rating_count   integer,
  in_stock       boolean,
  has_offer      boolean not null default false,
  offer_message  text,
  pack_size      text,
  url            text,
  image_url      text,
  primary key (scrape_date, brand, product_id)
);
create index if not exists brand_catalog_brand_idx on brand_catalog (brand, scrape_date);
alter table brand_catalog enable row level security;
drop policy if exists "read catalog" on brand_catalog;
create policy "read catalog" on brand_catalog for select to authenticated using (true);
grant select on brand_catalog to authenticated;

-- product details may now describe catalogue products that never reached a shelf
alter table product_details drop constraint if exists product_details_product_id_fkey;

create or replace view web_brand_catalog with (security_invoker = true) as
select c.*, d.country_name, d.formulation, d.skin_types, d.concerns, d.key_ingredients, d.usp_summary, d.usp_points,
       d.review_key_phrases, d.review_splitup, d.review_count as detail_review_count, coalesce(d.image_url, c.image_url) as best_image
from brand_catalog c
left join product_details d using (product_id)
where c.scrape_date = (select max(scrape_date) from brand_catalog b2 where b2.brand = c.brand);
grant select on web_brand_catalog to authenticated;
revoke all on web_brand_catalog from anon;
