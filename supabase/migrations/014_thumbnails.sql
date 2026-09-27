-- 2026-09-28: what a product's main image actually shows. The thumbnail is the first thing a shopper
-- judges, and Nykaa ranks on clicks — so the image is part of why a product wins its shelf.
-- Two layers: measured locally from the pixels, and read by a vision model. Idempotent.
create table if not exists product_thumbnails (
  product_id       text primary key,
  image_url        text not null,
  image_hash       text not null,          -- skip re-analysis while the image is unchanged
  width            integer,
  height           integer,
  -- measured from the pixels
  background       text,                   -- white | solid | scene
  bg_lightness     numeric(5,2),
  colorfulness     numeric(6,2),
  edge_density     numeric(5,3),           -- proxy for how much text/detail is on the image
  dominant_colors  jsonb,
  -- read by the vision model
  shot_type        text,                   -- pack_shot | model | texture | lifestyle | flat_lay | illustration
  model_present    boolean,
  text_density     text,                   -- none | light | heavy
  on_image_claims  jsonb,                  -- the claims printed on the image, verbatim
  packaging_style  text,
  mood             text,
  summary          text,
  vision_model     text,
  vision_raw       jsonb,
  analysed_at      timestamptz not null default now()
);
alter table product_thumbnails enable row level security;
drop policy if exists "read thumbnails" on product_thumbnails;
create policy "read thumbnails" on product_thumbnails for select to authenticated using (true);
grant select on product_thumbnails to authenticated;

create or replace view web_thumbnails with (security_invoker = true) as
select t.*, d.brand, d.name
from product_thumbnails t join product_dim d using (product_id);
grant select on web_thumbnails to authenticated;
revoke all on web_thumbnails from anon;
