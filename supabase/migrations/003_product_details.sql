-- Product detail attributes from Nykaa's product-details API, fetched once
-- per product (see scraper/product_details.py). Idempotent.

create table if not exists product_details (
  product_id          text primary key references products (product_id) on delete cascade,
  country_of_origin   text,          -- ISO-ish code Nykaa uses: KR, IN, US, FR ...
  country_name        text,          -- "South Korea", "India"
  manufacturer_name   text,
  seller_name         text,
  formulation         text,          -- Cream, Gel, Serum ...
  skin_types          text[],        -- from the "Skin Type" attribute
  concerns            text[],        -- from the "Concern" attribute
  key_ingredients     text[],        -- "Ingredient" attribute + bold names in the Key Ingredients block
  preferences         text[],        -- Fragrance-Free, Cruelty-Free, Vegan ...
  attributes          jsonb,         -- every {label, value} pair Nykaa shows under Highlights
  usp_summary         text,          -- Nykaa's one-line AI summary of the product
  usp_points          text[],        -- "You'll like" bullets
  description_text    text,          -- HTML-stripped description (capped)
  full_ingredients    text,
  how_to_use          text,
  review_key_phrases  jsonb,         -- [{text, sentiment, rank}]
  review_splitup      jsonb,         -- {"1": n, ... "5": n}
  review_count        integer,
  expiry_text         text,
  variants            jsonb,         -- [{sku, pack_size, mrp, price}]
  image_url           text,
  fetched_at          timestamptz not null default now()
);
create index if not exists product_details_origin_idx on product_details (country_of_origin);

alter table product_details enable row level security;
drop policy if exists "read product_details" on product_details;
create policy "read product_details" on product_details for select to authenticated using (true);
grant select on product_details to authenticated;
revoke all on product_details from anon;

-- Convenience: snapshots + product + brand + details in one view for the dashboard.
create or replace view v_snapshots_detailed as
select v.*, d.country_of_origin, d.country_name, d.formulation, d.skin_types, d.concerns, d.key_ingredients,
       d.preferences, d.usp_summary, d.usp_points, d.review_key_phrases, d.review_splitup, d.variants,
       d.image_url, d.review_count as detail_review_count
from v_snapshots v
left join product_details d on d.product_id = v.product_id;
grant select on v_snapshots_detailed to authenticated;
