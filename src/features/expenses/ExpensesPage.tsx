import { useEffect, useState, useMemo } from "react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { formatMoney, cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import {
  addExpense,
  addCategory,
  updateCategory,
  listCategories,
  listExpenses,
  type BudgetCategory,
  type Expense,
} from "@/db/queries"
import {
  Eye,
  Pencil,
  FileText,
  Calendar as CalendarIcon,
  User,
  Receipt,
  XCircle,
  Plus,
  FolderPlus,
  FolderTree,
  ArrowRight,
  Search,
  Wallet,
  Calculator,
  Clock,
} from "lucide-react"

function formatAmountInput(val: string): string {
  const digits = val.replace(/\D/g, "")
  if (!digits) return ""
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
}

type TabMode = "expenses" | "categories"

export function ExpensesPage({
  onChange,
  dbReady,
  mode = "expenses",
  onNavigateToTab,
}: {
  onChange?: () => void
  dbReady: boolean
  mode?: "expenses" | "categories"
  onNavigateToTab?: (tab: any) => void
}) {
  const { user } = useAuth()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabMode>(mode)

  useEffect(() => {
    setActiveTab(mode)
  }, [mode])

  // Creation expense dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [categoryId, setCategoryId] = useState("")
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newCategoryDesc, setNewCategoryDesc] = useState("")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [receiptPhotoPath, setReceiptPhotoPath] = useState("")
  const [spentAtDate, setSpentAtDate] = useState<Date | undefined>(new Date())
  const [fieldErrors, setFieldErrors] = useState<{
    category?: string
    amount?: string
    description?: string
    general?: string
  }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Creation category dialog state
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [catName, setCatName] = useState("")
  const [catDescription, setCatDescription] = useState("")
  const [catError, setCatError] = useState<string | null>(null)
  const [catSubmitting, setCatSubmitting] = useState(false)

  // Category details sheet state
  const [selectedCategoryDetails, setSelectedCategoryDetails] = useState<BudgetCategory | null>(null)
  const [categorySheetOpen, setCategorySheetOpen] = useState(false)

  // Category edit dialog state
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null)
  const [editCatName, setEditCatName] = useState("")
  const [editCatDesc, setEditCatDesc] = useState("")
  const [editCatError, setEditCatError] = useState<string | null>(null)
  const [editCatSubmitting, setEditCatSubmitting] = useState(false)
  const [editCatDialogOpen, setEditCatDialogOpen] = useState(false)

  function handleOpenCategoryDetails(c: BudgetCategory) {
    setSelectedCategoryDetails(c)
    setCategorySheetOpen(true)
  }

  function handleOpenCategoryEdit(c: BudgetCategory) {
    setEditingCategory(c)
    setEditCatName(c.name)
    setEditCatDesc(c.description || "")
    setEditCatError(null)
    setEditCatDialogOpen(true)
  }

  async function handleCategoryUpdateSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingCategory) return
    if (!editCatName.trim()) {
      setEditCatError("Le nom de la catégorie est requis.")
      return
    }

    setEditCatSubmitting(true)
    try {
      await updateCategory(editingCategory.id, editCatName.trim(), editCatDesc.trim() || undefined)
      setEditCatDialogOpen(false)
      await refresh()
    } catch (err) {
      console.error(err)
      setEditCatError("Erreur lors de la mise à jour de la catégorie.")
    } finally {
      setEditCatSubmitting(false)
    }
  }

  // Filters and search
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [categorySearchQuery, setCategorySearchQuery] = useState("")

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

  function resetExpenseForm() {
    setCategoryId(categories[0]?.id || "")
    setNewCategoryName("")
    setNewCategoryDesc("")
    setAmount("")
    setDescription("")
    setReceiptPhotoPath("")
    setSpentAtDate(new Date())
    setFieldErrors({})
  }

  function handleOpenCreateExpenseDialog() {
    resetExpenseForm()
    setCreateDialogOpen(true)
  }

  function handleOpenCreateCategoryDialog() {
    setCatName("")
    setCatDescription("")
    setCatError(null)
    setCategoryDialogOpen(true)
  }

  async function handleExpenseSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldErrors({})

    if (!user) return

    const errors: typeof fieldErrors = {}

    let activeCategoryId = categoryId === "new-category-placeholder" ? "" : categoryId
    if (categoryId === "new-category-placeholder" || !activeCategoryId) {
      if (!newCategoryName.trim()) {
        errors.category = "Veuillez saisir le nom de la nouvelle catégorie."
      } else {
        try {
          const cat = await addCategory(newCategoryName.trim(), newCategoryDesc.trim() || undefined)
          activeCategoryId = cat.id
        } catch (err) {
          console.error(err)
          errors.category = "Erreur lors de la création de la catégorie."
        }
      }
    }

    if (!activeCategoryId && !errors.category) {
      errors.category = "Veuillez choisir ou créer une catégorie."
    }

    const numericAmt = Number(amount.replace(/\D/g, ""))
    if (!numericAmt || numericAmt <= 0) {
      errors.amount = "Veuillez saisir un montant valide supérieur à 0 XOF."
    }

    if (!description.trim()) {
      errors.description = "Veuillez décrire le motif de cette dépense."
    } else if (description.trim().length > 255) {
      errors.description = "Le motif ne doit pas dépasser 255 caractères."
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setIsSubmitting(true)
    try {
      const dateObj = spentAtDate || new Date()
      await addExpense({
        categoryId: activeCategoryId,
        amount: numericAmt,
        description: description.trim(),
        spentAt: dateObj.toISOString(),
        recordedBy: user.id,
        receiptPhotoPath: receiptPhotoPath.trim() || undefined,
      })

      resetExpenseForm()
      setCreateDialogOpen(false)
      await refresh()
      onChange?.()
    } catch (err) {
      console.error(err)
      setFieldErrors({ general: "Impossible d'enregistrer la dépense. Réessayez." })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCategorySubmit(e: React.FormEvent) {
    e.preventDefault()
    setCatError(null)
    if (!catName.trim()) {
      setCatError("Le nom de la catégorie est obligatoire.")
      return
    }

    setCatSubmitting(true)
    try {
      const newCat = await addCategory(catName.trim(), catDescription.trim() || undefined)
      await refresh()
      setCatName("")
      setCatDescription("")
      setCategoryDialogOpen(false)
      setCategoryId(newCat.id)
      onChange?.()
    } catch (err) {
      console.error(err)
      setCatError("Erreur lors de la création de la catégorie.")
    } finally {
      setCatSubmitting(false)
    }
  }

  // Category aggregations map
  const categoryStats = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>()
    for (const e of expenses) {
      const current = map.get(e.category_id) || { total: 0, count: 0 }
      map.set(e.category_id, {
        total: current.total + e.amount,
        count: current.count + 1,
      })
    }
    return map
  }, [expenses])

  // Filtered expenses list
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchesSearch =
        e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.category_name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory =
        selectedCategory === "all" || e.category_id === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [expenses, searchQuery, selectedCategory])

  // Expense KPIs calculation
  const expenseKpis = useMemo(() => {
    const totalCount = expenses.length
    const totalAmount = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    const avgAmount = totalCount > 0 ? Math.round(totalAmount / totalCount) : 0

    const todayStr = new Date().toISOString().split("T")[0]
    const todayExpenses = expenses.filter((e) => {
      if (!e.spent_at) return false
      return e.spent_at.startsWith(todayStr)
    })
    const todayCount = todayExpenses.length
    const todayAmount = todayExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

    return {
      totalCount,
      totalAmount,
      avgAmount,
      todayCount,
      todayAmount,
    }
  }, [expenses])

  // Filtered categories list
  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      const q = categorySearchQuery.toLowerCase()
      return (
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
      )
    })
  }, [categories, categorySearchQuery])

  function handleConsult(expense: Expense) {
    setSelectedExpense(expense)
    setSheetOpen(true)
  }

  function handleFilterByCategory(catId: string) {
    setSelectedCategory(catId)
    if (onNavigateToTab) {
      onNavigateToTab("expenses")
    } else {
      setActiveTab("expenses")
    }
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-24 bg-muted rounded-lg" />
          <div className="h-24 bg-muted rounded-lg" />
          <div className="h-24 bg-muted rounded-lg" />
          <div className="h-24 bg-muted rounded-lg" />
        </div>
        <div className="rounded-md border border-border/40 bg-card p-4 space-y-4">
          <div className="h-6 bg-muted rounded-sm w-full" />
          <div className="h-6 bg-muted rounded-sm w-full" />
          <div className="h-6 bg-muted rounded-sm w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Header & Main Navigation Actions */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {activeTab === "expenses" ? "Dépenses" : "Catégories de dépenses"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeTab === "expenses"
              ? "Suivi analytique et contrôle des sorties de caisse"
              : "Organisation et répartition des postes budgétaires"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "expenses" ? (
            <Button
              onClick={handleOpenCreateExpenseDialog}
              className="group relative inline-flex items-center justify-start rounded-full p-0 h-10 w-10 hover:w-52 transition-all duration-500 ease-in-out shadow-2xs overflow-hidden shrink-0"
              title="Enregistrer une dépense"
            >
              <div className="flex h-10 w-10 items-center justify-center shrink-0">
                <Plus className="size-4" />
              </div>
              <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-500 ease-in-out group-hover:max-w-xs group-hover:opacity-100 text-xs font-semibold pr-4 -ml-1">
                Enregistrer une dépense
              </span>
            </Button>
          ) : (
            <Button onClick={handleOpenCreateCategoryDialog} className="flex items-center gap-1.5">
              <FolderPlus className="size-4" />
              Nouvelle catégorie
            </Button>
          )}
        </div>
      </header>

      {/* ----------------- TAB 1: EXPENSES VIEW ----------------- */}
      {activeTab === "expenses" && (
        <div className="space-y-6">
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border border-border/60 shadow-2xs hover:shadow-xs transition-shadow bg-card">
              <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Nombre de dépenses
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Receipt className="size-4" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {expenseKpis.totalCount}
                </div>
                <p className="text-3xs text-muted-foreground mt-1">
                  Enregistrées au total
                </p>
              </CardContent>
            </Card>

            <Card className="border border-border/60 shadow-2xs hover:shadow-xs transition-shadow bg-card">
              <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Montant total
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Wallet className="size-4" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {formatMoney(expenseKpis.totalAmount)}
                </div>
                <p className="text-3xs text-muted-foreground mt-1">
                  Cumul des sorties de caisse
                </p>
              </CardContent>
            </Card>

            <Card className="border border-border/60 shadow-2xs hover:shadow-xs transition-shadow bg-card">
              <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Dépense moyenne
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Calculator className="size-4" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {formatMoney(expenseKpis.avgAmount)}
                </div>
                <p className="text-3xs text-muted-foreground mt-1">
                  Moyenne par opération
                </p>
              </CardContent>
            </Card>

            <Card className="border border-border/60 shadow-2xs hover:shadow-xs transition-shadow bg-card">
              <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Aujourd'hui
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Clock className="size-4" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {formatMoney(expenseKpis.todayAmount)}
                </div>
                <p className="text-3xs text-muted-foreground mt-1">
                  {expenseKpis.todayCount} dépense(s) aujourd'hui
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Search & Category Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrer par motif ou catégorie..."
                className="pl-8 h-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-9 w-48 bg-white border-border text-xs">
                  <SelectValue placeholder="Toutes les catégories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les catégories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCategory !== "all" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCategory("all")}
                  className="h-9 text-xs text-muted-foreground hover:text-foreground"
                >
                  Effacer filtre
                </Button>
              )}
            </div>
          </div>

          {/* Expenses Datatable */}
          <div className="rounded-md border border-border/40 bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-2xs font-bold">Date</TableHead>
                  <TableHead className="text-2xs font-bold">Catégorie</TableHead>
                  <TableHead className="text-2xs font-bold">Description / Motif</TableHead>
                  <TableHead className="text-2xs font-bold">Enregistré par</TableHead>
                  <TableHead className="text-2xs font-bold text-right">Montant</TableHead>
                  <TableHead className="text-2xs font-bold text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.map((e) => (
                  <TableRow key={e.id} className="hover:bg-muted/30">
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(e.spent_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral" className="text-2xs font-normal">
                        {e.category_name}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-xs text-foreground max-w-xs truncate">
                      {e.description}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.recorded_by_name || "Agent comptable"}
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs text-foreground">
                      {formatMoney(e.amount)}
                    </TableCell>
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
                      <div className="flex flex-col items-center justify-center space-y-1">
                        <Receipt className="size-6 text-muted-foreground/40 mb-1" />
                        <p className="text-xs font-semibold text-foreground">Aucune dépense trouvée.</p>
                        <p className="text-3xs text-muted-foreground">
                          {searchQuery || selectedCategory !== "all"
                            ? "Essayez de modifier vos filtres de recherche."
                            : "Cliquez sur 'Enregistrer une dépense' pour démarrer."}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ----------------- TAB 2: CATEGORIES VIEW ----------------- */}
      {activeTab === "categories" && (
        <div className="space-y-6">
          {/* Search bar for categories */}
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={categorySearchQuery}
                onChange={(e) => setCategorySearchQuery(e.target.value)}
                placeholder="Rechercher une catégorie ou description..."
                className="pl-8 h-9 text-xs"
              />
            </div>
          </div>

          {/* Categories Datatable */}
          <div className="rounded-md border border-border/40 bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-2xs font-bold w-1/3">Nom</TableHead>
                  <TableHead className="text-2xs font-bold">Description</TableHead>
                  <TableHead className="text-2xs font-bold text-right w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCategories.map((c) => (
                  <TableRow key={c.id} className="hover:bg-muted/30">
                    <TableCell className="py-3 font-semibold text-xs text-foreground">
                      {c.name}
                    </TableCell>
                    <TableCell className="py-3 text-xs text-muted-foreground">
                      {c.description ? (
                        c.description
                      ) : (
                        <span className="italic text-muted-foreground/50">Aucune description</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenCategoryDetails(c)}
                          className="size-8 text-muted-foreground hover:text-foreground"
                          title="Voir les détails"
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenCategoryEdit(c)}
                          className="size-8 text-muted-foreground hover:text-foreground"
                          title="Modifier la catégorie"
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {filteredCategories.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center h-32 text-muted-foreground text-xs">
                      <div className="flex flex-col items-center justify-center space-y-1">
                        <FolderTree className="size-6 text-muted-foreground/40 mb-1" />
                        <p className="text-xs font-semibold text-foreground">Aucune catégorie trouvée.</p>
                        <p className="text-3xs text-muted-foreground">
                          Cliquez sur 'Nouvelle catégorie' pour créer un poste budgétaire.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ----------------- DIALOG 1: NEW EXPENSE MODAL ----------------- */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent
          className="sm:max-w-md p-6 sm:p-7 space-y-4"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Receipt className="size-5 text-primary" />
              Nouvelle Dépense
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Enregistrer une sortie d'argent de la trésorerie
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleExpenseSubmit} className="space-y-4 pt-1">
            {/* Category Select */}
            <div className="space-y-1.5">
              <Label htmlFor="dialog-category" className="text-xs font-medium text-foreground">
                Catégorie de dépense
              </Label>
              <Select
                value={categoryId}
                onValueChange={(val) => {
                  setCategoryId(val)
                  setFieldErrors((prev) => ({ ...prev, category: undefined }))
                }}
              >
                <SelectTrigger id="dialog-category" className="h-10 w-full bg-background border-input text-sm">
                  <SelectValue placeholder="Choisir une catégorie…" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex flex-col text-left">
                        <span className="font-medium">{c.name}</span>
                        {c.description && (
                          <span className="text-3xs text-muted-foreground">{c.description}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                  <SelectItem value="new-category-placeholder" className="text-primary font-medium">
                    + Créer une nouvelle catégorie
                  </SelectItem>
                </SelectContent>
              </Select>
              {fieldErrors.category && (
                <p className="text-xs text-negative font-medium">{fieldErrors.category}</p>
              )}
            </div>

            {categoryId === "new-category-placeholder" && (
              <div className="space-y-3 bg-primary/5 p-3 rounded-lg border border-primary/20">
                <div className="space-y-1">
                  <Label
                    htmlFor="dialog-newCategory"
                    className="text-xs font-semibold flex items-center gap-1.5 text-primary"
                  >
                    <FolderPlus className="size-3.5" />
                    Nom de la catégorie
                  </Label>
                  <Input
                    id="dialog-newCategory"
                    value={newCategoryName}
                    onChange={(e) => {
                      setNewCategoryName(e.target.value)
                      setFieldErrors((prev) => ({ ...prev, category: undefined }))
                    }}
                    placeholder="ex. Mobilier de classe"
                    className="bg-white text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dialog-newCategoryDesc" className="text-xs font-medium text-muted-foreground">
                    Description (optionnel)
                  </Label>
                  <Input
                    id="dialog-newCategoryDesc"
                    value={newCategoryDesc}
                    onChange={(e) => setNewCategoryDesc(e.target.value)}
                    placeholder="ex. Achats de tables, bancs et chaises"
                    className="bg-white text-xs"
                  />
                </div>
              </div>
            )}

            {/* Grid for Amount & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="dialog-amount" className="text-xs font-medium text-foreground">
                  Montant (XOF)
                </Label>
                <div className="relative">
                  <Input
                    id="dialog-amount"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => {
                      const formatted = formatAmountInput(e.target.value)
                      setAmount(formatted)
                      setFieldErrors((prev) => ({ ...prev, amount: undefined }))
                    }}
                    placeholder="150 000"
                    className="pr-12 text-sm font-semibold"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground pointer-events-none">
                    XOF
                  </span>
                </div>
                {fieldErrors.amount && (
                  <p className="text-xs text-negative font-medium">{fieldErrors.amount}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dialog-spentAt" className="text-xs font-medium text-foreground">
                  Date de la dépense
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="dialog-spentAt"
                      variant="outline"
                      className={cn(
                        "w-full h-10 justify-start text-left text-xs font-normal bg-background border-input",
                        !spentAtDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 size-3.5 text-muted-foreground" />
                      {spentAtDate ? (
                        format(spentAtDate, "PPP", { locale: fr })
                      ) : (
                        <span>Choisir une date…</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={spentAtDate}
                      onSelect={setSpentAtDate}
                      locale={fr}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Description / Motif */}
            <div className="space-y-1.5">
              <Label htmlFor="dialog-description" className="text-xs font-medium text-foreground">
                Motif explicatif
              </Label>
              <Textarea
                id="dialog-description"
                maxLength={255}
                rows={3}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value)
                  setFieldErrors((prev) => ({ ...prev, description: undefined }))
                }}
                placeholder="ex. Achat de 20 bancs en bois pour les classes de 3ème"
                className="resize-none text-xs"
              />
              {fieldErrors.description && (
                <p className="text-xs text-negative font-medium">{fieldErrors.description}</p>
              )}
            </div>

            {/* Optional Receipt Field */}
            <div className="space-y-1.5">
              <Label htmlFor="dialog-receipt" className="text-xs font-medium text-muted-foreground">
                N° de reçu (optionnel)
              </Label>
              <Input
                id="dialog-receipt"
                maxLength={255}
                value={receiptPhotoPath}
                onChange={(e) => setReceiptPhotoPath(e.target.value)}
                placeholder="ex. REÇU-2026-0042"
                className="text-xs"
              />
            </div>

            {fieldErrors.general && (
              <p className="text-xs text-negative font-medium bg-negative/10 p-2 rounded border border-negative/20">
                {fieldErrors.general}
              </p>
            )}

            <DialogFooter className="pt-3 border-t border-border/40 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Enregistrement..." : "Enregistrer la dépense"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ----------------- DIALOG 2: NEW CATEGORY MODAL ----------------- */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent
          className="sm:max-w-md p-6 sm:p-7 space-y-4"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <FolderPlus className="size-5 text-primary" />
              Nouvelle Catégorie de Dépense
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Créez une catégorie pour organiser les dépenses du collège
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCategorySubmit} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name" className="text-xs font-medium text-foreground">
                Nom de la catégorie
              </Label>
              <Input
                id="cat-name"
                maxLength={255}
                value={catName}
                onChange={(e) => {
                  setCatName(e.target.value)
                  setCatError(null)
                }}
                placeholder="ex. Équipements informatiques"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cat-desc" className="text-xs font-medium text-muted-foreground">
                Description (optionnel)
              </Label>
              <Input
                id="cat-desc"
                maxLength={255}
                value={catDescription}
                onChange={(e) => setCatDescription(e.target.value)}
                placeholder="ex. Ordinateurs, imprimantes et réseau"
              />
            </div>

            {catError && (
              <p className="text-xs text-negative font-medium bg-negative/10 p-2 rounded border border-negative/20">
                {catError}
              </p>
            )}

            <DialogFooter className="pt-3 border-t border-border/40 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCategoryDialogOpen(false)}
                disabled={catSubmitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={catSubmitting}>
                {catSubmitting ? "Création..." : "Créer la catégorie"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ----------------- DETAILS SLIDE-OVER SHEET ----------------- */}
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
                <p className="text-2xs text-muted-foreground uppercase tracking-wider font-semibold">
                  Montant Décaissé
                </p>
                <p className="text-3xl font-extrabold text-foreground mt-1.5">
                  {formatMoney(selectedExpense.amount)}
                </p>
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
                    <CalendarIcon className="size-3.5" /> Date d'effet
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

      {/* ----------------- CATEGORY DETAILS SHEET ----------------- */}
      <Sheet open={categorySheetOpen} onOpenChange={setCategorySheetOpen}>
        <SheetContent className="w-full sm:max-w-md p-6">
          {selectedCategoryDetails && (() => {
            const stats = categoryStats.get(selectedCategoryDetails.id) || { total: 0, count: 0 }
            const catExpenses = expenses.filter((e) => e.category_id === selectedCategoryDetails.id)

            return (
              <div className="space-y-6 h-full flex flex-col">
                <SheetHeader className="space-y-1">
                  <SheetTitle className="text-lg font-bold flex items-center gap-2">
                    <FolderTree className="size-5 text-primary" />
                    {selectedCategoryDetails.name}
                  </SheetTitle>
                  <SheetDescription className="text-xs">
                    {selectedCategoryDetails.description || "Aucune description fournie"}
                  </SheetDescription>
                </SheetHeader>

                {/* Category KPI summary */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 text-left">
                    <p className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Total Décaissé
                    </p>
                    <p className="text-lg font-bold text-foreground mt-1">
                      {formatMoney(stats.total)}
                    </p>
                  </div>
                  <div className="bg-muted/30 border border-border/40 rounded-lg p-3 text-left">
                    <p className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Nombre de Saisies
                    </p>
                    <p className="text-lg font-bold text-foreground mt-1">
                      {stats.count}
                    </p>
                  </div>
                </div>

                {/* List of associated expenses */}
                <div className="space-y-3 flex-1 overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-foreground">
                      Historique des Dépenses ({catExpenses.length})
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCategorySheetOpen(false)
                        handleFilterByCategory(selectedCategoryDetails.id)
                      }}
                      className="h-7 text-xs text-primary hover:text-primary"
                    >
                      Voir sur Dépenses <ArrowRight className="size-3 ml-1" />
                    </Button>
                  </div>

                  {catExpenses.length > 0 ? (
                    <div className="space-y-2">
                      {catExpenses.map((e) => (
                        <div
                          key={e.id}
                          className="bg-card border border-border/40 rounded-lg p-3 text-xs space-y-1 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground truncate max-w-xs">
                              {e.description}
                            </span>
                            <span className="font-bold text-foreground shrink-0">
                              {formatMoney(e.amount)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-3xs text-muted-foreground">
                            <span>{new Date(e.spent_at).toLocaleDateString()}</span>
                            <span>Par : {e.recorded_by_name || "Agent"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic text-center py-6">
                      Aucune dépense enregistrée dans cette catégorie.
                    </p>
                  )}
                </div>
              </div>
            )
          })()}
        </SheetContent>
      </Sheet>

      {/* ----------------- CATEGORY EDIT DIALOG ----------------- */}
      <Dialog open={editCatDialogOpen} onOpenChange={setEditCatDialogOpen}>
        <DialogContent
          className="sm:max-w-md p-6 sm:p-7 space-y-4"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Pencil className="size-5 text-primary" />
              Modifier la Catégorie
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Mettez à jour le nom et la description du poste budgétaire
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCategoryUpdateSubmit} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="edit-cat-name" className="text-xs font-medium text-foreground">
                Nom de la catégorie
              </Label>
              <Input
                id="edit-cat-name"
                maxLength={255}
                value={editCatName}
                onChange={(e) => {
                  setEditCatName(e.target.value)
                  setEditCatError(null)
                }}
                placeholder="ex. Équipements informatiques"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-cat-desc" className="text-xs font-medium text-muted-foreground">
                Description (optionnel)
              </Label>
              <textarea
                id="edit-cat-desc"
                maxLength={255}
                rows={3}
                value={editCatDesc}
                onChange={(e) => setEditCatDesc(e.target.value)}
                placeholder="ex. Ordinateurs, imprimantes et réseau"
                className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </div>

            {editCatError && (
              <p className="text-xs text-negative font-medium bg-negative/10 p-2 rounded border border-negative/20">
                {editCatError}
              </p>
            )}

            <DialogFooter className="pt-3 border-t border-border/40 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditCatDialogOpen(false)}
                disabled={editCatSubmitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={editCatSubmitting}>
                {editCatSubmitting ? "Mise à jour..." : "Mettre à jour"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
