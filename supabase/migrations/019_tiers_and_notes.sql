-- Round 3 (owner decisions 2026-10-12, D1/D5): one shared brand tiering and a data-quality log, both editable in Admin.
--  * brand_tiers: the pinned anchor and the focus set every tab leads with; every other brand sits behind search.
--  * data_notes: every data gap, artifact or explained spike, with cause and status. Charts draw their markers from it.
-- Everyone signed in reads both; only admins (app_admins) change them. Apply after 018. Idempotent.

create table if not exists brand_tiers (
  brand      text primary key,              -- display name; matched to the data case- and punctuation-insensitively
  tier       text not null check (tier in ('pinned', 'focus')),
  grp        text not null check (grp in ('korean', 'indian', 'global')),
  sort       int  not null default 100,
  note       text,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table brand_tiers enable row level security;
drop policy if exists "read tiers" on brand_tiers;
create policy "read tiers" on brand_tiers for select to authenticated using (true);
drop policy if exists "admins edit tiers" on brand_tiers;
create policy "admins edit tiers" on brand_tiers for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
grant select, insert, update, delete on brand_tiers to authenticated;

insert into brand_tiers (brand, tier, grp, sort, note) values
  ('Innisfree', 'pinned', 'korean', 0, 'anchor'),
  ('Laneige', 'focus', 'korean', 1, null), ('Beauty of Joseon', 'focus', 'korean', 2, null), ('The Face Shop', 'focus', 'korean', 3, null),
  ('TONYMOLY', 'focus', 'korean', 4, null), ('COSRX', 'focus', 'korean', 5, null), ('Anua', 'focus', 'korean', 6, null),
  ('SKIN1004', 'focus', 'korean', 7, null), ('ETUDE', 'focus', 'korean', 8, null), ('Biodance', 'focus', 'korean', 9, null),
  ('Mamonde', 'focus', 'korean', 10, 'launched on Nykaa 17 Aug 2026'),
  ('Dot & Key', 'focus', 'indian', 20, null), ('Minimalist', 'focus', 'indian', 21, null), ('Plum', 'focus', 'indian', 22, null),
  ('Foxtale', 'focus', 'indian', 23, null), ('Nykaa Skin', 'focus', 'indian', 24, null),
  ('Cetaphil', 'focus', 'global', 30, null), ('CeraVe', 'focus', 'global', 31, null), ('The Ordinary', 'focus', 'global', 32, null),
  ('Bioderma', 'focus', 'global', 33, null)
on conflict (brand) do nothing;

create table if not exists data_notes (
  id         bigint generated always as identity primary key,
  starts_on  date not null,
  ends_on    date,
  kind       text not null check (kind in ('coverage', 'sale', 'launch', 'artifact', 'method')),
  scope      text not null default 'all' check (scope in ('shelf', 'demand', 'search', 'all')),
  brand      text,
  category   text,
  title      text not null,
  detail     text,
  status     text not null default 'explained' check (status in ('explained', 'probable', 'open')),
  created_at timestamptz not null default now(),
  updated_by text
);
create unique index if not exists data_notes_once on data_notes (kind, starts_on, title);
alter table data_notes enable row level security;
drop policy if exists "read notes" on data_notes;
create policy "read notes" on data_notes for select to authenticated using (true);
drop policy if exists "admins edit notes" on data_notes;
create policy "admins edit notes" on data_notes for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
grant select, insert, update, delete on data_notes to authenticated;
grant usage on sequence data_notes_id_seq to authenticated;

insert into data_notes (starts_on, ends_on, kind, scope, brand, category, title, detail, status) values
  ('2026-09-13', null, 'coverage', 'shelf', null, null, 'Tracking starts: 7 categories',
   'Moisturiser, serum, sunscreen, face wash, masks & peels, lipstick and foundation, top 100 each.', 'explained'),
  ('2026-09-16', null, 'coverage', 'shelf', null, 'kbeauty_store', 'Korean Beauty store added',
   'Nykaa''s Korean store (category 30710) is read daily from here on. It is kept apart from the category shelves.', 'explained'),
  ('2026-09-27', null, 'coverage', 'shelf', null, null, '5 categories added (7 → 12)',
   'Toner & mist, sheet mask, cleansing balm, eye care and lip tint start being tracked. The shelf grows from 700 to 1,200 places, so brand listing counts jump overnight (Beauty of Joseon 12 → 19, The Face Shop 12 → 20, TONYMOLY 1 → 12). Not a market move.', 'explained'),
  ('2026-10-06', null, 'coverage', 'shelf', null, 'lip_care', 'Lip care added (12 → 13 categories)',
   'The shelf grows to 1,300 places. Laneige gains 8 listings that day, all in lip care. Not a market move.', 'explained'),
  ('2026-08-17', null, 'launch', 'all', 'Mamonde', null, 'Mamonde launches on Nykaa (exclusive)',
   'Amorepacific''s Mamonde enters India as a Nykaa exclusive with its Rose HA and Peony BHA lines. Its first reviews date from 16–25 Aug; September (1,605 reviews, 96% five-star) is the launch push. No growth rate until it has 6 months of history.', 'explained'),
  ('2026-07-17', '2026-07-31', 'sale', 'demand', null, null, 'Nykaa Hot Pink sale',
   'Reviews across every tracked product peak in the weeks of 13–27 July (5,129 in the week of 20 July vs about 2,000 normally). Dates from third-party sale calendars.', 'explained'),
  ('2026-05-04', '2026-05-24', 'sale', 'demand', null, null, 'Probable sale period (unconfirmed)',
   'Reviews across every tracked product peak in the weeks of 4–18 May (3,526 in the week of 11 May). No confirmed Nykaa sale found for these dates; log it in Events if you know what it was.', 'probable'),
  ('2026-09-26', null, 'method', 'demand', null, null, 'Review history: Nykaa serves about 1,000 reviews per product',
   'For the biggest bestsellers only recent months are complete. Their earlier months are left blank, and they are left out of 3-month growth rather than counted as zero.', 'explained'),
  ('2026-10-12', null, 'method', 'demand', null, null, 'Demand growth uses today''s products',
   'Growth compares reviews dated Jul–Sep vs Apr–Jun 2026 for the products on today''s shelves and catalogues. Products that sold before but have since dropped off are not counted, so growth reads slightly high across the board. 35 of 562 products launched after April and have no "before".', 'explained')
on conflict (kind, starts_on, title) do nothing;
