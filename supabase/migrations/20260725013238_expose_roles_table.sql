-- roles is a static 5-row lookup table (no sensitive data, same for every
-- college) — missed in the initial migration's RLS/grants pass. Any
-- authenticated user can read it; nothing here needs row-level scoping.
alter table roles enable row level security;
create policy roles_select on roles for select to authenticated using (true);
grant select on roles to authenticated;
