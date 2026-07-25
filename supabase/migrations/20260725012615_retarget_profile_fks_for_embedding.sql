-- investors.user_id, expenses.recorded_by, and activity_log.user_id were
-- FKed to auth.users(id) — correct for referential integrity, but
-- PostgREST can only auto-embed a related table through a real FK, and
-- the client queries this app needs (e.g. investors.select("...,
-- profiles(full_name, email)")) go through public.profiles, not
-- auth.users (which isn't exposed to the client at all). Retargeting to
-- profiles(id) preserves the same integrity guarantee — profiles.id IS
-- auth.users.id 1:1, kept in sync by the handle_new_user trigger — while
-- giving PostgREST a path to embed.

alter table investors drop constraint investors_user_id_fkey;
alter table investors add constraint investors_user_id_fkey
  foreign key (user_id) references profiles(id);

alter table expenses drop constraint expenses_recorded_by_fkey;
alter table expenses add constraint expenses_recorded_by_fkey
  foreign key (recorded_by) references profiles(id);

alter table activity_log drop constraint activity_log_user_id_fkey;
alter table activity_log add constraint activity_log_user_id_fkey
  foreign key (user_id) references profiles(id);
