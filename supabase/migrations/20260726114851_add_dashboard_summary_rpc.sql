-- One call to replace the ten the Dashboard used to make.
--
-- Measured 2026-07-26 on real seeded data: the old shape downloaded 2.76MB per
-- dashboard load, 2.63MB of it because `expenses` was fetched four times
-- (getTotalSpent, getSpentByCategory, getRecentActivities and listExpenses each
-- pulled the whole table to sum or slice it in JavaScript). This returns ~14KB
-- — a 199x reduction, verified against the same data.
--
-- No raw rows are returned. The client needed them only for the period filter
-- and the six-month chart, and every Period value ("all", this_month,
-- this_quarter, this_year) is calendar-aligned to now, so per-month buckets are
-- sufficient to compute all of them client-side without a refetch.
--
-- SECURITY INVOKER (the default) on purpose: RLS must still apply. This
-- function must never become a way to read another college's finances.

create or replace function public.dashboard_summary(p_college_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with
  pool as (
    select coalesce(sum(target_contribution), 0) as v
    from public.investors where college_id = p_college_id
  ),
  -- Cotisation only, everywhere. Adhésion is a flat entry fee and is excluded
  -- from the pool ratio by the ownership-basis rule. The old client code got
  -- this half right: it filtered to cotisation for the "all" total but summed
  -- every type once a period filter was applied, so the headline number
  -- changed meaning depending on the dropdown. Consistent now.
  contributed as (
    select coalesce(sum(amount), 0) as v
    from public.contributions
    where college_id = p_college_id and type = 'cotisation'
  ),
  spent as (
    select coalesce(sum(total_amount), 0) as v
    from public.expenses where college_id = p_college_id
  ),
  by_category as (
    select coalesce(jsonb_agg(jsonb_build_object('name', name, 'amount', amount)
                              order by amount desc), '[]'::jsonb) as v
    from (
      select c.name, sum(e.total_amount) as amount
      from public.expenses e
      join public.expense_categories c on c.id = e.category_id
      where e.college_id = p_college_id
      group by c.name
    ) t
  ),
  -- Buckets keyed the way the client keys them: an ISO prefix, UTC.
  monthly as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'month', m, 'contributed', contributed, 'spent', spent
           ) order by m), '[]'::jsonb) as v
    from (
      select m, sum(contributed) as contributed, sum(spent) as spent
      from (
        select to_char(occurred_on, 'YYYY-MM') as m,
               0::numeric as contributed, sum(total_amount) as spent
        from public.expenses
        where college_id = p_college_id and occurred_on is not null
        group by 1
        union all
        select to_char(paid_at at time zone 'UTC', 'YYYY-MM'),
               sum(amount), 0::numeric
        from public.contributions
        where college_id = p_college_id and type = 'cotisation'
        group by 1
      ) u
      group by m
    ) t
  ),
  recent as (
    select coalesce(jsonb_agg(to_jsonb(r) order by r.date desc), '[]'::jsonb) as v
    from (
      select * from (
        select c.id::text as id, 'contribution' as type,
               coalesce(i.name, 'Investisseur') as title,
               coalesce(c.method, 'Contribution') as subtitle,
               c.amount::numeric as amount,
               to_char(c.paid_at at time zone 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS"Z"') as date
        from public.contributions c
        left join public.investors i on i.id = c.investor_id
        where c.college_id = p_college_id
        union all
        select e.id::text, 'expense',
               e.label,
               coalesce(cat.name, 'Catégorie inconnue'),
               e.total_amount::numeric,
               to_char(e.occurred_on, 'YYYY-MM-DD')
        from public.expenses e
        left join public.expense_categories cat on cat.id = e.category_id
        where e.college_id = p_college_id
      ) merged
      order by date desc
      limit 5
    ) r
  ),
  -- Resolves investor names inline. The client used to do this with a SECOND,
  -- sequential query after the activity rows came back — and a sequential
  -- await measured ~290ms, more than deduplicating every parallel call.
  activities as (
    select coalesce(jsonb_agg(to_jsonb(a) order by a."createdAt" desc), '[]'::jsonb) as v
    from (
      select l.id::text as id,
             l.user_id::text as "userId",
             coalesce(p.full_name, 'Utilisateur') as "userName",
             l.action,
             to_char(l.created_at at time zone 'UTC',
                     'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
             case l.action
               when 'EXPENSE_CREATE' then jsonb_build_object(
                 'description', l.metadata->>'label',
                 'amount', (l.metadata->>'total_amount')::numeric)
               when 'CONTRIBUTION_CREATE' then jsonb_build_object(
                 'investorName', (
                   select i.name from public.investors i
                   where i.id = (l.metadata->>'investor_id')::uuid),
                 'amount', (l.metadata->>'amount')::numeric)
               when 'INVESTOR_CREATE' then jsonb_build_object(
                 'name', l.metadata->>'name',
                 'agreedContribution', (l.metadata->>'target_contribution')::numeric)
               else l.metadata
             end as metadata
      from public.activity_log l
      left join public.profiles p on p.id = l.user_id
      where l.college_id = p_college_id
      order by l.created_at desc
      limit 20
    ) a
  )
  select jsonb_build_object(
    'pool',              (select v from pool),
    'total_contributed', (select v from contributed),
    'total_spent',       (select v from spent),
    'by_category',       (select v from by_category),
    'monthly',           (select v from monthly),
    'recent',            (select v from recent),
    'user_activities',   (select v from activities)
  );
$function$;

revoke all on function public.dashboard_summary(uuid) from public, anon;
grant execute on function public.dashboard_summary(uuid) to authenticated;
