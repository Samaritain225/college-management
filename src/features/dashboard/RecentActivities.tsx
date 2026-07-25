import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Clock, TrendingUp, TrendingDown, Activity as ActivityIcon } from "lucide-react"
import { formatMoney, cn } from "@/lib/utils"
import type { Activity, UserActivityLog } from "@/lib/queries"

export interface FormattedActivity {
  actor: string
  actionText: string
  subtitle: string
  amount: number | null
  type: "expense" | "contribution" | "info"
}

function relativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return ""
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return "à l'instant"
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`
  if (diff < 604800) return `il y a ${Math.floor(diff / 86400)} j`
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
}

export function formatActivityItem(act: UserActivityLog): FormattedActivity {
  const meta = act.metadata || {}
  const actor = act.userName || "Utilisateur"

  switch (act.action) {
    case "EXPENSE_CREATE":
      return {
        actor,
        actionText: "a enregistré une dépense",
        subtitle: meta.description ? String(meta.description) : "",
        amount: meta.amount ? Number(meta.amount) : null,
        type: "expense",
      }
    case "CONTRIBUTION_CREATE":
      return {
        actor,
        actionText: "a enregistré un apport",
        subtitle: meta.investorName ? `Investisseur : ${meta.investorName}` : "",
        amount: meta.amount ? Number(meta.amount) : null,
        type: "contribution",
      }
    case "EXPENSE_CATEGORY_CREATE":
      return {
        actor,
        actionText: "a créé une catégorie",
        subtitle: meta.name ? String(meta.name) : "",
        amount: null,
        type: "info",
      }
    case "INVESTOR_CREATE":
      return {
        actor,
        actionText: "a ajouté un investisseur",
        subtitle: meta.name ? String(meta.name) : "",
        amount: meta.agreedContribution ? Number(meta.agreedContribution) : null,
        type: "info",
      }
    case "INVESTOR_UPDATE":
      return {
        actor,
        actionText: "a modifié un investisseur",
        subtitle: meta.name ? String(meta.name) : "",
        amount: null,
        type: "info",
      }
    case "USER_CREATE":
      return {
        actor,
        actionText: "a créé un utilisateur",
        subtitle: meta.name ? `${meta.name} (${meta.email || ""})` : (meta.email ? String(meta.email) : ""),
        amount: null,
        type: "info",
      }
    case "USER_UPDATE":
      return {
        actor,
        actionText: "a mis à jour un utilisateur",
        subtitle: meta.name ? String(meta.name) : "",
        amount: null,
        type: "info",
      }
    case "USER_DEACTIVATE":
      return {
        actor,
        actionText: "a désactivé un compte",
        subtitle: meta.name ? String(meta.name) : "",
        amount: null,
        type: "info",
      }
    case "USER_REACTIVATE":
      return {
        actor,
        actionText: "a réactivé un compte",
        subtitle: meta.name ? String(meta.name) : "",
        amount: null,
        type: "info",
      }
    default:
      return {
        actor,
        actionText: `— ${act.action.replace(/_/g, " ")}`,
        subtitle: meta.name || meta.title || "",
        amount: meta.amount ? Number(meta.amount) : null,
        type: "info",
      }
  }
}

interface RecentActivitiesProps {
  userActivities: UserActivityLog[]
  fallbackActivities: Activity[]
  className?: string
}

export function RecentActivities({ userActivities, fallbackActivities, className }: RecentActivitiesProps) {
  return (
    <Card className={cn("border-ink/10 bg-paper flex flex-col", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-ink font-display font-semibold text-base flex items-center gap-2">
          <Clock className="size-4 text-ink-soft" />
          Activités récentes
        </CardTitle>
      </CardHeader>
      <CardContent className="px-6 pb-6 pt-0 flex-1">
        {userActivities.length > 0 ? (
          <div className="relative border-l border-ink/10 pl-4 space-y-3.5">
            {userActivities.slice(0, 5).map((act) => {
              const formatted = formatActivityItem(act)
              const isContrib = formatted.type === "contribution"
              const isExpense = formatted.type === "expense"
              const amountColor = isContrib ? "text-positive" : isExpense ? "text-terracotta-600" : "text-ink"
              const amountBg = isContrib ? "bg-positive/8" : isExpense ? "bg-terracotta-600/8" : "bg-ink/5"
              const iconColor = isContrib ? "text-positive" : isExpense ? "text-terracotta-600" : "text-teal-950"

              return (
                <div key={act.id} className="relative flex items-start justify-between gap-3 group">
                  {/* Timeline dot */}
                  <span
                    className={cn(
                      "absolute -left-[25px] top-1 flex h-4 w-4 items-center justify-center rounded-full border border-ink/10 bg-paper shrink-0",
                      iconColor
                    )}
                  >
                    {isContrib ? (
                      <TrendingUp className="size-3" />
                    ) : isExpense ? (
                      <TrendingDown className="size-3" />
                    ) : (
                      <ActivityIcon className="size-3" />
                    )}
                  </span>

                  {/* Main content block */}
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    {/* Row 1: actor name + amount pill */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-display font-bold text-ink truncate">
                        {formatted.actor}
                      </span>
                      {formatted.amount !== null && (
                        <div className={cn("shrink-0 rounded-md px-2 py-0.5", amountBg)}>
                          <span className={cn("text-[11px] font-bold font-mono tabular-nums", amountColor)}>
                            {isContrib ? "+" : isExpense ? "−" : ""}
                            {formatMoney(formatted.amount)}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Row 2: action text */}
                    <p className="text-xs font-normal text-ink-soft leading-tight">
                      {formatted.actionText}
                    </p>
                    {formatted.subtitle && (
                      <p className="text-[11px] text-ink-soft/70 leading-tight font-normal truncate">
                        {formatted.subtitle}
                      </p>
                    )}
                    <p className="text-[10px] text-ink-soft/50 leading-none font-normal pt-0.5">
                      {relativeTime(act.createdAt)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : fallbackActivities.length > 0 ? (
          <div className="relative border-l border-ink/10 pl-4 space-y-3.5">
            {fallbackActivities.slice(0, 5).map((act) => {
              const isContrib = act.type === "contribution"
              const amountColor = isContrib ? "text-positive" : "text-terracotta-600"
              const amountBg = isContrib ? "bg-positive/8" : "bg-terracotta-600/8"

              return (
                <div key={act.id} className="relative flex items-start justify-between gap-3 group">
                  <span
                    className={cn(
                      "absolute -left-[25px] top-1 flex h-4 w-4 items-center justify-center rounded-full border border-ink/10 bg-paper shrink-0",
                      isContrib ? "text-positive" : "text-terracotta-600"
                    )}
                  >
                    {isContrib ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  </span>

                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    {/* Row 1: title + amount pill */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-display font-bold text-ink truncate">{act.title}</span>
                      <div className={cn("shrink-0 rounded-md px-2 py-0.5", amountBg)}>
                        <span className={cn("text-[11px] font-bold font-mono tabular-nums", amountColor)}>
                          {isContrib ? "+" : "−"}
                          {formatMoney(act.amount)}
                        </span>
                      </div>
                    </div>
                    {/* Row 2: subtitle + timestamp */}
                    {act.subtitle && (
                      <p className="text-[11px] text-ink-soft/70 leading-tight font-normal truncate">{act.subtitle}</p>
                    )}
                    {act.date && (
                      <p className="text-[10px] text-ink-soft/50 leading-none font-normal pt-0.5">
                        {relativeTime(act.date)}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-ink-soft text-center py-6">
            Aucune activité enregistrée.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
