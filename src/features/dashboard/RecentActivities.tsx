import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Clock, TrendingUp, TrendingDown } from "lucide-react"
import { formatMoney, cn } from "@/lib/utils"
import { ActivityFeed } from "@/features/activity/ActivityFeed"
import { relativeTime } from "@/features/activity/formatActivity"
import type { Activity, UserActivityLog } from "@/lib/queries"

interface RecentActivitiesProps {
  /** First page, already fetched by dashboard_summary — the feed pages on from
   *  here rather than re-requesting it. */
  userActivities: UserActivityLog[]
  /** Shown only when the activity log is empty (a fresh college has no rows
   *  yet, but may already have contributions and expenses). */
  fallbackActivities: Activity[]
  className?: string
}

export function RecentActivities({
  userActivities,
  fallbackActivities,
  className,
}: RecentActivitiesProps) {
  const hasLog = userActivities.length > 0

  return (
    <Card className={cn("border-ink/10 bg-paper flex flex-col", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-ink font-display font-semibold text-base flex items-center gap-2">
          <Clock className="size-4 text-ink-soft" />
          Activités récentes
        </CardTitle>
      </CardHeader>
      <CardContent className="px-6 pb-6 pt-0 flex-1 min-h-0">
        {hasLog ? (
          <ActivityFeed initialItems={userActivities} className="max-h-[26rem]" />
        ) : fallbackActivities.length > 0 ? (
          <div className="relative border-l border-ink/10 pl-4 space-y-3.5">
            {fallbackActivities.slice(0, 5).map((act) => {
              const isContrib = act.type === "contribution"
              const amountColor = isContrib ? "text-positive" : "text-terracotta-600"
              const amountBg = isContrib ? "bg-positive/8" : "bg-terracotta-600/8"

              return (
                <div key={act.id} className="relative flex items-start justify-between gap-3">
                  <span
                    className={cn(
                      "absolute -left-[25px] top-1 flex h-4 w-4 items-center justify-center rounded-full border border-ink/10 bg-paper shrink-0",
                      isContrib ? "text-positive" : "text-terracotta-600"
                    )}
                  >
                    {isContrib ? (
                      <TrendingUp className="size-3" />
                    ) : (
                      <TrendingDown className="size-3" />
                    )}
                  </span>

                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-display font-bold text-ink truncate">
                        {act.title}
                      </span>
                      <div className={cn("shrink-0 rounded-md px-2 py-0.5", amountBg)}>
                        <span
                          className={cn(
                            "text-2xs font-bold font-mono tabular-nums",
                            amountColor
                          )}
                        >
                          {isContrib ? "+" : "−"}
                          {formatMoney(act.amount)}
                        </span>
                      </div>
                    </div>
                    {act.subtitle && (
                      <p className="text-2xs text-ink-soft/70 leading-tight font-normal truncate">
                        {act.subtitle}
                      </p>
                    )}
                    {act.date && (
                      <p className="text-3xs text-ink-soft/50 leading-none font-normal pt-0.5">
                        {relativeTime(act.date)}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-ink-soft text-center py-6">Aucune activité enregistrée.</p>
        )}
      </CardContent>
    </Card>
  )
}
