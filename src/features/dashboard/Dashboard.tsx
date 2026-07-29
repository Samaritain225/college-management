import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PeriodFilter } from "@/components/PeriodFilter"
import { StatCard } from "@/components/StatCard"
import { BudgetDonut, type CategorySpend } from "./BudgetDonut"
import { RecentActivities } from "./RecentActivities"
import { formatMoney } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { isMonthInPeriod, type Period } from "@/lib/period"
import {
  getDashboardSummary,
  type Activity,
  type MonthBucket,
  type UserActivityLog,
} from "@/lib/queries"
import { Sun, Moon, Wallet, Coins, Scale, CreditCard } from "lucide-react"
import { readCache, writeCache } from "@/lib/persistentCache"

interface ChartDataPoint {
  month: string
  contributed: number
  spent: number
}

interface DashboardCacheData {
  pool: number
  baseContributed: number
  baseResources: number
  baseOtherIncome: number
  baseSpent: number
  byCategory: CategorySpend[]
  activities: Activity[]
  userActivities: UserActivityLog[]
  monthly: MonthBucket[]
}

const CACHE_KEY = "dashboard"

// Seeded from sessionStorage so a reload repaints the last figures instantly
// instead of showing the skeleton again. Still only a placeholder — the fetch
// below runs on every mount regardless and overwrites this.
let dashboardCache: DashboardCacheData | null = readCache<DashboardCacheData>(CACHE_KEY)

