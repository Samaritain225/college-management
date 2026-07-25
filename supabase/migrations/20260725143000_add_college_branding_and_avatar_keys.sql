-- College branding + profile avatars, and the R2 object keys that back them.
--
-- Until now the college's name, logo, address, phone and academic year lived
-- only in each browser's localStorage (src/lib/settings.tsx), so they were
-- per-device: renaming the college on one laptop changed nothing for anyone
-- else, and clearing site data reset it. These columns make them real shared
-- state and give the R2 upload path somewhere to store its object keys.
--
-- Only *_key is stored, never a URL — the public base URL and bucket are
-- deployment config (VITE_R2_PUBLIC_BASE_URL), so moving buckets or putting a
-- custom domain in front doesn't require rewriting rows.

alter table colleges
  add column if not exists logo_key      text,
  add column if not exists address       text,
  add column if not exists phone         text,
  add column if not exists academic_year text;

alter table profiles
  add column if not exists avatar_key text;

-- Distinct from can_manage_finance(), which also grants treasurer: a treasurer
-- records money but does not rename the institution or replace its logo.
create or replace function private.can_manage_college(target_college uuid)
returns boolean as $$
  select private.is_super_admin() or exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and college_id = target_college
      and role_id = 'admin'
  );
$$ language sql stable security definer set search_path = '';

-- colleges already carried a table-level UPDATE grant from the initial
-- schema, but had a select policy and *no* update policy — so RLS denied
-- every write and the table was effectively read-only for everyone. The
-- policy is the missing piece; no new grant is needed here (and a
-- column-level grant would be a no-op anyway, since Postgres takes the union
-- with the existing table-level one and that already covers new columns).
drop policy if exists colleges_update on colleges;
create policy colleges_update on colleges for update to authenticated
  using ((select private.can_manage_college(id)))
  with check ((select private.can_manage_college(id)));

-- profiles needs nothing: the table-level UPDATE grant plus the existing
-- profiles_update_own policy already cover avatar_key.
