import { PeriodFilter } from "@/components/PeriodFilter"
import { StatCard } from "@/components/StatCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import { periodRange, type Period } from "@/lib/period"
import {
  addCategory,
  addExpense,
  getExpensesPage,
  listCategories,
  type BudgetCategory,
  type CategoryStat,
  type Expense,
  type ExpenseStats,
} from "@/lib/queries"
import { TablePager } from "@/components/TablePager"
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination"
import { usePagedRows } from "@/lib/usePagedRows"
import { useDebounced } from "@/lib/useDebounced"
import { cn, formatMoney } from "@/lib/utils"
import { format, startOfToday } from "date-fns"
import { fr } from "date-fns/locale"
import {
  ArrowRight,
  Calculator,
  Calendar as CalendarIcon,
  Clock,
  Eye,
  FileText,
  FolderPlus,
  FolderTree,
  Plus,
  Receipt,
  Search,
  User,
  Wallet,
  XCircle,
  Paperclip,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

function formatAmountInput(val: string): string {
  const digits = val.replace(/\D/g, "")
  if (!digits) return ""
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
}

type TabMode = "expenses" | "categories"

// Categories only. Expenses are a server-paged slice now, so caching "the
// expenses" would cache whichever page happened to be open last.
let categoriesCache: BudgetCategory[] | null = null

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
  const [categories, setCategories] = useState<BudgetCategory[]>(categoriesCache ?? [])
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
  const [spentAtDate, setSpentAtDate] = useState<Date | undefined>(startOfToday())
  const [fieldErrors, setFieldErrors] = useState<{
    category?: string
    amount?: string
    spentAt?: string
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

  function handleOpenCategoryDetails(c: BudgetCategory) {
    setSelectedCategoryDetails(c)
    setCategorySheetOpen(true)
  }

  // The sheet's history used to be filtered out of the full in-memory ledger.
  // With the grid server-paged that array is one page of ten, so this fetches
  // the category's own rows instead of showing whatever happened to be loaded.
  const [catSheetExpenses, setCatSheetExpenses] = useState<Expense[]>([])
  const [catSheetLoading, setCatSheetLoading] = useState(false)

  // Filters and search
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("all")
  const [categorySearchQuery, setCategorySearchQuery] = useState("")

  // Details sheet
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Server-side paging state. The grid no longer holds the whole ledger —
  // `expenses` is one page of ten, and `total` is how many match the filters.
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<ExpenseStats>({
    totalCount: 0,
    totalAmount: 0,
    avgAmount: 0,
    todayCount: 0,
    todayAmount: 0,
  })
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([])
  const [pageLoading, setPageLoading] = useState(false)

  // Typing in the search box should not fire a query per keystroke.
  const debouncedSearch = useDebounced(searchQuery, 300)

  // Any filter change invalidates the current page number — staying on page 7
  // of a result set that now has two pages shows an empty table.
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, selectedCategory, selectedPeriod])

  const loadPage = useCallback(async () => {
    if (!dbReady) return
    setPageLoading(true)
    try {
      const range = periodRange(selectedPeriod)
      const res = await getExpensesPage({
        search: debouncedSearch,
        categoryId: selectedCategory === "all" ? null : selectedCategory,
        from: range.from,
        to: range.to,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
      })
      setExpenses(res.rows)
      setTotal(res.total)
      setStats(res.stats)
      setCategoryStats(res.categoryStats)
    } catch (e) {
      console.error(e)
    } finally {
      setPageLoading(false)
      setLoading(false)
    }
  }, [dbReady, debouncedSearch, selectedCategory, selectedPeriod, page])

  async function loadCategories() {
    if (!dbReady) return
    try {
      const cats = await listCategories()
      categoriesCache = cats
      setCategories(cats)
      if (!categoryId && cats[0]) setCategoryId(cats[0].id)
    } catch (e) {
      console.error(e)
    }
  }

  /** After a write — re-read both the page and the category list. */
  async function refresh() {
    await Promise.all([loadPage(), loadCategories()])
  }

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  useEffect(() => {
    void loadCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbReady])

  useEffect(() => {
    const cat = selectedCategoryDetails
    if (!cat || !dbReady) return
    let cancelled = false
    setCatSheetLoading(true)
    getExpensesPage({ categoryId: cat.id, page: 1, pageSize: 200 })
      .then((res) => {
        // Guard against a slow reply for a previously opened category landing
        // after the user has switched to another one.
        if (!cancelled) setCatSheetExpenses(res.rows)
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (!cancelled) setCatSheetLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedCategoryDetails, dbReady])

  function resetExpenseForm() {
    setCategoryId(categories[0]?.id || "")
    setNewCategoryName("")
    setNewCategoryDesc("")
    setAmount("")
    setDescription("")
    setReceiptPhotoPath("")
    setSpentAtDate(startOfToday())
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

    const isCreatingNewCategory = categoryId === "new-category-placeholder"
    let activeCategoryId = isCreatingNewCategory ? "" : categoryId
    if (isCreatingNewCategory) {
      if (!newCategoryName.trim()) {
        errors.category = "Veuillez saisir le nom de la nouvelle catégorie."
      }
    }

    if (!isCreatingNewCategory && !activeCategoryId && !errors.category) {
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

    if (!spentAtDate || Number.isNaN(spentAtDate.getTime())) {
      errors.spentAt = "Veuillez saisir une date valide."
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setIsSubmitting(true)
    try {
      if (isCreatingNewCategory) {
        const category = await addCategory(
          newCategoryName.trim(),
          newCategoryDesc.trim() || undefined,
        )
        activeCategoryId = category.id
      }

      const dateObj = spentAtDate || new Date()
      await addExpense({
        categoryId: activeCategoryId,
        amount: numericAmt,
        description: description.trim(),
        spentAt: dateObj.toISOString(),
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

  // Category aggregations, computed server-side over the whole period rather
  // than over whatever page is loaded. Kept as a Map so the callers below read
  // exactly as they did.
  const categoryStatsMap = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>()
    for (const c of categoryStats) map.set(c.categoryId, { total: c.total, count: c.count })
    return map
  }, [categoryStats])

  // Already the filtered page — search, category and period are applied by
  // `expenses_page`, so there is nothing left to filter here.
  const filteredExpenses = expenses

  // KPIs come back with the page, scoped to the period (not to search or
  // category) — the same scope this strip always described.
  const expenseKpis = {
    totalCount: stats.totalCount,
    totalAmount: stats.totalAmount,
    avgAmount: stats.avgAmount,
    todayCount: stats.todayCount,
    todayAmount: stats.todayAmount,
  }

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

  // In memory: nine categories. A round trip per page click would be slower
  // than slicing an array we already hold.
  const categoryPaging = usePagedRows(filteredCategories)

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
            <div className="h-7 w-48 bg-ink/10 rounded-md" />
            <div className="h-4 w-64 bg-ink/10 rounded-md" />
          </div>
          <div className="h-9 w-32 bg-ink/10 rounded-md" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-24 bg-ink/10 rounded-lg" />
          <div className="h-24 bg-ink/10 rounded-lg" />
          <div className="h-24 bg-ink/10 rounded-lg" />
          <div className="h-24 bg-ink/10 rounded-lg" />
        </div>
        <div className="rounded-md border border-ink/10 bg-paper p-4 space-y-4">
          <div className="h-6 bg-ink/10 rounded-sm w-full" />
          <div className="h-6 bg-ink/10 rounded-sm w-full" />
          <div className="h-6 bg-ink/10 rounded-sm w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-3 py-6 sm:px-4 sm:py-8 space-y-6">
      {/* Header & Main Navigation Actions */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-ink/10 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            {activeTab === "expenses" ? "Dépenses" : "Catégories de dépenses"}
          </h1>
          <p className="text-xs text-ink-soft mt-0.5">
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
              <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-500 ease-in-out group-hover:max-w-xs group-hover:opacity-100 text-xs font-display font-semibold pr-4 -ml-1">
                Enregistrer une dépense
              </span>
            </Button>
          ) : (
            <Button
              onClick={handleOpenCreateCategoryDialog}
              className="inline-flex items-center gap-2 rounded-full h-10 px-4 font-display text-xs font-semibold shadow-2xs"
            >
              <FolderPlus className="size-4 shrink-0" />
              Nouvelle catégorie
            </Button>
          )}
        </div>
      </header>

      {/* ----------------- TAB 1: EXPENSES VIEW ----------------- */}
      {activeTab === "expenses" && (
        <div className="space-y-4">
          {/* Period Filter (Right-aligned under header line, above KPI cards) */}
          <div className="flex justify-end items-center">
            <PeriodFilter value={selectedPeriod} onChange={setSelectedPeriod} className="w-50" />
          </div>

          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              variant="card"
              label="Nombre de dépenses"
              value={expenseKpis.totalCount}
              icon={Receipt}
              footer="Enregistrées au total"
            />
            <StatCard
              variant="card"
              label="Montant total"
              value={formatMoney(expenseKpis.totalAmount)}
              icon={Wallet}
              footer="Cumul des sorties de caisse"
            />
            <StatCard
              variant="card"
              label="Dépense moyenne"
              value={formatMoney(expenseKpis.avgAmount)}
              icon={Calculator}
              footer="Moyenne par opération"
            />
            <StatCard
              variant="card"
              label="Aujourd'hui"
              value={formatMoney(expenseKpis.todayAmount)}
              icon={Clock}
              footer={`${expenseKpis.todayCount} dépense(s) aujourd'hui`}
            />
          </div>

          {/* Search & Category Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-ink-soft" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrer par motif ou catégorie..."
                className="pl-8 h-9 text-xs border-ink/15 bg-paper text-ink"
              />
            </div>
            <div className="flex items-center gap-2">
              {/* Category Filter */}
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-9 w-48 bg-paper border-ink/15 text-xs text-ink font-display font-semibold">
                  <SelectValue placeholder="Toutes les catégories" />
                </SelectTrigger>
                <SelectContent className="bg-paper border-ink/10">
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
                  className="h-9 text-xs text-ink-soft hover:text-ink font-display"
                >
                  Effacer filtre
                </Button>
              )}
            </div>
          </div>

          {/* Expenses Datatable */}
          <div className="rounded-md border border-ink/10 bg-paper overflow-hidden">
            <div
              className={cn(
                "overflow-x-auto transition-opacity",
                pageLoading && "opacity-50"
              )}
            >
            <Table>
              <TableHeader>
                <TableRow className="border-b border-ink/10">
                  <TableHead className="text-xs font-display font-semibold text-ink-soft">Date</TableHead>
                  <TableHead className="text-xs font-display font-semibold text-ink-soft">Catégorie</TableHead>
                  <TableHead className="text-xs font-display font-semibold text-ink-soft hidden sm:table-cell">Description / Motif</TableHead>
                  <TableHead className="text-xs font-display font-semibold text-ink-soft hidden md:table-cell">Enregistré par</TableHead>
                  <TableHead className="text-xs font-display font-semibold text-ink-soft text-right">Montant</TableHead>
                  <TableHead className="text-xs font-display font-semibold text-ink-soft text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.map((e) => (
                  <TableRow key={e.id} className="border-b border-ink/10 last:border-0 hover:bg-teal-100/30">
                    <TableCell className="text-ink-soft text-xs whitespace-nowrap font-sans">
                      {new Date(e.spent_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral" className="text-xs font-normal whitespace-nowrap">
                        {e.category_name}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-display font-semibold text-xs text-ink max-w-[200px] truncate hidden sm:table-cell">
                      {e.description}
                    </TableCell>
                    <TableCell className="text-xs text-ink-soft hidden md:table-cell whitespace-nowrap">
                      {e.recorded_by_name || "Agent comptable"}
                    </TableCell>
                    <TableCell className="text-right font-display font-bold text-xs text-ink whitespace-nowrap">
                      {formatMoney(e.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-ink-soft hover:text-teal-950 hover:bg-teal-100/50"
                        onClick={() => handleConsult(e)}
                        title="Consulter les détails"
                      >
                        <Eye className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {filteredExpenses.length === 0 && !pageLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-ink-soft">
                      <div className="flex flex-col items-center justify-center space-y-1">
                        <p className="font-medium text-ink text-xs">Aucune dépense trouvée</p>
                        <p className="text-xs text-ink-soft">
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

            <div className="px-4 pb-3">
              <TablePager
                page={page}
                pageSize={DEFAULT_PAGE_SIZE}
                total={total}
                onPageChange={setPage}
                itemLabel="dépenses"
              />
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 2: CATEGORIES VIEW ----------------- */}
      {activeTab === "categories" && (
        <div className="space-y-6">
          {/* Search bar for categories */}
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-ink-soft" />
              <Input
                value={categorySearchQuery}
                onChange={(e) => setCategorySearchQuery(e.target.value)}
                placeholder="Rechercher une catégorie ou description..."
                className="pl-8 h-9 text-xs border-ink/15 bg-paper text-ink"
              />
            </div>
          </div>

          {/* Categories Datatable */}
          <div className="rounded-md border border-ink/10 bg-paper overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-ink/10">
                  <TableHead className="text-xs font-display font-semibold text-ink-soft w-1/3">Nom</TableHead>
                  <TableHead className="text-xs font-display font-semibold text-ink-soft">Description</TableHead>
                  <TableHead className="text-xs font-display font-semibold text-ink-soft text-right w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryPaging.pageRows.map((c) => (
                  <TableRow key={c.id} className="border-b border-ink/10 last:border-0 hover:bg-teal-100/30">
                    <TableCell className="py-3 font-semibold text-xs text-ink font-display">
                      {c.name}
                    </TableCell>
                    <TableCell className="py-3 text-xs text-ink-soft">
                      {c.description ? (
                        c.description
                      ) : (
                        <span className="italic text-ink-soft/50">Aucune description</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenCategoryDetails(c)}
                          className="size-8 text-ink-soft hover:text-ink"
                          title="Voir les détails"
                        >
                          <Eye className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {filteredCategories.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center h-32 text-ink-soft text-xs">
                      <div className="flex flex-col items-center justify-center space-y-1">
                        <FolderTree className="size-6 text-ink-soft/40 mb-1" />
                        <p className="text-xs font-display font-semibold text-ink">Aucune catégorie trouvée.</p>
                        <p className="text-xs text-ink-soft">
                          Cliquez sur 'Nouvelle catégorie' pour créer un poste budgétaire.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="px-4 pb-3">
              <TablePager
                page={categoryPaging.page}
                pageSize={categoryPaging.pageSize}
                total={categoryPaging.total}
                onPageChange={categoryPaging.setPage}
                itemLabel="catégories"
              />
            </div>
          </div>
        </div>
      )}

      {/* ----------------- DIALOG 1: NEW EXPENSE MODAL ----------------- */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent
          className="sm:max-w-md p-6 sm:p-7 space-y-4 bg-paper border border-ink/10"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-display font-bold flex items-center gap-2 text-ink">
              <Receipt className="size-5 text-teal-950" />
              Nouvelle Dépense
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-soft">
              Enregistrer une sortie d'argent de la trésorerie
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleExpenseSubmit} className="space-y-4 pt-1">
            {/* Category Select */}
            <div className="space-y-1.5">
              <Label htmlFor="dialog-category" className="text-xs font-display font-medium text-ink">
                Catégorie de dépense
              </Label>
              <Select
                value={categoryId}
                onValueChange={(val) => {
                  setCategoryId(val)
                  setFieldErrors((prev) => ({ ...prev, category: undefined }))
                }}
              >
                <SelectTrigger id="dialog-category" className="h-10 w-full bg-paper border-ink/15 text-sm text-ink">
                  <SelectValue placeholder="Choisir une catégorie…" />
                </SelectTrigger>
                <SelectContent className="bg-paper border-ink/10">
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex flex-col text-left">
                        <span className="font-medium text-ink">{c.name}</span>
                        {c.description && (
                          <span className="text-xs text-ink-soft">{c.description}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                  <SelectItem value="new-category-placeholder" className="text-teal-950 font-display font-medium">
                    + Créer une nouvelle catégorie
                  </SelectItem>
                </SelectContent>
              </Select>
              {fieldErrors.category && (
                <p className="text-xs text-negative font-medium">{fieldErrors.category}</p>
              )}
            </div>

            {categoryId === "new-category-placeholder" && (
              <div className="space-y-3 bg-teal-100/50 p-3 rounded-lg border border-teal-950/20">
                <div className="space-y-1">
                  <Label
                    htmlFor="dialog-newCategory"
                    className="text-xs font-display font-semibold flex items-center gap-1.5 text-teal-950"
                  >
                    <FolderPlus className="size-4" />
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
                    className="bg-paper text-xs border-ink/15 text-ink"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dialog-newCategoryDesc" className="text-xs font-medium text-ink-soft">
                    Description (optionnel)
                  </Label>
                  <Input
                    id="dialog-newCategoryDesc"
                    value={newCategoryDesc}
                    onChange={(e) => setNewCategoryDesc(e.target.value)}
                    placeholder="ex. Achats de tables, bancs et chaises"
                    className="bg-paper text-xs border-ink/15 text-ink"
                  />
                </div>
              </div>
            )}

            {/* Grid for Amount & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="dialog-amount" className="text-xs font-display font-medium text-ink">
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
                    className="pr-12 text-sm font-semibold border-ink/15 bg-paper text-ink"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-soft pointer-events-none">
                    XOF
                  </span>
                </div>
                {fieldErrors.amount && (
                  <p className="text-xs text-negative font-medium">{fieldErrors.amount}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dialog-spentAt" className="text-xs font-display font-medium text-ink">
                  Date de la dépense
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="dialog-spentAt"
                      variant="outline"
                      className={cn(
                        "w-full h-10 justify-start text-left text-xs font-normal bg-paper border-ink/15 text-ink",
                        !spentAtDate && "text-ink-soft"
                      )}
                    >
                      <CalendarIcon className="mr-2 size-4 text-ink-soft" />
                      {spentAtDate ? (
                        format(spentAtDate, "PPP", { locale: fr })
                      ) : (
                        <span>Choisir une date…</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-paper border-ink/10" align="start">
                    <Calendar
                      mode="single"
                      selected={spentAtDate}
                      onSelect={setSpentAtDate}
                      locale={fr}
                      disabled={{ after: startOfToday() }}
                    />
                  </PopoverContent>
                </Popover>
                {fieldErrors.spentAt && (
                  <p className="text-xs text-negative font-medium">{fieldErrors.spentAt}</p>
                )}
              </div>
            </div>

            {/* Description / Motif */}
            <div className="space-y-1.5">
              <Label htmlFor="dialog-description" className="text-xs font-display font-medium text-ink">
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
                className="resize-none text-xs border-ink/15 bg-paper text-ink"
              />
              {fieldErrors.description && (
                <p className="text-xs text-negative font-medium">{fieldErrors.description}</p>
              )}
            </div>

            {/* Optional Receipt Field */}
            <div className="space-y-1.5">
              <Label htmlFor="dialog-receipt" className="text-xs font-medium text-ink-soft">
                N° de reçu (optionnel)
              </Label>
              <Input
                id="dialog-receipt"
                maxLength={255}
                value={receiptPhotoPath}
                onChange={(e) => setReceiptPhotoPath(e.target.value)}
                placeholder="ex. REÇU-2026-0042"
                className="text-xs border-ink/15 bg-paper text-ink"
              />
            </div>

            {fieldErrors.general && (
              <p className="text-xs text-negative font-medium bg-negative-bg p-2 rounded border border-negative/20">
                {fieldErrors.general}
              </p>
            )}

            <DialogFooter className="pt-3 border-t border-ink/10 gap-2 sm:gap-0">
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
          className="sm:max-w-md p-6 sm:p-7 space-y-4 bg-paper border border-ink/10"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-display font-bold flex items-center gap-2 text-ink">
              <FolderPlus className="size-5 text-teal-950" />
              Nouvelle Catégorie de Dépense
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-soft">
              Créez une catégorie pour organiser les dépenses du collège
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCategorySubmit} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name" className="text-xs font-display font-medium text-ink">
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
                className="border-ink/15 bg-paper text-ink text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cat-desc" className="text-xs font-medium text-ink-soft">
                Description (optionnel)
              </Label>
              <Input
                id="cat-desc"
                maxLength={255}
                value={catDescription}
                onChange={(e) => setCatDescription(e.target.value)}
                placeholder="ex. Ordinateurs, imprimantes et réseau"
                className="border-ink/15 bg-paper text-ink text-xs"
              />
            </div>

            {catError && (
              <p className="text-xs text-negative font-medium bg-negative-bg p-2 rounded border border-negative/20">
                {catError}
              </p>
            )}

            <DialogFooter className="pt-3 border-t border-ink/10 gap-2 sm:gap-0">
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
        <SheetContent
          className="w-full sm:max-w-md p-6 bg-paper border-l border-ink/10"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          {selectedExpense && (
            <div className="space-y-6 h-full flex flex-col">
              <SheetHeader className="space-y-1">
                <SheetTitle className="text-lg font-display font-bold flex items-center gap-2 text-ink">
                  <Receipt className="size-5 text-teal-950" />
                  Détail de la Dépense
                </SheetTitle>
                <SheetDescription className="text-xs text-ink-soft">
                  Fiche de contrôle comptable immuable
                </SheetDescription>
              </SheetHeader>

              {/* Amount Display */}
              <div className="bg-teal-100/50 border border-teal-950/15 rounded-xl p-6 text-center">
                <p className="text-xs text-ink-soft uppercase tracking-wider font-display font-semibold">
                  Montant Décaissé
                </p>
                <p className="text-3xl font-display font-extrabold text-ink mt-1.5">
                  {formatMoney(selectedExpense.amount)}
                </p>
              </div>

              {/* Detailed Grid */}
              <div className="space-y-4 flex-1">
                <div className="grid grid-cols-3 items-start gap-4 border-b border-ink/10 pb-3">
                  <span className="text-xs font-display font-semibold text-ink-soft flex items-center gap-1.5">
                    <FileText className="size-4" /> Catégorie
                  </span>
                  <span className="col-span-2 text-sm font-medium text-ink">
                    {selectedExpense.category_name}
                  </span>
                </div>

                <div className="grid grid-cols-3 items-start gap-4 border-b border-ink/10 pb-3">
                  <span className="text-xs font-display font-semibold text-ink-soft flex items-center gap-1.5">
                    <CalendarIcon className="size-4" /> Date d'effet
                  </span>
                  <span className="col-span-2 text-sm text-ink">
                    {new Date(selectedExpense.spent_at).toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-3 items-start gap-4 border-b border-ink/10 pb-3">
                  <span className="text-xs font-display font-semibold text-ink-soft flex items-center gap-1.5">
                    <User className="size-4" /> Saisi par
                  </span>
                  <span className="col-span-2 text-sm text-ink">
                    {selectedExpense.recorded_by_name || "Agent comptable / Trésorerie"}
                  </span>
                </div>

                <div className="space-y-1.5 pt-2">
                  <span className="text-xs font-display font-semibold text-ink-soft">Motif explicatif</span>
                  <div className="bg-paper border border-ink/10 rounded-lg p-3 text-sm text-ink leading-relaxed">
                    {selectedExpense.description}
                  </div>
                </div>

                {/* Attached Document Placeholder */}
                <div className="space-y-1.5 pt-2">
                  <span className="text-xs font-display font-semibold text-ink-soft flex items-center gap-1.5">
                    <Paperclip className="size-4" /> Justificatif / Pièce jointe
                  </span>
                  <div className="border border-dashed border-ink/20 rounded-lg p-4 text-center bg-teal-100/10">
                    <Paperclip className="size-5 mx-auto text-ink-soft mb-1.5" />
                    <p className="text-xs font-medium text-ink-soft">
                      Aucun fichier joint à cette dépense
                    </p>
                    <p className="text-[11px] text-ink-soft/70 mt-0.5">
                      Formats acceptés : PDF, PNG, JPG
                    </p>
                  </div>
                </div>

                {/* Status Badges - ONLY for cancellation/reversals */}
                {selectedExpense.reverses_expense_id && (
                  <div className="pt-2 flex flex-wrap gap-2">
                    <Badge variant="negative" className="flex items-center gap-1">
                      <XCircle className="size-3.5" /> Ajusté / Annulé
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ----------------- CATEGORY DETAILS SHEET ----------------- */}
      <Sheet open={categorySheetOpen} onOpenChange={setCategorySheetOpen}>
        <SheetContent className="w-full sm:max-w-md p-6 bg-paper border-l border-ink/10">
          {selectedCategoryDetails && (() => {
            const stats = categoryStatsMap.get(selectedCategoryDetails.id) || { total: 0, count: 0 }
            const catExpenses = catSheetExpenses

            return (
              <div className="space-y-6 h-full flex flex-col">
                <SheetHeader className="space-y-1">
                  <SheetTitle className="text-lg font-display font-bold flex items-center gap-2 text-ink">
                    <FolderTree className="size-5 text-teal-950" />
                    {selectedCategoryDetails.name}
                  </SheetTitle>
                  <SheetDescription className="text-xs text-ink-soft">
                    {selectedCategoryDetails.description || "Aucune description fournie"}
                  </SheetDescription>
                </SheetHeader>

                {/* Category KPI summary */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-teal-100/50 border border-teal-950/15 rounded-lg p-3 text-left">
                    <p className="text-xs font-display font-semibold text-ink-soft uppercase tracking-wider">
                      Total Décaissé
                    </p>
                    <p className="text-lg font-display font-bold text-ink mt-1">
                      {formatMoney(stats.total)}
                    </p>
                  </div>
                  <div className="bg-paper border border-ink/10 rounded-lg p-3 text-left">
                    <p className="text-xs font-display font-semibold text-ink-soft uppercase tracking-wider">
                      Nombre de Saisies
                    </p>
                    <p className="text-lg font-display font-bold text-ink mt-1">
                      {stats.count}
                    </p>
                  </div>
                </div>

                {/* List of associated expenses */}
                <div className="space-y-3 flex-1 overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-display font-semibold text-ink">
                      Historique des Dépenses ({catSheetLoading ? "…" : catExpenses.length})
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCategorySheetOpen(false)
                        handleFilterByCategory(selectedCategoryDetails.id)
                      }}
                      className="h-7 text-xs text-teal-950 hover:text-teal-900 font-display"
                    >
                      Voir sur Dépenses <ArrowRight className="size-4 ml-1" />
                    </Button>
                  </div>

                  {catExpenses.length > 0 ? (
                    <div className="space-y-2">
                      {catExpenses.map((e) => (
                        <div
                          key={e.id}
                          className="bg-paper border border-ink/10 rounded-lg p-3 text-xs space-y-1 hover:bg-teal-100/30 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-ink truncate max-w-xs">
                              {e.description}
                            </span>
                            <span className="font-bold text-ink shrink-0">
                              {formatMoney(e.amount)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-ink-soft">
                            <span>{new Date(e.spent_at).toLocaleDateString()}</span>
                            <span>Par : {e.recorded_by_name || "Agent"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-ink-soft italic text-center py-6">
                      Aucune dépense enregistrée dans cette catégorie.
                    </p>
                  )}
                </div>
              </div>
            )
          })()}
        </SheetContent>
      </Sheet>

    </div>
  )
}
