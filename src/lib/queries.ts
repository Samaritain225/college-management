// Data layer for the college-budget app, backed by Supabase.
//
// Deliberately keeps the field names/shapes the UI already expects
// (agreed_contribution, description, spent_at, amount) even though the
// underlying schema uses different column names (target_contribution,
// label, occurred_on, total_amount) — this is a translation layer, not a
// 1:1 passthrough, so the feature pages built against the old AdonisJS API
// needed minimal changes. See docs/refactor-plan.md for the schema itself.
//
// This app is single-college for now (Wagnon) — COLLEGE_ID is a constant
// rather than derived per-request. Multi-college support is a later phase;
// every table already carries college_id so that's a query-scoping change,
// not a schema migration, when it happens.

import { supabase } from "@/lib/supabase"

export const COLLEGE_ID = "e55af449-8c95-41ee-9732-859ece20aaa1"

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

// ---- Investors ------------------------------------------------------

export interface Investor {
  id: string
  user_id: string | null
  name: string
  phone: string | null
  agreed_contribution: number
  joined_at: string
  user?: {
    name: string | null
    email: string | null
  } | null
}

export async function listInvestors(): Promise<Investor[]> {
  const res = await supabase
    .from("investors")
    .select("id, user_id, name, phone, target_contribution, joined_at, profiles(full_name, email)")
    .eq("college_id", COLLEGE_ID)
    .order("name", { ascending: true })
  const rows = unwrap(res)

  return rows.map((r: any) => ({
    id: r.id,
    user_id: r.user_id,
    name: r.name,
    phone: r.phone,
    agreed_contribution: Number(r.target_contribution),
    joined_at: r.joined_at,
    user: r.profiles ? { name: r.profiles.full_name, email: r.profiles.email } : null,
  }))
}

export async function addInvestor(input: {
  userId?: string | null
  name: string
  phone?: string | null
  agreedContribution: number
  membershipFee: number
  joinedAt?: string
}): Promise<Investor> {
  const joinedAt = input.joinedAt || new Date().toISOString()

  const res = await supabase
    .from("investors")
    .insert({
      college_id: COLLEGE_ID,
      user_id: input.userId ?? null,
      name: input.name,
      phone: input.phone ?? null,
      target_contribution: input.agreedContribution,
      membership_fee: input.membershipFee,
      joined_at: joinedAt,
    })
    .select("id")
    .single()
  const row = unwrap(res)

  // Recording the adhésion as a real contribution (not just the investors
  // row's membership_fee) is what makes it count toward college_pool — see
  // the addContribution comment below. Not a DB transaction (nothing else in
  // this file uses one either): if this second insert fails, the investor
  // row still exists but with no matching adhésion contribution yet, the
  // same recoverable state a later manual "Nouveau versement" would fix.
  await addContribution({
    investorId: row.id,
    type: "adhesion",
    amount: input.membershipFee,
    paidAt: joinedAt,
  })

  return {
    id: row.id,
    user_id: input.userId ?? null,
    name: input.name,
    phone: input.phone ?? null,
    agreed_contribution: input.agreedContribution,
    joined_at: joinedAt,
  }
}

export async function updateInvestor(
  id: string,
  input: {
    name: string
    userId: string | null
    agreedContribution: number
    phone?: string | null
  }
): Promise<void> {
  const res = await supabase
    .from("investors")
    .update({
      name: input.name,
      user_id: input.userId ?? null,
      target_contribution: input.agreedContribution,
      phone: input.phone ?? null,
    })
    .eq("id", id)
  unwrap(res)
}

// ---- Pool totals (derived, never stored statically) ------------------
// "Pool" here means the committed/agreed total (the budget target investors
// signed up for), not cash on hand — see college_pool view for the latter,
// used once the dashboard grows a "resources" concept beyond the pool ratio.

export async function getPoolTotal(): Promise<number> {
  const investors = await listInvestors()
  return investors.reduce((sum, inv) => sum + inv.agreed_contribution, 0)
}

export type ContributionType = "adhesion" | "cotisation"

export interface Contribution {
  id: string
  investor_id: string
  type: ContributionType
  amount: number
  paid_at: string
  method: string
  note: string | null
  recorded_by: string
}

