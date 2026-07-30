import { useEffect, useMemo, useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { focusFirstInvalidField } from "@/lib/formFocus"
import {
  investorFormSchema,
  investorCreateFormSchema,
  contributionFormSchema,
  CONTRIBUTION_METHODS,
  NO_LINKED_ACCOUNT,
  type InvestorFormValues,
  type InvestorCreateFormValues,
  type ContributionFormValues,
} from "./investorFormSchemas"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format, startOfToday } from "date-fns"
import { fr } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { StatCard } from "@/components/StatCard"
import { useNavigate, useParams, useLocation } from "react-router-dom"
import { useAuth, canManageFinance } from "@/lib/auth"
import { useSetPageTitle } from "@/lib/pageTitle"
import { TablePager } from "@/components/TablePager"
import { usePagedRows } from "@/lib/usePagedRows"
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
import { Badge } from "@/components/ui/badge"
import { formatMoney } from "@/lib/utils"
import { listAdminUsers, type ApiUser } from "@/lib/adminUsers"
import {
  addInvestor,
  updateInvestor,
  getInvestorStandings,
  listContributions,
  addContribution,
  type InvestorStanding,
  type Contribution,
} from "@/lib/queries"
import { toast } from "sonner"
import {
  UserPlus,
  Pencil,
  X,
  Link as LinkIcon,
  Users,
  Wallet,
  Coins,
  Scale,
  Eye,
  ArrowLeft,
  Calendar as CalendarIcon,
  Phone,
  Search,
  PlusCircle,
} from "lucide-react"

function formatAmountInput(val: string): string {
  const digits = val.replace(/\D/g, "")
  if (!digits) return ""
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
}

type LinkableUser = ApiUser

interface InvestorsPageProps {
  onChange?: () => void
  dbReady?: boolean
}

