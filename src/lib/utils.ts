import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Amounts are stored as integers in XOF (West African CFA franc), which
// has no minor subdivision in everyday use — so no cents conversion needed,
// and no floating point drift on sums.
//
// Two kinds of space, and the difference is the whole point:
//   * Non-breaking INSIDE the number and INSIDE the unit, so "152 535 900"
//     never splits between digit groups and "F CFA" never splits between the
//     F and the CFA. Both of those read as typos.
//   * An ordinary, breakable space BETWEEN the amount and the unit. That is
//     the one legitimate break point, and without it the string is atomic:
//     "152 535 900 F CFA" wants 202px and was silently clipped inside the
//     153px KPI cards, which is how the dashboard came to show "… F CF".
export function formatMoney(amount: number, currency = "F\u00a0CFA") {
  const rounded = Math.round(Number(amount) || 0)
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")
  return `${formatted} ${currency}`
}
