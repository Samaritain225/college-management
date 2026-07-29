-- Keep the expense grid and KPI strip independently queryable. The legacy
-- expenses_page RPC remains available for older clients.

create or replace function public.expense_table_page(
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
  q as (select nullif(btrim(coalesce(p_search, '')), '') as term),
  filtered as (
    select e.id, e.category_id, e.total_amount, e.label, e.occurred_on,
           e.recorded_by, e.reverses_expense_id, e.receipt_key,
           c.name as category_name,
           p.full_name as recorded_by_name,
           (p.deleted_at is not null) as recorded_by_deleted,
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
      and (p_to is null or e.occurred_on <= p_to)
      and ((select term from q) is null
           or e.label ilike '%' || (select term from q) || '%'
           or e.category_id in (
                select c2.id
                from public.expense_categories c2
                where c2.name ilike '%' || (select term from q) || '%'
              ))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
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
               'recorded_by_deleted', f.recorded_by_deleted,
               'reverses_expense_id', f.reverses_expense_id::text,
               'receipt_key',         f.receipt_key,
               'paid',                f.paid,
               'reliquat',            f.reliquat
             ) order by f.rn)
      from (
        select *,
          row_number() over (
            order by
              case when p_sort = 'amount' and p_dir = 'asc' then total_amount end asc,
              case when p_sort = 'amount' and p_dir = 'desc' then total_amount end desc,
              case when p_sort = 'category' and p_dir = 'asc' then category_name end asc,
              case when p_sort = 'category' and p_dir = 'desc' then category_name end desc,
              case when p_sort = 'date' and p_dir = 'asc' then occurred_on end asc,
              occurred_on desc,
              id desc
          ) as rn
        from filtered
      ) f
      where f.rn > greatest(coalesce(p_offset, 0), 0)
        and f.rn <= greatest(coalesce(p_offset, 0), 0)
          + least(coalesce(p_limit, 10), 200)
    ), '[]'::jsonb)
  );
$function$;

revoke all on function public.expense_table_page(uuid, text, uuid, date, date, int, int, text, text)
  from public, anon;
grant execute on function public.expense_table_page(uuid, text, uuid, date, date, int, int, text, text)
  to authenticated;

create or replace function public.expense_kpis(
  p_college_id uuid,
  p_from date default null,
  p_to date default null
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with
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
  period_scope as (
    select e.id, e.category_id, e.total_amount, e.occurred_on, e.label,
           c.name as category_name
    from public.expenses e
    left join public.expense_categories c on c.id = e.category_id
    where e.college_id = p_college_id
      and (p_from is null or e.occurred_on >= p_from)
      and (p_to is null or e.occurred_on <= p_to)
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
  biggest as (
    select s.total_amount, s.label, s.category_name, s.occurred_on
    from period_scope s
    order by s.total_amount desc, s.id desc
    limit 1
  )
  select jsonb_build_object(
    'stats', (
      select jsonb_build_object(
        'total_count', count(*),
        'total_amount', coalesce(sum(s.total_amount), 0),
        'avg_amount', coalesce(round(avg(s.total_amount)), 0),
        'today_count', count(*) filter (where s.occurred_on = current_date),
        'today_amount', coalesce(sum(s.total_amount)
                                  filter (where s.occurred_on = current_date), 0),
        'paid_amount', coalesce((select sum(pp.paid) from period_payments pp), 0),
        'reliquat_amount', coalesce(sum(s.total_amount), 0)
                           - coalesce((select sum(pp.paid) from period_payments pp), 0),
        'unpaid_count', (
          select count(*)
          from period_scope s2
          left join period_payments pp2 on pp2.expense_id = s2.id
          where s2.total_amount - coalesce(pp2.paid, 0) > 0
        ),
        'max_amount', (select total_amount from biggest),
        'max_label', (select label from biggest),
        'max_category', (select category_name from biggest),
        'max_on', (select occurred_on from biggest),
        'elapsed_days', (select elapsed_days from window_calc),
        'prev_amount', (select sum(total_amount) from prev_scope)
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

revoke all on function public.expense_kpis(uuid, date, date) from public, anon;
grant execute on function public.expense_kpis(uuid, date, date) to authenticated;
