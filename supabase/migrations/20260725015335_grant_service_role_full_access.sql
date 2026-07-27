-- Recovered from the remote migration history on 2026-07-26: this file was
-- applied but never mirrored locally, so `supabase migration list` showed it
-- as remote-only. Content is exactly what ran.
-- service_role bypasses RLS, but only once it actually has the base table
-- grant — Postgres checks table-level privileges before RLS is ever
-- evaluated. The initial migration only granted `authenticated`; every
-- admin.from(...) call from the admin-users Edge Function was hitting
-- "permission denied" as a result, not RLS filtering.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;

-- Same story for future tables in this schema.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
