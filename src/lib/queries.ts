import { v4 as uuid } from "uuid"
import { api, isApiError } from "@/lib/api"

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
  const res = await api.get<any>("/investors")
  const rawList = res?.data?.investors ?? res?.investors ?? (Array.isArray(res?.data) ? res.data : null)

  if (!Array.isArray(rawList)) return []

  return rawList.map((inv: any) => ({
    id: inv.id,
    user_id: inv.userId ?? null,
    name: inv.name,
    phone: inv.phone ?? null,
    agreed_contribution: Number(inv.agreedContribution ?? 0),
    joined_at: inv.joinedAt || inv.createdAt || new Date().toISOString(),
    user: inv.user
      ? {
          name: inv.user.name ?? null,
          email: inv.user.email ?? null,
        }
      : null,
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

  const res = await api.post<any>("/investors", {
    name: input.name,
    agreedContribution: input.agreedContribution,
    joinedAt,
    userId: input.userId ?? undefined,
  })

  const invData = res?.data?.investor ?? res?.investor ?? res?.data

  return {
    id: invData?.id ?? uuid(),
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
  await api.patch<any>(`/investors/${id}`, {
    name: input.name,
    agreedContribution: input.agreedContribution,
  })
}

// ---- Pool totals (derived, never stored statically) ------------------

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
  const res = await api.get<any>("/contributions")
  const rawList = res?.data?.contributions ?? res?.contributions ?? []

  return (rawList as any[]).map((c) => ({
    id: c.id,
    investor_id: c.investorId,
    amount: Number(c.amount),
    paid_at: c.paidAt,
    method: c.method ?? "",
    note: c.note ?? null,
    recorded_by: c.recordedBy,
  }))
}

export async function getTotalContributed(): Promise<number> {
  const contributions = await listContributions()
  return contributions.reduce((sum, c) => sum + c.amount, 0)
}

export interface InvestorStanding extends Investor {
  paid: number
  owed: number
  ownership_pct: number
}

export async function getInvestorStandings(): Promise<InvestorStanding[]> {
  const [investors, contributions] = await Promise.all([listInvestors(), listContributions()])

  const paidMap = new Map<string, number>()
  for (const c of contributions) {
    paidMap.set(c.investor_id, (paidMap.get(c.investor_id) ?? 0) + c.amount)
  }

  const pool = investors.reduce((sum, inv) => sum + inv.agreed_contribution, 0)

  return investors.map((inv) => {
    const paid = paidMap.get(inv.id) ?? 0
    const owed = Math.max(0, inv.agreed_contribution - paid)
    const ownership_pct = pool > 0 ? (inv.agreed_contribution / pool) * 100 : 0
    return { ...inv, paid, owed, ownership_pct }
  })
}

// ---- Budget categories -------------------------------------------------

export interface BudgetCategory {
  id: string
  name: string
  description?: string | null
}

export async function listCategories(): Promise<BudgetCategory[]> {
  const res = await api.get<{ data: { categories: any[] } }>("/expense-categories")
  const categories = res?.data?.categories ?? []
  return categories.map((c: any) => ({
    id: c.id,
    name: c.name,
    description: c.description ?? null,
  }))
}

export async function addCategory(name: string, description?: string): Promise<BudgetCategory> {
  const res = await api.post<{ data: { category: any } }>("/expense-categories", {
    name,
    description: description || undefined,
  })
  const apiCat = res?.data?.category

  return {
    id: apiCat?.id ?? uuid(),
    name: apiCat?.name ?? name,
    description: apiCat?.description ?? description ?? null,
  }
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
  const res = await api.get<{ data: { expenses: any[] } }>("/expenses")
  const expenses = res?.data?.expenses ?? []

  return expenses.map((e: any) => ({
    id: e.id,
    category_id: e.categoryId,
    category_name: e.category?.name || "Catégorie inconnue",
    amount: Number(e.amount),
    description: e.description,
    spent_at: e.spentAt,
    recorded_by: e.recordedBy,
    recorded_by_name: e.recorder?.name ?? null,
    reverses_expense_id: e.reversesExpenseId ?? null,
  }))
}

export async function addExpense(input: {
  categoryId: string
  amount: number
  description: string
  spentAt: string
  receiptPhotoPath?: string | null
}): Promise<void> {
  await api.post<{ data: { expense: any } }>("/expenses", {
    categoryId: input.categoryId,
    amount: input.amount,
    description: input.description,
    spentAt: input.spentAt,
    receiptPhotoPath: input.receiptPhotoPath || undefined,
  })
}

export async function getTotalSpent(): Promise<number> {
  const expenses = await listExpenses()
  return expenses.reduce((sum, e) => sum + e.amount, 0)
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

export interface UserActivityLog {
  id: string
  userId: string | null
  userName: string
  action: string
  createdAt: string
  metadata: Record<string, any> | null
}

export async function listUserActivities(): Promise<UserActivityLog[]> {
  try {
    const res = await api.get<{ data: { activities: any[] } }>("/activities")
    const activities = res?.data?.activities ?? []
    return activities
      .filter((act: any) => !act.action.startsWith("AUTH_"))
      .map((act: any) => ({
        id: act.id,
        userId: act.userId ?? null,
        userName: act.userName ?? act.user?.name ?? act.metadata?.actorName ?? "Utilisateur",
        action: act.action,
        createdAt: act.createdAt,
        metadata: act.metadata ?? null,
      }))
  } catch (err) {
    if (isApiError(err) && err.kind === "http") throw err
    console.warn("Failed to fetch user activities from API:", err)
    return []
  }
}
