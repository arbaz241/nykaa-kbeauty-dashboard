-- Open sign-up model (owner decision 2026-09-14): anyone may register and read,
-- but only listed admins may edit brand classifications.
-- Apply after 001. Idempotent.

create table if not exists app_admins (
  email       text primary key,
  added_at    timestamptz not null default now(),
  note        text
);
alter table app_admins enable row level security;
-- Everyone logged in may check the list (the app needs it); only the
-- service role / SQL editor can change it.
drop policy if exists "read admins" on app_admins;
create policy "read admins" on app_admins for select to authenticated using (true);
grant select on app_admins to authenticated;

-- Tighten the brand_classification update policy to admins only (defence in
-- depth: the dashboard also checks this before showing the editor).
drop policy if exists "edit brands" on brand_classification;
create policy "edit brands" on brand_classification for update to authenticated
  using  (lower(coalesce(auth.jwt() ->> 'email', '')) in (select lower(email) from app_admins))
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) in (select lower(email) from app_admins));

-- Initial admin: the project owner. Add more with:
--   insert into app_admins (email) values ('someone@example.com');
insert into app_admins (email, note) values ('arbazhussain241@gmail.com', 'owner')
on conflict (email) do nothing;
