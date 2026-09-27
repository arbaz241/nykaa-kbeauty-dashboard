-- 2026-09-27: the measurement layer behind the Analysis page. Everything here is an aggregate over
-- stored observations — no estimates, no fabricated rows. security_invoker: the caller's RLS applies.

-- ---------------------------------------------------------------- product -> category
-- A product's category: the shelf it last appeared on, else the tracked category its brand page filed it under.
create or replace view product_category with (security_invoker = true) as
select p.product_id, p.brand,
       coalesce(
         (select s.subcategory from scrape_snapshots s
          where s.product_id = p.product_id and s.subcategory <> 'kbeauty_store'
          order by s.scrape_date desc, s.rank limit 1),
         (select c.subcategories[1] from brand_catalog c
          where c.product_id = p.product_id and cardinality(c.subcategories) > 0
          order by c.scrape_date desc limit 1)
       ) as category
from product_dim p;

-- ---------------------------------------------------------------- demand, normalised
-- Raw monthly review counts favour old, huge listings. These columns make products comparable:
--   recent   = reviews in the last 3 complete months
--   prior    = the 3 months before that
--   momentum = recent vs prior (null when the base is too small to mean anything)
--   share_of_category = the product's recent reviews against every tracked product in its category
create or replace view web_product_demand with (security_invoker = true) as
with bounds as (select (date_trunc('month', current_date) - interval '1 month')::date as last_month),
     agg as (
       select h.product_id,
              sum(h.reviews) filter (where h.month >  (select last_month from bounds) - interval '3 months'
                                       and h.month <= (select last_month from bounds))::int as recent,
              sum(h.reviews) filter (where h.month >  (select last_month from bounds) - interval '6 months'
                                       and h.month <= (select last_month from bounds) - interval '3 months')::int as prior,
              sum(h.reviews)::int as lifetime,
              min(h.month) as first_month, max(h.month) as last_month,
              count(*)::int as months_listed
       from review_history h group by 1
     )
select a.product_id, pc.brand, pc.category, d.name, d.url,
       coalesce(a.recent, 0) as recent, coalesce(a.prior, 0) as prior, a.lifetime,
       a.first_month, a.last_month, a.months_listed,
       case when coalesce(a.prior, 0) >= 15 and coalesce(a.recent, 0) + coalesce(a.prior, 0) >= 40
            then round((a.recent::numeric - a.prior) / a.prior, 3) end as momentum,
       round(a.lifetime::numeric / nullif(a.months_listed, 0), 1) as reviews_per_month,
       c.complete as history_complete,
       coalesce((select min(c2.product_id) from review_cursor c2
                 where c2.newest_review_id = c.newest_review_id and c.newest_review_id is not null),
                a.product_id) as pool_id
from agg a
join product_category pc using (product_id)
join product_dim d using (product_id)
left join review_cursor c using (product_id);

-- ---------------------------------------------------------------- three shares, per brand per day
-- Share of shelf (visibility Nykaa gives), share of voice (search results earned, ads excluded),
-- and best rank. Share of demand lives in web_product_demand because reviews are monthly, not daily.
create or replace view web_brand_shares with (security_invoker = true) as
with shelf as (
  select s.scrape_date, p.brand, count(*)::int slots,
         count(*) filter (where s.rank <= 20)::int top20, min(s.rank)::int best_rank
  from scrape_snapshots s join products p using (product_id)
  where s.subcategory <> 'kbeauty_store'
  group by 1, 2
), shelf_total as (
  select scrape_date, sum(slots)::int total from shelf group by 1
), voice as (
  select scrape_date, brand,
         count(*) filter (where not is_ad)::int earned,
         count(*) filter (where is_ad)::int paid
  from search_snapshots group by 1, 2
), voice_total as (
  select scrape_date, sum(earned)::int total from voice group by 1
)
select coalesce(sh.scrape_date, v.scrape_date) as scrape_date,
       coalesce(sh.brand, v.brand) as brand,
       coalesce(b.origin, 'unknown') as origin,
       coalesce(sh.slots, 0) as slots, coalesce(sh.top20, 0) as top20, sh.best_rank,
       round(coalesce(sh.slots, 0)::numeric / nullif(st.total, 0), 4) as share_of_shelf,
       coalesce(v.earned, 0) as search_earned, coalesce(v.paid, 0) as search_paid,
       round(coalesce(v.earned, 0)::numeric / nullif(vt.total, 0), 4) as share_of_voice,
       round(coalesce(v.paid, 0)::numeric / nullif(coalesce(v.earned, 0) + coalesce(v.paid, 0), 0), 3) as paid_dependency
from shelf sh
full join voice v on v.scrape_date = sh.scrape_date and v.brand = sh.brand
left join shelf_total st on st.scrape_date = coalesce(sh.scrape_date, v.scrape_date)
left join voice_total vt on vt.scrape_date = coalesce(sh.scrape_date, v.scrape_date)
left join brand_classification b on b.brand = coalesce(sh.brand, v.brand);

