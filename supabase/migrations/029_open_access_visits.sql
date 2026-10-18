-- 029 (owner 18 Oct 2026: "disable the sign in... open to other people... without creating an account... track
-- that through their IP address... only available to me"). Additive.
--
-- 1. app_settings.require_login (false = open): readable by everyone, changed only by an admin (Admin › People).
--    While open, the site signs each visitor in as a guest (Supabase anonymous sign-in, a project setting turned on
--    in the Supabase dashboard), so every existing permission works unchanged: guests read, only admins write.
--    Turning sign-in back on removes every guest account at once, which ends their sessions.
-- 2. app_visits gains the visitor's IP address, browser, a per-browser id and whether they were a guest, written
--    by log_visit() from the request itself. Only admins can read visits (admin_visit_log, admin_visitors).
-- 3. admin_users lists real accounts only (not guests).

create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table app_settings enable row level security;
drop policy if exists "read settings" on app_settings;
create policy "read settings" on app_settings for select to anon, authenticated using (true);
revoke all on app_settings from anon, authenticated;
grant select on app_settings to anon, authenticated;
insert into app_settings (key, value, updated_by) values ('require_login', 'false', 'owner, 18 Oct 2026')
on conflict (key) do nothing;

alter table app_visits add column if not exists ip text;
alter table app_visits add column if not exists user_agent text;
alter table app_visits add column if not exists visitor text;
alter table app_visits add column if not exists guest boolean not null default false;
alter table app_visits add column if not exists referrer text;
create index if not exists app_visits_ip_at on app_visits (ip, at desc);

create or replace function public.log_visit(p_path text, p_visitor text default null, p_referrer text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  h json := nullif(current_setting('request.headers', true), '')::json;
  addr text;
begin
  if auth.uid() is null then return; end if;
  addr := coalesce(h ->> 'cf-connecting-ip', split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1), h ->> 'x-real-ip');
  insert into public.app_visits (user_id, path, ip, user_agent, visitor, guest, referrer)
  values (auth.uid(), left(coalesce(p_path, ''), 300), nullif(trim(addr), ''), left(h ->> 'user-agent', 300), left(p_visitor, 64),
          coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false), left(p_referrer, 300));
end $$;
revoke all on function public.log_visit(text, text, text) from public, anon;
grant execute on function public.log_visit(text, text, text) to authenticated;

create or replace function public.set_require_login(p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'admins only'; end if;
  update public.app_settings set value = to_jsonb(p_on), updated_at = now(), updated_by = auth.jwt() ->> 'email' where key = 'require_login';
  if p_on then delete from auth.users where is_anonymous; end if;   -- every guest session ends now
end $$;
revoke all on function public.set_require_login(boolean) from public, anon;
grant execute on function public.set_require_login(boolean) to authenticated;

-- every visit, newest first, with who (account email or "guest"), where from (IP) and on what (browser)
create or replace function public.admin_visit_log(p_days int default 7, p_limit int default 500)
returns table (at timestamptz, who text, guest boolean, ip text, visitor text, path text, user_agent text, referrer text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'admins only'; end if;
  return query
  select v.at, coalesce(u.email::text, 'guest'), v.guest, v.ip, v.visitor, v.path, v.user_agent, v.referrer
  from public.app_visits v left join auth.users u on u.id = v.user_id
  where v.at > now() - make_interval(days => p_days)
  order by v.at desc limit p_limit;
end $$;
revoke all on function public.admin_visit_log(int, int) from public, anon;
grant execute on function public.admin_visit_log(int, int) to authenticated;

-- one row per browser (or per IP for visits logged before browser ids existed)
create or replace function public.admin_visitors(p_days int default 7)
returns table (visitor text, who text, guest boolean, ips text, first_at timestamptz, last_at timestamptz, visits int, pages int, last_page text, user_agent text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'admins only'; end if;
  return query
  with v as (
    select w.*, coalesce(w.visitor, w.ip, w.user_id::text) as k, u.email::text as email
    from public.app_visits w left join auth.users u on u.id = w.user_id
    where w.at > now() - make_interval(days => p_days)
  )
  select v.k, coalesce(max(v.email), 'guest'), bool_and(v.guest), string_agg(distinct v.ip, ', '), min(v.at), max(v.at),
         count(*)::int, count(distinct v.path)::int,
         (array_agg(v.path order by v.at desc))[1], (array_agg(v.user_agent order by v.at desc))[1]
  from v group by v.k order by max(v.at) desc;
end $$;
revoke all on function public.admin_visitors(int) from public, anon;
grant execute on function public.admin_visitors(int) to authenticated;

CREATE OR REPLACE FUNCTION public.admin_users()
 RETURNS TABLE(id uuid, email text, joined_at timestamp with time zone, confirmed boolean, last_sign_in_at timestamp with time zone, last_active_at timestamp with time zone, blocked boolean, is_admin boolean, visits_30d integer, last_page text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_app_admin() then raise exception 'admins only'; end if;
  return query
  select u.id, u.email::text, u.created_at, u.email_confirmed_at is not null, u.last_sign_in_at,
         greatest(u.last_sign_in_at, s.last_refresh, v.last_visit),
         coalesce(u.banned_until > now(), false),
         exists (select 1 from public.app_admins a where lower(a.email) = lower(u.email)),
         coalesce(v.n30, 0)::int, v.last_page
  from auth.users u
  left join lateral (select max(coalesce(x.refreshed_at, x.updated_at)) as last_refresh
                     from auth.sessions x where x.user_id = u.id) s on true
  left join lateral (select max(w.at) as last_visit,
                            count(*) filter (where w.at > now() - interval '30 days') as n30,
                            (select w2.path from public.app_visits w2 where w2.user_id = u.id order by w2.at desc limit 1) as last_page
                     from public.app_visits w where w.user_id = u.id) v on true
  where not coalesce(u.is_anonymous, false)
  order by u.created_at desc;
end $function$;

notify pgrst, 'reload schema';
