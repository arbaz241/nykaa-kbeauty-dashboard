-- 022: the dashboard documents (021) in a compact form, ~5-10x smaller.
--
-- A tab's bundle was ~15 MB of JSON: every row repeats every field name, monthly rows repeat the product's name
-- and link, and the shelf carries Nykaa's full product description the app never shows. Moving it took 4-6 s.
-- Each document is now {"v":2,"n":rows,"c":{column: values}}: one array per column, in row order; a text or date
-- column whose values repeat is stored once as a list ("k") plus each row's position in it ("i", null for none).
-- web/lib/supabase.ts turns it back into the same rows. Columns no page reads are left out (OMIT below).

create or replace function public.web_blob_build(base text) returns json
language plpgsql security definer set search_path = public as $$
declare
  col record; n bigint; nd bigint; part text; body text := '';
  ord text := coalesce(public.web_blob_order(base), '1');
  omit text[] := array['description_text', 'preferences', 'avg_rating'];
begin
  drop table if exists pg_temp._blob;
  execute format('create temp table _blob as select row_number() over (order by %s) as _rn, * from %I', ord, base || '_snap');
  select count(*) into n from _blob;
  for col in
    select attname, format_type(atttypid, atttypmod) as typ from pg_attribute
    where attrelid = (base || '_snap')::regclass and attnum > 0 and not attisdropped and not (attname = any(omit))
    order by attnum
  loop
    nd := null;
    if col.typ in ('text', 'character varying', 'date') then
      execute format('select count(distinct %I) from _blob', col.attname) into nd;
    end if;
    if nd is not null and nd < n / 2 then
      execute format(
        'with r as (select _rn, %1$I as v, dense_rank() over (order by %1$I) - 1 as i from _blob)
         select json_build_object(
           ''k'', coalesce((select json_agg(v order by i) from (select distinct on (i) i, v from r where v is not null order by i) d), ''[]''::json),
           ''i'', coalesce((select json_agg(case when v is null then null else i end order by _rn) from r), ''[]''::json))::text',
        col.attname) into part;
    else
      execute format('select coalesce(json_agg(%I order by _rn), ''[]''::json)::text from _blob', col.attname) into part;
    end if;
    body := body || case when body = '' then '' else ',' end || to_json(col.attname::text)::text || ':' || part;
  end loop;
  drop table if exists pg_temp._blob;
  return ('{"v":2,"n":' || n || ',"c":{' || body || '}}')::json;
end $$;
revoke all on function public.web_blob_build(text) from public, anon, authenticated;

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
    insert into web_blobs (view, body, built_at) values (base, public.web_blob_build(base), now())
    on conflict (view) do update set body = excluded.body, built_at = excluded.built_at;
  end loop;
end $$;
revoke all on function public.refresh_web_snapshots() from public, anon;
grant execute on function public.refresh_web_snapshots() to authenticated, service_role;

select public.refresh_web_snapshots();
