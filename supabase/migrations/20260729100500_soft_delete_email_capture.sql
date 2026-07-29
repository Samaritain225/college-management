-- handle_updated_user() (20260725012345_sync_profiles_from_auth_users.sql)
-- syncs profiles.email from auth.users on every email change, including the
-- tombstone write a soft delete makes to free the address for reuse. Without
-- a separate column, that trigger overwrites the one place the plan intended
-- to keep the real address readable — discovered before it shipped, not
-- after, by tracing the trigger rather than assuming profiles.email would
-- hold still.

alter table profiles add column deleted_email text;

revoke update (deleted_email) on profiles from authenticated;
