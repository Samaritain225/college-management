import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Amounts are stored as integers in XOF (West African CFA franc), which
// has no minor subdivision in everyday use — so no cents conversion needed,
// and no floating point drift on sums.
// The currency label keeps a non-breaking space inside it too — with a plain
// space, "75 000 000 F CFA" breaks between the F and the CFA on narrow cards,
// which happened on every KPI card at every viewport.
export function formatMoney(amount: number, currency = "F\u00a0CFA") {
  const rounded = Math.round(Number(amount) || 0)
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")
  return `${formatted}\u00a0${currency}`
}
