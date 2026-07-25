import { cn, formatMoney } from "@/lib/utils"

export interface CategorySpend {
  name: string
  amount: number
  color: string // tailwind bg-* class
}

interface BudgetBarProps {
  totalPool: number
  spentByCategory: CategorySpend[]
}

/**
 * Signature element: a single bar showing the whole budget pool, segmented
 * by category, with the unspent remainder left open. This is the answer to
 * the question everyone actually has — "how much is left, and where did
 * the rest go" — rendered as one honest shape instead of a generic
 * progress bar or a pie chart that hides the absolute numbers.
 */
export function BudgetBar({ totalPool, spentByCategory }: BudgetBarProps) {
  const totalSpent = spentByCategory.reduce((sum, c) => sum + c.amount, 0)
  const remaining = totalPool - totalSpent

  return (
    <div className="w-full">
      <style>{`
        @keyframes slideIn {
          from { width: 0; }
        }
        .animate-bar {
          animation: slideIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
      <div className="flex h-8 w-full overflow-hidden rounded-lg border border-ink/10 bg-paper">
        {spentByCategory.map((cat) => (
          <div
            key={cat.name}
            className={cn(cat.color, "h-full transition-all animate-bar")}
            style={{ width: `${(cat.amount / totalPool) * 100}%` }}
            title={`${cat.name}: ${formatMoney(cat.amount)}`}
          />
        ))}
        <div
          className="h-full bg-transparent animate-bar"
          style={{ width: `${(remaining / totalPool) * 100}%` }}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-xs">
        {spentByCategory.map((cat) => (
          <div key={cat.name} className="flex items-center gap-2">
            <span className={cn(cat.color, "h-3 w-3 rounded-full")} />
            <span className="text-ink-soft font-display font-medium">{cat.name}</span>
            <span className="font-semibold text-ink">{formatMoney(cat.amount)}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full border border-ink/10 bg-paper" />
          <span className="text-ink-soft font-display font-medium">Restant</span>
          <span className="font-semibold text-ink">{formatMoney(remaining)}</span>
        </div>
      </div>
    </div>
  )
}
