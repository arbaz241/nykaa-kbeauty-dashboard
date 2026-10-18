-- 028 (owner OK 18 Oct 2026, plan v4 decision 1): the preview counts a product only in the category Nykaa files it
-- under (its L3 label, e.g. a sheet mask on the "Masks & peels" list is filed under "Sheet Masks"). The label is
-- already saved every night in scrape_snapshots.nykaa_l3; this adds it to the preview's daily copy. One column
-- appended; nothing else changes. The live site does not read web_shelf_daily.

create or replace view web_shelf_daily with (security_invoker = true) as
select s.scrape_date, s.subcategory, s.product_id, s.rank, s.price, s.mrp, s.rating_count,
       s.is_ad, s.has_offer, s.in_stock, s.nykaa_l3
from scrape_snapshots s
where s.scrape_date >= current_date - 120;

drop materialized view if exists web_shelf_daily_snap;
create materialized view web_shelf_daily_snap as select * from web_shelf_daily;
revoke all on web_shelf_daily_snap from public, anon, authenticated;
grant select on web_shelf_daily_snap to authenticated, service_role;
create index on web_shelf_daily_snap (scrape_date, subcategory, rank, product_id);

select public.refresh_web_snapshots();

notify pgrst, 'reload schema';
