-- A keyset-paginated activity feed, plus the shared normaliser it and
-- dashboard_summary both read through.
--
-- The reshaping of activity_log.metadata (which is a raw to_jsonb(new) dump
-- carrying the DB's column names) into the camelCase shape formatActivityItem
-- expects used to live inline in dashboard_summary. Now that a second caller
-- needs the identical shape, it lives in one function — two copies of this
-- CASE would drift the moment an action type is added.
--
-- SECURITY INVOKER throughout: RLS must still apply. activity_log's select
-- policy is what decides whether a caller sees the whole college or only their
-- own rows, and neither of these functions may become a way around it.

create or replace function public.normalize_activity_metadata(
  p_action text,
  p_metadata jsonb
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select case p_action
    when 'EXPENSE_CREATE' then jsonb_build_object(
      'description', p_metadata->>'label',
      'amount', (p_metadata->>'total_amount')::numeric)
    when 'CONTRIBUTION_CREATE' then jsonb_build_object(
      'investorName', (
        select i.name from public.investors i
        where i.id = (p_metadata->>'investor_id')::uuid),
      'amount', (p_metadata->>'amount')::numeric)
    when 'INVESTOR_CREATE' then jsonb_build_object(
      'name', p_metadata->>'name',
      'agreedContribution', (p_metadata->>'target_contribution')::numeric)
    else p_metadata
  end;
$function$;

revoke all on function public.normalize_activity_metadata(text, jsonb) from public, anon;
grant execute on function public.normalize_activity_metadata(text, jsonb) to authenticated;

-- Keyset, not OFFSET. Rows arrive while someone is scrolling, and an OFFSET
-- page boundary shifts under them — duplicating or skipping entries. The
-- (created_at, id) row comparison matches the composite indexes added in
-- 20260726171537 exactly, so each page is an index range scan.
--
-- The id half of the cursor is load-bearing, not defensive: the seeded log has
-- 1,699 rows sharing a single created_at, so a created_at-only cursor would
-- skip or repeat entire pages.
--
-- `cursorAt` is returned alongside the display `createdAt` and is the value the
-- client must echo back. They are NOT interchangeable: `createdAt` is
-- to_char'd to whole seconds for display, and real rows carry microseconds
-- (the seed's are all …44.028598). Paging on the truncated string would place
-- the cursor before every row in that second and silently skip them.
create or replace function public.activity_feed(
  p_college_id uuid,
  p_user_id uuid default null,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 20
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(jsonb_agg(obj order by created_at desc, id desc), '[]'::jsonb)
  from (
    select l.created_at,
           l.id,
           jsonb_build_object(
             'id',        l.id::text,
             'userId',    l.user_id::text,
             'userName',  coalesce(p.full_name, 'Utilisateur'),
             'action',    l.action,
             'createdAt', to_char(l.created_at at time zone 'UTC',
                                  'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
             'cursorAt',  l.created_at,
             'metadata',  public.normalize_activity_metadata(l.action, l.metadata)
           ) as obj
    from public.activity_log l
    left join public.profiles p on p.id = l.user_id
    where l.college_id = p_college_id
      and (p_user_id is null or l.user_id = p_user_id)
      -- Null cursor means "first page". Both cursor parts must be supplied
      -- together; a created_at without an id would drop rows sharing a
      -- timestamp.
      and (p_before_created_at is null
           or (l.created_at, l.id) < (p_before_created_at, p_before_id))
    order by l.created_at desc, l.id desc
    limit least(coalesce(p_limit, 20), 100)
  ) t;
$function$;

revoke all on function public.activity_feed(uuid, uuid, timestamptz, uuid, int) from public, anon;
grant execute on function public.activity_feed(uuid, uuid, timestamptz, uuid, int) to authenticated;
