-- The dashboard reported a false negative balance: it computed
-- `total_contributed - total_spent` where total_contributed was cotisation
-- only, so the 178,500,000 XOF sitting in `other_income` and the 3,750,000 of
-- adhésion were both missing from the numerator. On real seeded data that
-- showed -102,928,756 F CFA when the true position is +79,321,244.
--
-- Fixed by returning `total_resources` — the same definition the `college_pool`
-- view already uses (every contribution, both types, plus other income),
-- because both are real cash received. `total_contributed` stays cotisation-only
-- and keeps its old meaning: it is the ownership-basis figure and the series the
-- chart draws.
--
-- `monthly` gains `resources` and `other_income` buckets so the period filter
-- and the footer breakdown can both be computed client-side without a refetch.
-- Buckets stay calendar-aligned.

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
  other_income_total as (
    select coalesce(sum(amount), 0) as v
    from public.other_income where college_id = p_college_id
  ),
  -- Total spendable cash. Deliberately broader than `contributed`: adhésion is
  -- money actually received even though it confers no ownership, and other
  -- income (student fees) is the largest single source. Mirrors the
  -- `college_pool` view exactly — if that definition changes, change it here
  -- too or the dashboard and the pool view will disagree.
  resources as (
    select (select coalesce(sum(amount), 0) from public.contributions
            where college_id = p_college_id)
         + (select v from other_income_total) as v
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
  -- `contributed` is cotisation only; `resources` is every cash inflow;
  -- `other_income` is broken out so the period-filtered footer can name it
  -- without a second call.
  monthly as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'month', m, 'contributed', contributed,
             'resources', resources, 'other_income', other_income,
             'spent', spent
           ) order by m), '[]'::jsonb) as v
    from (
      select m,
             sum(contributed) as contributed,
             sum(resources) as resources,
             sum(other_income) as other_income,
             sum(spent) as spent
      from (
        select to_char(occurred_on, 'YYYY-MM') as m,
               0::numeric as contributed, 0::numeric as resources,
               0::numeric as other_income,
               sum(total_amount) as spent
        from public.expenses
        where college_id = p_college_id and occurred_on is not null
        group by 1
        union all
        select to_char(paid_at at time zone 'UTC', 'YYYY-MM'),
               coalesce(sum(amount) filter (where type = 'cotisation'), 0),
               sum(amount),
               0::numeric,
               0::numeric
        from public.contributions
        where college_id = p_college_id
        group by 1
        union all
        select to_char(occurred_on, 'YYYY-MM'),
               0::numeric, sum(amount), sum(amount), 0::numeric
        from public.other_income
        where college_id = p_college_id
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
    'total_other_income',(select v from other_income_total),
    'total_resources',   (select v from resources),
    'total_spent',       (select v from spent),
    'by_category',       (select v from by_category),
    'monthly',           (select v from monthly),
    'recent',            (select v from recent),
    'user_activities',   (select v from activities)
  );
$function$;

revoke all on function public.dashboard_summary(uuid) from public, anon;
grant execute on function public.dashboard_summary(uuid) to authenticated;