export async function listContributions(): Promise<Contribution[]> {
  const res = await supabase
    .from("contributions")
    .select("id, investor_id, type, amount, paid_at, method, note, recorded_by")
    .eq("college_id", COLLEGE_ID)
    .order("paid_at", { ascending: true })
  const rows = unwrap(res)

  return rows.map((r: any) => ({
    id: r.id,
    investor_id: r.investor_id,
    type: r.type,
    amount: Number(r.amount),
    paid_at: r.paid_at,
    method: r.method ?? "",
    note: r.note,
    recorded_by: r.recorded_by,
  }))
}

// Records a payment against an investor's target_contribution (cotisation)
// or their one-time entry fee (adhesion). investor_standings computes `owed`
// from the sum of cotisation contributions live — this never touches that
// column directly, per the "derived numbers are never stored" rule.
export async function addContribution(input: {
  investorId: string
  type: ContributionType
  amount: number
  paidAt?: string
  method?: string | null
  note?: string | null
}): Promise<Contribution> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error("Not authenticated")

  const paidAt = input.paidAt || new Date().toISOString()

  const res = await supabase
    .from("contributions")
    .insert({
      college_id: COLLEGE_ID,
      investor_id: input.investorId,
      type: input.type,
      amount: input.amount,
      paid_at: paidAt,
      method: input.method || null,
      note: input.note || null,
      recorded_by: auth.user.id,
    })
    .select("id, investor_id, type, amount, paid_at, method, note, recorded_by")
    .single()
  const row = unwrap(res)

  return {
    id: row.id,
    investor_id: row.investor_id,
    type: row.type,
    amount: Number(row.amount),
    paid_at: row.paid_at,
    method: row.method ?? "",
    note: row.note,
    recorded_by: row.recorded_by,
  }
}

export interface InvestorStanding extends Investor {
  paid: number
  owed: number
  ownership_pct: number
}

export async function getInvestorStandings(): Promise<InvestorStanding[]> {
  const [investors, res] = await Promise.all([
    listInvestors(),
    supabase
      .from("investor_standings")
      .select("id, paid_cotisation, paid_adhesion, owed, ownership_pct")
      .eq("college_id", COLLEGE_ID),
  ])
  const standingRows = unwrap(res)
  const standingsById = new Map(standingRows.map((r: any) => [r.id, r]))

  return investors.map((inv) => {
    const s = standingsById.get(inv.id) as any
    return {
      ...inv,
      paid: s ? Number(s.paid_cotisation) + Number(s.paid_adhesion) : 0,
      owed: s ? Number(s.owed) : inv.agreed_contribution,
      ownership_pct: s ? Number(s.ownership_pct) : 0,
    }
  })
}

// ---- Budget categories -------------------------------------------------

export interface BudgetCategory {
  id: string
  name: string
  description?: string | null
}

export async function listCategories(): Promise<BudgetCategory[]> {
  const res = await supabase
    .from("expense_categories")
    .select("id, name, description")
    .eq("college_id", COLLEGE_ID)
    .order("name", { ascending: true })
  return unwrap(res)
}

export async function addCategory(name: string, description?: string): Promise<BudgetCategory> {
  const res = await supabase
    .from("expense_categories")
    .insert({ college_id: COLLEGE_ID, name, description: description || null })
    .select("id, name, description")
    .single()
  return unwrap(res)
}

// ---- Expenses ------------------------------------------------------
// Every expense requires recorded_by — there is no anonymous spending.
// Corrections are made via a new row with reverses_expense_id set,
// never by editing or deleting the original (keeps the audit trail honest).

export interface Expense {
  id: string
  category_id: string
  category_name: string
  amount: number
  description: string
  spent_at: string
  recorded_by: string
  recorded_by_name: string | null
  /** True when the account behind recorded_by_name has been soft-deleted —
   *  the name still identifies who recorded this, but that account no
   *  longer has access. Never true for a hard-deleted user, since those
   *  never existed with attributable history in the first place. */
  recorded_by_deleted: boolean
  reverses_expense_id: string | null
  /** R2 object key for an uploaded receipt, or null. Rows created before the
   *  upload existed hold a hand-typed text reference in this same column
   *  instead — see `isUploadedReceiptKey` for telling the two apart. */
  receipt_key: string | null
  payee: string | null
  payment_method: PaymentMethod | null
  /** Only populated by `getExpensesPage` (the RPC joins `expense_payments`).
   *  `listExpenses` below leaves both at 0 — nothing reads them from there. */
  paid: number
  reliquat: number
}