export function InvestorsPage({
  onChange,
  dbReady = true,
}: InvestorsPageProps) {
  const { user } = useAuth()
  const canManage = canManageFinance(user)
  const [standings, setStandings] = useState<InvestorStanding[]>([])
  const [users, setUsers] = useState<LinkableUser[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)

  // Detail view state
  const [searchQuery, setSearchQuery] = useState("")
  const [paymentFilter, setPaymentFilter] = useState<"all" | "paid" | "owing">("all")
  // The URL owns which record is open. `standings` is the list this page
  // already loads, so the detail view is a lookup rather than a second fetch —
  // and a deep link works because the lookup happens after that load resolves.
  const { id: routeInvestorId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isEditRoute = location.pathname.endsWith("/edit")
  const selectedInvestor = routeInvestorId
    ? (standings.find((s) => s.id === routeInvestorId) ?? null)
    : null
  useSetPageTitle(
    selectedInvestor ? (isEditRoute ? `Modifier — ${selectedInvestor.name}` : `Fiche — ${selectedInvestor.name}`) : null
  )
  const [investorContribs, setInvestorContribs] = useState<Contribution[]>([])

  // Create form state — react-hook-form + zod (investorFormSchemas.ts),
  // same pattern as UsersPage/ExpensesPage. Uses investorCreateFormSchema
  // (adds membershipFee) rather than the shared investorFormSchema editForm
  // uses — see the comment on that schema for why it's create-only.
  const createForm = useForm<InvestorCreateFormValues>({
    resolver: zodResolver(investorCreateFormSchema),
    mode: "onTouched",
    defaultValues: { name: "", phone: "", contribution: "", membershipFee: "", userId: NO_LINKED_ACCOUNT },
  })

  // "Nouveau versement" dialog state — records a payment against the
  // currently open investor's reliquat (cotisation) or a corrective/
  // historical adhésion entry.
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const paymentForm = useForm<ContributionFormValues>({
    resolver: zodResolver(contributionFormSchema),
    mode: "onTouched",
    defaultValues: { type: "cotisation", amount: "", paidAt: startOfToday(), method: "", note: "" },
  })

  // Edit form state — a dedicated page at /investors/:id/edit, not inline
  // in the table. The URL itself is the source of truth for "editing or
  // not," so there's no separate editingId: submit/cancel both just
  // navigate away from the edit route.
  const editForm = useForm<InvestorFormValues>({
    resolver: zodResolver(investorFormSchema),
    mode: "onTouched",
    defaultValues: { name: "", phone: "", contribution: "", userId: NO_LINKED_ACCOUNT },
  })

  async function refresh() {
    if (!dbReady) return
    try {
      setStandings(await getInvestorStandings())
    } catch (e) {
      console.error("Failed to load investor standings:", e)
      toast.error("Impossible de charger les positions des investisseurs.")
    }
  }

  async function loadUsers() {
    try {
      const res = await listAdminUsers()
      setUsers(res.data.users)
    } catch (err) {
      console.error("Failed to fetch users to link:", err)
    }
  }

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      // admin-users (the source for loadUsers) is admin/super_admin/treasurer
      // only — investors reaching this page read-only would just 403 on
      // every load for a list they can't act on anyway.
      await Promise.all([refresh(), canManage ? loadUsers() : Promise.resolve()])
      setLoading(false)
    }
    if (dbReady) {
      loadData()
    }
  }, [dbReady, canManage])

  // Fetch contributions for selected investor when detail page is opened
  useEffect(() => {
    async function fetchContribs() {
      if (!selectedInvestor) return
      try {
        const all = await listContributions()
        setInvestorContribs(all.filter((c) => c.investor_id === selectedInvestor.id))
      } catch (err) {
        console.error("Failed to load investor contributions:", err)
      }
    }
    fetchContribs()
  }, [selectedInvestor])

  // Populate the edit form once the investor being edited resolves from
  // `standings` (same load-order dependency as the contributions fetch
  // above — the route param is available immediately, but the record it
  // points to arrives asynchronously).
  useEffect(() => {
    if (!isEditRoute || !selectedInvestor) return
    editForm.reset({
      name: selectedInvestor.name,
      phone: selectedInvestor.phone || "",
      contribution: String(selectedInvestor.agreed_contribution),
      userId: selectedInvestor.user_id || NO_LINKED_ACCOUNT,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditRoute, selectedInvestor?.id])

  // A read-only investor account could reach /investors/:id/edit directly
  // by URL even though the trigger buttons are already canManage-gated.
  useEffect(() => {
    if (isEditRoute && selectedInvestor && !canManage) {
      navigate(`/investors/${selectedInvestor.id}`, { replace: true })
    }
  }, [isEditRoute, selectedInvestor, canManage, navigate])

  // ---------------------------------------------------------------------------
  // Create Investor
  // ---------------------------------------------------------------------------

  const CREATE_FIELD_ORDER: (keyof InvestorCreateFormValues)[] = [
    "name",
    "phone",
    "contribution",
    "membershipFee",
    "userId",
  ]

  const submitCreate = createForm.handleSubmit(
    async (values) => {
      const amount = Number(values.contribution.replace(/\D/g, ""))
      const membershipFee = Number(values.membershipFee.replace(/\D/g, ""))
      try {
        await addInvestor({
          name: values.name.trim(),
          phone: values.phone?.trim() || null,
          agreedContribution: amount,
          membershipFee,
          userId: values.userId === NO_LINKED_ACCOUNT ? null : values.userId,
        })

        toast.success("Investisseur enregistré avec succès.")
        createForm.reset()
        setShowForm(false)

        await refresh()
        if (onChange) onChange()
      } catch (err) {
        toast.error("Erreur lors de la création de l'investisseur.")
        console.error(err)
      }
    },
    (errors) => focusFirstInvalidField(errors, CREATE_FIELD_ORDER, createForm.setFocus)
  )

  // ---------------------------------------------------------------------------
  // Edit Investor — dedicated page at /investors/:id/edit
  // ---------------------------------------------------------------------------

  const EDIT_FIELD_ORDER: (keyof InvestorFormValues)[] = ["name", "phone", "contribution", "userId"]

  const submitEdit = editForm.handleSubmit(
    async (values) => {
      if (!selectedInvestor) return
      const amount = Number(values.contribution.replace(/\D/g, ""))
      try {
        await updateInvestor(selectedInvestor.id, {
          name: values.name.trim(),
          phone: values.phone?.trim() || null,
          agreedContribution: amount,
          userId: values.userId === NO_LINKED_ACCOUNT ? null : values.userId,
        })

        toast.success("Investisseur mis à jour avec succès.")
        await refresh()
        if (onChange) onChange()
        navigate(`/investors/${selectedInvestor.id}`)
      } catch (err) {
        toast.error("Erreur lors de la mise à jour.")
        console.error(err)
      }
    },
    (errors) => focusFirstInvalidField(errors, EDIT_FIELD_ORDER, editForm.setFocus)
  )

  // ---------------------------------------------------------------------------
  // Record a payment (Nouveau versement) against the open investor
  // ---------------------------------------------------------------------------

  const PAYMENT_FIELD_ORDER: (keyof ContributionFormValues)[] = ["type", "amount", "paidAt", "method", "note"]

  const submitPayment = paymentForm.handleSubmit(
    async (values) => {
      if (!selectedInvestor) return
      const amount = Number(values.amount.replace(/\D/g, ""))
      try {
        await addContribution({
          investorId: selectedInvestor.id,
          type: values.type,
          amount,
          paidAt: values.paidAt.toISOString(),
          method: values.method || null,
          note: values.note?.trim() || null,
        })

        toast.success("Versement enregistré avec succès.")
        setPaymentDialogOpen(false)
        await refresh()
        const all = await listContributions()
        setInvestorContribs(all.filter((c) => c.investor_id === selectedInvestor.id))
        if (onChange) onChange()
      } catch (err) {
        toast.error("Erreur lors de l'enregistrement du versement.")
        console.error(err)
      }
    },
    (errors) => focusFirstInvalidField(errors, PAYMENT_FIELD_ORDER, paymentForm.setFocus)
  )

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function getLinkedAccountText(standing: InvestorStanding): string {
    if (!standing.user_id) return "Pas d'accès"
    if (standing.user?.name || standing.user?.email) {
      return standing.user.email
        ? `${standing.user.name || "Utilisateur"} (${standing.user.email})`
        : standing.user.name || "Utilisateur lié"
    }
    const matched = users.find((u) => u.id === standing.user_id)
    return matched ? `${matched.name} (${matched.email})` : "Utilisateur lié"
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  const totalInvestors = standings.length
  const totalAgreed = standings.reduce((acc, curr) => acc + curr.agreed_contribution, 0)
  const totalPaid = standings.reduce((acc, curr) => acc + curr.paid, 0)
  const totalOwed = standings.reduce((acc, curr) => acc + curr.owed, 0)
  const unpaidCount = standings.filter((s) => s.owed > 0).length

  // 15 investors — filtered and paged in memory. Going to the server for a
  // page of ten out of fifteen would cost a round trip and gain nothing.
  const filteredStandings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return standings.filter((s) => {
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.phone || "").toLowerCase().includes(q)
      const matchesPayment =
        paymentFilter === "all" ||
        (paymentFilter === "paid" && s.owed <= 0) ||
        (paymentFilter === "owing" && s.owed > 0)
      return matchesSearch && matchesPayment
    })
  }, [standings, searchQuery, paymentFilter])

  const investorPaging = usePagedRows(filteredStandings)

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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="h-24 bg-ink/10 rounded-md" />
          <div className="h-24 bg-ink/10 rounded-md" />
          <div className="h-24 bg-ink/10 rounded-md" />
          <div className="h-24 bg-ink/10 rounded-md" />
        </div>
        <div className="rounded-md border border-ink/10 bg-paper p-4 space-y-4">
          <div className="h-6 bg-ink/10 rounded-sm w-full" />
          <div className="h-6 bg-ink/10 rounded-sm w-full" />
          <div className="h-6 bg-ink/10 rounded-sm w-full" />
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Investor Edit Page — /investors/:id/edit
  // ---------------------------------------------------------------------------

  if (selectedInvestor && isEditRoute) {
    // canManage is already guarded by the useEffect above (redirects a
    // read-only account away); this just avoids a one-frame flash of the
    // form before that redirect fires.
    if (!canManage) return null
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
        <Button
          variant="ghost"
          onClick={() => navigate(`/investors/${selectedInvestor.id}`)}
          className="w-fit flex items-center gap-2 text-xs font-display text-ink-soft hover:text-ink -ml-2"
        >
          <ArrowLeft className="size-4" />
          Retour à la fiche
        </Button>

        <Card className="border border-ink/10 bg-paper">
          <CardHeader>
            <CardTitle className="text-ink font-display font-semibold text-base">
              Modifier {selectedInvestor.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitEdit} className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ei-name" className="text-xs font-display font-medium text-ink">Nom complet *</Label>
                <Input
                  id="ei-name"
                  {...editForm.register("name")}
                  aria-invalid={!!editForm.formState.errors.name}
                  className="border-ink/15 bg-paper text-ink text-sm"
                  required
                />
                {editForm.formState.errors.name && (
                  <p className="text-xs text-negative font-medium">{editForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ei-phone" className="text-xs font-display font-medium text-ink">Téléphone (facultatif)</Label>
                <Input
                  id="ei-phone"
                  {...editForm.register("phone")}
                  placeholder="+225 05 00 00 00 00"
                  className="border-ink/15 bg-paper text-ink text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ei-contribution" className="text-xs font-display font-medium text-ink">Contribution convenue (F CFA) *</Label>
                <Input
                  id="ei-contribution"
                  {...editForm.register("contribution")}
                  aria-invalid={!!editForm.formState.errors.contribution}
                  className="border-ink/15 bg-paper text-ink text-sm"
                  required
                />
                {editForm.formState.errors.contribution && (
                  <p className="text-xs text-negative font-medium">{editForm.formState.errors.contribution.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ei-user" className="text-xs font-display font-medium text-ink">Lier à un compte utilisateur (facultatif)</Label>
                <Controller
                  control={editForm.control}
                  name="userId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="ei-user" ref={field.ref} className="h-10 w-full border-ink/15 bg-paper text-ink text-sm">
                        <SelectValue placeholder="Choisir un compte" />
                      </SelectTrigger>
                      <SelectContent className="bg-paper border-ink/10">
                        <SelectItem value={NO_LINKED_ACCOUNT}>Aucun compte (Pas d'accès de connexion)</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name} ({u.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2 mt-2 sm:flex-row">
                <Button type="submit" disabled={editForm.formState.isSubmitting} className="flex-1 font-display">
                  {editForm.formState.isSubmitting ? "Enregistrement…" : "Enregistrer les modifications"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(`/investors/${selectedInvestor.id}`)}
                  className="flex-1 font-display sm:flex-none"
                >
                  Annuler
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Investor Details View Page
  // ---------------------------------------------------------------------------

  if (selectedInvestor) {
    const isFullyPaid = selectedInvestor.owed <= 0
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
        {/* Back navigation & Actions Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate("/investors")}
            className="w-fit flex items-center gap-2 text-xs font-display text-ink-soft hover:text-ink -ml-2"
          >
            <ArrowLeft className="size-4" />
            Retour aux investisseurs
          </Button>
          {canManage && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/investors/${selectedInvestor.id}/edit`)}
                className="text-xs font-display flex items-center gap-1.5"
              >
                <Pencil className="size-3.5" />
                Modifier l'investisseur
              </Button>
            </div>
          )}
        </div>

        {/* Profile Card Header */}
        <Card className="border border-ink/10 bg-paper p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-teal-100 font-display text-xl font-bold text-teal-950 shrink-0">
                {selectedInvestor.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-xl font-bold text-ink">{selectedInvestor.name}</h1>
                  <Badge variant={isFullyPaid ? "positive" : "negative"}>
                    {isFullyPaid ? "Libéré" : `Reste: ${formatMoney(selectedInvestor.owed)}`}
                  </Badge>
                </div>
                <div className="text-xs text-ink-soft flex items-center gap-3 flex-wrap">
                  {selectedInvestor.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="size-3" />
                      {selectedInvestor.phone}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="size-3" />
                    Inscrit le {new Date(selectedInvestor.joined_at).toLocaleDateString("fr-FR")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Financial KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-6">
          <Card className="border border-ink/10 bg-paper p-5 flex flex-col justify-between">
            <p className="text-xs font-display font-semibold text-ink-soft uppercase tracking-wider">Capital Convenu</p>
            <h3 className="text-lg font-display font-bold text-ink mt-1">{formatMoney(selectedInvestor.agreed_contribution)}</h3>
            <p className="text-2xs text-ink-soft mt-1">Montant promis</p>
          </Card>
          <Card className="border border-ink/10 bg-paper p-5 flex flex-col justify-between">
            <p className="text-xs font-display font-semibold text-ink-soft uppercase tracking-wider">Total Libéré</p>
            <h3 className="text-lg font-display font-bold text-positive mt-1">{formatMoney(selectedInvestor.paid)}</h3>
            <p className="text-2xs text-positive font-semibold mt-1">Contributions reçues</p>
          </Card>
          <Card className="border border-ink/10 bg-paper p-5 flex flex-col justify-between">
            <p className="text-xs font-display font-semibold text-ink-soft uppercase tracking-wider">Reste à Libérer</p>
            <h3 className="text-lg font-display font-bold text-negative mt-1">{formatMoney(selectedInvestor.owed)}</h3>
            <p className="text-2xs text-terracotta-600 font-semibold mt-1">Solde dû</p>
          </Card>
          <Card className="border border-ink/10 bg-paper p-5 flex flex-col justify-between">
            <p className="text-xs font-display font-semibold text-ink-soft uppercase tracking-wider">Part du Capital</p>
            <h3 className="text-lg font-display font-bold text-ink mt-1 font-mono">{selectedInvestor.ownership_pct.toFixed(1)}%</h3>
            <p className="text-2xs text-ink-soft mt-1">Part de l'enveloppe</p>
          </Card>
        </div>

        {/* Detailed Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border border-ink/10 bg-paper p-6 space-y-4">
            <h3 className="font-display font-semibold text-sm text-ink border-b border-ink/10 pb-2">Informations Générales</h3>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-ink/5">
                <span className="text-ink-soft">Nom complet</span>
                <span className="font-semibold text-ink">{selectedInvestor.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-ink/5">
                <span className="text-ink-soft">Téléphone</span>
                <span className="font-semibold text-ink">{selectedInvestor.phone || "Non renseigné"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-ink/5">
                <span className="text-ink-soft">Date d'inscription</span>
                <span className="font-semibold text-ink">{new Date(selectedInvestor.joined_at).toLocaleDateString("fr-FR")}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-ink-soft">Identifiant système</span>
                <span className="font-mono text-2xs text-ink-soft">{selectedInvestor.id}</span>
              </div>
            </div>
          </Card>

          <Card className="border border-ink/10 bg-paper p-6 space-y-4">
            <h3 className="font-display font-semibold text-sm text-ink border-b border-ink/10 pb-2">Compte Utilisateur Lié</h3>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-ink/5">
                <span className="text-ink-soft">Accès système</span>
                <span>
                  {selectedInvestor.user_id ? (
                    <Badge variant="positive">Accès configuré</Badge>
                  ) : (
                    <Badge variant="neutral">Pas d'accès</Badge>
                  )}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-ink/5">
                <span className="text-ink-soft">Compte associé</span>
                <span className="font-semibold text-ink flex items-center gap-1.5">
                  {selectedInvestor.user_id && <LinkIcon className="size-3.5 text-ink-soft/60" />}
                  {getLinkedAccountText(selectedInvestor)}
                </span>
              </div>
              {selectedInvestor.user?.email && (
                <div className="flex justify-between py-1 border-b border-ink/5">
                  <span className="text-ink-soft">Adresse E-mail</span>
                  <span className="font-mono text-ink">{selectedInvestor.user.email}</span>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Contributions History Table */}
        <Card className="border border-ink/10 bg-paper p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-sm text-ink">
              Historique des versements ({investorContribs.length})
            </h3>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  paymentForm.reset({ type: "cotisation", amount: "", paidAt: startOfToday(), method: "", note: "" })
                  setPaymentDialogOpen(true)
                }}
                className="text-xs font-display flex items-center gap-1.5"
              >
                <PlusCircle className="size-3.5" />
                Nouveau versement
              </Button>
            )}
          </div>

          <div className="rounded-md border border-ink/10 bg-paper overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-ink/10">
                    <TableHead className="text-xs font-display font-semibold text-ink-soft">Date</TableHead>
                    <TableHead className="text-xs font-display font-semibold text-ink-soft">Type</TableHead>
                    <TableHead className="text-xs font-display font-semibold text-ink-soft text-right">Montant</TableHead>
                    <TableHead className="text-xs font-display font-semibold text-ink-soft">Mode de paiement</TableHead>
                    <TableHead className="text-xs font-display font-semibold text-ink-soft">Note / Libellé</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investorContribs.map((c) => (
                    <TableRow key={c.id} className="border-b border-ink/10 last:border-0 hover:bg-teal-100/30">
                      <TableCell className="text-xs text-ink whitespace-nowrap">
                        {new Date(c.paid_at).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant={c.type === "adhesion" ? "neutral" : "positive"}>
                          {c.type === "adhesion" ? "Adhésion" : "Cotisation"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-display font-bold text-positive text-right whitespace-nowrap">
                        +{formatMoney(c.amount)}
                      </TableCell>
                      <TableCell className="text-xs text-ink-soft capitalize">{c.method || "Virement"}</TableCell>
                      <TableCell className="text-xs text-ink-soft">{c.note || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {investorContribs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center h-20 text-xs text-ink-soft italic">
                        Aucun versement enregistré pour cet investisseur.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </Card>

        {/* max-h + overflow-y-auto: DialogContent is `fixed` with no height
            cap of its own — see the same note on ExpensesPage's create
            dialog, same gotcha applies here. */}
        <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
          <DialogContent
            showCloseButton={false}
            className="max-h-[90svh] overscroll-contain overflow-x-hidden overflow-y-auto border border-ink/10 bg-paper p-6 sm:max-w-md sm:p-7"
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DialogHeader className="flex-row items-start justify-between gap-3 space-y-0 text-left">
              <div className="flex min-w-0 flex-col gap-1">
                <DialogTitle className="flex items-center gap-2 text-lg font-display font-bold text-ink">
                  <PlusCircle className="size-5 text-teal-950" />
                  Nouveau versement
                </DialogTitle>
                <DialogDescription className="text-xs text-ink-soft">
                  Enregistrer un paiement reçu de {selectedInvestor.name}
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Fermer"
                  title="Fermer"
                  disabled={paymentForm.formState.isSubmitting}
                  className="-mr-3 -mt-3 max-md:size-11 md:-mr-2 md:-mt-2"
                >
                  <X aria-hidden="true" />
                </Button>
              </DialogClose>
            </DialogHeader>

            <form onSubmit={submitPayment} className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="payment-type" className="text-xs font-display font-medium text-ink">Type de versement</Label>
                <Controller
                  control={paymentForm.control}
                  name="type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="payment-type" ref={field.ref} className="w-full bg-paper border-ink/15 text-sm text-ink max-md:!h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-paper border-ink/10">
                        <SelectItem value="cotisation">Cotisation</SelectItem>
                        <SelectItem value="adhesion">Adhésion</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="payment-amount" className="text-xs font-display font-medium text-ink">Montant (F CFA)</Label>
                  <div className="relative">
                    <Input
                      id="payment-amount"
                      inputMode="numeric"
                      placeholder="500 000"
                      className="pr-12 text-sm font-semibold border-ink/15 bg-paper text-ink max-md:h-11"
                      {...paymentForm.register("amount", {
                        onChange: (e) => {
                          e.target.value = formatAmountInput(e.target.value)
                        },
                      })}
                      aria-invalid={!!paymentForm.formState.errors.amount}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-soft pointer-events-none">
                      F CFA
                    </span>
                  </div>
                  {paymentForm.formState.errors.amount && (
                    <p className="text-xs text-negative font-medium">{paymentForm.formState.errors.amount.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="payment-paidAt" className="text-xs font-display font-medium text-ink">Date du versement</Label>
                  <Controller
                    control={paymentForm.control}
                    name="paidAt"
                    render={({ field }) => (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            id="payment-paidAt"
                            ref={field.ref}
                            type="button"
                            variant="outline"
                            className={cn(
                              "h-10 w-full justify-start text-left text-xs font-normal bg-paper border-ink/15 text-ink max-md:h-11",
                              !field.value && "text-ink-soft"
                            )}
                          >
                            <CalendarIcon className="mr-2 size-4 text-ink-soft" />
                            {field.value ? format(field.value, "PPP", { locale: fr }) : <span>Choisir une date…</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-paper border-ink/10" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            locale={fr}
                            disabled={{ after: startOfToday() }}
                          />
                        </PopoverContent>
                      </Popover>
                    )}
                  />
                  {paymentForm.formState.errors.paidAt && (
                    <p className="text-xs text-negative font-medium">{paymentForm.formState.errors.paidAt.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payment-method" className="text-xs font-display font-medium text-ink">Mode de paiement (facultatif)</Label>
                <Controller
                  control={paymentForm.control}
                  name="method"
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger id="payment-method" ref={field.ref} className="w-full bg-paper border-ink/15 text-sm text-ink max-md:!h-11">
                        <SelectValue placeholder="Non précisé" />
                      </SelectTrigger>
                      <SelectContent className="bg-paper border-ink/10">
                        {CONTRIBUTION_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payment-note" className="text-xs font-display font-medium text-ink">Note (facultatif)</Label>
                <Input
                  id="payment-note"
                  {...paymentForm.register("note")}
                  placeholder="ex. Versement de la 3e tranche"
                  className="text-xs border-ink/15 bg-paper text-ink max-md:h-11"
                />
              </div>

              <DialogFooter className="pt-3 border-t border-ink/10 gap-2 sm:gap-0">
                <Button type="submit" disabled={paymentForm.formState.isSubmitting} className="max-md:h-11">
                  {paymentForm.formState.isSubmitting ? "Enregistrement…" : "Enregistrer le versement"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Main List View Page
  // ---------------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            Investisseurs &amp; Capitaux
          </h1>
          <p className="text-sm text-ink-soft">
            {totalInvestors} {totalInvestors > 1 ? "associés" : "associé"} · total convenu: {formatMoney(totalAgreed)}
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => setShowForm((s) => !s)}
            className="h-10 px-4 text-xs font-semibold shadow-2xs max-md:h-11"
          >
            <UserPlus data-icon="inline-start" aria-hidden="true" />
            {showForm ? "Annuler" : "Nouvel investisseur"}
          </Button>
        )}
      </header>

      {/* Create form */}
      {canManage && showForm && (
        <Card className="border border-ink/10 bg-paper">
          <CardHeader>
            <CardTitle className="text-ink font-display font-semibold text-base">Enregistrer un investisseur</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitCreate} className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ci-name" className="text-xs font-display font-medium text-ink">Nom complet *</Label>
                <Input
                  id="ci-name"
                  {...createForm.register("name")}
                  placeholder="Ex. Konan Blaise"
                  aria-invalid={!!createForm.formState.errors.name}
                  className="border-ink/15 bg-paper text-ink text-sm"
                  required
                />
                {createForm.formState.errors.name && (
                  <p className="text-xs text-negative font-medium">{createForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ci-phone" className="text-xs font-display font-medium text-ink">Téléphone (facultatif)</Label>
                <Input
                  id="ci-phone"
                  {...createForm.register("phone")}
                  placeholder="+225 05 00 00 00 00"
                  className="border-ink/15 bg-paper text-ink text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ci-contribution" className="text-xs font-display font-medium text-ink">Contribution convenue (F CFA) *</Label>
                <Input
                  id="ci-contribution"
                  {...createForm.register("contribution")}
                  placeholder="2 500 000"
                  aria-invalid={!!createForm.formState.errors.contribution}
                  className="border-ink/15 bg-paper text-ink text-sm"
                  required
                />
                {createForm.formState.errors.contribution && (
                  <p className="text-xs text-negative font-medium">{createForm.formState.errors.contribution.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ci-membership-fee" className="text-xs font-display font-medium text-ink">Droit d'adhésion (F CFA) *</Label>
                <Input
                  id="ci-membership-fee"
                  {...createForm.register("membershipFee")}
                  placeholder="100 000"
                  aria-invalid={!!createForm.formState.errors.membershipFee}
                  className="border-ink/15 bg-paper text-ink text-sm"
                  required
                />
                {createForm.formState.errors.membershipFee && (
                  <p className="text-xs text-negative font-medium">{createForm.formState.errors.membershipFee.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ci-user" className="text-xs font-display font-medium text-ink">Lier à un compte utilisateur (facultatif)</Label>
                <Controller
                  control={createForm.control}
                  name="userId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="ci-user" ref={field.ref} className="h-10 w-full border-ink/15 bg-paper text-ink text-sm">
                        <SelectValue placeholder="Choisir un compte" />
                      </SelectTrigger>
                      <SelectContent className="bg-paper border-ink/10">
                        <SelectItem value={NO_LINKED_ACCOUNT}>Aucun compte (Pas d'accès de connexion)</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name} ({u.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2 mt-2">
                <Button type="submit" disabled={createForm.formState.isSubmitting} className="w-full font-display">
                  {createForm.formState.isSubmitting ? "Enregistrement…" : "Enregistrer la fiche financière"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Financial stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-6">
        <StatCard
          label="Investisseurs"
          value={totalInvestors}
          icon={Users}
          iconClassName="bg-teal-100 text-teal-950"
          footer={`${totalInvestors} ${totalInvestors > 1 ? "associés inscrits" : "associé inscrit"}`}
        />
        <StatCard
          label="Capital Convenu"
          value={formatMoney(totalAgreed)}
          icon={Wallet}
          iconClassName="bg-teal-100/60 text-teal-950"
          footer="Engagement global"
        />
        <StatCard
          label="Total Investi"
          value={formatMoney(totalPaid)}
          valueClassName="text-positive"
          icon={Coins}
          iconClassName="bg-positive-bg text-positive"
          footer={
            <span className="text-positive">
              {totalAgreed > 0 ? Math.round((totalPaid / totalAgreed) * 100) : 0}% du capital convenu
            </span>
          }
        />
        <StatCard
          label="Reste à Libérer"
          value={formatMoney(totalOwed)}
          valueClassName="text-negative"
          icon={Scale}
          iconClassName="bg-terracotta-100 text-terracotta-600"
          footer={
            <span className="text-terracotta-600">
              {unpaidCount > 0 ? `${unpaidCount} ${unpaidCount > 1 ? "associés en attente" : "associé en attente"}` : "Aucun solde dû"}
            </span>
          }
        />
      </div>

      {/* Investors List table */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-soft" />
          <Input
            placeholder="Rechercher un associé (nom, téléphone)…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={paymentFilter} onValueChange={(v) => setPaymentFilter(v as typeof paymentFilter)}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="paid">Entièrement libéré</SelectItem>
            <SelectItem value="owing">Solde restant dû</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-ink/10 bg-paper overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-ink/10">
                <TableHead className="text-xs font-display font-semibold text-ink-soft">Nom</TableHead>
                <TableHead className="text-xs font-display font-semibold text-ink-soft hidden sm:table-cell">Téléphone</TableHead>
                <TableHead className="text-xs font-display font-semibold text-ink-soft text-right">Convenu</TableHead>
                <TableHead className="text-xs font-display font-semibold text-ink-soft text-right hidden sm:table-cell">Libéré</TableHead>
                <TableHead className="text-xs font-display font-semibold text-ink-soft text-right">Restant</TableHead>
                <TableHead className="text-xs font-display font-semibold text-ink-soft text-right hidden md:table-cell">Parts</TableHead>
                <TableHead className="text-xs font-display font-semibold text-ink-soft text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {investorPaging.pageRows.map((s) => {
                return (
                  <TableRow key={s.id} className="border-b border-ink/10 last:border-0 hover:bg-teal-100/30">
                    {/* Name */}
                    <TableCell className="text-xs font-display font-semibold text-ink">
                      <button
                        onClick={() => navigate(`/investors/${s.id}`)}
                        className="font-display font-semibold text-ink hover:text-teal-950 hover:underline text-left whitespace-nowrap"
                      >
                        {s.name}
                      </button>
                    </TableCell>

                    {/* Phone */}
                    <TableCell className="hidden sm:table-cell text-xs text-ink-soft">
                      <span className="text-ink-soft text-xs">{s.phone || "—"}</span>
                    </TableCell>

                    {/* Agreed Contribution */}
                    <TableCell className="text-right text-xs">
                      <span className="text-ink text-xs font-display font-bold">{formatMoney(s.agreed_contribution)}</span>
                    </TableCell>

                    {/* Paid */}
                    <TableCell className="text-right text-xs hidden sm:table-cell whitespace-nowrap">
                      <span className="text-positive text-xs font-display font-bold">{formatMoney(s.paid)}</span>
                    </TableCell>

                    {/* Owed */}
                    <TableCell className="text-right text-xs whitespace-nowrap">
                      {s.owed > 0 ? (
                        <span className="text-negative font-display font-bold text-xs">{formatMoney(s.owed)}</span>
                      ) : (
                        <Badge variant="positive">Libéré</Badge>
                      )}
                    </TableCell>

                    {/* Ownership Pct */}
                    <TableCell className="text-right text-ink-soft text-xs hidden md:table-cell whitespace-nowrap font-mono font-medium">
                      {s.ownership_pct.toFixed(1)}%
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-ink-soft hover:text-teal-950 hover:bg-teal-100/50"
                          onClick={() => navigate(`/investors/${s.id}`)}
                          title="Voir la fiche détaillée"
                        >
                          <Eye className="size-4" />
                        </Button>
                        {canManage && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-ink-soft hover:text-teal-950 hover:bg-teal-100/50"
                            onClick={() => navigate(`/investors/${s.id}/edit`)}
                            title="Modifier"
                          >
                            <Pencil className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}

              {standings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-24 text-ink-soft">
                    <p className="text-sm font-display font-semibold text-ink">Aucun investisseur enregistré.</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="px-4 pb-3">
          <TablePager
            page={investorPaging.page}
            pageSize={investorPaging.pageSize}
            total={investorPaging.total}
            onPageChange={investorPaging.setPage}
            itemLabel="associés"
          />
        </div>
      </div>
    </div>
  )
}
