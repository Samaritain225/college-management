import type { ComponentType, ReactNode } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: ReactNode
  icon: ComponentType<{ className?: string }>
  iconClassName?: string
  valueClassName?: string
  footer: ReactNode
  /** "dashboard": label+value stacked left, footer divided by a top border.
   *  "card": shadcn Card/CardHeader/CardContent split, no divider. */
  variant?: "dashboard" | "card"
  className?: string
}

/** Icon-chip + label + big number + footer caption — the KPI stat card
 * repeated across Dashboard/ExpensesPage/InvestorsPage. */
export function StatCard({
  label,
  value,
  icon: Icon,
  iconClassName = "bg-teal-100 text-teal-950",
  valueClassName = "text-ink",
  footer,
  variant = "dashboard",
  className,
}: StatCardProps) {
  if (variant === "card") {
    return (
      <Card className={cn("border border-ink/10 shadow-2xs hover:shadow-xs transition-shadow bg-paper", className)}>
        <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 pb-2">
          <CardTitle className="min-w-0 text-xs font-display font-semibold text-ink-soft">
            {label}
          </CardTitle>
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              iconClassName
            )}
          >
            <Icon className="size-4" />
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {/* text-balance so a wrapped amount splits evenly instead of leaving
              a lone "F CFA" on line two. */}
          <div
            className={cn(
              "text-xl sm:text-2xl font-display font-bold tracking-tight text-balance tabular-nums",
              valueClassName
            )}
          >
            {value}
          </div>
          <p className="text-xs text-ink-soft mt-1">{footer}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      className={cn(
        "border border-ink/10 bg-paper p-5 flex flex-col justify-between min-h-[110px] relative overflow-hidden group",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {/* min-w-0 is what lets the amount wrap at all — without it this column
            keeps its content width and overflows the card instead. */}
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-display font-semibold text-ink-soft uppercase tracking-wider">{label}</p>
          <h3 className={cn("text-lg font-display font-bold text-balance tabular-nums", valueClassName)}>
            {value}
          </h3>
        </div>
        <div className={cn("p-2 rounded-lg shrink-0", iconClassName)}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="pt-2 border-t border-ink/10 text-xs font-display font-semibold text-ink-soft">{footer}</div>
    </Card>
  )
}
