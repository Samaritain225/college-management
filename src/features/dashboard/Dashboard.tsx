import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { PeriodFilter } from "@/components/PeriodFilter"
import { StatCard } from "@/components/StatCard"
import { BudgetBar, type CategorySpend } from "./BudgetBar"
import { RecentActivities } from "./RecentActivities"
import { formatMoney } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { isDateInPeriod, type Period } from "@/lib/period"
import {
  getPoolTotal,
  getTotalContributed,
  getTotalSpent,
  getSpentByCategory,
  getRecentActivities,
  listUserActivities,
  listExpenses,
  listContributions,
  type Activity,
  type Contribution,
  type Expense,
  type UserActivityLog,
} from "@/lib/queries"
import { Sun, Moon, Venus, Mars, Wallet, Coins, Scale, CreditCard } from "lucide-react"

const PALETTE = ["bg-teal-950", "bg-terracotta-600", "bg-positive", "bg-teal-900", "bg-ink-soft"]

interface ChartDataPoint {
  month: string
  contributed: number
  spent: number
}

interface DashboardCacheData {
  pool: number
  baseContributed: number
  baseSpent: number
  byCategory: CategorySpend[]
  activities: Activity[]
  userActivities: UserActivityLog[]
  allContribs: Contribution[]
  allExps: Expense[]
}

let dashboardCache: DashboardCacheData | null = null

