-- Forced first-password onboarding.
--
-- New users are now created without a password at all: admin-users mints a
-- one-time link, mails it via Resend, and the person lands on the platform
-- already in a session but with no credential they chose themselves. This
-- flag is what holds them on the "choose your password" screen until they do
-- — and it is re-armed whenever an admin sets a password for someone, so an
-- admin-chosen password is always temporary.

alter table profiles add column must_set_password boolean not null default false;

-- profiles_update_own (using auth.uid() = id) would otherwise let anyone
-- clear their own gate with a direct PATCH. Same column-level revoke as
-- deleted_at/deleted_by (20260729100000) and is_system_account
-- (20260730141652) — every other field on this row stays self-editable.
-- admin-users runs as service_role and bypasses column grants entirely.
revoke update (must_set_password) on profiles from authenticated;

-- The one sanctioned way to clear it. Scoped to auth.uid() and nothing else,
-- so it cannot be turned into a lever against another account: there is no
-- parameter to point at someone else's row.
--
-- The caller runs this immediately after supabase.auth.updateUser({password})
-- succeeds. Deliberately not gated on "did a password actually get set" —
-- this function cannot see auth.users' encrypted_password, and GoTrue has
-- already enforced its own policy by the time we get here.
create or replace function public.complete_password_setup()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set must_set_password = false where id = auth.uid();
$$;

revoke execute on function public.complete_password_setup() from public, anon;
grant execute on function public.complete_password_setup() to authenticated;