-- ---------------------------------------------------------------- rank and price movement
-- One row per product per category: where it sits now, where it sat 7 and 14 days ago, and how its
-- price moved. Price needs care: Nykaa swaps which pack size a listing shows by default, which changes
-- both MRP and selling price without anyone cutting anything (Cetaphil's cleanser "fell" 67% on 14 Sep
-- purely because the listing switched pack). A move only counts as a real cut when the MRP is unchanged.
drop view if exists web_movement;
create view web_movement with (security_invoker = true) as
with days as (select max(scrape_date) as today from scrape_snapshots),
     snap as (
       select s.product_id, s.subcategory, s.scrape_date, s.rank, s.price, s.mrp, s.is_ad, s.discount_pct
       from scrape_snapshots s where s.subcategory <> 'kbeauty_store'
     )
select n.product_id, p.brand, coalesce(b.origin, 'unknown') as origin, d.name, d.url,
       n.subcategory as category, n.rank, n.price, n.mrp, n.is_ad, n.discount_pct,
       w.rank as rank_7d, f.rank as rank_14d,
       (w.rank - n.rank) as gain_7d, (f.rank - n.rank) as gain_14d,
       w.price as price_7d, f.price as price_14d, f.mrp as mrp_14d,
       (f.mrp is not null and n.mrp = f.mrp) as same_pack,
       case when f.price > 0 and n.mrp = f.mrp then round((n.price - f.price) / f.price, 3) end as price_change_14d,
       case when f.mrp is not null and n.mrp <> f.mrp then true else false end as pack_changed_14d,
       round(n.discount_pct - f.discount_pct, 1) as discount_change_14d,
       (f.product_id is null) as new_since_14d
from snap n
cross join days dd
left join snap w on w.product_id = n.product_id and w.subcategory = n.subcategory and w.scrape_date = dd.today - 7
left join snap f on f.product_id = n.product_id and f.subcategory = n.subcategory and f.scrape_date = dd.today - 14
join product_dim d on d.product_id = n.product_id
join products p on p.product_id = n.product_id
left join brand_classification b on b.brand = p.brand
where n.scrape_date = dd.today;

-- ---------------------------------------------------------------- availability (catalogue only)
-- Shelves never list an unsellable product, so stock-outs are only visible in a brand's own catalogue.
create or replace view web_availability with (security_invoker = true) as
select c.brand, c.product_id, c.name, c.url, c.price, c.rating_count, c.subcategories, c.scrape_date
from brand_catalog c
where c.scrape_date = (select max(scrape_date) from brand_catalog) and c.in_stock is false;

-- ---------------------------------------------------------------- owner's event log
create table if not exists market_events (
  id          bigint generated always as identity primary key,
  happened_on date not null,
  ends_on     date,
  label       text not null,
  kind        text not null default 'other',   -- sale | launch | campaign | competitor | other
  brand       text,
  note        text,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists market_events_date_idx on market_events (happened_on);
alter table market_events enable row level security;
drop policy if exists "read events" on market_events;
create policy "read events" on market_events for select to authenticated using (true);
drop policy if exists "admins write events" on market_events;
create policy "admins write events" on market_events for all to authenticated
  using (exists (select 1 from app_admins a where a.email = auth.jwt() ->> 'email'))
  with check (exists (select 1 from app_admins a where a.email = auth.jwt() ->> 'email'));
grant select on market_events to authenticated;
grant insert, update, delete on market_events to authenticated;

grant select on product_category, web_product_demand, web_brand_shares, web_movement, web_availability to authenticated;
revoke all on product_category, web_product_demand, web_brand_shares, web_movement, web_availability from anon;

-- ---------------------------------------------------------------- how long each shelf has been tracked
-- A shelf added today makes every product on it look "new". Rules that compare against the past must
-- first check the shelf itself is old enough to have a past.
create or replace view web_category_coverage with (security_invoker = true) as
select subcategory as category, min(scrape_date) as first_date, max(scrape_date) as last_date,
       count(distinct scrape_date)::int as days_tracked
from scrape_snapshots group by 1;

grant select on web_category_coverage to authenticated;
revoke all on web_category_coverage from anon;

-- ---------------------------------------------------------------- variants that share a review pool
-- Nykaa serves one review pool for a product and its variants (the Volcanic mask and its Mini return the
-- same reviews), so both listings carry identical demand numbers. Products whose crawl found the same
-- newest review belong to one pool; analysis counts a pool once.
create or replace view web_review_pool with (security_invoker = true) as
select c.product_id,
       coalesce(min(c2.product_id), c.product_id) as pool_id
from review_cursor c
left join review_cursor c2 on c2.newest_review_id = c.newest_review_id and c.newest_review_id is not null
group by c.product_id;

grant select on web_review_pool to authenticated;
revoke all on web_review_pool from anon;
