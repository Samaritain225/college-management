import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatMoney } from "@/lib/utils"
import { useActiveUser } from "@/lib/active-user"
import {
  addExpense,
  addCategory,
  listCategories,
  listExpenses,
  type BudgetCategory,
  type Expense,
} from "@/db/queries"

export function ExpensesPage({ onChange }: { onChange?: () => void }) {
  const { activeUser } = useActiveUser()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [showForm, setShowForm] = useState(false)
  const [categoryId, setCategoryId] = useState("")
  const [newCategoryName, setNewCategoryName] = useState("")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const [exp, cats] = await Promise.all([listExpenses(), listCategories()])
    setExpenses(exp)
    setCategories(cats)
    if (!categoryId && cats[0]) setCategoryId(cats[0].id)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // No user, no entry — this is the rule the page exists to enforce.
    if (!activeUser) return setError("Veuillez choisir votre identité en haut de la page avant d'enregistrer une dépense.")

    let activeCategoryId = categoryId === "new-category-placeholder" ? "" : categoryId
    if (!activeCategoryId && newCategoryName.trim()) {
      const cat = await addCategory(newCategoryName.trim())
      activeCategoryId = cat.id
    }
    if (!activeCategoryId) return setError("Veuillez choisir ou créer une catégorie.")

    const amt = Number(amount.replace(/\D/g, ""))
    if (!amt || amt <= 0) return setError("Veuillez saisir un montant valide.")
    if (!description.trim()) return setError("Veuillez décrire le motif de cette dépense.")

    await addExpense({
      categoryId: activeCategoryId,
      amount: amt,
      description: description.trim(),
      spentAt: new Date().toISOString(),
      recordedBy: activeUser.id,
    })

    setAmount("")
    setDescription("")
    setNewCategoryName("")
    setShowForm(false)
    await refresh()
    onChange?.()
  }

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Dépenses</h1>
          <p className="text-sm text-ink-soft">
            {expenses.length} {expenses.length > 1 ? "saisies" : "saisie"} · {formatMoney(totalSpent)} au total
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} disabled={!activeUser}>
          {showForm ? "Annuler" : "Enregistrer une dépense"}
        </Button>
      </header>

      {!activeUser && (
        <Card className="mb-6 border-amber-200 bg-amber-50/50 text-amber-900">
          <CardContent className="p-4 text-sm font-sans flex items-start gap-2">
            <span>Aucun utilisateur actif sélectionné. Choisissez qui vous êtes dans la barre supérieure — chaque dépense doit être attribuée à quelqu'un.</span>
          </CardContent>
        </Card>
      )}

      {showForm && activeUser && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Nouvelle dépense · enregistrée par {activeUser.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category">Catégorie</Label>
                <Select value={categoryId} onValueChange={(val) => setCategoryId(val)}>
                  <SelectTrigger id="category" className="h-10 w-full bg-white border-ink/15 text-sm">
                    <SelectValue placeholder="Choisir une catégorie…" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                    <SelectItem value="new-category-placeholder">+ Nouvelle catégorie</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(categoryId === "new-category-placeholder" || !categoryId) && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="newCategory">Nom de la nouvelle catégorie</Label>
                  <Input
                    id="newCategory"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="ex. Mobilier de classe"
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amount">Montant (XOF)</Label>
                <Input
                  id="amount"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="150 000"
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="description">Motif de la dépense</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="20 bancs de classe en bois"
                />
              </div>
              {error && <p className="sm:col-span-2 text-sm text-negative">{error}</p>}
              <div className="sm:col-span-2">
                <Button type="submit">Enregistrer la dépense</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-ink-soft">
                <th className="pb-2 font-display font-medium">Date</th>
                <th className="pb-2 font-display font-medium">Catégorie</th>
                <th className="pb-2 font-display font-medium">Description</th>
                <th className="pb-2 font-display font-medium">Enregistré par</th>
                <th className="pb-2 font-display font-medium text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-ink/5 last:border-0">
                  <td className="py-2.5 text-ink-soft">
                    {new Date(e.spent_at).toLocaleDateString()}
                  </td>
                  <td className="py-2.5">{e.category_name}</td>
                  <td className="py-2.5">{e.description}</td>
                  <td className="py-2.5 text-ink-soft">{e.recorded_by_name}</td>
                  <td className="py-2.5 text-right">{formatMoney(e.amount)}</td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <img
                        src="/empty-state.png"
                        alt="Aucune dépense"
                        className="h-32 w-32 object-contain mb-4 rounded-xl opacity-80"
                      />
                      <p className="text-sm font-medium text-foreground">Aucune dépense enregistrée pour le moment.</p>
                      <p className="text-xs text-muted-foreground mt-1">Les dépenses apparaîtront ici dès qu'un administrateur les aura saisies.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
