-- Server-side paging, filtering, search and aggregates for the expenses table.
--
-- Why only expenses: it holds 1,801 rows against 9 categories, 15 investors and
-- 160 contributions. The small tables are fetched once and paged in memory —
-- server-paging nine rows would add a round trip per page click and be strictly
-- slower. This is the one table where the client was downloading everything to
-- filter it in JavaScript.
--
-- The aggregates come back with the page on purpose. Paging the grid alone
-- would not have removed the full download, because the KPI strip and the
-- per-category totals were both derived from the same in-memory array.
--
-- Two different scopes, matching what the page showed before:
--   * `rows`/`total`  — every filter, including search and category.
--   * `stats`/`category_stats` — the date range only. The KPI strip has always
--     described the period, not the filtered grid, and quietly narrowing it
--     when someone types in the search box would change what those numbers
--     mean mid-session.
--
-- OFFSET rather than the keyset the activity feed uses, deliberately: this grid
-- has numbered pages and needs to jump to page N, which a keyset cursor cannot
-- do. The trade-off (a shifting boundary under concurrent inserts) is
-- acceptable here — expenses are appended rarely and by one person at a time,
-- unlike the activity log which writes on every action.
--
-- Measured after applying: at 1,801 rows the planner ignores the trigram index
-- and seq-scans (4.6ms, 34 buffers), which is the correct choice at this size.
-- The index is for later, and the predicate below is shaped so it can actually
-- be used when the planner flips.

create extension if not exists pg_trgm;

-- Trigram, not full-text. Labels are short French noun phrases and users type
-- fragments: a to_tsquery on 'salaire' does not match 'Salaires', and websearch
-- syntax is wrong for a filter box. ILIKE '%frag%' with a trigram index does
-- match, and can stay index-backed.
create index if not exists expenses_label_trgm_idx
  on public.expenses using gin (label gin_trgm_ops);

-- Supports the default ordering and the college filter together.
create index if not exists expenses_college_occurred_idx
  on public.expenses (college_id, occurred_on desc, id desc);

create or replace function public.expenses_page(
  p_college_id uuid,
  p_search text default null,
  p_category_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_limit int default 10,
  p_offset int default 0
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
  -- Date range only. Feeds the KPI strip and the per-category totals.
  period_scope as (
    select e.id, e.category_id, e.total_amount, e.occurred_on
    from public.expenses e
    where e.college_id = p_college_id
      and (p_from is null or e.occurred_on >= p_from)
      and (p_to   is null or e.occurred_on <= p_to)
  ),
  filtered as (
    select e.id, e.category_id, e.total_amount, e.label, e.occurred_on,
           e.recorded_by, e.reverses_expense_id,
           c.name as category_name,
           p.full_name as recorded_by_name
    from public.expenses e
    left join public.expense_categories c on c.id = e.category_id
    left join public.profiles p on p.id = e.recorded_by
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
  )
  select jsonb_build_object(
    -- The count is of the whole filtered set, not the page — the pager needs it
    -- to know how many pages exist.
    'total', (select count(*) from filtered),
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
               'reverses_expense_id', f.reverses_expense_id::text
             ) order by f.occurred_on desc, f.id desc)
      from (
        select * from filtered
        order by occurred_on desc, id desc
        limit least(coalesce(p_limit, 10), 200)
        offset greatest(coalesce(p_offset, 0), 0)
      ) f
    ), '[]'::jsonb),
    'stats', (
      select jsonb_build_object(
        'total_count',  count(*),
        'total_amount', coalesce(sum(total_amount), 0),
        'avg_amount',   coalesce(round(avg(total_amount)), 0),
        'today_count',  count(*) filter (where occurred_on = current_date),
        'today_amount', coalesce(sum(total_amount)
                                 filter (where occurred_on = current_date), 0)
      )
      from period_scope
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

revoke all on function public.expenses_page(uuid, text, uuid, date, date, int, int) from public, anon;
grant execute on function public.expenses_page(uuid, text, uuid, date, date, int, int) to authenticated;
