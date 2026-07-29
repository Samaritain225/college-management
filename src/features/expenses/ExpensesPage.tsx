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
  TableFooter,
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
  getExpensesExport,
  getExpensesPage,
  listCategories,
  type BudgetCategory,
  type CategoryStat,
  type Expense,
  type ExpenseExportRow,
  type ExpenseStats,
  type ExpensesSortColumn,
  type PaymentMethod,
  type SortDirection,
} from "@/lib/queries"
import { TablePager } from "@/components/TablePager"
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination"
import { usePagedRows } from "@/lib/usePagedRows"
import { useDebounced } from "@/lib/useDebounced"
import { readCache, writeCache } from "@/lib/persistentCache"
import { useNavigate } from "react-router-dom"
import { cn, formatDay, formatMoney } from "@/lib/utils"
import { isUploadedReceiptKey, publicUrl, uploadFile, validateUpload } from "@/lib/uploads"
import { format, startOfToday } from "date-fns"
import { fr } from "date-fns/locale"
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Calendar as CalendarIcon,
  Eye,
  FileText,
  FolderPlus,
  FolderTree,
  PieChart,
  Plus,
  Printer,
  Receipt,
  Search,
  TrendingUp,
  User,
  Wallet,
  XCircle,
  Paperclip,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { flushSync } from "react-dom"

function formatAmountInput(val: string): string {
  const digits = val.replace(/\D/g, "")
  if (!digits) return ""
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Espèces",
  mobile_money: "Mobile money",
  bank_transfer: "Virement",
  other: "Autre",
}

/** Rows predating the cash-expense fields have no method — those read "—"
 *  rather than being labelled as any particular one. */
function paymentMethodLabel(method: PaymentMethod | null): string {
  return method ? PAYMENT_METHOD_LABELS[method] : "—"
}

type TabMode = "expenses" | "categories"

// Categories only. Expenses are a server-paged slice now, so caching "the
// expenses" would cache whichever page happened to be open last.
const CATEGORIES_CACHE_KEY = "expense-categories"
let categoriesCache: BudgetCategory[] | null =
  readCache<BudgetCategory[]>(CATEGORIES_CACHE_KEY)

