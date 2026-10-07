-- 2026-10-08: what each product sells itself on (its USP), read from its whole Nykaa gallery, page text and
-- reviews (scraper/usp.py, stage A), and how each Innisfree product's message stands against its direct
-- rivals (stage B, one comparison per anchor product; rivals from scraper/rivals.py). Idempotent.
create table if not exists usp_analyses (
  product_id           text primary key,
  analysis             jsonb not null,            -- main_usp, key_benefits, hero_ingredients, target_consumer, review_check, ...
  gallery_fingerprint  text not null,             -- re-analyse only when a photo is added, removed, reordered or replaced
  images               integer,
  reviews_sampled      integer,
  reviews_stored       integer,
  model                text not null,
  effort               text,
  cost_usd             numeric(8,4),
  analysed_at          timestamptz not null default now()
);

create table if not exists usp_comparisons (
  anchor_product_id  text primary key,
  category           text,                        -- the anchor's shelf (scraper/rivals.py ANCHOR_PRODUCTS)
  products           text[] not null,             -- anchor first, then its rivals
  roles              jsonb,                       -- product_id -> korean | indian | global
  comparison         jsonb not null,              -- table_stakes, products, anchor_position, white_space
  model              text not null,
  cost_usd           numeric(8,4),
  analysed_at        timestamptz not null default now()
);

-- every batch the analyser pays for: the monthly budget guard sums this
create table if not exists usp_spend (
  id          bigint generated always as identity primary key,
  spent_at    timestamptz not null default now(),
  stage       text not null,                      -- products | comparisons
  requests    integer not null,
  cost_usd    numeric(8,4) not null
);

alter table usp_comparisons add column if not exists category text;

alter table usp_analyses enable row level security;
alter table usp_comparisons enable row level security;
alter table usp_spend enable row level security;
drop policy if exists "read usp analyses" on usp_analyses;
create policy "read usp analyses" on usp_analyses for select to authenticated using (true);
drop policy if exists "read usp comparisons" on usp_comparisons;
create policy "read usp comparisons" on usp_comparisons for select to authenticated using (true);
grant select on usp_analyses, usp_comparisons to authenticated;
revoke all on usp_spend from anon, authenticated;

create or replace view web_usp_products with (security_invoker = true) as
select u.product_id, d.brand, d.name, d.url, u.analysis, u.images, u.reviews_sampled, u.reviews_stored, u.analysed_at
from usp_analyses u join product_dim d using (product_id);
grant select on web_usp_products to authenticated;
revoke all on web_usp_products from anon;

create or replace view web_usp_comparisons with (security_invoker = true) as
select c.anchor_product_id, d.name as anchor_name, c.products, c.roles, c.comparison, c.analysed_at, c.category
from usp_comparisons c join product_dim d on d.product_id = c.anchor_product_id;
grant select on web_usp_comparisons to authenticated;
revoke all on web_usp_comparisons from anon;
