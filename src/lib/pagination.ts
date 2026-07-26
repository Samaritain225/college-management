export const DEFAULT_PAGE_SIZE = 10

/**
 * Page numbers to render, with `null` standing for an ellipsis.
 *
 * Always the same count of slots so the control does not change width as you
 * move through it — a pager that reflows under the cursor makes you misclick.
 */
export function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, null, total]
  if (current >= total - 3) return [1, null, total - 4, total - 3, total - 2, total - 1, total]
  return [1, null, current - 1, current, current + 1, null, total]
}
