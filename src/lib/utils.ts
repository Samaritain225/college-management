import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Amounts are stored as integers in XOF (West African CFA franc), which
// has no minor subdivision in everyday use — so no cents conversion needed,
// and no floating point drift on sums.
export function formatMoney(amount: number, currency = "F CFA") {
  const rounded = Math.round(Number(amount) || 0)
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")
  return `${formatted}\u00a0${currency}`
}