export type PaymentMethod = "cash" | "mobile_money" | "bank_transfer" | "other"

export async function listExpenses(): Promise<Expense[]> {
  const res = await supabase
    .from("expenses")
    .select(
      "id, category_id, total_amount, label, occurred_on, recorded_by, reverses_expense_id, receipt_key, payee, payment_method, expense_categories(name), profiles(full_name, deleted_at)"
    )
    .eq("college_id", COLLEGE_ID)
    .order("occurred_on", { ascending: false })
  const rows = unwrap(res)

  return rows.map((e: any) => ({
    id: e.id,
    category_id: e.category_id,
    category_name: e.expense_categories?.name || "Catégorie inconnue",
    amount: Number(e.total_amount),
    description: e.label,
    spent_at: e.occurred_on,
    recorded_by: e.recorded_by,
    recorded_by_name: e.profiles?.full_name ?? null,
    recorded_by_deleted: !!e.profiles?.deleted_at,
    reverses_expense_id: e.reverses_expense_id,
    receipt_key: e.receipt_key ?? null,
    payee: e.payee ?? null,
    payment_method: e.payment_method ?? null,
    paid: 0,
    reliquat: 0,
  }))
}

export interface ExpenseStats {
  totalCount: number
  totalAmount: number
  avgAmount: number
  todayCount: number
  todayAmount: number
  /** Sum of `expense_payments` against expenses in the period. */
  paidAmount: number
  /** `totalAmount - paidAmount` for the period — what is still owed. */
  reliquatAmount: number
  /** Expenses in the period with a positive reliquat. */
  unpaidCount: number
  /** The single largest expense in the period, or null if the period is empty. */
  maxAmount: number | null
  maxLabel: string | null
  maxCategory: string | null
  maxOn: string | null
  /**
   * Length in days of the requested period, clamped to "so far" when the
   * period extends into the future (a mid-month filter). Null when the
   * period is "Toutes les périodes" — there is no window to compare against.
   */
  elapsedDays: number | null
  /** Total of the same-length window immediately preceding the period. Null
   *  under the same condition as `elapsedDays`. */
  prevAmount: number | null
}

export interface CategoryStat {
  categoryId: string
  total: number
  count: number
}

export interface ExpensesPageResult {
  rows: Expense[]
  /** Rows matching the filters across every page, for the pager. */
  total: number
  /** Sum over every filter, including search and category — unlike `stats`,
   *  this narrows with the search box, so a filtered table can show a
   *  matching total row. */
  filteredTotal: number
  /**
   * KPI strip and per-category totals. Scoped to the date range only, NOT to
   * the search or category filter — that is what the page showed before, and
   * silently renarrowing the headline numbers when someone types in the search
   * box would change what they mean mid-session.
   */
  stats: ExpenseStats
  categoryStats: CategoryStat[]
}

export type ExpenseTablePageResult = Pick<
  ExpensesPageResult,
  "rows" | "total" | "filteredTotal"
>

export type ExpenseKpisResult = Pick<
  ExpensesPageResult,
  "stats" | "categoryStats"
>

export type ExpensesSortColumn = "date" | "amount" | "category"
export type SortDirection = "asc" | "desc"

export interface ExpensesPageQuery {
  /** Matched against the expense label and the category name, case-insensitive
   *  substring. Blank or whitespace-only means "no filter". */
  search?: string | null
  categoryId?: string | null
  from?: string | null
  to?: string | null
  page?: number
  pageSize?: number
  sort?: ExpensesSortColumn
  dir?: SortDirection
}

export async function listExpenseYears(): Promise<number[]> {
  const rows = unwrap(await supabase.rpc("expense_years", {
    p_college_id: COLLEGE_ID,
  })) as Array<{ year: number | string }>

  return rows
    .map((row) => Number(row.year))
    .filter((year) => Number.isInteger(year))
}

function expenseStatsFromRpc(value: any): ExpenseStats {
  const s = value ?? {}
  return {
    totalCount: Number(s.total_count ?? 0),
    totalAmount: Number(s.total_amount ?? 0),
    avgAmount: Number(s.avg_amount ?? 0),
    todayCount: Number(s.today_count ?? 0),
    todayAmount: Number(s.today_amount ?? 0),
    paidAmount: Number(s.paid_amount ?? 0),
    reliquatAmount: Number(s.reliquat_amount ?? 0),
    unpaidCount: Number(s.unpaid_count ?? 0),
    maxAmount: s.max_amount != null ? Number(s.max_amount) : null,
    maxLabel: s.max_label ?? null,
    maxCategory: s.max_category ?? null,
    maxOn: s.max_on ?? null,
    elapsedDays: s.elapsed_days != null ? Number(s.elapsed_days) : null,
    prevAmount: s.prev_amount != null ? Number(s.prev_amount) : null,
  }
}

