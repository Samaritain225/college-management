-- Initial schema for the college finance app.
--
-- Design principles carried over from the previous SQLite schema:
--   * Financial ledger tables are append-only. No UPDATE or DELETE is granted
--     to any application role — corrections are new rows
--     (expenses use reverses_expense_id).
--   * Derived numbers (pool totals, ownership %, reliquat) are never stored —
--     always computed in views.
--   * Every table is scoped by college_id from day one so the eventual
--     super-admin / college-owner split is a policy change, not a migration.

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

create table colleges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table college_settings (
  college_id uuid primary key references colleges(id) on delete cascade,
  -- 'target': ownership % = agreed cotisation ÷ pool of agreed cotisations.
  -- 'paid':   ownership % = amount actually paid ÷ pool of amounts paid.
  -- Configurable per college rather than hardcoded — see refactor-plan.md.
  ownership_basis text not null default 'target'
    check (ownership_basis in ('target', 'paid')),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Identity & roles
-- A user can hold more than one role (an investor who is also a teacher),
-- and roles are scoped per college except super_admin, which is global
-- (college_id null).
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  created_at timestamptz not null default now()
);

create table roles (
  id text primary key,
  label text not null
);

insert into roles (id, label) values
  ('super_admin', 'Super administrateur'),
  ('admin', 'Administrateur'),
  ('treasurer', 'Trésorier'),
  ('investor', 'Investisseur'),
  ('teacher', 'Enseignant');

create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id text not null references roles(id),
  college_id uuid references colleges(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- super_admin must be global (college_id null); every other role must be
  -- scoped to a college.
  constraint role_scope_matches_kind check (
    (role_id = 'super_admin' and college_id is null)
    or (role_id <> 'super_admin' and college_id is not null)
  ),
  unique (user_id, role_id, college_id)
);

create index user_roles_user_id_idx on user_roles(user_id);
create index user_roles_college_id_idx on user_roles(college_id);

-- ---------------------------------------------------------------------------
-- Investors & contributions
-- ---------------------------------------------------------------------------

