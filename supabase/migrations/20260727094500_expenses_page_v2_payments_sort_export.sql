-- expenses_page v2: adds what the expenses UX benchmark (2026-07-27) found
-- missing — payment state, a same-length prior-period comparison, the
-- filtered-set total, sortable columns, and the largest expense of the
-- period. Also adds expenses_export, a companion function for a full,
-- unpaged CSV pull.
--
-- See docs/expenses-ux-benchmark-2026-07-27.md and
-- docs/expenses-page-plan-2026-07-27.md for the reasoning behind each field.
--
-- `create or replace` on the existing signature plus two new optional
-- trailing parameters (p_sort, p_dir) — an old client that doesn't pass them
-- keeps working, and the new columns in the JSON response are additive.

create or replace function public.expenses_page(
  p_college_id uuid,
  p_search text default null,
  p_category_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_limit int default 10,
  p_offset int default 0,
  p_sort text default 'date',
  p_dir text default 'desc'
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with
  -- nullif so that an empty or whitespace-only search box means "no filter",
  -- not "match the empty string".
  q as (select nullif(btrim(coalesce(p_search, '')), '') as term),

  -- Same-length comparison window immediately preceding the requested period,
  -- clamped to "so far" when p_to is still in the future (a mid-month "this
  -- month" filter). Comparing 27 days of July against a full 30-day June
  -- would read as a bigger swing than actually happened — this is what makes
  -- the KPI footer's percentage honest. Null p_from ("Toutes les périodes")
  -- means no comparison is possible; every prev_* field comes back null and
  -- the client hides the comparison rather than inventing one.
  window_calc as (
    select
      case when p_from is null then null
           else least(coalesce(p_to, current_date), current_date) - p_from + 1
      end as elapsed_days
  ),
  prev_window as (
    select
      case when p_from is null then null else p_from - w.elapsed_days end as prev_from,
      case when p_from is null then null else p_from - 1 end as prev_to
    from window_calc w
  ),

  -- Date range only. Feeds the KPI strip and the per-category totals — and
  -- now also the payment aggregates and the period's largest expense.
  period_scope as (
    select e.id, e.category_id, e.total_amount, e.occurred_on, e.label,
           c.name as category_name
    from public.expenses e
    left join public.expense_categories c on c.id = e.category_id
    where e.college_id = p_college_id
      and (p_from is null or e.occurred_on >= p_from)
      and (p_to   is null or e.occurred_on <= p_to)
  ),
  period_payments as (
    select p.expense_id, sum(p.amount) as paid
    from public.expense_payments p
    join period_scope s on s.id = p.expense_id
    group by p.expense_id
  ),
  prev_scope as (
    select e.total_amount
    from public.expenses e, prev_window w
    where e.college_id = p_college_id
      and w.prev_from is not null
      and e.occurred_on >= w.prev_from
      and e.occurred_on <= w.prev_to
  ),

  filtered as (
    select e.id, e.category_id, e.total_amount, e.label, e.occurred_on,
           e.recorded_by, e.reverses_expense_id, e.receipt_key,
           c.name as category_name,
           p.full_name as recorded_by_name,
           coalesce(pay.paid, 0) as paid,
           greatest(e.total_amount - coalesce(pay.paid, 0), 0) as reliquat
    from public.expenses e
    left join public.expense_categories c on c.id = e.category_id
    left join public.profiles p on p.id = e.recorded_by
    left join (
      select expense_id, sum(amount) as paid
      from public.expense_payments
      group by expense_id
    ) pay on pay.expense_id = e.id
    where e.college_id = p_college_id
      and (p_category_id is null or e.category_id = p_category_id)
      and (p_from is null or e.occurred_on >= p_from)
      and (p_to   is null or e.occurred_on <= p_to)
      and ((select term from q) is null
           -- Both arms of this OR are predicates on `expenses`, so the planner
           -- can BitmapOr the trigram index with the category index once the
           -- table is big enough to prefer them. Written as
           -- `or c.name ilike ...` against the joined table instead, the label
           -- index could never be used at any size — the OR would force a join
           -- filter and a full scan.
           or e.label ilike '%' || (select term from q) || '%'
           or e.category_id in (
                select c2.id from public.expense_categories c2
                where c2.name ilike '%' || (select term from q) || '%'
              ))
  ),
  -- The single largest expense in the period scope (not the filtered set —
  -- this answers "what was our biggest expense this quarter", independent of
  -- whatever the user typed in the search box).
  biggest as (
    select s.total_amount, s.label, s.category_name, s.occurred_on
    from period_scope s
    order by s.total_amount desc, s.id desc
    limit 1
  )
  select jsonb_build_object(
    -- The count is of the whole filtered set, not the page — the pager needs it
    -- to know how many pages exist.
    'total', (select count(*) from filtered),
    -- Sum over every filter, including search and category — lets the table's
    -- total row answer "how much did I spend on X", which the period-scoped
    -- `stats` deliberately does not.
    'filtered_total', (select coalesce(sum(total_amount), 0) from filtered),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',                  f.id::text,
               'category_id',         f.category_id::text,
               'category_name',       coalesce(f.category_name, 'Catégorie inconnue'),
               'amount',              f.total_amount::numeric,
               'description',         f.label,
               'spent_at',            f.occurred_on,
               'recorded_by',         f.recorded_by::text,
               'recorded_by_name',    f.recorded_by_name,
               'reverses_expense_id', f.reverses_expense_id::text,
               'receipt_key',         f.receipt_key,
               'paid',                f.paid,
               'reliquat',            f.reliquat
             ) order by f.rn)
      from (
        select *,
          row_number() over (
            order by
              case when p_sort = 'amount' and p_dir = 'asc'  then total_amount end asc,
              case when p_sort = 'amount' and p_dir = 'desc' then total_amount end desc,
              case when p_sort = 'category' and p_dir = 'asc'  then category_name end asc,
              case when p_sort = 'category' and p_dir = 'desc' then category_name end desc,
              case when p_sort = 'date' and p_dir = 'asc' then occurred_on end asc,
              -- Default: date desc. Also the fallback for any p_sort value
              -- this whitelist doesn't recognize.
              occurred_on desc,
              id desc
          ) as rn
        from filtered
      ) f
      where f.rn > greatest(coalesce(p_offset, 0), 0)
        and f.rn <= greatest(coalesce(p_offset, 0), 0) + least(coalesce(p_limit, 10), 200)
    ), '[]'::jsonb),
    'stats', (
      select jsonb_build_object(
        'total_count',  count(*),
        'total_amount', coalesce(sum(s.total_amount), 0),
        'avg_amount',   coalesce(round(avg(s.total_amount)), 0),
        'today_count',  count(*) filter (where s.occurred_on = current_date),
        'today_amount', coalesce(sum(s.total_amount)
                                 filter (where s.occurred_on = current_date), 0),
        'paid_amount',      coalesce((select sum(pp.paid) from period_payments pp), 0),
        'reliquat_amount',  coalesce(sum(s.total_amount), 0)
                             - coalesce((select sum(pp.paid) from period_payments pp), 0),
        'unpaid_count', (
          select count(*) from period_scope s2
          left join period_payments pp2 on pp2.expense_id = s2.id
          where s2.total_amount - coalesce(pp2.paid, 0) > 0
        ),
        'max_amount',   (select total_amount from biggest),
        'max_label',    (select label from biggest),
        'max_category', (select category_name from biggest),
        'max_on',       (select occurred_on from biggest),
        'elapsed_days', (select elapsed_days from window_calc),
        'prev_amount',  (select sum(total_amount) from prev_scope)
      )
      from period_scope s
    ),
    'category_stats', coalesce((
      select jsonb_agg(jsonb_build_object(
               'category_id', category_id::text,
               'total', total,
               'count', cnt))
      from (
        select category_id, sum(total_amount) as total, count(*) as cnt
        from period_scope
        group by category_id
      ) g
    ), '[]'::jsonb)
  );
