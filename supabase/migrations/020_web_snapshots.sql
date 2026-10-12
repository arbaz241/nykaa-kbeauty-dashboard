-- 020: ready-made copies of the views the dashboard reads in full.
--
-- Each web_* view is recomputed from the raw history on every request, and the app reads most of them whole,
-- 1,000 rows a page: the Demand tab alone asks for ~45 pages (~14 MB). On this database that took 5-7 s a tab.
-- The data changes once a night, so each such view gets a materialized copy, web_<view>_snap, that the app
-- reads instead. The views themselves are unchanged (the scraper and per-product reads keep using them).
--
-- refresh_web_snapshots() rebuilds every copy. It runs after the nightly scrape (scrape.yml), after the USP and
-- thumbnail scripts, and after an admin edits a brand's origin. A materialized view has no row-level security:
-- access is by grant only, so each copy is readable by signed-in users and not by anon, as the views were.

do $$
declare
  v text;
  views text[] := array[
    'web_latest_shelf', 'web_review_months', 'web_latest_search', 'web_latest_assortment', 'web_brand_catalog',
    'web_share_daily', 'web_brand_daily', 'web_search_history', 'web_suggestions_latest', 'web_movement',
    'web_brand_shares', 'web_product_demand', 'web_availability', 'web_category_coverage', 'web_thumbnails',
    'web_usp_products', 'web_usp_comparisons'];
begin
  foreach v in array views loop
    execute format('drop materialized view if exists %I', v || '_snap');
    execute format('create materialized view %I as select * from %I', v || '_snap', v);
    execute format('revoke all on %I from public, anon, authenticated', v || '_snap');
    execute format('grant select on %I to authenticated, service_role', v || '_snap');
  end loop;
end $$;

-- the app pages through each copy in a fixed order (web/lib/supabase.ts ORDER); index those columns
create index on web_latest_shelf_snap (subcategory, rank, product_id);
create index on web_review_months_snap (product_id, month);
create index on web_latest_search_snap (query, sample, rank, product_id);
create index on web_latest_assortment_snap (brand);
create index on web_brand_catalog_snap (brand, product_id);
create index on web_share_daily_snap (scrape_date, subcategory, origin);
create index on web_brand_daily_snap (scrape_date, brand, subcategory);
create index on web_search_history_snap (scrape_date, query, sample, rank, product_id);
create index on web_suggestions_latest_snap (seed, kind, position);
create index on web_movement_snap (category, product_id);
create index on web_brand_shares_snap (scrape_date, brand);
create index on web_product_demand_snap (product_id);
create index on web_availability_snap (brand, product_id);
create index on web_category_coverage_snap (category);
create index on web_thumbnails_snap (product_id);
create index on web_usp_products_snap (product_id);
create index on web_usp_comparisons_snap (anchor_product_id);

-- Rebuild every copy. Callable by the service role (scraper, scripts) and by app admins (after a brand edit).
create or replace function public.refresh_web_snapshots() returns void
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if coalesce(auth.role(), 'service_role') <> 'service_role' and not public.is_app_admin() then
    raise exception 'only the scraper or an admin can refresh the dashboard copies';
  end if;
  for v in select matviewname from pg_matviews where schemaname = 'public' and matviewname like 'web\_%\_snap' loop
    execute format('refresh materialized view %I', v.matviewname);
  end loop;
end $$;
revoke all on function public.refresh_web_snapshots() from public, anon;
grant execute on function public.refresh_web_snapshots() to authenticated, service_role;

notify pgrst, 'reload schema';
