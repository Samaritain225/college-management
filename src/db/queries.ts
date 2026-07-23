import { v4 as uuid } from "uuid"
import { getDb } from "./client"
import { api, isApiError } from "@/lib/api"

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

// ---- Investors ------------------------------------------------------

export async function listInvestors(): Promise<Investor[]> {
  const db = getDb()
  try {
    const res = await api.get<any>("/investors")
    const rawList = res?.data?.investors ?? res?.investors ?? (Array.isArray(res?.data) ? res.data : null)

    if (Array.isArray(rawList)) {
      const apiInvestors: Investor[] = rawList.map((inv: any) => ({
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

      for (const inv of apiInvestors) {
        try {
          await db.execute({
            sql: `INSERT INTO investors (id, user_id, name, phone, agreed_contribution, joined_at, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET
                    user_id = excluded.user_id,
                    name = excluded.name,
                    phone = excluded.phone,
                    agreed_contribution = excluded.agreed_contribution,
                    joined_at = excluded.joined_at`,
            args: [
              inv.id,
              inv.user_id,
              inv.name,
              inv.phone,
              inv.agreed_contribution,
              inv.joined_at,
              new Date().toISOString(),
            ],
          })
        } catch (dbErr) {
          console.warn("Local DB sync for investor failed:", inv.id, dbErr)
        }
      }

      return apiInvestors
    }
  } catch (err) {
    console.warn("Failed to fetch investors from API, using local DB:", err)
  }

  const res = await db.execute(
    "SELECT id, user_id, name, phone, agreed_contribution, joined_at FROM investors ORDER BY name ASC"
  )
  return res.rows as unknown as Investor[]
}

export async function addInvestor(input: {
  userId?: string | null
  name: string
  phone?: string | null
  agreedContribution: number
  joinedAt?: string
  addedBy?: string
}): Promise<Investor> {
  const db = getDb()
  let id = uuid()
  const joinedAt = input.joinedAt || new Date().toISOString()
  const createdAt = new Date().toISOString()

  try {
    const res = await api.post<any>("/investors", {
      name: input.name,
      agreedContribution: input.agreedContribution,
      joinedAt,
      userId: input.userId ?? undefined,
    })

    const invData = res?.data?.investor ?? res?.investor ?? res?.data
    if (invData?.id) {
      id = invData.id
    }
  } catch (err) {
    if (isApiError(err) && err.kind === "http") throw err
    console.warn("API creation for investor failed, saving locally:", err)
  }

  try {
    await db.execute({
      sql: `INSERT INTO investors (id, user_id, name, phone, agreed_contribution, joined_at, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              user_id = excluded.user_id,
              name = excluded.name,
              phone = excluded.phone,
              agreed_contribution = excluded.agreed_contribution,
              joined_at = excluded.joined_at`,
      args: [
        id,
        input.userId ?? null,
        input.name,
        input.phone ?? null,
        input.agreedContribution,
        joinedAt,
        input.addedBy ?? null,
        createdAt,
      ],
    })
  } catch (dbErr) {
    console.warn("Local DB execute for addInvestor failed:", dbErr)
  }

  return {
    id,
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
  const db = getDb()

  try {
    await api.patch<any>(`/investors/${id}`, {
      name: input.name,
      agreedContribution: input.agreedContribution,
    })
  } catch (err) {
    if (isApiError(err) && err.kind === "http") throw err
    console.warn("API update for investor failed, updating locally:", err)
  }

  try {
    await db.execute({
      sql: `UPDATE investors 
            SET name = ?, user_id = ?, agreed_contribution = ?, phone = ?, updated_at = ? 
            WHERE id = ?`,
      args: [
        input.name,
        input.userId ?? null,
        input.agreedContribution,
        input.phone ?? null,
        new Date().toISOString(),
        id,
      ],
    })
  } catch (dbErr) {
    console.warn("Local DB execute for updateInvestor failed:", dbErr)
  }
}

// ---- Pool totals (derived, never stored statically) ------------------

export async function getPoolTotal(): Promise<number> {
  const investors = await listInvestors()
  if (investors.length > 0) {
    return investors.reduce((sum, inv) => sum + inv.agreed_contribution, 0)
  }
  const db = getDb()
  const res = await db.execute("SELECT COALESCE(SUM(agreed_contribution), 0) as total FROM investors")
  return Number(res.rows?.[0]?.total ?? 0)
}

export async function getTotalContributed(): Promise<number> {
  const db = getDb()
  const res = await db.execute("SELECT COALESCE(SUM(amount), 0) as total FROM contributions")
  return Number(res.rows?.[0]?.total ?? 0)
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
  const db = getDb()
  const res = await db.execute("SELECT id, investor_id, amount, paid_at, method, note, recorded_by FROM contributions ORDER BY paid_at ASC")
  return res.rows.map((row: any) => ({
    id: row.id,
    investor_id: row.investor_id,
    amount: Number(row.amount),
    paid_at: String(row.paid_at),
    method: String(row.method),
    note: row.note ? String(row.note) : null,
    recorded_by: String(row.recorded_by),
  }))
}

export interface InvestorStanding extends Investor {
  paid: number
  owed: number
  ownership_pct: number
}

export async function getInvestorStandings(): Promise<InvestorStanding[]> {
  const apiInvestors = await listInvestors()
  const db = getDb()

  let paidMap = new Map<string, number>()
  try {
    const res = await db.execute(`
      SELECT investor_id, COALESCE(SUM(amount), 0) as paid
      FROM contributions
      GROUP BY investor_id
    `)
    for (const row of res.rows as any[]) {
      paidMap.set(String(row.investor_id), Number(row.paid))
    }
  } catch (err) {
    console.warn("Failed to fetch contribution sums for investors:", err)
  }

  const pool = apiInvestors.reduce((sum, inv) => sum + inv.agreed_contribution, 0)

  return apiInvestors.map((inv) => {
    const paid = paidMap.get(inv.id) ?? 0
    const owed = Math.max(0, inv.agreed_contribution - paid)
    const ownership_pct = pool > 0 ? (inv.agreed_contribution / pool) * 100 : 0
    return {
      ...inv,
      paid,
      owed,
      ownership_pct,
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
  const db = getDb()
  try {
    const res = await api.get<{ data: { categories: any[] } }>("/expense-categories")
    if (res?.data?.categories) {
      const categories: BudgetCategory[] = res.data.categories.map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? null,
      }))
      for (const cat of categories) {
        await db.execute({
          sql: "INSERT INTO budget_categories (id, name, description, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
          args: [cat.id, cat.name, cat.description ?? null, new Date().toISOString()],
        })
      }
      return categories
    }
  } catch (err) {
    console.warn("Failed to fetch expense categories from API, using local DB:", err)
  }

  const res = await db.execute("SELECT id, name, description FROM budget_categories ORDER BY name ASC")
  return res.rows as unknown as BudgetCategory[]
}

export async function addCategory(name: string, description?: string): Promise<BudgetCategory> {
  const db = getDb()
  let categoryId = uuid()
  let finalName = name
  let finalDesc = description ?? null

  try {
    const res = await api.post<{ data: { category: any } }>("/expense-categories", {
      name,
      description: description || undefined,
    })
    if (res?.data?.category) {
      const apiCat = res.data.category
      categoryId = apiCat.id
      finalName = apiCat.name
      finalDesc = apiCat.description ?? null
    }
  } catch (err) {
    if (isApiError(err) && err.kind === "http") throw err
    console.warn("API creation for category failed, saving locally:", err)
  }

  try {
    await db.execute({
      sql: "INSERT INTO budget_categories (id, name, description, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
      args: [categoryId, finalName, finalDesc, new Date().toISOString()],
    })
  } catch (dbErr) {
    console.warn("Local DB execute for addCategory skipped:", dbErr)
  }

  return { id: categoryId, name: finalName, description: finalDesc }
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
  const db = getDb()
  try {
    const res = await api.get<{ data: { expenses: any[] } }>("/expenses")
    if (res?.data?.expenses) {
      const apiExpenses: Expense[] = res.data.expenses.map((e: any) => ({
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

      for (const e of apiExpenses) {
        await db.execute({
          sql: `INSERT INTO expenses (id, category_id, amount, description, spent_at, recorded_by, recorder_name, reverses_expense_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO NOTHING`,
          args: [
            e.id,
            e.category_id,
            e.amount,
            e.description,
            e.spent_at,
            e.recorded_by,
            e.recorded_by_name,
            e.reverses_expense_id,
            new Date().toISOString(),
          ],
        })

        if (e.recorded_by_name) {
          await db.execute({
            sql: `INSERT INTO expense_recorder_cache (expense_id, user_id, name, cached_at)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(expense_id) DO UPDATE SET user_id=excluded.user_id, name=excluded.name, cached_at=excluded.cached_at`,
            args: [e.id, e.recorded_by, e.recorded_by_name, new Date().toISOString()],
          })
        }
      }

      return apiExpenses
    }
  } catch (err) {
    console.warn("Failed to fetch expenses from API, using local DB:", err)
  }

  const res = await db.execute(`
    SELECT e.id, e.category_id, c.name as category_name, e.amount, e.description,
           e.spent_at, e.recorded_by, COALESCE(r.name, e.recorder_name) as recorded_by_name, e.reverses_expense_id
    FROM expenses e
    JOIN budget_categories c ON c.id = e.category_id
    LEFT JOIN expense_recorder_cache r ON r.expense_id = e.id
    ORDER BY e.spent_at DESC
  `)
  return res.rows as unknown as Expense[]
}

export async function addExpense(input: {
  categoryId: string
  amount: number
  description: string
  spentAt: string
  recordedBy: string // required — caller must pass the active user's id
  recorderName: string
  receiptPhotoPath?: string | null
}): Promise<void> {
  const db = getDb()
  let expenseId = uuid()

  try {
    const res = await api.post<{ data: { expense: any } }>("/expenses", {
      categoryId: input.categoryId,
      amount: input.amount,
      description: input.description,
      spentAt: input.spentAt,
      receiptPhotoPath: input.receiptPhotoPath || undefined,
    })

    if (res?.data?.expense) {
      expenseId = res.data.expense.id
    }
  } catch (err) {
    if (isApiError(err) && err.kind === "http") throw err
    console.warn("API creation for expense failed, saving locally:", err)
  }

  await db.execute({
    sql: `INSERT INTO expenses (id, category_id, amount, description, spent_at, recorded_by, recorder_name, receipt_photo_path, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: [
      expenseId,
      input.categoryId,
      input.amount,
      input.description,
      input.spentAt,
      input.recordedBy,
      input.recorderName,
      input.receiptPhotoPath ?? null,
      new Date().toISOString(),
    ],
  })
}

export async function getTotalSpent(): Promise<number> {
  const db = getDb()
  const res = await db.execute("SELECT COALESCE(SUM(amount), 0) as total FROM expenses")
  return Number(res.rows?.[0]?.total ?? 0)
}

export async function getSpentByCategory(): Promise<{ name: string; amount: number }[]> {
  const db = getDb()
  const res = await db.execute(`
    SELECT c.name as name, COALESCE(SUM(e.amount), 0) as amount
    FROM budget_categories c
    LEFT JOIN expenses e ON e.category_id = c.id
    GROUP BY c.id
    HAVING amount > 0
    ORDER BY amount DESC
  `)
  return (res.rows as unknown as { name: string; amount: number }[]).map((r) => ({
    name: r.name,
    amount: Number(r.amount),
  }))
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
  const db = getDb()
  
  // Fetch latest 5 contributions
  const contribRes = await db.execute(`
    SELECT c.id, i.name as title, c.method as subtitle, c.amount, c.paid_at as date
    FROM contributions c
    JOIN investors i ON c.investor_id = i.id
    ORDER BY c.paid_at DESC LIMIT 5
  `)
  const contribs: Activity[] = contribRes.rows.map((row: any) => ({
    id: row.id,
    type: "contribution",
    title: String(row.title),
    subtitle: String(row.subtitle || "Contribution"),
    amount: Number(row.amount),
    date: String(row.date),
  }))

  // Fetch latest 5 expenses
  const expenseRes = await db.execute(`
    SELECT e.id, e.description as title, cat.name as subtitle, e.amount, e.spent_at as date
    FROM expenses e
    JOIN budget_categories cat ON e.category_id = cat.id
    ORDER BY e.spent_at DESC LIMIT 5
  `)
  const expenses: Activity[] = expenseRes.rows.map((row: any) => ({
    id: row.id,
    type: "expense",
    title: String(row.title),
    subtitle: String(row.subtitle || "Dépense"),
    amount: Number(row.amount),
    date: String(row.date),
  }))

  // Combine and sort DESC by date
  return [...contribs, ...expenses]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)
}

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
    if (res?.data?.activities) {
      return res.data.activities
        .filter((act: any) => !act.action.startsWith("AUTH_"))
        .map((act: any) => ({
          id: act.id,
          userId: act.userId ?? null,
          userName: act.userName ?? act.user?.name ?? act.metadata?.actorName ?? "Utilisateur",
          action: act.action,
          createdAt: act.createdAt,
          metadata: act.metadata ?? null,
        }))
    }
  } catch (err) {
    console.warn("Failed to fetch user activities from API:", err)
  }
  return []
}

