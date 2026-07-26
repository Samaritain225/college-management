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
      joined_at: joinedAt,
    })
    .select("id")
    .single()
  const row = unwrap(res)

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

export interface Contribution {
  id: string
  investor_id: string
  amount: number
  paid_at: string
  method: string
  note: string | null
  recorded_by: string
}

export async function listContributions(): Promise<Contribution[]> {
  const res = await supabase
    .from("contributions")
    .select("id, investor_id, amount, paid_at, method, note, recorded_by")
    .eq("college_id", COLLEGE_ID)
    .order("paid_at", { ascending: true })
  const rows = unwrap(res)

  return rows.map((r: any) => ({
    id: r.id,
    investor_id: r.investor_id,
    amount: Number(r.amount),
    paid_at: r.paid_at,
    method: r.method ?? "",
    note: r.note,
    recorded_by: r.recorded_by,
  }))
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
  reverses_expense_id: string | null
}

export async function listExpenses(): Promise<Expense[]> {
  const res = await supabase
    .from("expenses")
    .select(
      "id, category_id, total_amount, label, occurred_on, recorded_by, reverses_expense_id, expense_categories(name), profiles(full_name)"
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
    reverses_expense_id: e.reverses_expense_id,
  }))
}

export async function addExpense(input: {
  categoryId: string
  amount: number
  description: string
  spentAt: string
  receiptPhotoPath?: string | null
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
    receipt_key: input.receiptPhotoPath || null,
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
  contributed: number
  spent: number
}

export interface DashboardSummary {
  pool: number
  totalContributed: number
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
    totalSpent: Number(d.total_spent),
    byCategory: (d.by_category ?? []).map((c: any) => ({
      name: c.name,
      amount: Number(c.amount),
    })),
    monthly: (d.monthly ?? []).map((m: any) => ({
      month: m.month,
      contributed: Number(m.contributed),
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
    userActivities: (d.user_activities ?? []).map((a: any) => ({
      id: a.id,
      userId: a.userId,
      userName: a.userName,
      action: a.action,
      createdAt: a.createdAt,
      metadata: a.metadata,
    })),
  }
}

export interface UserActivityLog {
  id: string
  userId: string | null
  userName: string
  action: string
  createdAt: string
  metadata: Record<string, any> | null
}