function categoryStatsFromRpc(value: any): CategoryStat[] {
  return (value ?? []).map((c: any) => ({
    categoryId: c.category_id,
    total: Number(c.total),
    count: Number(c.count),
  }))
}

async function hydrateExpensePageRows(pageRows: any[]): Promise<Expense[]> {
  const ids = pageRows.map((e) => e.id)
  const details = ids.length
    ? unwrap(await supabase.from("expenses").select("id, payee, payment_method").in("id", ids)) as any[]
    : []
  const cashDetails = new Map(details.map((e) => [e.id, e]))

  return pageRows.map((e) => ({
    id: e.id,
    category_id: e.category_id,
    category_name: e.category_name,
    amount: Number(e.amount),
    description: e.description,
    spent_at: e.spent_at,
    recorded_by: e.recorded_by,
    recorded_by_name: e.recorded_by_name,
    recorded_by_deleted: !!e.recorded_by_deleted,
    reverses_expense_id: e.reverses_expense_id,
    receipt_key: e.receipt_key ?? null,
    payee: cashDetails.get(e.id)?.payee ?? null,
    payment_method: cashDetails.get(e.id)?.payment_method ?? null,
    paid: Number(e.paid ?? 0),
    reliquat: Number(e.reliquat ?? 0),
  }))
}

export async function getExpenseTablePage(
  q: ExpensesPageQuery = {}
): Promise<ExpenseTablePageResult> {
  const pageSize = q.pageSize ?? 10
  const page = Math.max(q.page ?? 1, 1)
  const d = unwrap(await supabase.rpc("expense_table_page", {
    p_college_id: COLLEGE_ID,
    p_search: q.search ?? null,
    p_category_id: q.categoryId ?? null,
    p_from: q.from ?? null,
    p_to: q.to ?? null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
    p_sort: q.sort ?? "date",
    p_dir: q.dir ?? "desc",
  })) as any

  return {
    total: Number(d.total ?? 0),
    filteredTotal: Number(d.filtered_total ?? 0),
    rows: await hydrateExpensePageRows(d.rows ?? []),
  }
}

export async function getExpenseKpis({
  from = null,
  to = null,
}: Pick<ExpensesPageQuery, "from" | "to"> = {}): Promise<ExpenseKpisResult> {
  const d = unwrap(await supabase.rpc("expense_kpis", {
    p_college_id: COLLEGE_ID,
    p_from: from,
    p_to: to,
  })) as any

  return {
    stats: expenseStatsFromRpc(d.stats),
    categoryStats: categoryStatsFromRpc(d.category_stats),
  }
}

/**
 * One page of expenses, filtered and counted server-side.
 *
 * Unlike the small tables, this one is worth a round trip: 1,801 rows today and
 * growing with every purchase the college makes. `listExpenses` below still
 * exists for the callers that genuinely need the whole ledger (the totals
 * strip), but the grid must not download it to show ten rows.
 */
export async function getExpensesPage(
  q: ExpensesPageQuery = {}
): Promise<ExpensesPageResult> {
  const pageSize = q.pageSize ?? 10
  const page = Math.max(q.page ?? 1, 1)

  const res = await supabase.rpc("expenses_page", {
    p_college_id: COLLEGE_ID,
    p_search: q.search ?? null,
    p_category_id: q.categoryId ?? null,
    p_from: q.from ?? null,
    p_to: q.to ?? null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
    p_sort: q.sort ?? "date",
    p_dir: q.dir ?? "desc",
  })

  const d = unwrap(res) as any
  const pageRows = d.rows ?? []
  return {
    total: Number(d.total ?? 0),
    filteredTotal: Number(d.filtered_total ?? 0),
    stats: expenseStatsFromRpc(d.stats),
    categoryStats: categoryStatsFromRpc(d.category_stats),
    rows: await hydrateExpensePageRows(pageRows),
  }
}

