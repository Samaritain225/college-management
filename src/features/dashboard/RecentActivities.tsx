import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Clock, TrendingUp, TrendingDown, Activity as ActivityIcon } from "lucide-react"
import { formatMoney } from "@/lib/utils"
import type { Activity, UserActivityLog } from "@/db/queries"

export interface FormattedActivity {
  title: string
  subtitle: string
  amount: number | null
  type: "expense" | "contribution" | "info"
}

export function formatActivityItem(act: UserActivityLog): FormattedActivity {
  const meta = act.metadata || {}
  const actor = act.userName || "Utilisateur"

  switch (act.action) {
    case "EXPENSE_CREATE":
      return {
        title: `${actor} a enregistré une dépense`,
        subtitle: meta.description ? String(meta.description) : "Dépense",
        amount: meta.amount ? Number(meta.amount) : null,
        type: "expense",
      }
    case "CONTRIBUTION_CREATE":
      return {
        title: `${actor} a enregistré un apport`,
        subtitle: meta.investorName ? `Investisseur : ${meta.investorName}` : "Contribution",
        amount: meta.amount ? Number(meta.amount) : null,
        type: "contribution",
      }
    case "EXPENSE_CATEGORY_CREATE":
      return {
        title: `${actor} a créé une catégorie`,
        subtitle: meta.name ? String(meta.name) : "Catégorie de dépense",
        amount: null,
        type: "info",
      }
    case "INVESTOR_CREATE":
      return {
        title: `${actor} a ajouté un investisseur`,
        subtitle: meta.name ? String(meta.name) : "Nouvel investisseur",
        amount: meta.agreedContribution ? Number(meta.agreedContribution) : null,
        type: "info",
      }
    case "INVESTOR_UPDATE":
      return {
        title: `${actor} a modifié un investisseur`,
        subtitle: meta.name ? String(meta.name) : "Mise à jour investisseur",
        amount: null,
        type: "info",
      }
    case "USER_CREATE":
      return {
        title: `${actor} a créé un utilisateur`,
        subtitle: meta.name ? `${meta.name} (${meta.email || ""})` : String(meta.email || "Utilisateur"),
        amount: null,
        type: "info",
      }
    case "USER_UPDATE":
      return {
        title: `${actor} a mis à jour un utilisateur`,
        subtitle: meta.name ? String(meta.name) : "Mise à jour utilisateur",
        amount: null,
        type: "info",
      }
    case "USER_DEACTIVATE":
      return {
        title: `${actor} a désactivé un compte`,
        subtitle: meta.name ? String(meta.name) : "Désactivation",
        amount: null,
        type: "info",
      }
    case "USER_REACTIVATE":
      return {
        title: `${actor} a réactivé un compte`,
        subtitle: meta.name ? String(meta.name) : "Réactivation",
        amount: null,
        type: "info",
      }
    default:
      return {
        title: `${actor} — ${act.action.replace(/_/g, " ")}`,
        subtitle: meta.name || meta.title || "",
        amount: meta.amount ? Number(meta.amount) : null,
        type: "info",
      }
  }
}

interface RecentActivitiesProps {
  userActivities: UserActivityLog[]
  fallbackActivities: Activity[]
}

export function RecentActivities({ userActivities, fallbackActivities }: RecentActivitiesProps) {
  return (
    <Card className="border-ink/10 bg-paper">
      <CardHeader>
        <CardTitle className="text-ink font-display font-semibold text-base flex items-center gap-2">
          <Clock className="size-4 text-ink-soft" />
          Activités récentes
        </CardTitle>
      </CardHeader>
      <CardContent className="px-6 pb-6 pt-0">
        {userActivities.length > 0 ? (
          <div className="relative border-l border-ink/10 pl-4 space-y-4">
            {userActivities.map((act) => {
              const formatted = formatActivityItem(act)
              const isContrib = formatted.type === "contribution"
              const isExpense = formatted.type === "expense"
              return (
                <div key={act.id} className="relative group">
                  <span
                    className={`absolute -left-[25px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-ink/10 bg-paper ${
                      isContrib ? "text-positive" : isExpense ? "text-terracotta-600" : "text-teal-950"
                    }`}
                  >
                    {isContrib ? (
                      <TrendingUp className="size-3" />
                    ) : isExpense ? (
                      <TrendingDown className="size-3" />
                    ) : (
                      <ActivityIcon className="size-3" />
                    )}
                  </span>
                  <div className="flex flex-col space-y-0.5">
                    <p className="text-xs font-display font-semibold text-ink leading-tight">
                      {formatted.title}
                    </p>
                    {formatted.subtitle && (
                      <p className="text-xs text-ink-soft leading-none">
                        {formatted.subtitle}
                      </p>
                    )}
                    {formatted.amount !== null && (
                      <span
                        className={`text-xs font-bold font-mono mt-1 ${
                          isContrib ? "text-positive" : isExpense ? "text-terracotta-600" : "text-ink"
                        }`}
                      >
                        {isContrib ? "+" : isExpense ? "-" : ""} {formatMoney(formatted.amount)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : fallbackActivities.length > 0 ? (
          <div className="relative border-l border-ink/10 pl-4 space-y-4">
            {fallbackActivities.map((act) => {
              const isContrib = act.type === "contribution"
              return (
                <div key={act.id} className="relative group">
                  <span
                    className={`absolute -left-[25px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-ink/10 bg-paper ${
                      isContrib ? "text-positive" : "text-terracotta-600"
                    }`}
                  >
                    {isContrib ? (
                      <TrendingUp className="size-3" />
                    ) : (
                      <TrendingDown className="size-3" />
                    )}
                  </span>
                  <div className="flex flex-col space-y-0.5">
                    <p className="text-xs font-display font-semibold text-ink leading-tight">
                      {act.title}
                    </p>
                    <p className="text-xs text-ink-soft leading-none">
                      {act.subtitle}
                    </p>
                    <span
                      className={`text-xs font-bold font-mono mt-1 ${
                        isContrib ? "text-positive" : "text-terracotta-600"
                      }`}
                    >
                      {isContrib ? "+" : "-"} {formatMoney(act.amount)}
                    </span>
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
