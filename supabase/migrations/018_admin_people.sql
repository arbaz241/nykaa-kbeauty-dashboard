-- Admin › People (owner request 2026-10-12): the admin sees every account (who joined, when, their id,
-- last activity, pages opened) and controls access: make or remove admins, block or delete an account.
-- Sign-up stays open to anyone (owner decision 2026-09-14, reconfirmed 2026-10-12).
-- The site is a static page with only the public key, so every admin action is a database function that
-- checks the caller is in app_admins before doing anything. Apply after 002. Idempotent.

-- Is the signed-in caller an admin?
create or replace function public.is_app_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins a
                 where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- One row per dashboard page opened. Users may only add their own rows; only admins read them (via functions).
create table if not exists app_visits (
  id      bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  path    text not null,
  at      timestamptz not null default now()
);
create index if not exists app_visits_user_at on app_visits (user_id, at desc);
create index if not exists app_visits_at on app_visits (at desc);
alter table app_visits enable row level security;
drop policy if exists "log own visit" on app_visits;
create policy "log own visit" on app_visits for insert to authenticated with check (user_id = auth.uid());
grant insert on app_visits to authenticated;

-- ---------- admin functions (each refuses non-admins) ----------

create or replace function public.admin_users()
returns table (id uuid, email text, joined_at timestamptz, confirmed boolean, last_sign_in_at timestamptz,
               last_active_at timestamptz, blocked boolean, is_admin boolean, visits_30d int, last_page text)
language plpgsql stable security definer set search_path = '' as $$
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
  order by u.created_at desc;
end $$;

create or replace function public.admin_visits(p_limit int default 200)
returns table (at timestamptz, email text, path text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'admins only'; end if;
  return query
  select w.at, coalesce(u.email::text, '(deleted account)'), w.path
  from public.app_visits w left join auth.users u on u.id = w.user_id
  order by w.at desc limit least(greatest(p_limit, 1), 1000);
end $$;

create or replace function public.admin_set_admin(p_email text, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'admins only'; end if;
  if not p_on and lower(trim(p_email)) = lower(auth.jwt() ->> 'email') then
    raise exception 'You cannot remove your own admin access';
  end if;
  if p_on then
    insert into public.app_admins (email, note) values (lower(trim(p_email)), 'added by ' || (auth.jwt() ->> 'email'))
    on conflict (email) do nothing;
  else
    delete from public.app_admins where lower(email) = lower(trim(p_email));
  end if;
end $$;

-- Block: the account can no longer sign in, and its saved logins are ended (an already-open page keeps
-- working for at most an hour, until its sign-in token expires). Unblock restores sign-in.
create or replace function public.admin_set_blocked(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'admins only'; end if;
  if p_user = auth.uid() then raise exception 'You cannot block your own account'; end if;
  update auth.users set banned_until = case when p_on then 'infinity'::timestamptz else null end where id = p_user;
  if p_on then delete from auth.sessions where user_id = p_user; end if;
end $$;

create or replace function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'admins only'; end if;
  if p_user = auth.uid() then raise exception 'You cannot delete your own account'; end if;
  delete from public.app_visits where user_id = p_user;
  delete from auth.users where id = p_user;
end $$;

-- Only signed-in users may call these (and each function then checks for admin).
do $$ declare f text; begin
  foreach f in array array['is_app_admin()', 'admin_users()', 'admin_visits(int)', 
    'admin_set_admin(text, boolean)',
    'admin_set_blocked(uuid, boolean)', 'admin_delete_user(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
