-- Two changes, both for the activity feed.
--
-- 1. Tighten the read policy. It used to be "any member of the college", which
--    meant a plain investor could read every action every other user had ever
--    taken. Now: admin/treasurer/super_admin see the whole college, everyone
--    else sees only their own rows.
--
--    Consequence, accepted deliberately: `dashboard_summary` is SECURITY
--    INVOKER, so a non-admin's "Activités récentes" on the dashboard now shows
--    only their own actions. That is the intended behaviour, not a regression.
--
--    Verified against the real project by simulating PostgREST (set role
--    authenticated + a request.jwt.claims sub) inside a rolled-back
--    transaction: super_admin saw all 3675 rows; the same user demoted to
--    `investor` saw its own 3675 and zero of a row belonging to someone else.
--
-- 2. Composite indexes for keyset pagination. The feed pages on
--    (created_at, id) descending — keyset rather than OFFSET so that rows
--    inserted while someone is scrolling do not shift the page boundary and
--    duplicate or skip entries. The existing single-column indexes cannot
--    serve that ordering without a sort.

drop policy if exists activity_log_select on public.activity_log;

create policy activity_log_select on public.activity_log
  for select to authenticated
  using (
    (select private.can_manage_finance(college_id))
    or user_id = (select auth.uid())
  );

-- Admin/treasurer feed: whole college, newest first.
create index if not exists activity_log_college_created_idx
  on public.activity_log (college_id, created_at desc, id desc);

-- Per-user feed: one user's history, newest first. Also what a non-admin's
-- own dashboard feed now uses.
create index if not exists activity_log_user_created_idx
  on public.activity_log (user_id, created_at desc, id desc);