create table investors (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references colleges(id) on delete cascade,
  user_id uuid references auth.users(id), -- nullable: investor without a login
  name text not null,
  phone text,
  membership_fee numeric(14, 2) not null default 0,   -- adhésion — entry fee, excluded from ownership
  target_contribution numeric(14, 2) not null,          -- cotisation objective — basis for ownership
  joined_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index investors_college_id_idx on investors(college_id);

-- Append-only. type distinguishes the one-off membership fee from ongoing
-- capital calls; both flow into the same ledger for a simple running total,
-- but only cotisation counts toward ownership.
create table contributions (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references colleges(id) on delete cascade,
  investor_id uuid not null references investors(id),
  type text not null check (type in ('adhesion', 'cotisation')),
  amount numeric(14, 2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  method text,
  note text,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index contributions_college_id_idx on contributions(college_id);
create index contributions_investor_id_idx on contributions(investor_id);

-- Lump-sum revenue that isn't an investor contribution — primarily student
-- fees for now, tracked in aggregate until the SIS phase adds per-student
-- detail. Kept generic (label, not a fixed enum) since the shape of "other
-- income" isn't fully known yet.
create table other_income (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references colleges(id) on delete cascade,
  label text not null,
  amount numeric(14, 2) not null check (amount > 0),
  note text,
  occurred_on date not null default current_date,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index other_income_college_id_idx on other_income(college_id);

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references colleges(id) on delete cascade,
  name text not null,
  phone text,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index suppliers_college_id_idx on suppliers(college_id);

create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references colleges(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create index expense_categories_college_id_idx on expense_categories(college_id);

-- One row per ledger line. Categories double as the "work package" grouping
-- (e.g. "Montage R+1") — no separate work_packages table; see refactor-plan.md.
-- quantity/unit/unit_price are optional so a lump-sum expense (no line-item
-- detail) is just as valid as a priced one.
--
-- Dates on the source ledger are frequently imprecise ("DU 20/12/24 AU
-- 5/01/25", "04/25", blank) — occurred_to and date_precision let the app
-- represent that honestly instead of fabricating a false exact date.
create table expenses (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references colleges(id) on delete cascade,
  category_id uuid not null references expense_categories(id),
  supplier_id uuid references suppliers(id),
  label text not null,
  note text,
  quantity numeric(14, 3),
  unit text,                       -- free text: "t", "20 P", "2 BOT" — not enumerated
  unit_price numeric(14, 2),
  total_amount numeric(14, 2) not null check (total_amount > 0),
  occurred_on date,
  occurred_to date,
  date_precision text not null default 'day'
    check (date_precision in ('day', 'month', 'range', 'unknown')),
  receipt_key text,                -- R2 object key
  recorded_by uuid not null references auth.users(id),
  reverses_expense_id uuid references expenses(id),
  created_at timestamptz not null default now(),
  constraint occurred_to_requires_range check (
    occurred_to is null or date_precision = 'range'
  )
);

create index expenses_college_id_idx on expenses(college_id);
create index expenses_category_id_idx on expenses(category_id);
create index expenses_supplier_id_idx on expenses(supplier_id);

-- Append-only. reliquat for a given expense = total_amount − sum(amount).
create table expense_payments (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references colleges(id) on delete cascade,
  expense_id uuid not null references expenses(id),
  amount numeric(14, 2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  note text,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index expense_payments_expense_id_idx on expense_payments(expense_id);

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references colleges(id) on delete cascade,
  user_id uuid references auth.users(id),
  action text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_college_id_idx on activity_log(college_id);
create index activity_log_created_at_idx on activity_log(created_at desc);

-- auth.uid() rather than new.recorded_by/new.created_by: this function is
-- attached to tables with different column sets (investors has created_by,
-- the ledger tables have recorded_by), and NEW is an untyped record here —
-- referencing a field that doesn't exist on a given table would fail at
-- trigger-execution time. auth.uid() is always correct anyway: it's exactly
-- who performed the insert, and every one of these tables enforces that via
-- its RLS insert policy.
create or replace function log_activity() returns trigger as $$
begin
  insert into public.activity_log (college_id, user_id, action, metadata)
  values (new.college_id, auth.uid(), tg_argv[0], to_jsonb(new));
  return new;
end;
$$ language plpgsql security definer set search_path = '';

create trigger trg_log_contribution after insert on contributions
  for each row execute function log_activity('CONTRIBUTION_CREATE');
create trigger trg_log_other_income after insert on other_income
  for each row execute function log_activity('OTHER_INCOME_CREATE');
create trigger trg_log_expense after insert on expenses
  for each row execute function log_activity('EXPENSE_CREATE');
create trigger trg_log_expense_payment after insert on expense_payments
  for each row execute function log_activity('EXPENSE_PAYMENT_CREATE');
create trigger trg_log_investor after insert on investors
  for each row execute function log_activity('INVESTOR_CREATE');

-- ---------------------------------------------------------------------------
-- Derived views — never store what can be computed.
-- ---------------------------------------------------------------------------

-- security_invoker: without it, views run as their creator (effectively
-- bypassing RLS on the underlying tables for anyone who can query the view)
-- rather than as the querying user. Postgres 15+.
--
-- Two steps: aggregate per investor first (a plain GROUP BY), then compute
-- the ownership window over that already-aggregated result. Doing both in
-- one query mixes a grouped aggregate with a window function over the same
-- ungrouped column, which Postgres rejects.
create view investor_standings with (security_invoker = true) as
with per_investor as (
  select
    i.id,
    i.college_id,
    i.name,
    i.target_contribution,
    coalesce(sum(c.amount) filter (where c.type = 'cotisation'), 0) as paid_cotisation,
    coalesce(sum(c.amount) filter (where c.type = 'adhesion'), 0) as paid_adhesion
  from investors i
  left join contributions c on c.investor_id = i.id
  group by i.id, i.college_id, i.name, i.target_contribution
)
select
  pi.id,
  pi.college_id,
  pi.name,
  pi.target_contribution,
  pi.paid_cotisation,
  pi.paid_adhesion,
  cs.ownership_basis,
  greatest(pi.target_contribution - pi.paid_cotisation, 0) as owed,
  (case cs.ownership_basis when 'paid' then pi.paid_cotisation else pi.target_contribution end)
  / nullif(
      sum(case cs.ownership_basis when 'paid' then pi.paid_cotisation else pi.target_contribution end)
        over (partition by pi.college_id),
      0
    ) * 100 as ownership_pct
from per_investor pi
join college_settings cs on cs.college_id = pi.college_id;

create view expense_standings with (security_invoker = true) as
select
  e.id,
  e.college_id,
  e.total_amount,
  coalesce(sum(p.amount), 0) as paid,
  greatest(e.total_amount - coalesce(sum(p.amount), 0), 0) as reliquat
from expenses e
left join expense_payments p on p.expense_id = e.id
group by e.id, e.college_id, e.total_amount;

-- Total spendable cash: every contribution (adhésion + cotisation — both are
-- real money received) plus other income. Deliberately broader than
-- investor_standings, which excludes adhésion because that view answers a
-- different question (who owns what stake), not how much cash exists.
create view college_pool with (security_invoker = true) as
select
  college_id,
  coalesce(sum(amount), 0)
    + coalesce((select sum(amount) from other_income oi where oi.college_id = c.college_id), 0)
    as total_resources
from contributions c
group by college_id;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

-- Helper functions live in `private`, never `public` — `public` is an
-- exposed schema, and a security-definer function sitting there is directly
-- callable by anon/authenticated over the API with no additional grant
-- needed (Postgres grants EXECUTE to PUBLIC by default on new functions).
-- These specific functions are safe in principle (they only ever report on
-- auth.uid()'s own state, no parameter lets one user query another's), but
-- there's no reason to expose them and Supabase's own guidance is explicit:
-- security-definer functions must not live in an exposed schema.
create schema if not exists private;

-- security definer (not invoker) is deliberate here, not a shortcut: several
-- of these policies (e.g. user_roles' own select policy) call a function
-- that itself queries user_roles. If that function ran as invoker, the
-- internal query would re-trigger the same table's RLS policy, which calls
-- the function again — infinite recursion during policy evaluation. Running
-- as definer breaks that loop by bypassing RLS for just this internal read,
-- which is exactly the sanctioned Supabase pattern for role-check helpers.
create or replace function private.is_super_admin() returns boolean as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role_id = 'super_admin'
  );
$$ language sql stable security definer set search_path = '';

create or replace function private.my_college_ids() returns setof uuid as $$
  select college_id from public.user_roles
  where user_id = auth.uid() and college_id is not null;
$$ language sql stable security definer set search_path = '';

create or replace function private.can_manage_finance(target_college uuid) returns boolean as $$
  select private.is_super_admin() or exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and college_id = target_college
      and role_id in ('admin', 'treasurer')
  );
$$ language sql stable security definer set search_path = '';

alter table colleges enable row level security;
alter table college_settings enable row level security;
alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table investors enable row level security;
alter table contributions enable row level security;
alter table other_income enable row level security;
alter table suppliers enable row level security;
alter table expense_categories enable row level security;
alter table expenses enable row level security;
alter table expense_payments enable row level security;
alter table activity_log enable row level security;

-- Read: any role scoped to the college, or super_admin. Write: admin/treasurer
-- or super_admin. Applied uniformly across the finance tables.
--
-- Every function call is wrapped in (select ...) — per Supabase's own RLS
-- performance guide this lets Postgres cache the result per-statement
-- instead of re-evaluating per row (their benchmark: an is_admin()-style
-- join check went from 11,000ms to 7ms from this alone).
--
-- `to authenticated` on every policy: this app has no anon/public access at
-- all — every table requires login — and specifying the role lets Postgres
-- skip evaluating the policy entirely for anon requests.
--
-- activity_log gets read-only: it's populated exclusively by the
-- log_activity() trigger (security definer, runs as the table owner, which
-- bypasses RLS) — no application role should ever insert into it directly.
do $$
declare
  t text;
begin
  foreach t in array array[
    'investors', 'contributions', 'other_income', 'suppliers',
    'expense_categories', 'expenses', 'expense_payments', 'activity_log'
  ]
  loop
    execute format(
      'create policy %I on %I for select to authenticated using (
         (select private.is_super_admin()) or college_id = any(array(select private.my_college_ids()))
       );', t || '_select', t
    );
    if t <> 'activity_log' then
      execute format(
        'create policy %I on %I for insert to authenticated with check (
           (select private.can_manage_finance(college_id))
         );', t || '_insert', t
      );
    end if;
  end loop;
end $$;

-- No update/delete policy is created for the ledger tables — combined with
-- REVOKE below, this makes corrections structurally impossible other than
-- via a new row (expenses use reverses_expense_id).
revoke update, delete on contributions, other_income, expenses, expense_payments, activity_log
  from authenticated;

-- investors, suppliers, expense_categories are rosters, not ledgers — normal
-- edits (fixing a typo) are allowed to admin/treasurer. with check (not just
-- using) so a policy-holder can't reassign a row's college_id to a tenant
-- they don't manage — without it, USING alone only gates the row being
-- edited, not what it's edited into.
create policy investors_update on investors for update to authenticated
  using ((select private.can_manage_finance(college_id)))
  with check ((select private.can_manage_finance(college_id)));
create policy suppliers_update on suppliers for update to authenticated
  using ((select private.can_manage_finance(college_id)))
  with check ((select private.can_manage_finance(college_id)));
create policy expense_categories_update on expense_categories for update to authenticated
  using ((select private.can_manage_finance(college_id)))
  with check ((select private.can_manage_finance(college_id)));

create policy colleges_select on colleges for select to authenticated using (
  (select private.is_super_admin()) or id = any(array(select private.my_college_ids()))
);

create policy college_settings_select on college_settings for select to authenticated using (
  (select private.is_super_admin()) or college_id = any(array(select private.my_college_ids()))
);
create policy college_settings_update on college_settings for update to authenticated
  using (
    (select private.is_super_admin()) or exists (
      select 1 from user_roles
      where user_id = auth.uid() and college_id = college_settings.college_id and role_id = 'admin'
    )
  )
  with check (
    (select private.is_super_admin()) or exists (
      select 1 from user_roles
      where user_id = auth.uid() and college_id = college_settings.college_id and role_id = 'admin'
    )
  );

create policy profiles_select on profiles for select to authenticated using (true);
create policy profiles_update_own on profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy user_roles_select on user_roles for select to authenticated using (
  (select private.is_super_admin()) or user_id = (select auth.uid())
  or college_id = any(array(select private.my_college_ids()))
);

-- ---------------------------------------------------------------------------
-- Grants
-- Supabase doesn't automatically expose new SQL-created tables to anon/
-- authenticated — RLS restricts which rows are visible once a table is
-- reachable, but reachability itself is a separate GRANT. No grants to anon
-- anywhere: this app has no unauthenticated access at all.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;

-- select: every table a policy above grants read access to.
grant select on
  colleges, college_settings, profiles, user_roles,
  investors, contributions, other_income, suppliers,
  expense_categories, expenses, expense_payments, activity_log
  to authenticated;

-- insert: only the tables with an insert policy. colleges (bootstrap-only,
-- no client insert path yet) and activity_log (trigger-only) are
-- deliberately excluded — RLS would deny them anyway with no matching
-- policy, but there's no reason to grant what's never meant to be used.
grant insert on
  investors, contributions, other_income, suppliers,
  expense_categories, expenses, expense_payments
  to authenticated;

grant update on
  colleges, college_settings, profiles, investors, suppliers, expense_categories
  to authenticated;

grant select on investor_standings, expense_standings, college_pool to authenticated;