export interface ExpenseExportRow {
  spent_at: string
  category_name: string
  description: string
  amount: number
  paid: number
  reliquat: number
  recorded_by_name: string | null
  receipt_key: string | null
}

/**
 * The same filter/sort surface as `getExpensesPage`, but the full matching
 * set — no page cap. For the print report only: a paged function's row limit
 * is a real safety property for the normal grid, and a full unpaged pull is a
 * rare, explicit, user-initiated action, so it gets its own RPC
 * (`expenses_export`) rather than a raised limit on the paged one.
 */
// PostgREST caps a table-returning RPC's response at its default row limit
// (1000) regardless of how many rows actually match — there is no server-side
// signal that the result was truncated, it just silently stops at row 1000.
// Measured against this ledger (1,802 rows): an unfiltered export came back
// as exactly 1000 rows with no error. `.range()` works on an RPC call the
// same way it does on a table select, so the fix is to page through in
// chunks until a chunk comes back short of a full page.
const EXPORT_CHUNK_SIZE = 1000

export async function getExpensesExport(
  q: Omit<ExpensesPageQuery, "page" | "pageSize"> = {}
): Promise<ExpenseExportRow[]> {
  const args = {
    p_college_id: COLLEGE_ID,
    p_search: q.search ?? null,
    p_category_id: q.categoryId ?? null,
    p_from: q.from ?? null,
    p_to: q.to ?? null,
    p_sort: q.sort ?? "date",
    p_dir: q.dir ?? "desc",
  }

  const all: any[] = []
  let offset = 0
  for (;;) {
    const res = await supabase
      .rpc("expenses_export", args)
      .range(offset, offset + EXPORT_CHUNK_SIZE - 1)
    const chunk = unwrap(res) as any[]
    all.push(...chunk)
    if (chunk.length < EXPORT_CHUNK_SIZE) break
    offset += EXPORT_CHUNK_SIZE
  }

  return all.map((r) => ({
    spent_at: r.occurred_on,
    category_name: r.category_name ?? "Catégorie inconnue",
    description: r.description,
    amount: Number(r.amount),
    paid: Number(r.paid ?? 0),
    reliquat: Number(r.reliquat ?? 0),
    recorded_by_name: r.recorded_by_name ?? null,
    receipt_key: r.receipt_key ?? null,
  }))
}

export async function addExpense(input: {
  categoryId: string
  amount: number
  description: string
  spentAt: string
  receiptKey?: string | null
  payee: string
  paymentMethod: PaymentMethod
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error("Not authenticated")

  const res = await supabase.from("expenses").insert({
    college_id: COLLEGE_ID,
    category_id: input.categoryId,
    label: input.description,
    total_amount: input.amount,
    occurred_on: input.spentAt.slice(0, 10),
    date_precision: "day",
    receipt_key: input.receiptKey || null,
    payee: input.payee,
    payment_method: input.paymentMethod,
    recorded_by: auth.user.id,
  })
  unwrap(res)
}

export interface Activity {
  id: string
  type: "contribution" | "expense"
  title: string
  subtitle: string
  amount: number
  date: string
}

// ---- User activity log --------------------------------------------------
// Sourced from activity_log (populated by DB triggers, not app code — see
// the initial_schema migration). metadata on each row is a raw dump of the
// inserted record (to_jsonb(new)), so it carries the new schema's column
// names (label, total_amount, target_contribution) rather than the
// UI-facing camelCase shape the old Adonis activity service produced.
// Normalized here rather than reshaping RecentActivities.tsx's already
// carefully laid out formatActivityItem().

// ---- Dashboard summary (single round-trip) -----------------------------
// Replaces the ten calls the Dashboard used to fan out. Measured 2026-07-26 on
// real data: the old shape moved 2.76MB per load (expenses alone was fetched
// four times); this moves ~14KB — a 199x reduction. No raw rows come back: the
// client only ever needed them for the period filter and the six-month chart,
// and every Period is calendar-aligned to now, so month buckets answer both
// without refetching when the dropdown changes.

export interface MonthBucket {
  /** "YYYY-MM", UTC, matching how the client used to key off ISO strings. */
  month: string
  /** Cotisation only — the ownership-basis figure and the charted series. */
  contributed: number
  /** Every cash inflow: both contribution types plus other income. */
  resources: number
  /** The other-income slice of `resources`, broken out for the footer. */
  otherIncome: number
  spent: number
}

export interface DashboardSummary {
  pool: number
  totalContributed: number
  /**
   * Total cash actually received — every contribution (adhésion included, since
   * it is real money even though it confers no ownership) plus other income.
   * This, not totalContributed, is what the balance must be computed against:
   * other income is the largest single source, and leaving it out made the
   * dashboard report a negative balance on a healthy account.
   */
  totalResources: number
  totalOtherIncome: number
  totalSpent: number
  byCategory: { name: string; amount: number }[]
  monthly: MonthBucket[]
  recent: Activity[]
  userActivities: UserActivityLog[]
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const res = await supabase.rpc("dashboard_summary", { p_college_id: COLLEGE_ID })
  const d = unwrap(res) as any

  return {
    pool: Number(d.pool),
    totalContributed: Number(d.total_contributed),
    totalResources: Number(d.total_resources),
    totalOtherIncome: Number(d.total_other_income),
    totalSpent: Number(d.total_spent),
    byCategory: (d.by_category ?? []).map((c: any) => ({
      name: c.name,
      amount: Number(c.amount),
    })),
    monthly: (d.monthly ?? []).map((m: any) => ({
      month: m.month,
      contributed: Number(m.contributed),
      resources: Number(m.resources),
      otherIncome: Number(m.other_income),
      spent: Number(m.spent),
    })),
    recent: (d.recent ?? []).map((a: any) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      subtitle: a.subtitle,
      amount: Number(a.amount),
      date: a.date,
    })),
    // Already normalized server-side into the shape formatActivityItem reads.
    // That also removed the dependent second query that resolved investor
    // names — a sequential await, and those measured ~290ms each.
    userActivities: (d.user_activities ?? []).map(toActivity),
  }
}

