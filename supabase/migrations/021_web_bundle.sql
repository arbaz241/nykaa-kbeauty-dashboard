-- 021: each dashboard copy as one ready-made JSON document, served in one request per page.
--
-- With the copies from 020 each read was fast, but a tab still sent ~25-45 requests (1,000 rows a page) and the
-- API serves only a few at a time, so even a one-row read waited ~2 s in the queue. Now refresh_web_snapshots()
-- also writes every copy as a single JSON array (in the order the app pages them), and web_bundle(names) returns
-- the ones a page asks for in one response. The copies and the views are unchanged.

create table if not exists web_blobs (
  view     text primary key,
  body     json not null,
  built_at timestamptz not null default now()
);
alter table web_blobs enable row level security;
drop policy if exists "read blobs" on web_blobs;
create policy "read blobs" on web_blobs for select to authenticated using (true);
revoke all on web_blobs from public, anon, authenticated;
grant select on web_blobs to authenticated;

-- the order each copy is paged in (web/lib/supabase.ts ORDER), so the document matches a paged read row for row
create or replace function public.web_blob_order(v text) returns text language sql immutable as $$
  select case v
    when 'web_latest_shelf' then 'subcategory, rank, product_id'
    when 'web_review_months' then 'product_id, month'
    when 'web_latest_search' then 'query, sample, rank, product_id'
    when 'web_latest_assortment' then 'brand'
    when 'web_brand_catalog' then 'brand, product_id'
    when 'web_share_daily' then 'scrape_date, subcategory, origin'
    when 'web_brand_daily' then 'scrape_date, brand, subcategory'
    when 'web_search_history' then 'scrape_date, query, sample, rank, product_id'
    when 'web_suggestions_latest' then 'seed, kind, position'
    when 'web_movement' then 'category, product_id'
    when 'web_brand_shares' then 'scrape_date, brand'
    when 'web_product_demand' then 'product_id'
    when 'web_availability' then 'brand, product_id'
    when 'web_category_coverage' then 'category'
    when 'web_thumbnails' then 'product_id'
    when 'web_usp_products' then 'product_id'
    when 'web_usp_comparisons' then 'anchor_product_id'
  end $$;

create or replace function public.refresh_web_snapshots() returns void
language plpgsql security definer set search_path = public as $$
declare v record; base text;
begin
  if coalesce(auth.role(), 'service_role') <> 'service_role' and not public.is_app_admin() then
    raise exception 'only the scraper or an admin can refresh the dashboard copies';
  end if;
  for v in select matviewname from pg_matviews where schemaname = 'public' and matviewname like 'web\_%\_snap' loop
    execute format('refresh materialized view %I', v.matviewname);
    base := left(v.matviewname, -5);
    execute format(
      'insert into web_blobs (view, body, built_at) select %L, coalesce(json_agg(t order by %s), ''[]''::json), now() from %I t
       on conflict (view) do update set body = excluded.body, built_at = excluded.built_at',
      base, coalesce(public.web_blob_order(base), '1'), v.matviewname);
  end loop;
end $$;
revoke all on function public.refresh_web_snapshots() from public, anon;
grant execute on function public.refresh_web_snapshots() to authenticated, service_role;

-- The documents a page asks for, as {view: rows}, in one response. Runs as the caller: signed-in users only.
create or replace function public.web_bundle(names text[]) returns json
language sql stable as $$
  select coalesce(json_object_agg(view, body), '{}'::json) from web_blobs where view = any(names)
$$;
revoke all on function public.web_bundle(text[]) from public, anon;
grant execute on function public.web_bundle(text[]) to authenticated;

select public.refresh_web_snapshots();

notify pgrst, 'reload schema';
