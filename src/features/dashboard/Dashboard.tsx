import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BudgetBar, type CategorySpend } from "./BudgetBar"
import { formatMoney } from "@/lib/utils"
import { getPoolTotal, getTotalContributed, getTotalSpent, getSpentByCategory } from "@/db/queries"

const PALETTE = ["bg-indigo-600", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-slate-400"]

export function Dashboard({ refreshKey }: { refreshKey?: number }) {
  const [pool, setPool] = useState(0)
  const [contributed, setContributed] = useState(0)
  const [spent, setSpent] = useState(0)
  const [byCategory, setByCategory] = useState<CategorySpend[]>([])

  useEffect(() => {
    async function load() {
      const [p, c, s, cats] = await Promise.all([
        getPoolTotal(),
        getTotalContributed(),
        getTotalSpent(),
        getSpentByCategory(),
      ])
      setPool(p)
      setContributed(c)
      setSpent(s)
      setByCategory(cats.map((cat, i) => ({ ...cat, color: PALETTE[i % PALETTE.length] })))
    }
    load()
  }, [refreshKey])

  const remaining = contributed - spent

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="font-sans text-2xl font-bold tracking-tight text-foreground">Aperçu du budget</h1>
          <p className="text-sm text-muted-foreground">Données locales, mises à jour en direct</p>
        </div>
        <Badge variant="positive">Synchronisé</Badge>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Fonds total engagé</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-sans text-2xl font-bold text-foreground">{formatMoney(pool)}</p>
            <p className="text-xs text-muted-foreground mt-1">Somme des contributions convenues de tous les investisseurs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Contribué jusqu'ici</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-sans text-2xl font-bold text-foreground">{formatMoney(contributed)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {pool > 0 ? Math.round((contributed / pool) * 100) : 0}% des fonds versés
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Solde restant</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-sans text-2xl font-bold text-green-600">{formatMoney(remaining)}</p>
            <p className="text-xs text-muted-foreground mt-1">Après {formatMoney(spent)} dépensés</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground font-semibold text-base">Dépenses par catégorie</CardTitle>
        </CardHeader>
        <CardContent>
          {contributed > 0 ? (
            <BudgetBar totalPool={contributed} spentByCategory={byCategory} />
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <img
                src="/empty-state.png"
                alt="Aucune donnée"
                className="h-40 w-40 object-contain mb-4 rounded-xl opacity-80"
              />
              <p className="text-sm font-medium text-foreground">Aucune contribution enregistrée pour le moment.</p>
              <p className="text-xs text-muted-foreground mt-1">Ajoutez des investissements pour voir la répartition par catégorie.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
