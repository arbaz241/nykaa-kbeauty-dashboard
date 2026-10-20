# Migrations

From 30 Oct 2026 Supabase no longer grants Data API access to new tables in `public` automatically
(email to the owner, 20 Oct 2026). Tables created before that date keep their grants.

Every migration that creates a table must grant access in the same file:

```sql
create table if not exists example (...);
alter table example enable row level security;
-- the dashboard reads (signed-in and guest visitors are both `authenticated`)
grant select on example to authenticated;
-- the nightly collector writes through the Data API with the service-role key
grant select, insert, update, delete on example to service_role;
```

Without the `service_role` grant, the nightly run fails with "permission denied" on that table.