// `dbReady` outlived the local libSQL bootstrap it used to gate (Phase 0) and
// is always true; it stays as an optional prop so the loading gate below reads
// unchanged. `refreshKey` is gone: the router unmounts this screen when you
// navigate away, so returning to it refetches on mount anyway.
export function Dashboard({ dbReady = true }: { dbReady?: boolean }) {
  const { user } = useAuth()
  const [period, setPeriod] = useState<Period>("this_month")
  const [pool, setPool] = useState(dashboardCache?.pool ?? 0)
  const [baseContributed, setBaseContributed] = useState(dashboardCache?.baseContributed ?? 0)
  const [baseResources, setBaseResources] = useState(dashboardCache?.baseResources ?? 0)
  const [baseOtherIncome, setBaseOtherIncome] = useState(dashboardCache?.baseOtherIncome ?? 0)
  const [baseSpent, setBaseSpent] = useState(dashboardCache?.baseSpent ?? 0)
  const [byCategory, setByCategory] = useState<CategorySpend[]>(dashboardCache?.byCategory ?? [])
  const [activities, setActivities] = useState<Activity[]>(dashboardCache?.activities ?? [])
  const [userActivities, setUserActivities] = useState<UserActivityLog[]>(dashboardCache?.userActivities ?? [])
  const [loading, setLoading] = useState(!dashboardCache)
  const [loadError, setLoadError] = useState(false)
  const [retryTick, setRetryTick] = useState(0)

  const [monthly, setMonthly] = useState<MonthBucket[]>(dashboardCache?.monthly ?? [])

  const [randomGreeting, setRandomGreeting] = useState("")

  // SVG Area Chart State
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // Professional greeting by time of day
  useEffect(() => {
    if (!user) return
    const firstName = user.name.split(" ")[0]
    const currentHour = new Date().getHours()

    let greetingText = ""
    if (currentHour >= 5 && currentHour < 12) {
      greetingText = `Bon matin, ${firstName}.`
    } else if (currentHour >= 12 && currentHour < 18) {
      greetingText = `Bon après-midi, ${firstName}.`
    } else {
      greetingText = `Bonsoir, ${firstName}.`
    }
    setRandomGreeting(greetingText)
  }, [user])

  // Daytime greeting icon helper
  const hour = new Date().getHours()
  const isNight = hour >= 18 || hour < 5
  const GreetingIcon = isNight ? Moon : Sun

  useEffect(() => {
    if (!dbReady) return

    async function load() {
      try {
        setLoadError(false)
        const summary = await getDashboardSummary()

        dashboardCache = {
          pool: summary.pool,
          baseContributed: summary.totalContributed,
          baseResources: summary.totalResources,
          baseOtherIncome: summary.totalOtherIncome,
          baseSpent: summary.totalSpent,
          byCategory: summary.byCategory,
          activities: summary.recent,
          userActivities: summary.userActivities,
          monthly: summary.monthly,
        }
        writeCache(CACHE_KEY, dashboardCache)

        setPool(summary.pool)
        setBaseContributed(summary.totalContributed)
        setBaseResources(summary.totalResources)
        setBaseOtherIncome(summary.totalOtherIncome)
        setBaseSpent(summary.totalSpent)
        setByCategory(summary.byCategory)
        setActivities(summary.recent)
        setUserActivities(summary.userActivities)
        setMonthly(summary.monthly)
      } catch (err) {
        console.error("Dashboard failed to load database stats:", err)
        if (!dashboardCache) {
          setLoadError(true)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [dbReady, retryTick])

  // Period-filtered stats, now summed from month buckets instead of from every
  // row in the table. Same arithmetic, ~200x less data to get here.
  const bucketsInPeriod = monthly.filter((m) => isMonthInPeriod(m.month, period))

  const spent = period === "all" ? baseSpent : bucketsInPeriod.reduce((sum, m) => sum + m.spent, 0)
  // Every cash inflow, not just cotisation. The balance used to be
  // `contributed - spent`, which ignored other income entirely and so reported
  // -102,928,756 F CFA on an account actually holding +79,321,244.
  const resources =
    period === "all" ? baseResources : bucketsInPeriod.reduce((sum, m) => sum + m.resources, 0)
  const otherIncome =
    period === "all" ? baseOtherIncome : bucketsInPeriod.reduce((sum, m) => sum + m.otherIncome, 0)
  // A balance is a position at a moment; a period turns the same subtraction
  // into a *flow*. Under "ce mois-ci" this is July's inflows minus July's
  // outflows — −2,782,643 on a college holding +79,321,244 — so labelling it
  // "Solde Restant / Découvert" told the treasurer the account was overdrawn
  // when it was nothing of the sort. Same number, different question, so the
  // card says which question it is answering.
  const isPeriodFiltered = period !== "all"
  const netFlow = resources - spent
  // The true position, never period-scoped: what is actually in the pot today.
  const balance = baseResources - baseSpent
  const headlineValue = isPeriodFiltered ? netFlow : balance
  const isPositive = headlineValue >= 0

  // Recompute chart timeline. Cumulative within the selected period, matching
  // the previous behaviour — the old code accumulated over the *filtered* rows,
  // so filtering the buckets first preserves it.
  useEffect(() => {
    const now = new Date()
    const dataPoints = Array.from({ length: 6 }).map((_, i) => {
      // Day pinned to 1 before shifting months: setMonth() on the current
      // day-of-month overflows into the next month whenever the target month
      // has fewer days (eg. today the 29th minus 5 months lands on a
      // 28-day February, which rolls forward to March and duplicates it).
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      return {
        label: d.toLocaleDateString("fr-FR", { month: "short" }),
        monthKey: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      }
    })

    const inPeriod = monthly.filter((m) => isMonthInPeriod(m.month, period))
    const computed = dataPoints.map((dp) => {
      const upTo = inPeriod.filter((m) => m.month <= dp.monthKey)
      return {
        month: dp.label.charAt(0).toUpperCase() + dp.label.slice(1).replace(".", ""),
        contributed: upTo.reduce((sum, m) => sum + m.contributed, 0),
        spent: upTo.reduce((sum, m) => sum + m.spent, 0),
      }
    })
    setChartData(computed)
  }, [period, monthly])

  if (!dbReady || loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8 animate-pulse space-y-8">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-ink/10 rounded-sm" />
          <div className="h-4 w-64 bg-ink/10 rounded-sm" />
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="h-28 bg-ink/10 rounded-xl" />
          <div className="h-28 bg-ink/10 rounded-xl" />
          <div className="h-28 bg-ink/10 rounded-xl" />
        </div>
        <div className="h-64 bg-ink/10 rounded-xl" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-16 flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-negative-bg text-negative">
          <Scale className="size-5" />
        </div>
        <p className="font-display font-semibold text-ink">Impossible de charger le tableau de bord</p>
        <p className="text-sm text-ink-soft max-w-sm">
          Vérifiez votre connexion et réessayez. Les chiffres affichés ne reflètent pas forcément l'état réel du compte.
        </p>
        <Button
          type="button"
          onClick={() => setRetryTick((t) => t + 1)}
          className="mt-2 font-semibold text-white transition-colors max-md:h-11"
        >
          Réessayer
        </Button>
      </div>
    )
  }

  // Generate SVG coordinates for Area Chart
  const maxValue = Math.max(...chartData.map((d) => Math.max(d.contributed, d.spent)), 10000) * 1.15
  const chartHeight = 140
  const chartWidth = 500

  const getPointsPath = (key: "contributed" | "spent") => {
    return chartData
      .map((d, i) => {
        const x = (i / (chartData.length - 1)) * chartWidth
        const y = chartHeight - (d[key] / maxValue) * (chartHeight - 30)
        return `${i === 0 ? "M" : "L"} ${x} ${y}`
      })
      .join(" ")
  }

  const getAreaPath = (key: "contributed" | "spent") => {
    const points = getPointsPath(key)
    return `${points} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-4 sm:space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink/10 bg-teal-100 text-teal-950">
            <GreetingIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-base sm:text-xl font-bold tracking-tight text-ink leading-snug">
              {randomGreeting}
            </h1>
          </div>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </header>

      {/* Financial stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-6">
        <StatCard
          label="Fonds Engagé"
          value={formatMoney(pool)}
          icon={Wallet}
          iconClassName="bg-teal-100/60 text-teal-950"
          footer={
            // Always the all-time ratio. `pool` is a standing commitment, not a
            // flow, so pairing it with a period's contributions compared two
            // different spans and read "0% libéré" in any month nobody happened
            // to pay in.
            <span className="text-teal-950">
              {pool > 0 ? Math.round((baseContributed / pool) * 100) : 0}% libéré par les
              investisseurs
            </span>
          }
        />
        <StatCard
          label="Encaissements"
          value={formatMoney(resources)}
          icon={Coins}
          iconClassName="bg-teal-100 text-teal-950"
          footer={
            <span className="text-teal-950">
              dont {formatMoney(otherIncome)} autres revenus
            </span>
          }
        />
        <StatCard
          label="Fonds Dépensé"
          value={formatMoney(spent)}
          icon={CreditCard}
          iconClassName="bg-terracotta-100 text-terracotta-600"
          footer={
            // Under a period both halves are flows, and a month that spent more
            // than it took in gave "912% des ressources" — arithmetically true
            // and useless. Filtered, the honest and bounded question is how much
            // of all spending happened in this window.
            <span className="text-terracotta-600">
              {isPeriodFiltered
                ? `${baseSpent > 0 ? Math.round((spent / baseSpent) * 100) : 0}% des dépenses totales`
                : `${resources > 0 ? Math.round((spent / resources) * 100) : 0}% des ressources`}
            </span>
          }
        />
        {/* Red is reserved for a genuinely overdrawn account. A negative *flow*
            is an ordinary month where more went out than came in, so it reads
            terracotta like every other outflow on this screen — same colour
            language as "Fonds Dépensé". */}
        <StatCard
          label={isPeriodFiltered ? "Flux net" : "Solde Restant"}
          value={formatMoney(headlineValue)}
          valueClassName={
            isPositive ? "text-positive" : isPeriodFiltered ? "text-terracotta-600" : "text-negative"
          }
          icon={Scale}
          iconClassName={
            isPositive
              ? "bg-positive-bg text-positive"
              : isPeriodFiltered
                ? "bg-terracotta-100 text-terracotta-600"
                : "bg-negative-bg text-negative"
          }
          footer={
            <span
              className={`flex items-center gap-1.5 ${
                isPositive
                  ? "text-positive"
                  : isPeriodFiltered
                    ? "text-terracotta-600"
                    : "text-negative"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                  isPositive
                    ? "bg-positive animate-pulse"
                    : isPeriodFiltered
                      ? "bg-terracotta-600"
                      : "bg-negative"
                }`}
              />
              {isPeriodFiltered
                ? isPositive
                  ? "Entrées > sorties sur la période"
                  : "Sorties > entrées sur la période"
                : isPositive
                  ? "Fonds disponibles"
                  : "Découvert"}
            </span>
          }
        />
      </div>

      {/* Cumulative Financial Progress Area Chart */}
      <Card className="border-ink/10 bg-paper p-6 space-y-4 relative">
        <style>{`
          @keyframes chartDraw {
            from { stroke-dashoffset: 600; }
          }
          .animate-line {
            stroke-dasharray: 600;
            stroke-dashoffset: 0;
            animation: chartDraw 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
        `}</style>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-display font-semibold text-ink">Évolution des flux financiers</h3>
            <p className="text-xs text-ink-soft">Progression cumulée sur les 6 derniers mois</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-display font-semibold">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-teal-950" />
              <span className="text-ink-soft">Contributions</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-terracotta-600" />
              <span className="text-ink-soft">Dépenses</span>
            </div>
          </div>
        </div>

        <div className="w-full pt-2">
          {chartData.length > 0 ? (
            <div className="relative w-full h-36 sm:h-44">
              <svg className="w-full h-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="grad-contrib" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-teal-950)" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="var(--color-teal-950)" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="grad-spent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-terracotta-600)" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="var(--color-terracotta-600)" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                <line x1="0" y1={chartHeight * 0.25} x2={chartWidth} y2={chartHeight * 0.25} stroke="currentColor" className="text-ink/10" strokeDasharray="4 4" />
                <line x1="0" y1={chartHeight * 0.5} x2={chartWidth} y2={chartHeight * 0.5} stroke="currentColor" className="text-ink/10" strokeDasharray="4 4" />
                <line x1="0" y1={chartHeight * 0.75} x2={chartWidth} y2={chartHeight * 0.75} stroke="currentColor" className="text-ink/10" strokeDasharray="4 4" />
                <line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="currentColor" className="text-ink/20" />

                {/* Contributed Area & Line */}
                <path d={getAreaPath("contributed")} fill="url(#grad-contrib)" />
                <path d={getPointsPath("contributed")} fill="none" stroke="var(--color-teal-950)" strokeWidth="2.5" strokeLinecap="round" className="animate-line" />

                {/* Spent Area & Line */}
                <path d={getAreaPath("spent")} fill="url(#grad-spent)" />
                <path d={getPointsPath("spent")} fill="none" stroke="var(--color-terracotta-600)" strokeWidth="2.5" strokeLinecap="round" className="animate-line" />

                {/* Dashed Hover vertical line & circle intersection points */}
                {hoveredIndex !== null && (
                  <>
                    <line
                      x1={(hoveredIndex / (chartData.length - 1)) * chartWidth}
                      y1={0}
                      x2={(hoveredIndex / (chartData.length - 1)) * chartWidth}
                      y2={chartHeight}
                      stroke="currentColor"
                      className="text-ink/30"
                      strokeWidth="1.2"
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={(hoveredIndex / (chartData.length - 1)) * chartWidth}
                      cy={chartHeight - (chartData[hoveredIndex].contributed / maxValue) * (chartHeight - 30)}
                      r="4.5"
                      fill="var(--color-teal-950)"
                      stroke="var(--color-paper)"
                      strokeWidth="1.5"
                    />
                    <circle
                      cx={(hoveredIndex / (chartData.length - 1)) * chartWidth}
                      cy={chartHeight - (chartData[hoveredIndex].spent / maxValue) * (chartHeight - 30)}
                      r="4.5"
                      fill="var(--color-terracotta-600)"
                      stroke="var(--color-paper)"
                      strokeWidth="1.5"
                    />
                  </>
                )}

                {/* Transparent Hover Trigger Rectangles */}
                {chartData.map((_, i) => {
                  const x = (i / (chartData.length - 1)) * chartWidth
                  const step = chartWidth / (chartData.length - 1)
                  return (
                    <rect
                      key={i}
                      x={i === 0 ? 0 : x - step / 2}
                      y={0}
                      width={i === 0 || i === chartData.length - 1 ? step / 2 : step}
                      height={chartHeight}
                      fill="transparent"
                      className="cursor-pointer pointer-events-auto"
                      onMouseEnter={() => setHoveredIndex(i)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    />
                  )
                })}
              </svg>

              <div className="absolute left-0 right-0 bottom-[-16px] flex justify-between text-xs font-display font-semibold text-ink-soft px-1 tracking-wider uppercase">
                {chartData.map((d, i) => (
                  <span key={i}>{d.month}</span>
                ))}
              </div>

              {/* Hover Tooltip Box */}
              {hoveredIndex !== null && chartData[hoveredIndex] && (
                <div
                  className="absolute z-30 pointer-events-none rounded-lg border border-ink/10 bg-paper p-3 shadow-md text-left transition-all duration-75 flex flex-col gap-1.5"
                  style={{
                    left: `${Math.min(
                      Math.max((hoveredIndex / (chartData.length - 1)) * 100 - 15, 2),
                      78
                    )}%`,
                    top: "10px",
                  }}
                >
                  <p className="text-xs font-display font-semibold text-ink uppercase tracking-wider">
                    {chartData[hoveredIndex].month}
                  </p>
                  <div className="flex flex-col gap-1 text-xs font-medium">
                    <div className="flex items-center justify-between gap-6">
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-teal-950" />
                        <span className="text-ink-soft">Contributions</span>
                      </div>
                      <span className="font-mono font-bold text-ink">
                        {formatMoney(chartData[hoveredIndex].contributed)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-terracotta-600" />
                        <span className="text-ink-soft">Dépenses</span>
                      </div>
                      <span className="font-mono font-bold text-ink">
                        {formatMoney(chartData[hoveredIndex].spent)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-36 flex items-center justify-center text-xs text-ink-soft italic">
              Données insuffisantes pour tracer le graphique.
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <Card className="md:col-span-7 border-ink/10 bg-paper">
          <CardHeader>
            <CardTitle className="text-ink font-display font-semibold text-base">Répartition du budget</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-0">
            {byCategory.length > 0 ? (
              // Always all-time, unlike the KPI strip above: `byCategory` has
              // no monthly breakdown to filter by, so pairing it with the
              // period-scoped `resources` produced percentages past 100% and
              // a negative "Restant" under anything but "Toutes les périodes".
              <BudgetDonut totalPool={baseResources} spentByCategory={byCategory} />
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-sm font-display font-medium text-ink">Aucune dépense enregistrée pour le moment.</p>
                <p className="text-xs text-ink-soft mt-1">Enregistrez des dépenses pour voir la répartition par catégorie.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <RecentActivities
          className="md:col-span-5"
          userActivities={userActivities}
          fallbackActivities={activities}
        />
      </div>
    </div>
  )
}