export function ExpensesPage({
  onChange,
  dbReady = true,
  mode = "expenses",
}: {
  onChange?: () => void
  dbReady?: boolean
  mode?: "expenses" | "categories"
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
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
  const [payee, setPayee] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<"" | "cash" | "mobile_money" | "bank_transfer" | "other">("")
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [spentAtDate, setSpentAtDate] = useState<Date | undefined>(startOfToday())
  const [fieldErrors, setFieldErrors] = useState<{
    category?: string
    amount?: string
    spentAt?: string
    description?: string
    payee?: string
    paymentMethod?: string
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
  const [catSheetTotal, setCatSheetTotal] = useState(0)
  const [catSheetLoading, setCatSheetLoading] = useState(false)

  // Filters and search
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("this_month")
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
    paidAmount: 0,
    reliquatAmount: 0,
    unpaidCount: 0,
    maxAmount: null,
    maxLabel: null,
    maxCategory: null,
    maxOn: null,
    elapsedDays: null,
    prevAmount: null,
  })
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([])
  const [filteredTotal, setFilteredTotal] = useState(0)
  const [pageLoading, setPageLoading] = useState(false)

  // Print report — a full, unpaged pull of whatever is currently filtered.
  // Rendered off-screen (`hidden print:block`) so it never shows on screen;
  // `window.print()` hands the choice of page range / printer / "Save as
  // PDF" to the browser's own dialog instead of building any of that here.
  const [printRows, setPrintRows] = useState<ExpenseExportRow[] | null>(null)
  const [printLoading, setPrintLoading] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [printPeriod, setPrintPeriod] = useState<Period>("all")

  // Column sort. Category defaults ascending (alphabetical reads naturally
  // A→Z); date and amount default descending (newest / biggest first).
  const [sortColumn, setSortColumn] = useState<ExpensesSortColumn>("date")
  const [sortDir, setSortDir] = useState<SortDirection>("desc")

  function toggleSort(column: ExpensesSortColumn) {
    if (sortColumn === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortColumn(column)
      setSortDir(column === "category" ? "asc" : "desc")
    }
  }

  // Typing in the search box should not fire a query per keystroke.
  const debouncedSearch = useDebounced(searchQuery, 300)

  // Any filter or sort change invalidates the current page number — staying
  // on page 7 of a result set that now has two pages shows an empty table.
  // `selectedPeriod` belongs here for the same reason as the others: it
  // narrows the result set, so it can strand the reader past the last page.
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, selectedCategory, selectedPeriod, sortColumn, sortDir])

  const loadPage = useCallback(async () => {
    if (!dbReady) return
    setPageLoading(true)
    try {
      const range = periodRange(selectedPeriod)
      // The table carries the date range too. Without it the grid and its
      // total row describe the whole ledger while the KPI strip above them
      // describes the selected period — two totals on one screen, disagreeing.
      const [tableRes, kpiRes] = await Promise.all([getExpensesPage({
        search: debouncedSearch,
        categoryId: selectedCategory === "all" ? null : selectedCategory,
        from: range.from,
        to: range.to,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
        sort: sortColumn,
        dir: sortDir,
      }), getExpensesPage({ from: range.from, to: range.to, page: 1, pageSize: 1 })])
      setExpenses(tableRes.rows)
      setTotal(tableRes.total)
      setFilteredTotal(tableRes.filteredTotal)
      setStats(kpiRes.stats)
      setCategoryStats(kpiRes.categoryStats)
    } catch (e) {
      console.error(e)
    } finally {
      setPageLoading(false)
      setLoading(false)
    }
  }, [dbReady, debouncedSearch, selectedCategory, selectedPeriod, page, sortColumn, sortDir])

  async function loadCategories() {
    if (!dbReady) return
    try {
      const cats = await listCategories()
      categoriesCache = cats
      writeCache(CATEGORIES_CACHE_KEY, cats)
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
    // Same period the KPI panel above this list is scoped to (categoryStats
    // is period-scoped) — fetching without it made the two disagree whenever
    // a period was selected on the Dépenses tab before navigating here.
    const range = periodRange(selectedPeriod)
    getExpensesPage({
      categoryId: cat.id,
      from: range.from,
      to: range.to,
      page: 1,
      pageSize: 200,
    })
      .then((res) => {
        // Guard against a slow reply for a previously opened category landing
        // after the user has switched to another one.
        if (!cancelled) {
          setCatSheetExpenses(res.rows)
          setCatSheetTotal(res.total)
        }
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (!cancelled) setCatSheetLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedCategoryDetails, selectedPeriod, dbReady])

  function resetExpenseForm() {
    setCategoryId(categories[0]?.id || "")
    setNewCategoryName("")
    setNewCategoryDesc("")
    setAmount("")
    setDescription("")
    setPayee("")
    setPaymentMethod("")
    setReceiptFile(null)
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

    if (!payee.trim()) {
      errors.payee = "Veuillez indiquer qui a reçu le paiement."
    }
    if (!paymentMethod) {
      errors.paymentMethod = "Veuillez choisir le moyen de paiement."
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
      const uploadedReceiptKey = receiptFile ? await uploadFile(receiptFile, "receipt") : undefined
      await addExpense({
        categoryId: activeCategoryId,
        amount: numericAmt,
        description: description.trim(),
        spentAt: dateObj.toISOString(),
        receiptKey: uploadedReceiptKey,
        payee: payee.trim(),
        paymentMethod: paymentMethod as "cash" | "mobile_money" | "bank_transfer" | "other",
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

  // "Au total" is only true when nothing is filtered — with a period
  // selected these cards describe that period, not the whole ledger.
  const isPeriodScoped = selectedPeriod !== "all"

  // Percentage change vs. the same-length window immediately preceding the
  // period (computed server-side so "27 days of July" is compared against
  // "1–27 June", never a full month against a partial one). Omitted — not
  // zero — when there is no prior window (all-time) or it was itself empty,
  // since a percentage off a zero base is meaningless.
  const periodComparison = useMemo(() => {
    if (!isPeriodScoped || stats.prevAmount == null || stats.prevAmount === 0) return null
    const pct = Math.round(((stats.totalAmount - stats.prevAmount) / stats.prevAmount) * 100)
    return `${pct >= 0 ? "+" : ""}${pct} % vs période précédente`
  }, [isPeriodScoped, stats.prevAmount, stats.totalAmount])

  // The heaviest category by spend in the period — categoryStats is already
  // in memory (it comes back with every page load), so this is pure
  // rendering, no extra round trip.
  const topCategory = useMemo(() => {
    if (categoryStats.length === 0) return null
    const top = categoryStats.reduce((max, c) => (c.total > max.total ? c : max))
    if (top.total <= 0) return null
    const name = categories.find((c) => c.id === top.categoryId)?.name ?? "Catégorie inconnue"
    const pct = stats.totalAmount > 0 ? Math.round((top.total / stats.totalAmount) * 100) : 0
    return { name, total: top.total, pct }
  }, [categoryStats, categories, stats.totalAmount])

  const printTotal = useMemo(
    () => (printRows ?? []).reduce((sum, r) => sum + r.amount, 0),
    [printRows]
  )

  const periodLabels: Record<Period, string> = {
    all: "Toutes les périodes",
    this_month: "Ce mois-ci",
    this_quarter: "Ce trimestre",
    this_year: `Cette année (${new Date().getFullYear()})`,
  }

  // A plain-language description of the active filters, for the print
  // header — the printout has no interactive controls to show them itself.
  const printFilterDescription = [
    periodLabels[printPeriod],
    selectedCategory !== "all"
      ? categories.find((c) => c.id === selectedCategory)?.name
      : null,
    debouncedSearch ? `recherche : "${debouncedSearch}"` : null,
  ]
    .filter(Boolean)
    .join(" · ")

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
    navigate("/expenses")
  }

  async function handlePrint() {
    setPrintLoading(true)
    try {
      const range = periodRange(printPeriod)
      const rows = await getExpensesExport({
        search: debouncedSearch,
        categoryId: selectedCategory === "all" ? null : selectedCategory,
        from: range.from,
        to: range.to,
        sort: sortColumn,
        dir: sortDir,
      })
      // window.print() reads the DOM synchronously — an ordinary setState
      // only commits before the next paint, which is not guaranteed to have
      // happened yet when the very next line runs. flushSync forces the
      // commit to finish before this call returns, so the report is actually
      // in the DOM by the time print() looks at it.
      flushSync(() => setPrintRows(rows))
      setPrintDialogOpen(false)
      window.print()
    } catch (e) {
      console.error(e)
    } finally {
      setPrintLoading(false)
    }
  }

  // A plain function returning JSX, not a component — using a capitalized
  // component tag here would remount the header cell on every render (new
  // function identity each time), which is unnecessary for something this
  // simple and has no state of its own.
  function sortHeader(column: ExpensesSortColumn, label: string, align?: "right") {
    const active = sortColumn === column
    const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
    return (
      <button
        type="button"
        onClick={() => toggleSort(column)}
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-display font-semibold transition-colors hover:text-ink",
          align === "right" && "flex-row-reverse",
          active ? "text-ink" : "text-ink-soft"
        )}
      >
        {label}
        <Icon className="size-3" />
      </button>
    )
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
    <>
    <div className="mx-auto max-w-5xl px-3 py-6 sm:px-4 sm:py-8 space-y-6 print:hidden">
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
              className="inline-flex items-center gap-2 rounded-full h-10 px-4 font-display text-xs font-semibold shadow-2xs shrink-0"
            >
              <Plus className="size-4 shrink-0" />
              Enregistrer une dépense
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

          {/* KPI Cards Grid — four cards, each answering a question a
              non-technical reader actually has, not a number that happens to
              be easy to compute. "Aujourd'hui" and "Dépense moyenne" are gone:
              the first was blank most days, the second averaged a 2.25M
              salary run against a 28k supply purchase and described neither. */}
          {/* Three cards, not four. "Transactions enregistrées" printed the
              same count already carried in the first card's footer, so on a
              phone — where these stack — the reader scrolled past "57" twice
              before reaching a single expense. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              variant="card"
              label="Dépensé sur la période"
              value={formatMoney(stats.totalAmount)}
              icon={Wallet}
              footer={
                <>
                  {stats.totalCount} sortie{stats.totalCount > 1 ? "s" : ""} de caisse
                  {periodComparison ? ` · ${periodComparison}` : ""}
                </>
              }
            />
            <StatCard
              variant="card"
              label="Poste le plus lourd"
              value={topCategory?.name ?? "—"}
              valueClassName="text-lg sm:text-xl"
              icon={PieChart}
              footer={
                topCategory
                  ? `${formatMoney(topCategory.total)} · ${topCategory.pct} % du total`
                  : "Aucune dépense sur la période"
              }
            />
            <StatCard
              variant="card"
              label="Plus grosse dépense"
              value={stats.maxAmount != null ? formatMoney(stats.maxAmount) : "—"}
              icon={TrendingUp}
              footer={
                stats.maxAmount != null && stats.maxOn
                  ? `${stats.maxCategory} · ${formatDay(stats.maxOn)}`
                  : "Aucune dépense sur la période"
              }
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

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPrintDialogOpen(true)}
                disabled={printLoading}
                className="h-9 text-xs border-ink/15 text-ink-soft hover:text-ink font-display gap-1.5"
                title="Choisir la période du rapport"
              >
                <Printer className="size-3.5" />
                {printLoading ? "Préparation..." : "Imprimer"}
              </Button>
            </div>
          </div>

          {/* Expenses Datatable */}
          <div className="rounded-md border border-ink/10 bg-paper overflow-hidden">
            {/* Below sm the table is 589px wide inside a ~331px column, so it
                can only be read by dragging it sideways — and the drag target
                is the same surface the reader swipes to scroll the page. One
                card per expense instead, carrying every column the table has
                including the two the md-hidden column would otherwise cost a
                phone reader entirely. */}
            <div
              className={cn(
                "sm:hidden divide-y divide-ink/10 transition-opacity",
                pageLoading && "opacity-50"
              )}
            >
              {filteredExpenses.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => handleConsult(e)}
                  className="w-full text-left p-3 space-y-1.5 hover:bg-teal-100/30 active:bg-teal-100/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-display font-semibold text-xs text-ink min-w-0 break-words">
                      {e.description}
                    </span>
                    <span className="font-display font-bold text-xs text-ink shrink-0 tabular-nums">
                      {formatMoney(e.amount, "").trim()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-2xs text-ink-soft tabular-nums">{formatDay(e.spent_at)}</span>
                    <Badge variant="neutral" className="text-2xs font-normal">
                      {e.category_name}
                    </Badge>
                  </div>
                  <p className="text-2xs text-ink-soft break-words">
                    {e.payee || "Non renseigné"} · {paymentMethodLabel(e.payment_method)}
                  </p>
                </button>
              ))}

              {filteredExpenses.length === 0 && !pageLoading && (
                <div className="p-6 text-center space-y-1">
                  <p className="font-medium text-ink text-xs">Aucune dépense trouvée</p>
                  <p className="text-xs text-ink-soft">
                    {searchQuery || selectedCategory !== "all" || selectedPeriod !== "all"
                      ? "Essayez de modifier vos filtres de recherche."
                      : "Cliquez sur 'Enregistrer une dépense' pour démarrer."}
                  </p>
                </div>
              )}

              {filteredExpenses.length > 0 && (
                <div className="flex items-center justify-between gap-3 bg-teal-100/20 p-3">
                  <span className="text-xs font-display font-semibold text-ink">
                    {total} dépense{total > 1 ? "s" : ""} filtrée{total > 1 ? "s" : ""}
                  </span>
                  <span className="font-display font-bold text-xs text-ink shrink-0 tabular-nums">
                    {formatMoney(filteredTotal, "").trim()}
                  </span>
                </div>
              )}
            </div>

            <div
              className={cn(
                "hidden sm:block transition-opacity",
                pageLoading && "opacity-50"
              )}
            >
            <Table>
              <TableHeader>
                <TableRow className="border-b border-ink/10">
                  <TableHead className="text-xs font-display font-semibold text-ink-soft">
                    {sortHeader("date", "Date")}
                  </TableHead>
                  <TableHead className="text-xs font-display font-semibold text-ink-soft">
                    {sortHeader("category", "Catégorie")}
                  </TableHead>
                  {/* Description is the row's name — the last thing to drop.
                      Enregistré par is the first, hidden until md instead. */}
                  <TableHead className="text-xs font-display font-semibold text-ink-soft">Description / Motif</TableHead>
                  <TableHead className="text-xs font-display font-semibold text-ink-soft hidden md:table-cell">Payé à / moyen</TableHead>
                  <TableHead className="text-xs font-display font-semibold text-ink-soft text-right">
                    {sortHeader("amount", "Montant (F CFA)", "right")}
                  </TableHead>
                  <TableHead className="text-xs font-display font-semibold text-ink-soft text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.map((e) => (
                  <TableRow key={e.id} className="border-b border-ink/10 last:border-0 hover:bg-teal-100/30">
                    <TableCell className="text-ink-soft text-xs whitespace-nowrap font-sans">
                      {formatDay(e.spent_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral" className="text-xs font-normal whitespace-nowrap">
                        {e.category_name}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="font-display font-semibold text-xs text-ink max-w-[160px] sm:max-w-[200px] truncate"
                      title={e.description}
                    >
                      {e.description}
                    </TableCell>
                    <TableCell className="text-xs text-ink-soft hidden md:table-cell whitespace-nowrap">
                      <span className="font-medium text-ink">{e.payee || "Non renseigné"}</span>
                      <span className="block text-2xs">{paymentMethodLabel(e.payment_method)}</span>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="font-display font-bold text-xs text-ink">
                        {formatMoney(e.amount, "").trim()}
                      </div>
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
                          {searchQuery || selectedCategory !== "all" || selectedPeriod !== "all"
                            ? "Essayez de modifier vos filtres de recherche."
                            : "Cliquez sur 'Enregistrer une dépense' pour démarrer."}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              {filteredExpenses.length > 0 && (
                <TableFooter>
                  <TableRow className="border-t border-ink/10 bg-teal-100/20 hover:bg-teal-100/20">
                    <TableCell colSpan={2} className="text-xs font-display font-semibold text-ink whitespace-nowrap">
                      {total} dépense{total > 1 ? "s" : ""} filtrée{total > 1 ? "s" : ""}
                    </TableCell>
                    <TableCell />
                    <TableCell className="hidden md:table-cell" />
                    <TableCell className="text-right font-display font-bold text-xs text-ink whitespace-nowrap">
                      {formatMoney(filteredTotal, "").trim()}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
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
          {/* The period filter is the same state as the Dépenses tab — it was
              silently still applied to these totals even when this control
              wasn't rendered, so it must be visible here too. */}
          <div className="flex justify-end items-center">
            <PeriodFilter value={selectedPeriod} onChange={setSelectedPeriod} className="w-50" />
          </div>

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
      {/* max-h + overflow-y-auto because `DialogContent` is `fixed` and
          centred with `-translate-y-1/2`, with no height cap of its own: a
          form taller than the viewport spills off *both* edges and cannot be
          scrolled to, so the submit button becomes unreachable. Measured at
          851px against a 375x667 phone, where "Enregistrer la dépense" landed
          7px below the fold. `svh`, not `vh` — `vh` is the viewport with the
          mobile URL bar expanded, which is not what the user is looking at. */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent
          className="sm:max-w-md p-6 sm:p-7 space-y-4 bg-paper border border-ink/10 max-h-[90svh] overflow-y-auto"
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="dialog-payee" className="text-xs font-display font-medium text-ink">Payé à</Label>
                <Input id="dialog-payee" maxLength={255} value={payee} onChange={(e) => { setPayee(e.target.value); setFieldErrors((prev) => ({ ...prev, payee: undefined })) }} placeholder="ex. M. Kouamé / Quincaillerie Awa" className="text-xs border-ink/15 bg-paper text-ink" />
                {fieldErrors.payee && <p className="text-xs text-negative font-medium">{fieldErrors.payee}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dialog-payment-method" className="text-xs font-display font-medium text-ink">Moyen de paiement</Label>
                <Select value={paymentMethod} onValueChange={(value) => { setPaymentMethod(value as typeof paymentMethod); setFieldErrors((prev) => ({ ...prev, paymentMethod: undefined })) }}>
                  <SelectTrigger id="dialog-payment-method" className="h-10 w-full bg-paper border-ink/15 text-sm text-ink"><SelectValue placeholder="Choisir un moyen…" /></SelectTrigger>
                  <SelectContent className="bg-paper border-ink/10"><SelectItem value="cash">Espèces</SelectItem><SelectItem value="mobile_money">Mobile money</SelectItem><SelectItem value="bank_transfer">Virement bancaire</SelectItem><SelectItem value="other">Autre</SelectItem></SelectContent>
                </Select>
                {fieldErrors.paymentMethod && <p className="text-xs text-negative font-medium">{fieldErrors.paymentMethod}</p>}
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

            {/* Optional receipt attachment */}
            <div className="space-y-1.5">
              <Label htmlFor="dialog-receipt" className="text-xs font-medium text-ink-soft">
                Pièce justificative (optionnel)
              </Label>
              <Input
                id="dialog-receipt"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  if (file) {
                    const err = validateUpload(file, "receipt")
                    if (err) {
                      setReceiptFile(null)
                      e.target.value = ""
                      setFieldErrors((prev) => ({ ...prev, general: err }))
                      return
                    }
                  }
                  setFieldErrors((prev) => ({ ...prev, general: undefined }))
                  setReceiptFile(file)
                }}
                className="text-xs border-ink/15 bg-paper text-ink"
              />
              <p className="text-2xs text-ink-soft">
                Photo ou PDF. Les photos sont compressées automatiquement ; PDF 10 Mo maximum.
              </p>
              {receiptFile && <p className="text-xs font-medium text-ink">{receiptFile.name}</p>}
            </div>

            {fieldErrors.general && (
              <p className="text-xs text-negative font-medium bg-negative-bg p-2 rounded-sm border border-negative/20">
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

      {/* ----------------- DIALOG 2: PRINT REPORT MODAL ----------------- */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="sm:max-w-sm p-6 space-y-4 bg-paper border border-ink/10 max-h-[90svh] overflow-y-auto">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-display font-bold text-ink">Imprimer les dépenses</DialogTitle>
            <DialogDescription className="text-xs text-ink-soft">Choisissez la période à inclure dans le rapport.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="print-period" className="text-xs font-display font-medium text-ink">Période du rapport</Label>
            <PeriodFilter value={printPeriod} onChange={setPrintPeriod} className="w-full" />
          </div>
          <DialogFooter className="pt-3 border-t border-ink/10 gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setPrintDialogOpen(false)} disabled={printLoading}>Annuler</Button>
            <Button type="button" onClick={handlePrint} disabled={printLoading}>{printLoading ? "Préparation…" : "Imprimer le rapport"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent
          className="sm:max-w-md p-6 sm:p-7 space-y-4 bg-paper border border-ink/10 max-h-[90svh] overflow-y-auto"
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
              <p className="text-xs text-negative font-medium bg-negative-bg p-2 rounded-sm border border-negative/20">
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

              {/* Detailed Grid. overflow-y-auto because this is the only
                  scrollable region of the sheet — the header and the amount
                  box above it are fixed height, and on a short phone this
                  list is what runs past the bottom edge. */}
              <div className="space-y-4 flex-1 overflow-y-auto">
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
                    {formatDay(selectedExpense.spent_at)}
                  </span>
                </div>

                {/* Payee and method live only in this sheet on a phone — the
                    table column carrying them is hidden below md. */}
                <div className="grid grid-cols-3 items-start gap-4 border-b border-ink/10 pb-3">
                  <span className="text-xs font-display font-semibold text-ink-soft flex items-center gap-1.5">
                    <User className="size-4" /> Payé à
                  </span>
                  <span className="col-span-2 text-sm text-ink break-words">
                    {selectedExpense.payee || "Non renseigné"}
                  </span>
                </div>

                <div className="grid grid-cols-3 items-start gap-4 border-b border-ink/10 pb-3">
                  <span className="text-xs font-display font-semibold text-ink-soft flex items-center gap-1.5">
                    <Wallet className="size-4" /> Moyen
                  </span>
                  <span className="col-span-2 text-sm text-ink">
                    {paymentMethodLabel(selectedExpense.payment_method)}
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

                {/* Optional uploaded receipt or invoice. */}
                <div className="space-y-1.5 pt-2">
                  <span className="text-xs font-display font-semibold text-ink-soft flex items-center gap-1.5">
                    <Paperclip className="size-4" /> Pièce justificative
                  </span>
                  {selectedExpense.receipt_key ? (
                    <div className="border border-ink/10 rounded-lg p-3 bg-teal-100/10">
                      {!isUploadedReceiptKey(selectedExpense.receipt_key) ? (
                        // A paper reference, not a file. Linking it produces a
                        // URL that resolves and 404s, so show the reference.
                        <p className="text-sm text-ink">
                          Référence papier :{" "}
                          <span className="font-display font-semibold">{selectedExpense.receipt_key}</span>
                        </p>
                      ) : publicUrl(selectedExpense.receipt_key) ? (
                        <a href={publicUrl(selectedExpense.receipt_key)!} target="_blank" rel="noreferrer" className="text-sm font-display font-semibold text-teal-950 underline underline-offset-2">
                          Ouvrir la pièce jointe
                        </a>
                      ) : <p className="text-xs text-ink-soft">Pièce jointe enregistrée, mais indisponible dans cette configuration.</p>}
                    </div>
                  ) : (
                    <div className="border border-dashed border-ink/20 rounded-lg p-4 text-center bg-teal-100/10">
                      <p className="text-xs font-medium text-ink-soft">
                        Aucune pièce jointe
                      </p>
                    </div>
                  )}
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
                      Historique des Dépenses ({catSheetLoading ? "…" : catSheetTotal})
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

                  {catSheetTotal > 200 && (
                    <p className="text-2xs text-ink-soft/70 -mt-1">
                      Aperçu des 200 plus récentes.
                    </p>
                  )}

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
                            <span>{formatDay(e.spent_at)}</span>
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

    {/* ----------------- PRINT-ONLY REPORT -----------------
        Invisible on screen (`hidden print:block`); this is what actually
        prints. The interactive page above is `print:hidden`, and the app
        shell hides its own sidebar/header the same way — see AppShell.
        Colours are hardcoded black-on-white rather than the `text-ink` /
        `border-ink` theme tokens: those flip to near-white text in dark mode
        (`--color-ink` is `#e2e8f0` there), which would print as invisible
        text on white paper if generated while the app happened to be in
        dark mode. A report has no theme — it's always paper-colored. */}
    <div className="hidden print:block p-6" style={{ color: "#000", background: "#fff" }}>
      <h1 className="font-display text-lg font-bold">Rapport des dépenses — Wagnon</h1>
      <p className="text-xs mt-1" style={{ color: "#475569" }}>
        {printFilterDescription} · Généré le {formatDay(new Date().toISOString())}
      </p>

      <table className="w-full mt-4 text-xs border-collapse">
        <thead>
          <tr className="text-left" style={{ borderBottom: "1px solid #94a3b8" }}>
            <th className="py-1 pr-2 font-semibold">Date</th>
            <th className="py-1 pr-2 font-semibold">Catégorie</th>
            <th className="py-1 pr-2 font-semibold">Motif</th>
            <th className="py-1 pr-2 font-semibold text-right">Montant</th>
          </tr>
        </thead>
        <tbody>
          {(printRows ?? []).map((r, i) => (
            <tr key={i} className="break-inside-avoid" style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td className="py-1 pr-2 whitespace-nowrap">{formatDay(r.spent_at)}</td>
              <td className="py-1 pr-2">{r.category_name}</td>
              <td className="py-1 pr-2">{r.description}</td>
              <td className="py-1 pr-2 text-right whitespace-nowrap">{formatMoney(r.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-display font-semibold" style={{ borderTop: "2px solid #475569" }}>
            <td colSpan={3} className="py-1.5 pr-2">
              {(printRows ?? []).length} dépense{(printRows ?? []).length > 1 ? "s" : ""}
            </td>
            <td className="py-1.5 pr-2 text-right">{formatMoney(printTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    </>
  )
}
