import { v4 as uuid } from "uuid"
import { getDb } from "./client"

export interface Investor {
  id: string
  name: string
  phone: string | null
  email: string | null
  role: "admin" | "investor"
  pin_hash: string | null
  agreed_contribution: number
  joined_at: string
}

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

export async function verifyInvestorPin(id: string, pin: string): Promise<boolean> {
  const db = getDb()
  const res = await db.execute({
    sql: "SELECT pin_hash FROM investors WHERE id = ?",
    args: [id],
  })
  if (res.rows.length === 0) return false
  const storedHash = res.rows[0].pin_hash as string | null
  if (!storedHash) return true // No PIN configured
  const enteredHash = await hashPin(pin)
  return storedHash === enteredHash
}

// ---- Investors ------------------------------------------------------

export async function listInvestors(): Promise<Investor[]> {
  const db = getDb()
  const res = await db.execute(
    "SELECT id, name, phone, email, role, pin_hash, agreed_contribution, joined_at FROM investors ORDER BY joined_at ASC"
  )
  return res.rows as unknown as Investor[]
}

export async function addInvestor(input: {
  name: string
  phone?: string
  email?: string
  role: "admin" | "investor"
  pin?: string
  agreedContribution: number
  addedBy?: string
}): Promise<Investor> {
  const db = getDb()
  const id = uuid()
  const joinedAt = new Date().toISOString()
  const pinHash = input.pin ? await hashPin(input.pin) : null

  await db.execute({
    sql: `INSERT INTO investors (id, name, phone, email, role, pin_hash, agreed_contribution, joined_at, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.name,
      input.phone ?? null,
      input.email ?? null,
      input.role,
      pinHash,
      input.agreedContribution,
      joinedAt,
      input.addedBy ?? null,
    ],
  })

  return {
    id,
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    role: input.role,
    pin_hash: pinHash,
    agreed_contribution: input.agreedContribution,
    joined_at: joinedAt,
  }
}

// ---- Pool totals (derived, never stored statically) ------------------

export async function getPoolTotal(): Promise<number> {
  const db = getDb()
  const res = await db.execute("SELECT COALESCE(SUM(agreed_contribution), 0) as total FROM investors")
  return Number(res.rows[0].total)
}

export async function getTotalContributed(): Promise<number> {
  const db = getDb()
  const res = await db.execute("SELECT COALESCE(SUM(amount), 0) as total FROM contributions")
  return Number(res.rows[0].total)
}

export interface InvestorStanding extends Investor {
  paid: number
  owed: number
  ownership_pct: number
}

export async function getInvestorStandings(): Promise<InvestorStanding[]> {
  const db = getDb()
  const pool = await getPoolTotal()
  const res = await db.execute(`
    SELECT i.id, i.name, i.phone, i.email, i.role, i.agreed_contribution, i.joined_at,
           COALESCE(SUM(c.amount), 0) as paid
    FROM investors i
    LEFT JOIN contributions c ON c.investor_id = i.id
    GROUP BY i.id
    ORDER BY i.joined_at ASC
  `)

  return (res.rows as unknown as (Investor & { paid: number })[]).map((row) => ({
    ...row,
    paid: Number(row.paid),
    owed: row.agreed_contribution - Number(row.paid),
    ownership_pct: pool > 0 ? (row.agreed_contribution / pool) * 100 : 0,
  }))
}

// ---- Budget categories -------------------------------------------------

export interface BudgetCategory {
  id: string
  name: string
}

export async function listCategories(): Promise<BudgetCategory[]> {
  const db = getDb()
  const res = await db.execute("SELECT id, name FROM budget_categories ORDER BY name ASC")
  return res.rows as unknown as BudgetCategory[]
}

export async function addCategory(name: string): Promise<BudgetCategory> {
  const db = getDb()
  const id = uuid()
  await db.execute({
    sql: "INSERT INTO budget_categories (id, name, created_at) VALUES (?, ?, ?)",
    args: [id, name, new Date().toISOString()],
  })
  return { id, name }
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
  recorded_by_name: string
  reverses_expense_id: string | null
}

export async function listExpenses(): Promise<Expense[]> {
  const db = getDb()
  const res = await db.execute(`
    SELECT e.id, e.category_id, c.name as category_name, e.amount, e.description,
           e.spent_at, e.recorded_by, i.name as recorded_by_name, e.reverses_expense_id
    FROM expenses e
    JOIN budget_categories c ON c.id = e.category_id
    JOIN investors i ON i.id = e.recorded_by
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
}): Promise<void> {
  const db = getDb()
  await db.execute({
    sql: `INSERT INTO expenses (id, category_id, amount, description, spent_at, recorded_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      uuid(),
      input.categoryId,
      input.amount,
      input.description,
      input.spentAt,
      input.recordedBy,
      new Date().toISOString(),
    ],
  })
}

export async function getTotalSpent(): Promise<number> {
  const db = getDb()
  const res = await db.execute("SELECT COALESCE(SUM(amount), 0) as total FROM expenses")
  return Number(res.rows[0].total)
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
