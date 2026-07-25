-- Follow-up fixes from get_advisors after the initial schema migration.

-- log_activity() is a trigger function, never meant to be called directly,
-- but SECURITY DEFINER functions get EXECUTE granted to PUBLIC by default,
-- which the security advisor correctly flags as exposing it over
-- /rest/v1/rpc/log_activity to anon and authenticated.
revoke execute on function log_activity() from public, anon, authenticated;

-- college_settings_update wrapped its top-level private.is_super_admin()
-- call but missed the auth.uid() references inside the nested exists()
-- clauses — those still re-evaluate per row instead of once per statement.
drop policy college_settings_update on college_settings;
create policy college_settings_update on college_settings for update to authenticated
  using (
    (select private.is_super_admin()) or exists (
      select 1 from user_roles
      where user_id = (select auth.uid()) and college_id = college_settings.college_id and role_id = 'admin'
    )
  )
  with check (
    (select private.is_super_admin()) or exists (
      select 1 from user_roles
      where user_id = (select auth.uid()) and college_id = college_settings.college_id and role_id = 'admin'
    )
  );

-- Covering indexes for foreign keys that will be queried often: "who
-- recorded this", "who created this roster entry", reversal lookups.
create index contributions_recorded_by_idx on contributions(recorded_by);
create index other_income_recorded_by_idx on other_income(recorded_by);
create index expenses_recorded_by_idx on expenses(recorded_by);
create index expenses_reverses_expense_id_idx on expenses(reverses_expense_id);
create index expense_payments_college_id_idx on expense_payments(college_id);
create index expense_payments_recorded_by_idx on expense_payments(recorded_by);
create index investors_created_by_idx on investors(created_by);
create index investors_user_id_idx on investors(user_id);
create index suppliers_created_by_idx on suppliers(created_by);
create index activity_log_user_id_idx on activity_log(user_id);
create index user_roles_role_id_idx on user_roles(role_id);
