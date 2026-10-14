-- 024: Korean for the text that comes from the data (owner request 14 Oct 2026: a 한국어 / EN switch on every tab).
--
-- The page wording is translated in the code (web/lib/i18n.ts). What the code cannot translate is the data itself:
-- Nykaa's product-page wording (claims, summaries, skin types, concerns, ingredients, review tags, offers) and the
-- AI reads (USP analyses, comparisons, image reads). scraper/translate.py translates each distinct English string
-- once and stores it here; the site looks strings up by their exact English text (web/lib/dict.ts) only while it is
-- in Korean. The data tables stay English, so every rule that reads them is unchanged. Customer reviews, product
-- names, brand names and the owner's own notes and events are not translated.

create table if not exists ko_dictionary (
  en            text primary key,
  ko            text not null,
  source        text,                       -- where the string was first seen (product_details.usp_points, usp_analyses, ...)
  model         text,
  translated_at timestamptz not null default now()
);

alter table ko_dictionary enable row level security;
drop policy if exists "read ko dictionary" on ko_dictionary;
create policy "read ko dictionary" on ko_dictionary for select to authenticated using (true);
revoke all on ko_dictionary from anon;
grant select on ko_dictionary to authenticated;
