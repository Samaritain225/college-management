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

// Cotisation only — matches the unit of getPoolTotal() (agreed_contribution
// is the cotisation target; adhésion is a separate flat entry fee excluded
// from this ratio, per the ownership-basis decision in refactor-plan.md).
export async function getTotalContributed(): Promise<number> {
  const res = await supabase
    .from("contributions")
    .select("amount")
    .eq("college_id", COLLEGE_ID)
    .eq("type", "cotisation")
  const rows = unwrap(res)
  return rows.reduce((sum: number, r: any) => sum + Number(r.amount), 0)
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

export async function getTotalSpent(): Promise<number> {
  const res = await supabase.from("expenses").select("total_amount").eq("college_id", COLLEGE_ID)
  const rows = unwrap(res)
  return rows.reduce((sum: number, r: any) => sum + Number(r.total_amount), 0)
}

export async function getSpentByCategory(): Promise<{ name: string; amount: number }[]> {
  const expenses = await listExpenses()
  const totals = new Map<string, number>()
  for (const e of expenses) {
    totals.set(e.category_name, (totals.get(e.category_name) ?? 0) + e.amount)
  }
  return Array.from(totals.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
}

export interface Activity {
  id: string
  type: "contribution" | "expense"
  title: string
  subtitle: string
  amount: number
  date: string
}

export async function getRecentActivities(): Promise<Activity[]> {
  const [investors, contributions, expenses] = await Promise.all([
    listInvestors(),
    listContributions(),
    listExpenses(),
  ])

  const investorNames = new Map(investors.map((inv) => [inv.id, inv.name]))

  const contribActivities: Activity[] = contributions.map((c) => ({
    id: c.id,
    type: "contribution",
    title: investorNames.get(c.investor_id) ?? "Investisseur",
    subtitle: c.method || "Contribution",
    amount: c.amount,
    date: c.paid_at,
  }))

  const expenseActivities: Activity[] = expenses.map((e) => ({
    id: e.id,
    type: "expense",
    title: e.description,
    subtitle: e.category_name,
    amount: e.amount,
    date: e.spent_at,
  }))

  return [...contribActivities, ...expenseActivities]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)
}

// ---- User activity log --------------------------------------------------
// Sourced from activity_log (populated by DB triggers, not app code — see
// the initial_schema migration). metadata on each row is a raw dump of the
// inserted record (to_jsonb(new)), so it carries the new schema's column
// names (label, total_amount, target_contribution) rather than the
// UI-facing camelCase shape the old Adonis activity service produced.
// Normalized here rather than reshaping RecentActivities.tsx's already
// carefully laid out formatActivityItem().

export interface UserActivityLog {
  id: string
  userId: string | null
  userName: string
  action: string
  createdAt: string
  metadata: Record<string, any> | null
}

export async function listUserActivities(): Promise<UserActivityLog[]> {
  const res = await supabase
    .from("activity_log")
    .select("id, user_id, action, metadata, created_at, profiles(full_name)")
    .eq("college_id", COLLEGE_ID)
    .order("created_at", { ascending: false })
    .limit(20)
  const rows = unwrap(res)

  // CONTRIBUTION_CREATE rows only carry investor_id in their raw metadata —
  // resolve names for the subtitle in one batch rather than per-row.
  const investorIds = Array.from(
    new Set(
      rows
        .filter((r: any) => r.action === "CONTRIBUTION_CREATE")
        .map((r: any) => r.metadata?.investor_id)
        .filter(Boolean)
    )
  )
  let investorNameById = new Map<string, string>()
  if (investorIds.length > 0) {
    const investorsRes = await supabase.from("investors").select("id, name").in("id", investorIds)
    const investorRows = unwrap(investorsRes)
    investorNameById = new Map(investorRows.map((i: any) => [i.id, i.name]))
  }

  return rows.map((r: any) => {
    const raw = r.metadata || {}
    let metadata: Record<string, any> = raw

    if (r.action === "EXPENSE_CREATE") {
      metadata = { description: raw.label, amount: raw.total_amount }
    } else if (r.action === "CONTRIBUTION_CREATE") {
      metadata = {
        investorName: investorNameById.get(raw.investor_id) ?? null,
        amount: raw.amount,
      }
    } else if (r.action === "INVESTOR_CREATE") {
      metadata = { name: raw.name, agreedContribution: raw.target_contribution }
    }
    // OTHER_INCOME_CREATE / EXPENSE_PAYMENT_CREATE fall through with their
    // raw `amount` column already matching what formatActivityItem's
    // default case reads.

    return {
      id: r.id,
      userId: r.user_id,
      userName: r.profiles?.full_name ?? "Utilisateur",
      action: r.action,
      createdAt: r.created_at,
      metadata,
    }
  })
}
