-- 2026-09-22: autosuggest keywords, repeated search sampling for ad rotation, review text. Idempotent.

-- Nykaa's "popular searches" and the autosuggest list for a set of seed terms
create table if not exists search_suggestions (
  scrape_date  date not null,
  seed         text not null,              -- what was typed ('' for the popular-searches list)
  position     integer not null,           -- order Nykaa shows it in
  suggestion   text not null,              -- keyword or product title
  kind         text not null,              -- popular | query | search | category | brand | product
  product_id   text,
  url          text,
  primary key (scrape_date, seed, kind, position)
);
alter table search_suggestions enable row level security;
drop policy if exists "read suggestions" on search_suggestions;
create policy "read suggestions" on search_suggestions for select to authenticated using (true);
grant select on search_suggestions to authenticated;

-- search results sampled several times per run (ads rotate per page load)
alter table search_snapshots add column if not exists sample integer not null default 1;
alter table search_snapshots drop constraint if exists search_snapshots_scrape_date_query_product_id_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'search_snapshots_day_query_sample_product_key') then
    alter table search_snapshots add constraint search_snapshots_day_query_sample_product_key unique (scrape_date, query, sample, product_id);
  end if;
end $$;

-- review text for key products (enables trending review themes)
create table if not exists review_texts (
  review_id    bigint primary key,
  product_id   text not null references products (product_id) on delete cascade,
  created_on   timestamptz not null,
  rating       smallint,
  title        text,
  body         text,
  is_buyer     boolean,
  fetched_at   timestamptz not null default now()
);
create index if not exists review_texts_product_idx on review_texts (product_id, created_on desc);
alter table review_texts enable row level security;
drop policy if exists "read review texts" on review_texts;
create policy "read review texts" on review_texts for select to authenticated using (true);
grant select on review_texts to authenticated;