export interface UserActivityLog {
  id: string
  userId: string | null
  userName: string
  action: string
  /** Display timestamp, truncated to whole seconds. Never page on this. */
  createdAt: string
  /**
   * Full-precision timestamp, for the keyset cursor only. Distinct from
   * `createdAt` on purpose: that one is truncated to seconds, and real rows
   * carry microseconds, so paging on it would place the cursor before every
   * row sharing that second and silently skip them.
   */
  cursorAt: string
  metadata: Record<string, any> | null
}

export interface ActivityCursor {
  cursorAt: string
  id: string
}

export interface ActivityPage {
  items: UserActivityLog[]
  /** Null once the feed is exhausted. */
  nextCursor: ActivityCursor | null
}

export const ACTIVITY_PAGE_SIZE = 20

function toActivity(a: any): UserActivityLog {
  return {
    id: a.id,
    userId: a.userId,
    userName: a.userName,
    action: a.action,
    createdAt: a.createdAt,
    cursorAt: a.cursorAt,
    metadata: a.metadata,
  }
}

/**
 * One page of the activity log, newest first.
 *
 * Keyset-paginated rather than offset-paginated: rows land in this table while
 * someone is scrolling, and an OFFSET boundary shifts underneath them, which
 * duplicates or skips entries. What comes back is already normalized by the
 * same SQL the dashboard uses, so no reshaping happens here.
 *
 * `userId` filters to one person's history. It is a convenience, not a
 * permission boundary — the RLS policy on activity_log already restricts a
 * non-admin to their own rows regardless of what is passed.
 */
export async function listActivityFeed(
  opts: { userId?: string | null; cursor?: ActivityCursor | null; limit?: number } = {}
): Promise<ActivityPage> {
  const limit = opts.limit ?? ACTIVITY_PAGE_SIZE
  const res = await supabase.rpc("activity_feed", {
    p_college_id: COLLEGE_ID,
    p_user_id: opts.userId ?? null,
    p_before_created_at: opts.cursor?.cursorAt ?? null,
    p_before_id: opts.cursor?.id ?? null,
    p_limit: limit,
  })

  const rows = (unwrap(res) as any[]) ?? []
  const items = rows.map(toActivity)
  const last = items[items.length - 1]

  return {
    items,
    // A short page is the end of the feed. Only a full page can have more.
    nextCursor:
      items.length === limit && last ? { cursorAt: last.cursorAt, id: last.id } : null,
  }
}

/** The cursor to continue from, given the activities the dashboard preloaded. */
export function cursorFrom(items: UserActivityLog[]): ActivityCursor | null {
  const last = items[items.length - 1]
  return last ? { cursorAt: last.cursorAt, id: last.id } : null
}
