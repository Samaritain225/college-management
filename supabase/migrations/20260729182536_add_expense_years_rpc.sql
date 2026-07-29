-- Return only the distinct calendar years needed by the expense-table filter.
-- SECURITY INVOKER keeps the existing expenses RLS policies in force.
create or replace function public.expense_years(p_college_id uuid)
returns table(year int)
language sql
stable
security invoker
set search_path = ''
as $function$
  select distinct extract(year from e.occurred_on)::int as year
  from public.expenses e
  where e.college_id = p_college_id
    and e.occurred_on is not null
  order by year desc;
$function$;

revoke all on function public.expense_years(uuid) from public, anon;
grant execute on function public.expense_years(uuid) to authenticated;
