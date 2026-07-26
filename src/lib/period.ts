export type Period = "all" | "this_month" | "this_quarter" | "this_year"

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