export function Dashboard({
  refreshKey,
  dbReady,
  onNavigateToTab: _onNavigateToTab,
}: {
  refreshKey?: number
  dbReady: boolean
  onNavigateToTab?: (tab: "dashboard" | "investors" | "expenses" | "users" | "settings" | "profile" | "teachers" | "students" | "classes", subId?: string) => void
}) {
  const { user } = useAuth()
  const [period, setPeriod] = useState<Period>("all")
  const [pool, setPool] = useState(dashboardCache?.pool ?? 0)
  const [baseContributed, setBaseContributed] = useState(dashboardCache?.baseContributed ?? 0)
  const [baseSpent, setBaseSpent] = useState(dashboardCache?.baseSpent ?? 0)
  const [byCategory, setByCategory] = useState<CategorySpend[]>(dashboardCache?.byCategory ?? [])
  const [activities, setActivities] = useState<Activity[]>(dashboardCache?.activities ?? [])
  const [userActivities, setUserActivities] = useState<UserActivityLog[]>(dashboardCache?.userActivities ?? [])
  const [loading, setLoading] = useState(!dashboardCache)
  const [loadError, setLoadError] = useState(false)
  const [retryTick, setRetryTick] = useState(0)

  const [allContribs, setAllContribs] = useState<Contribution[]>(dashboardCache?.allContribs ?? [])
  const [allExps, setAllExps] = useState<Expense[]>(dashboardCache?.allExps ?? [])

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
      greetingText = `Bon matin, ${firstName}. Prêt pour la journée scolaire ?`
    } else if (currentHour >= 12 && currentHour < 18) {
      greetingText = `Bon après-midi, ${firstName}.`
    } else {
      greetingText = `Bonsoir, ${firstName}. Bilan de la journée disponible.`
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
        const [p, c, s, cats, acts, userActs, contribs, exps] = await Promise.all([
          getPoolTotal(),
          getTotalContributed(),
          getTotalSpent(),
          getSpentByCategory(),
          getRecentActivities(),
          listUserActivities(),
          listContributions(),
          listExpenses(),
        ])
        const mappedCats = cats.map((cat, i) => ({ ...cat, color: PALETTE[i % PALETTE.length] }))

        dashboardCache = {
          pool: p,
          baseContributed: c,
          baseSpent: s,
          byCategory: mappedCats,
          activities: acts,
          userActivities: userActs,
          allContribs: contribs,
          allExps: exps,
        }

        setPool(p)
        setBaseContributed(c)
        setBaseSpent(s)
        setByCategory(mappedCats)
        setActivities(acts)
        setUserActivities(userActs)
        setAllContribs(contribs)
        setAllExps(exps)
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
  }, [refreshKey, dbReady, retryTick])

  // Compute period-filtered stats
  const filteredContribs = allContribs.filter((c) => isDateInPeriod(c.paid_at, period))
  const filteredExps = allExps.filter((e) => isDateInPeriod(e.spent_at, period))

  const contributed = period === "all" ? baseContributed : filteredContribs.reduce((sum, c) => sum + c.amount, 0)
  const spent = period === "all" ? baseSpent : filteredExps.reduce((sum, e) => sum + e.amount, 0)
  const remaining = contributed - spent

  // Recompute chart timeline based on filtered datasets
  useEffect(() => {
    const now = new Date()
    const dataPoints = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date()
      d.setMonth(now.getMonth() - (5 - i))
      return {
        label: d.toLocaleDateString("fr-FR", { month: "short" }),
        monthKey: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      }
    })

    const computed = dataPoints.map((dp) => {
      const totalC = filteredContribs
        .filter((contrib) => contrib.paid_at.substring(0, 7) <= dp.monthKey)
        .reduce((sum, contrib) => sum + contrib.amount, 0)
      const totalS = filteredExps
        .filter((exp) => exp.spent_at.substring(0, 7) <= dp.monthKey)
        .reduce((sum, exp) => sum + exp.amount, 0)
      return {
        month: dp.label.charAt(0).toUpperCase() + dp.label.slice(1).replace(".", ""),
        contributed: totalC,
        spent: totalS,
      }
    })
    setChartData(computed)
  }, [period, allContribs, allExps])

  if (!dbReady || loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8 animate-pulse space-y-8">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-ink/10 rounded" />
          <div className="h-4 w-64 bg-ink/10 rounded" />
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
        <button
          type="button"
          onClick={() => setRetryTick((t) => t + 1)}
          className="mt-2 rounded-full bg-teal-950 text-white text-sm font-display font-semibold px-4 py-2 hover:bg-teal-900 transition-colors"
        >
          Réessayer
        </button>
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6">
        <StatCard
          label="Fonds Engagé"
          value={formatMoney(pool)}
          icon={Wallet}
          iconClassName="bg-teal-100/60 text-teal-950"
          footer="Enveloppe globale théorique"
        />
        <StatCard
          label="Fonds Libéré"
          value={formatMoney(contributed)}
          icon={Coins}
          iconClassName="bg-teal-100 text-teal-950"
          footer={
            <span className="text-teal-950">
              {pool > 0 ? Math.round((contributed / pool) * 100) : 0}% du budget alloué
            </span>
          }
        />
        <StatCard
          label="Fonds Dépensé"
          value={formatMoney(spent)}
          icon={CreditCard}
          iconClassName="bg-terracotta-100 text-terracotta-600"
          footer={
            <span className="text-terracotta-600">
              {contributed > 0 ? Math.round((spent / contributed) * 100) : 0}% des contributions
            </span>
          }
        />
        <StatCard
          label="Solde Restant"
          value={formatMoney(remaining)}
          valueClassName="text-positive"
          icon={Scale}
          iconClassName="bg-positive-bg text-positive"
          footer={
            <span className="flex items-center gap-1.5 text-positive">
              <span className="h-1.5 w-1.5 rounded-full bg-positive animate-pulse shrink-0" />
              Fonds disponibles
            </span>
          }
        />
      </div>

      {/* School Statistics (Enseignants, Élèves, Classes) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Élèves */}
        <Card className="border-ink/10 bg-paper p-6 flex flex-col items-center justify-between text-center min-h-[220px]">
          <div className="w-full text-left">
            <h4 className="text-xs font-display font-semibold text-ink-soft uppercase tracking-wider">Registre Élèves</h4>
          </div>
          
          <div className="relative h-24 w-24 my-2 shrink-0">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" fill="transparent" stroke="currentColor" className="text-ink/10" strokeWidth="4" />
              <circle cx="32" cy="32" r="26" fill="transparent" stroke="var(--color-terracotta-600)" strokeWidth="4" strokeDasharray="84.95 78.41" strokeDashoffset="0" />
              <circle cx="32" cy="32" r="26" fill="transparent" stroke="var(--color-teal-950)" strokeWidth="4" strokeDasharray="78.41 84.95" strokeDashoffset="-84.95" />
              <text x="32" y="32" textAnchor="middle" className="fill-ink font-display font-bold text-xs" transform="rotate(90 32 32)">420</text>
              <text x="32" y="42" textAnchor="middle" className="fill-ink-soft font-sans text-[9px]" transform="rotate(90 32 32)">Élèves</text>
            </svg>
          </div>

          <div className="flex gap-3 pt-2 border-t border-ink/10 w-full justify-center text-ink-soft text-xs font-display font-semibold">
            <div className="flex items-center gap-1 whitespace-nowrap">
              <Venus className="size-4 text-terracotta-600 shrink-0" />
              <span>218 Filles (52%)</span>
            </div>
            <div className="flex items-center gap-1 whitespace-nowrap">
              <Mars className="size-4 text-teal-950 shrink-0" />
              <span>202 Garçons (48%)</span>
            </div>
          </div>
        </Card>

        {/* Card 2: Enseignants */}
        <Card className="border-ink/10 bg-paper p-6 flex flex-col items-center justify-between text-center min-h-[220px]">
          <div className="w-full text-left">
            <h4 className="text-xs font-display font-semibold text-ink-soft uppercase tracking-wider">Enseignants</h4>
          </div>
          
          <div className="relative h-24 w-24 my-2 shrink-0">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" fill="transparent" stroke="currentColor" className="text-ink/10" strokeWidth="4" />
              <circle cx="32" cy="32" r="26" fill="transparent" stroke="var(--color-teal-950)" strokeWidth="4" strokeDasharray="89.85 73.51" strokeDashoffset="0" />
              <circle cx="32" cy="32" r="26" fill="transparent" stroke="var(--color-terracotta-600)" strokeWidth="4" strokeDasharray="73.51 89.85" strokeDashoffset="-89.85" />
              <text x="32" y="32" textAnchor="middle" className="fill-ink font-display font-bold text-xs" transform="rotate(90 32 32)">18</text>
              <text x="32" y="42" textAnchor="middle" className="fill-ink-soft font-sans text-[9px]" transform="rotate(90 32 32)">Actifs</text>
            </svg>
          </div>

          <div className="flex gap-3 pt-2 border-t border-ink/10 w-full justify-center text-ink-soft text-xs font-display font-semibold">
            <div className="flex items-center gap-1 whitespace-nowrap">
              <Mars className="size-4 text-teal-950 shrink-0" />
              <span>10 Hommes (55%)</span>
            </div>
            <div className="flex items-center gap-1 whitespace-nowrap">
              <Venus className="size-4 text-terracotta-600 shrink-0" />
              <span>8 Femmes (45%)</span>
            </div>
          </div>
        </Card>

        {/* Card 3: Classes — per-level mini bar chart */}
        <Card className="border-ink/10 bg-paper p-6 flex flex-col justify-between min-h-[220px]">
          <h4 className="text-xs font-display font-semibold text-ink-soft uppercase tracking-wider">Niveaux & Classes</h4>

          <div className="w-full space-y-1.5 py-2 flex-1">
            {([
              { label: "6ème",        count: 2, max: 2, color: "var(--color-teal-950)" },
              { label: "5ème",        count: 2, max: 2, color: "var(--color-teal-900)" },
              { label: "4ème",        count: 1, max: 2, color: "var(--color-terracotta-600)" },
              { label: "3ème",        count: 2, max: 2, color: "var(--color-positive)" },
              { label: "2nde",        count: 2, max: 2, color: "var(--color-teal-950)" },
              { label: "1ère",        count: 2, max: 2, color: "var(--color-terracotta-600)" },
              { label: "Terminale",   count: 1, max: 2, color: "var(--color-negative)" },
            ] as { label: string; count: number; max: number; color: string }[]).map(({ label, count, max, color }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="w-16 shrink-0 text-ink font-display text-xs font-semibold">{label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-teal-100/60 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(count / max) * 100}%`, backgroundColor: color }}
                  />
                </div>
                <span className="w-10 text-right text-ink-soft text-xs font-display font-semibold shrink-0">
                  {count} cl.
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-between pt-2 border-t border-ink/10 text-ink-soft text-xs font-display font-semibold">
            <span>12 classes · 7 niveaux</span>
            <span>35 él. / cl. moy.</span>
          </div>
        </Card>
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
              <BudgetBar totalPool={contributed} spentByCategory={byCategory} />
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-sm font-display font-medium text-ink">Aucune contribution enregistrée pour le moment.</p>
                <p className="text-xs text-ink-soft mt-1">Ajoutez des investissements pour voir la répartition par catégorie.</p>
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