$function$;

revoke all on function public.expenses_page(uuid, text, uuid, date, date, int, int, text, text) from public, anon;
grant execute on function public.expenses_page(uuid, text, uuid, date, date, int, int, text, text) to authenticated;

-- expenses_export: same filter/sort surface as expenses_page, no aggregates,
-- no page cap. A separate function rather than a raised limit on
-- expenses_page — the paged function's 200-row cap is a real safety
-- property, and export is an explicit, rare, user-initiated action.
create or replace function public.expenses_export(
  p_college_id uuid,
  p_search text default null,
  p_category_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_sort text default 'date',
  p_dir text default 'desc'
) returns table (
  occurred_on date,
  category_name text,
  description text,
  amount numeric,
  paid numeric,
  reliquat numeric,
  recorded_by_name text,
  receipt_key text
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with
  q as (select nullif(btrim(coalesce(p_search, '')), '') as term),
  filtered as (
    select e.id, e.category_id, e.total_amount, e.label, e.occurred_on,
           e.receipt_key,
           c.name as category_name,
           p.full_name as recorded_by_name,
           coalesce(pay.paid, 0) as paid,
           greatest(e.total_amount - coalesce(pay.paid, 0), 0) as reliquat
    from public.expenses e
    left join public.expense_categories c on c.id = e.category_id
    left join public.profiles p on p.id = e.recorded_by
    left join (
      select expense_id, sum(amount) as paid
      from public.expense_payments
      group by expense_id
    ) pay on pay.expense_id = e.id
    where e.college_id = p_college_id
      and (p_category_id is null or e.category_id = p_category_id)
      and (p_from is null or e.occurred_on >= p_from)
      and (p_to   is null or e.occurred_on <= p_to)
      and ((select term from q) is null
           or e.label ilike '%' || (select term from q) || '%'
           or e.category_id in (
                select c2.id from public.expense_categories c2
                where c2.name ilike '%' || (select term from q) || '%'
              ))
  )
  select f.occurred_on, f.category_name, f.label, f.total_amount,
         f.paid, f.reliquat, f.recorded_by_name, f.receipt_key
  from filtered f
  order by
    case when p_sort = 'amount' and p_dir = 'asc'  then f.total_amount end asc,
    case when p_sort = 'amount' and p_dir = 'desc' then f.total_amount end desc,
    case when p_sort = 'category' and p_dir = 'asc'  then f.category_name end asc,
    case when p_sort = 'category' and p_dir = 'desc' then f.category_name end desc,
    case when p_sort = 'date' and p_dir = 'asc' then f.occurred_on end asc,
    f.occurred_on desc,
    f.id desc;
$function$;

revoke all on function public.expenses_export(uuid, text, uuid, date, date, text, text) from public, anon;
grant execute on function public.expenses_export(uuid, text, uuid, date, date, text, text) to authenticated;
