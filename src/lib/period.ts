export type Period = "all" | "this_month" | "this_quarter" | "this_year"

/**
 * Period test for a "YYYY-MM" bucket key rather than a full date.
 *
 * The dashboard no longer downloads raw rows — it gets per-month totals from
 * the dashboard_summary RPC. Every Period is calendar-aligned to the current
 * date, so month granularity is enough to answer all of them, and the filter
 * still works without refetching when the dropdown changes.
 */
export function isMonthInPeriod(monthKey: string, period: Period): boolean {
  if (period === "all") return true

  const [yearStr, monthStr] = monthKey.split("-")
  const year = Number(yearStr)
  const monthIndex = Number(monthStr) - 1
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return true

  const now = new Date()
  if (year !== now.getFullYear()) return false

  if (period === "this_year") return true
  if (period === "this_month") return monthIndex === now.getMonth()
  if (period === "this_quarter") {
    return Math.floor(monthIndex / 3) === Math.floor(now.getMonth() / 3)
  }
  return true
}

/**
 * The same calendar window as `isDateInPeriod`, as inclusive `YYYY-MM-DD`
 * bounds, so a server-side query can express the filter the client used to
 * apply row by row. Local dates on purpose — `occurred_on` is a plain date and
 * "this month" means the user's month, not UTC's.
 */
export function periodRange(period: Period): { from: string | null; to: string | null } {
  if (period === "all") return { from: null, to: null }

  const now = new Date()
  const y = now.getFullYear()
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

  if (period === "this_month") {
    return { from: iso(new Date(y, now.getMonth(), 1)), to: iso(new Date(y, now.getMonth() + 1, 0)) }
  }
  if (period === "this_quarter") {
    const q = Math.floor(now.getMonth() / 3)
    return { from: iso(new Date(y, q * 3, 1)), to: iso(new Date(y, q * 3 + 3, 0)) }
  }
  // this_year
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

export function isDateInPeriod(dateStr: string, period: Period): boolean {
  if (period === "all") return true
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return true
  const now = new Date()

  if (period === "this_month") {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }

  if (period === "this_quarter") {
    const currentQ = Math.floor(now.getMonth() / 3)
    const dateQ = Math.floor(d.getMonth() / 3)
    return d.getFullYear() === now.getFullYear() && dateQ === currentQ
  }

  if (period === "this_year") {
    return d.getFullYear() === now.getFullYear()
  }

  return true
}
