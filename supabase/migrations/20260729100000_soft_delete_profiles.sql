-- Soft delete for profiles — Part 2 of docs/access-lifecycle-plan-2026-07-29.md.
--
-- Today admin-users' DELETE either hard-erases a profile or refuses with 409
-- when expenses/activity_log/investors reference it. This adds the columns
-- that let the edge function fall back to a soft delete instead of refusing:
-- the account is banned permanently, its auth email is tombstoned so the
-- address becomes reusable, and the profiles row survives so financial
-- history stays attributable to a name instead of an orphaned uuid.

alter table profiles
  add column deleted_at timestamptz,
  add column deleted_by uuid references profiles(id);

-- profiles_update_own (using auth.uid() = id) would otherwise let any user
-- mark their own account deleted — this must only ever be set by
-- admin-users, running as service_role, which bypasses column grants
-- entirely. Column-level revoke rather than a policy change, since every
-- other field on this row is still meant to be self-editable.
revoke update (deleted_at, deleted_by) on profiles from authenticated;
