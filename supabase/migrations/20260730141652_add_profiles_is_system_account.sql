-- Lets a profile be excluded from the admin Users list (admin-users edge
-- function's LIST handler) for every caller, while still appearing normally
-- in the activity feed (a separate code path — activity_log + profiles,
-- unaffected by this flag). Exists for bootstrap/service accounts such as
-- the initial super_admin created directly in each project's Auth
-- Dashboard, not for anything a client should ever set itself.

alter table profiles add column is_system_account boolean not null default false;

revoke update (is_system_account) on profiles from authenticated;
