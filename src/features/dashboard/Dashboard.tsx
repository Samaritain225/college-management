import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BudgetBar, type CategorySpend } from "./BudgetBar"
import { formatMoney } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import {
  getPoolTotal,
  getTotalContributed,
  getTotalSpent,
  getSpentByCategory,
  getRecentActivities,
  listExpenses,
  listContributions,
  type Activity,
} from "@/db/queries"
import { Sun, Moon, TrendingUp, TrendingDown, Clock, Venus, Mars, Wallet, Coins, Scale, CreditCard } from "lucide-react"

const PALETTE = ["bg-indigo-600", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-slate-400"]

interface ChartDataPoint {
  month: string
  contributed: number
  spent: number
}

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
  const [pool, setPool] = useState(0)
  const [contributed, setContributed] = useState(0)
  const [spent, setSpent] = useState(0)
  const [byCategory, setByCategory] = useState<CategorySpend[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

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
      greetingText = `Bon après-midi, ${firstName}. Suivi des activités en cours.`
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
        const [p, c, s, cats, acts, allContribs, allExps] = await Promise.all([
          getPoolTotal(),
          getTotalContributed(),
          getTotalSpent(),
          getSpentByCategory(),
          getRecentActivities(),
          listContributions(),
          listExpenses(),
        ])
        setPool(p)
        setContributed(c)
        setSpent(s)
        setByCategory(cats.map((cat, i) => ({ ...cat, color: PALETTE[i % PALETTE.length] })))
        setActivities(acts)

        // Compute cumulative timeline for the last 6 months
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
          const totalC = allContribs
            .filter((contrib) => contrib.paid_at.substring(0, 7) <= dp.monthKey)
            .reduce((sum, contrib) => sum + contrib.amount, 0)
          const totalS = allExps
            .filter((exp) => exp.spent_at.substring(0, 7) <= dp.monthKey)
            .reduce((sum, exp) => sum + exp.amount, 0)
          return {
            month: dp.label.charAt(0).toUpperCase() + dp.label.slice(1).replace(".", ""),
            contributed: totalC,
            spent: totalS,
          }
        })
        setChartData(computed)
      } catch (err) {
        console.error("Dashboard failed to load database stats:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [refreshKey, dbReady])

  if (!dbReady || loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8 animate-pulse space-y-8">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-4 w-64 bg-muted rounded" />
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="h-28 bg-muted rounded-xl" />
          <div className="h-28 bg-muted rounded-xl" />
          <div className="h-28 bg-muted rounded-xl" />
        </div>
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    )
  }

  const remaining = contributed - spent

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
    <div className="mx-auto max-w-5xl px-2 py-8 space-y-6">
      <header className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/45 bg-muted/40 text-primary">
            <GreetingIcon className="size-5" />
          </div>
          <div>
            <h1 className="font-sans text-xl font-bold tracking-tight text-foreground">
              {randomGreeting}
            </h1>
          </div>
        </div>
        <Badge variant="neutral">Synchronisé</Badge>
      </header>

      {/* Reimaged Premium financial stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
        <Card className="border border-border/40 bg-card p-5 flex flex-col justify-between min-h-[110px] relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Fonds Engagé</p>
              <h3 className="text-lg font-black text-foreground">{formatMoney(pool)}</h3>
            </div>
            <div className="p-2 rounded-lg bg-muted/65 text-muted-foreground">
              <Wallet className="size-4" />
            </div>
          </div>
          <div className="pt-2 border-t border-border/10" style={{ fontSize: "12px", fontWeight: 500 }}>
            <span className="text-muted-foreground/80">Enveloppe globale théorique</span>
          </div>
        </Card>

        <Card className="border border-border/40 bg-card p-5 flex flex-col justify-between min-h-[110px] relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Fonds Libéré</p>
              <h3 className="text-lg font-black text-foreground">{formatMoney(contributed)}</h3>
            </div>
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500">
              <Coins className="size-4" />
            </div>
          </div>
          <div className="pt-2 border-t border-border/10" style={{ fontSize: "12px", fontWeight: 700 }}>
            <span className="text-indigo-600 dark:text-indigo-400">{pool > 0 ? Math.round((contributed / pool) * 100) : 0}% du budget alloué</span>
          </div>
        </Card>

        <Card className="border border-border/40 bg-card p-5 flex flex-col justify-between min-h-[110px] relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Fonds Dépensé</p>
              <h3 className="text-lg font-black text-foreground">{formatMoney(spent)}</h3>
            </div>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-500">
              <CreditCard className="size-4" />
            </div>
          </div>
          <div className="pt-2 border-t border-border/10" style={{ fontSize: "12px", fontWeight: 700 }}>
            <span className="text-amber-600 dark:text-amber-400">{contributed > 0 ? Math.round((spent / contributed) * 100) : 0}% des contributions</span>
          </div>
        </Card>

        <Card className="border border-border/40 bg-card p-5 flex flex-col justify-between min-h-[110px] relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Solde Restant</p>
              <h3 className="text-lg font-black text-green-600">{formatMoney(remaining)}</h3>
            </div>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500">
              <Scale className="size-4" />
            </div>
          </div>
          <div className="pt-2 border-t border-border/10 flex items-center gap-1" style={{ fontSize: "12px", fontWeight: 700 }}>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-emerald-600 dark:text-emerald-400">Fonds disponibles</span>
          </div>
        </Card>
      </div>

      {/* School Statistics (Enseignants, Élèves, Classes) with Centered Donut Charts & Legends */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Élèves */}
        <Card className="border-border/40 bg-card p-6 flex flex-col items-center justify-between text-center min-h-[220px]">
          <div className="w-full text-left">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Registre Élèves</h4>
          </div>
          
          <div className="relative h-24 w-24 my-2 shrink-0">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" fill="transparent" stroke="currentColor" className="text-muted/10 dark:text-muted/20" strokeWidth="4" />
              <circle cx="32" cy="32" r="26" fill="transparent" stroke="#ec4899" strokeWidth="4" strokeDasharray="84.95 78.41" strokeDashoffset="0" />
              <circle cx="32" cy="32" r="26" fill="transparent" stroke="#6366f1" strokeWidth="4" strokeDasharray="78.41 84.95" strokeDashoffset="-84.95" />
              <text x="32" y="32" textAnchor="middle" className="fill-foreground font-sans font-black" fontSize="11px" transform="rotate(90 32 32)">420</text>
              <text x="32" y="42" textAnchor="middle" className="fill-muted-foreground font-sans font-medium" fontSize="6px" transform="rotate(90 32 32)">Élèves</text>
            </svg>
          </div>

          <div className="flex gap-2 pt-2 border-t border-border/20 w-full justify-center text-muted-foreground font-bold" style={{ fontSize: "12px" }}>
            <div className="flex items-center gap-1 whitespace-nowrap">
              <Venus className="size-3.5 text-pink-500 shrink-0" />
              <span>218 Filles (52%)</span>
            </div>
            <div className="flex items-center gap-1 whitespace-nowrap">
              <Mars className="size-3.5 text-indigo-500 shrink-0" />
              <span>202 Garçons (48%)</span>
            </div>
          </div>
        </Card>

        {/* Card 2: Enseignants */}
        <Card className="border-border/40 bg-card p-6 flex flex-col items-center justify-between text-center min-h-[220px]">
          <div className="w-full text-left">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Enseignants</h4>
          </div>
          
          <div className="relative h-24 w-24 my-2 shrink-0">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" fill="transparent" stroke="currentColor" className="text-muted/10 dark:text-muted/20" strokeWidth="4" />
              <circle cx="32" cy="32" r="26" fill="transparent" stroke="#6366f1" strokeWidth="4" strokeDasharray="89.85 73.51" strokeDashoffset="0" />
              <circle cx="32" cy="32" r="26" fill="transparent" stroke="#ec4899" strokeWidth="4" strokeDasharray="73.51 89.85" strokeDashoffset="-89.85" />
              <text x="32" y="32" textAnchor="middle" className="fill-foreground font-sans font-black" fontSize="11px" transform="rotate(90 32 32)">18</text>
              <text x="32" y="42" textAnchor="middle" className="fill-muted-foreground font-sans font-medium" fontSize="6px" transform="rotate(90 32 32)">Actifs</text>
            </svg>
          </div>

          <div className="flex gap-2 pt-2 border-t border-border/20 w-full justify-center text-muted-foreground font-bold" style={{ fontSize: "12px" }}>
            <div className="flex items-center gap-1 whitespace-nowrap">
              <Mars className="size-3.5 text-indigo-500 shrink-0" />
              <span>10 Hommes (55%)</span>
            </div>
            <div className="flex items-center gap-1 whitespace-nowrap">
              <Venus className="size-3.5 text-pink-500 shrink-0" />
              <span>8 Femmes (45%)</span>
            </div>
          </div>
        </Card>

        {/* Card 3: Classes — per-level mini bar chart */}
        <Card className="border-border/40 bg-card p-6 flex flex-col justify-between min-h-[220px]">
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Niveaux & Classes</h4>

          <div className="w-full space-y-1.5 py-2 flex-1">
            {([
              { label: "6ème",        count: 2, max: 2, color: "#8b5cf6" },
              { label: "5ème",        count: 2, max: 2, color: "#6366f1" },
              { label: "4ème",        count: 1, max: 2, color: "#38bdf8" },
              { label: "3ème",        count: 2, max: 2, color: "#14b8a6" },
              { label: "2nde",        count: 2, max: 2, color: "#10b981" },
              { label: "1ère",        count: 2, max: 2, color: "#f59e0b" },
              { label: "Terminale",   count: 1, max: 2, color: "#f43f5e" },
            ] as { label: string; count: number; max: number; color: string }[]).map(({ label, count, max, color }) => (
              <div key={label} className="flex items-center gap-2">
                {/* Color dot */}
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {/* Class label */}
                <span className="w-16 shrink-0 text-foreground font-semibold" style={{ fontSize: "12px" }}>{label}</span>
                {/* Bar */}
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(count / max) * 100}%`, backgroundColor: color }}
                  />
                </div>
                {/* Count */}
                <span className="w-10 text-right text-muted-foreground font-bold shrink-0" style={{ fontSize: "12px" }}>
                  {count} cl.
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-between pt-2 border-t border-border/20 text-muted-foreground font-bold" style={{ fontSize: "12px" }}>
            <span>12 classes · 7 niveaux</span>
            <span>35 él. / cl. moy.</span>
          </div>
        </Card>
      </div>

      {/* SVG Cumulative Financial Progress Area Chart */}
      <Card className="border-border/40 bg-card p-6 space-y-4 relative">
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
            <h3 className="text-sm font-semibold text-foreground">Évolution des flux financiers</h3>
            <p className="text-2xs text-muted-foreground">Progression cumulée sur les 6 derniers mois</p>
          </div>
          <div className="flex items-center gap-4 text-2xs font-semibold">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">Contributions</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-muted-foreground">Dépenses</span>
            </div>
          </div>
        </div>

        <div className="w-full pt-2">
          {chartData.length > 0 ? (
            <div className="relative w-full h-44">
              <svg className="w-full h-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="grad-contrib" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="grad-spent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                <line x1="0" y1={chartHeight * 0.25} x2={chartWidth} y2={chartHeight * 0.25} stroke="currentColor" className="text-border/20" strokeDasharray="4 4" />
                <line x1="0" y1={chartHeight * 0.5} x2={chartWidth} y2={chartHeight * 0.5} stroke="currentColor" className="text-border/20" strokeDasharray="4 4" />
                <line x1="0" y1={chartHeight * 0.75} x2={chartWidth} y2={chartHeight * 0.75} stroke="currentColor" className="text-border/20" strokeDasharray="4 4" />
                <line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="currentColor" className="text-border/40" />

                {/* Contributed Area & Line */}
                <path d={getAreaPath("contributed")} fill="url(#grad-contrib)" />
                <path d={getPointsPath("contributed")} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" className="animate-line" />

                {/* Spent Area & Line */}
                <path d={getAreaPath("spent")} fill="url(#grad-spent)" />
                <path d={getPointsPath("spent")} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" className="animate-line" />

                {/* Dashed Hover vertical line & circle intersection points */}
                {hoveredIndex !== null && (
                  <>
                    <line
                      x1={(hoveredIndex / (chartData.length - 1)) * chartWidth}
                      y1={0}
                      x2={(hoveredIndex / (chartData.length - 1)) * chartWidth}
                      y2={chartHeight}
                      stroke="currentColor"
                      className="text-border/60"
                      strokeWidth="1.2"
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={(hoveredIndex / (chartData.length - 1)) * chartWidth}
                      cy={chartHeight - (chartData[hoveredIndex].contributed / maxValue) * (chartHeight - 30)}
                      r="4.5"
                      fill="#10b981"
                      stroke="white"
                      strokeWidth="1.5"
                    />
                    <circle
                      cx={(hoveredIndex / (chartData.length - 1)) * chartWidth}
                      cy={chartHeight - (chartData[hoveredIndex].spent / maxValue) * (chartHeight - 30)}
                      r="4.5"
                      fill="#f59e0b"
                      stroke="white"
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

              <div className="absolute left-0 right-0 bottom-[-16px] flex justify-between text-4xs font-bold text-muted-foreground px-1 tracking-wider uppercase">
                {chartData.map((d, i) => (
                  <span key={i}>{d.month}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-36 flex items-center justify-center text-xs text-muted-foreground italic">
              Données insuffisantes pour tracer le graphique.
            </div>
          )}
        </div>

        {/* Hover Tooltip Box (HTML popup) */}
        {hoveredIndex !== null && chartData[hoveredIndex] && (
          <div
            className="absolute z-30 pointer-events-none rounded-lg border border-border/40 bg-popover/95 p-3 shadow-md text-left transition-all duration-75 flex flex-col gap-1.5"
            style={{
              left: `${Math.min(
                Math.max((hoveredIndex / (chartData.length - 1)) * 100 - 15, 2),
                78
              )}%`,
              bottom: "75px",
            }}
          >
            <p className="text-[10px] font-bold text-foreground uppercase tracking-wider">
              {chartData[hoveredIndex].month}
            </p>
            <div className="flex flex-col gap-1 text-[11px] font-medium">
              <div className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="text-muted-foreground">Contributions</span>
                </div>
                <span className="font-mono font-bold text-foreground">
                  {formatMoney(chartData[hoveredIndex].contributed)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  <span className="text-muted-foreground">Dépenses</span>
                </div>
                <span className="font-mono font-bold text-foreground">
                  {formatMoney(chartData[hoveredIndex].spent)}
                </span>
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 border-border/40">
          <CardHeader>
            <CardTitle className="text-foreground font-semibold text-base">Répartition du budget</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-0">
            {byCategory.length > 0 ? (
              <BudgetBar totalPool={contributed} spentByCategory={byCategory} />
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-sm font-medium text-foreground">Aucune contribution enregistrée pour le moment.</p>
                <p className="text-xs text-muted-foreground mt-1">Ajoutez des investissements pour voir la répartition par catégorie.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardHeader>
            <CardTitle className="text-foreground font-semibold text-base flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              Activités récentes
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-0">
            {activities.length > 0 ? (
              <div className="relative border-l border-border/40 pl-4 space-y-4">
                {activities.map((act) => {
                  const isContrib = act.type === "contribution"
                  return (
                    <div key={act.id} className="relative group">
                      <span className={`absolute -left-[25px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-card bg-background ${isContrib ? "text-emerald-500" : "text-amber-500"}`}>
                        {isContrib ? (
                          <TrendingUp className="size-2.5" />
                        ) : (
                          <TrendingDown className="size-2.5" />
                        )}
                      </span>
                      <div className="flex flex-col space-y-0.5">
                        <p className="text-xs font-semibold text-foreground leading-tight">
                          {act.title}
                        </p>
                        <p className="text-3xs text-muted-foreground/80 leading-none">
                          {act.subtitle}
                        </p>
                        <span className={`text-2xs font-bold font-mono mt-1 ${isContrib ? "text-emerald-600" : "text-amber-600"}`}>
                          {isContrib ? "+" : "-"} {formatMoney(act.amount)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">
                Aucune activité enregistrée.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
