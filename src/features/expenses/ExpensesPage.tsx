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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { formatMoney } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import {
  addExpense,
  addCategory,
  listCategories,
  listExpenses,
  type BudgetCategory,
  type Expense,
} from "@/db/queries"
import { Eye, FileText, Calendar, User, Receipt, XCircle } from "lucide-react"

export function ExpensesPage({ onChange, dbReady }: { onChange?: () => void; dbReady: boolean }) {
  const { user } = useAuth()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [showForm, setShowForm] = useState(false)
  const [categoryId, setCategoryId] = useState("")
  const [newCategoryName, setNewCategoryName] = useState("")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Filters and search
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")

  // Details sheet
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  async function refresh() {
    if (!dbReady) return
    try {
      const [exp, cats] = await Promise.all([listExpenses(), listCategories()])
      setExpenses(exp)
      setCategories(cats)
      if (!categoryId && cats[0]) setCategoryId(cats[0].id)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [dbReady])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!user) return

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
      recordedBy: user.id,
    })

    setAmount("")
    setDescription("")
    setNewCategoryName("")
    setShowForm(false)
    await refresh()
    onChange?.()
  }

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0)

  // Filtered list
  const filteredExpenses = expenses.filter((e) => {
    const matchesSearch =
      e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.category_name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory =
      selectedCategory === "all" || e.category_id === selectedCategory
    return matchesSearch && matchesCategory
  })

  function handleConsult(expense: Expense) {
    setSelectedExpense(expense)
    setSheetOpen(true)
  }

  if (!dbReady || loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8 animate-pulse space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-muted rounded-md" />
            <div className="h-4 w-64 bg-muted rounded-md" />
          </div>
          <div className="h-9 w-32 bg-muted rounded-md" />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between py-4">
          <div className="h-9 w-64 bg-muted rounded-md" />
          <div className="h-9 w-40 bg-muted rounded-md" />
        </div>
        <div className="rounded-md border border-border/40 bg-card p-4 space-y-4">
          <div className="h-6 bg-muted rounded-sm w-full" />
          <div className="h-6 bg-muted rounded-sm w-full" />
          <div className="h-6 bg-muted rounded-sm w-full" />
          <div className="h-6 bg-muted rounded-sm w-full" />
          <div className="h-6 bg-muted rounded-sm w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Dépenses</h1>
          <p className="text-sm text-muted-foreground">
            {expenses.length} {expenses.length > 1 ? "saisies" : "saisie"} · {formatMoney(totalSpent)} au total
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Annuler" : "Enregistrer une dépense"}
        </Button>
      </header>

      {showForm && user && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-foreground font-semibold text-base">Nouvelle dépense · enregistrée par {user.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category">Catégorie</Label>
                <Select value={categoryId} onValueChange={(val) => setCategoryId(val)}>
                  <SelectTrigger id="category" className="h-10 w-full bg-white border-border text-sm">
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
              {error && <p className="sm:col-span-2 text-sm text-negative font-medium">{error}</p>}
              <div className="sm:col-span-2">
                <Button type="submit">Enregistrer la dépense</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between py-4">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filtrer par motif ou catégorie..."
          className="max-w-sm h-9"
        />
        <div className="flex items-center gap-2">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="h-9 w-48 bg-white border-border text-xs">
              <SelectValue placeholder="Toutes les catégories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les catégories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border border-border/40 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Enregistré par</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredExpenses.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-muted-foreground text-xs">
                  {new Date(e.spent_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Badge variant="neutral">{e.category_name}</Badge>
                </TableCell>
                <TableCell className="font-medium text-foreground">{e.description}</TableCell>
                <TableCell className="text-muted-foreground">{e.recorded_by_name || "Admin/Staff"}</TableCell>
                <TableCell className="text-right font-bold text-foreground">{formatMoney(e.amount)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:text-primary"
                    onClick={() => handleConsult(e)}
                    title="Consulter les détails"
                  >
                    <Eye className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}

            {filteredExpenses.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-32 text-muted-foreground">
                  <div className="flex flex-col items-center justify-center">
                    <p className="text-sm font-medium text-foreground">Aucune dépense trouvée.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Details Slide-over Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md p-6">
          {selectedExpense && (
            <div className="space-y-6 h-full flex flex-col">
              <SheetHeader className="space-y-1">
                <SheetTitle className="text-lg font-bold flex items-center gap-2">
                  <Receipt className="size-5 text-primary" />
                  Détail de la Dépense
                </SheetTitle>
                <SheetDescription className="text-xs">
                  Fiche de contrôle comptable immuable
                </SheetDescription>
              </SheetHeader>

              {/* Amount Display */}
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-6 text-center">
                <p className="text-2xs text-muted-foreground uppercase tracking-wider font-semibold">Montant Décaissé</p>
                <p className="text-3xl font-extrabold text-foreground mt-1.5">{formatMoney(selectedExpense.amount)}</p>
              </div>

              {/* Detailed Grid */}
              <div className="space-y-4 flex-1">
                <div className="grid grid-cols-3 items-start gap-4 border-b border-border/40 pb-3">
                  <span className="text-xs font-semibold text-muted-foreground/80 flex items-center gap-1.5">
                    <FileText className="size-3.5" /> Catégorie
                  </span>
                  <span className="col-span-2 text-sm font-medium text-foreground">
                    {selectedExpense.category_name}
                  </span>
                </div>

                <div className="grid grid-cols-3 items-start gap-4 border-b border-border/40 pb-3">
                  <span className="text-xs font-semibold text-muted-foreground/80 flex items-center gap-1.5">
                    <Calendar className="size-3.5" /> Date d'effet
                  </span>
                  <span className="col-span-2 text-sm text-foreground">
                    {new Date(selectedExpense.spent_at).toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-3 items-start gap-4 border-b border-border/40 pb-3">
                  <span className="text-xs font-semibold text-muted-foreground/80 flex items-center gap-1.5">
                    <User className="size-3.5" /> Saisi par
                  </span>
                  <span className="col-span-2 text-sm text-foreground">
                    {selectedExpense.recorded_by_name || "Agent comptable / Trésorerie"}
                  </span>
                </div>

                <div className="space-y-1.5 pt-2">
                  <span className="text-xs font-semibold text-muted-foreground/80">Motif explicatif</span>
                  <div className="bg-muted/40 border border-border/40 rounded-lg p-3 text-sm text-foreground leading-relaxed">
                    {selectedExpense.description}
                  </div>
                </div>

                {/* Status Badges */}
                <div className="pt-2 flex flex-wrap gap-2">
                  {selectedExpense.reverses_expense_id ? (
                    <Badge variant="negative" className="flex items-center gap-1">
                      <XCircle className="size-3" /> Ajusté / Annulé
                    </Badge>
                  ) : (
                    <Badge variant="positive">Transaction Validée</Badge>
                  )}
                </div>
              </div>

              {/* Close Action */}
              <div className="pt-4 border-t border-border mt-auto">
                <Button className="w-full" variant="outline" onClick={() => setSheetOpen(false)}>
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
