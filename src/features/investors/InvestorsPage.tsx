import React, { useEffect, useState } from "react"
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
import { Badge } from "@/components/ui/badge"
import { formatMoney } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { api } from "@/lib/api"
import {
  addInvestor,
  updateInvestor,
  getInvestorStandings,
  listContributions,
  type InvestorStanding,
  type Contribution,
} from "@/db/queries"
import { toast } from "sonner"
import {
  UserPlus,
  Pencil,
  X,
  Check,
  Link as LinkIcon,
  Users,
  Wallet,
  Coins,
  Scale,
  Eye,
  ArrowLeft,
  Calendar,
  Phone,
} from "lucide-react"

interface LinkableUser {
  id: string
  name: string
  email: string
  roleId: string
  isActive: boolean
}

interface InvestorsPageProps {
  onChange?: () => void
  dbReady: boolean
  onBreadcrumbChange?: (items: string[]) => void
  backTrigger?: number
}

export function InvestorsPage({
  onChange,
  dbReady,
  onBreadcrumbChange,
  backTrigger,
}: InvestorsPageProps) {
  const { user: me } = useAuth()
  const [standings, setStandings] = useState<InvestorStanding[]>([])
  const [users, setUsers] = useState<LinkableUser[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)

  // Detail view state
  const [selectedInvestor, setSelectedInvestor] = useState<InvestorStanding | null>(null)
  const [investorContribs, setInvestorContribs] = useState<Contribution[]>([])

  // Create form state
  const [createName, setCreateName] = useState("")
  const [createPhone, setCreatePhone] = useState("")
  const [createContribution, setCreateContribution] = useState("")
  const [createUserId, setCreateUserId] = useState<string>("none")
  const [createSubmitting, setCreateSubmitting] = useState(false)

  // Edit form state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editContribution, setEditContribution] = useState("")
  const [editUserId, setEditUserId] = useState<string>("none")
  const [editSubmitting, setEditSubmitting] = useState(false)

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
      const data = await api.get<{ data: { users: LinkableUser[] } }>("/users")
      setUsers(data.data.users)
    } catch (err) {
      console.error("Failed to fetch users to link:", err)
    }
  }

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      await Promise.all([refresh(), loadUsers()])
      setLoading(false)
    }
    if (dbReady) {
      loadData()
    }
  }, [dbReady])

  // Handle breadcrumb navigation & back button triggers
  useEffect(() => {
    if (backTrigger && backTrigger > 0) {
      setSelectedInvestor(null)
    }
  }, [backTrigger])

  useEffect(() => {
    if (selectedInvestor) {
      onBreadcrumbChange?.([`Fiche — ${selectedInvestor.name}`])
    } else {
      onBreadcrumbChange?.([])
    }
  }, [selectedInvestor, onBreadcrumbChange])

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

  // ---------------------------------------------------------------------------
  // Create Investor
  // ---------------------------------------------------------------------------

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()

    if (!createName.trim()) return toast.error("Le nom complet est requis.")
    if (!createContribution.trim()) return toast.error("La contribution convenue est requise.")

    const amount = Number(createContribution.replace(/\D/g, ""))
    if (isNaN(amount) || amount <= 0) {
      return toast.error("La contribution doit être un montant positif.")
    }

    setCreateSubmitting(true)
    try {
      await addInvestor({
        name: createName.trim(),
        phone: createPhone.trim() || null,
        agreedContribution: amount,
        userId: createUserId === "none" ? null : createUserId,
        addedBy: me?.id,
      })

      toast.success("Investisseur enregistré avec succès.")
      setCreateName("")
      setCreatePhone("")
      setCreateContribution("")
      setCreateUserId("none")
      setShowForm(false)

      await refresh()
      if (onChange) onChange()
    } catch (err) {
      toast.error("Erreur lors de la création de l'investisseur.")
      console.error(err)
    } finally {
      setCreateSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Edit Investor
  // ---------------------------------------------------------------------------

  function startEdit(s: InvestorStanding) {
    setEditingId(s.id)
    setEditName(s.name)
    setEditPhone(s.phone || "")
    setEditContribution(String(s.agreed_contribution))
    setEditUserId(s.user_id || "none")
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function handleEdit(id: string) {
    if (!editName.trim()) return toast.error("Le nom complet est requis.")
    if (!editContribution.trim()) return toast.error("La contribution est requise.")

    const amount = Number(editContribution.replace(/\D/g, ""))
    if (isNaN(amount) || amount <= 0) {
      return toast.error("La contribution doit être un montant positif.")
    }

    setEditSubmitting(true)
    try {
      await updateInvestor(id, {
        name: editName.trim(),
        phone: editPhone.trim() || null,
        agreedContribution: amount,
        userId: editUserId === "none" ? null : editUserId,
      })

      toast.success("Investisseur mis à jour avec succès.")
      setEditingId(null)
      await refresh()
      if (onChange) onChange()
    } catch (err) {
      toast.error("Erreur lors de la mise à jour.")
      console.error(err)
    } finally {
      setEditSubmitting(false)
    }
  }

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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
            onClick={() => setSelectedInvestor(null)}
            className="w-fit flex items-center gap-2 text-xs font-display text-ink-soft hover:text-ink -ml-2"
          >
            <ArrowLeft className="size-4" />
            Retour aux investisseurs
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                startEdit(selectedInvestor)
                setSelectedInvestor(null)
              }}
              className="text-xs font-display flex items-center gap-1.5"
            >
              <Pencil className="size-3.5" />
              Modifier l'investisseur
            </Button>
          </div>
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
                    <Calendar className="size-3" />
                    Inscrit le {new Date(selectedInvestor.joined_at).toLocaleDateString("fr-FR")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Financial KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6">
          <Card className="border border-ink/10 bg-paper p-5 flex flex-col justify-between">
            <p className="text-xs font-display font-semibold text-ink-soft uppercase tracking-wider">Capital Convenu</p>
            <h3 className="text-lg font-display font-bold text-ink mt-1">{formatMoney(selectedInvestor.agreed_contribution)}</h3>
            <p className="text-[11px] text-ink-soft mt-1">Montant promis</p>
          </Card>
          <Card className="border border-ink/10 bg-paper p-5 flex flex-col justify-between">
            <p className="text-xs font-display font-semibold text-ink-soft uppercase tracking-wider">Total Libéré</p>
            <h3 className="text-lg font-display font-bold text-positive mt-1">{formatMoney(selectedInvestor.paid)}</h3>
            <p className="text-[11px] text-positive font-semibold mt-1">Contributions reçues</p>
          </Card>
          <Card className="border border-ink/10 bg-paper p-5 flex flex-col justify-between">
            <p className="text-xs font-display font-semibold text-ink-soft uppercase tracking-wider">Reste à Libérer</p>
            <h3 className="text-lg font-display font-bold text-negative mt-1">{formatMoney(selectedInvestor.owed)}</h3>
            <p className="text-[11px] text-terracotta-600 font-semibold mt-1">Solde dû</p>
          </Card>
          <Card className="border border-ink/10 bg-paper p-5 flex flex-col justify-between">
            <p className="text-xs font-display font-semibold text-ink-soft uppercase tracking-wider">Part du Capital</p>
            <h3 className="text-lg font-display font-bold text-ink mt-1 font-mono">{selectedInvestor.ownership_pct.toFixed(1)}%</h3>
            <p className="text-[11px] text-ink-soft mt-1">Part de l'enveloppe</p>
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
                <span className="font-mono text-[11px] text-ink-soft">{selectedInvestor.id}</span>
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
          </div>

          <div className="rounded-md border border-ink/10 bg-paper overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-ink/10">
                    <TableHead className="text-xs font-display font-semibold text-ink-soft">Date</TableHead>
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
                      <TableCell className="text-xs font-display font-bold text-positive text-right whitespace-nowrap">
                        +{formatMoney(c.amount)}
                      </TableCell>
                      <TableCell className="text-xs text-ink-soft capitalize">{c.method || "Virement"}</TableCell>
                      <TableCell className="text-xs text-ink-soft">{c.note || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {investorContribs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center h-20 text-xs text-ink-soft italic">
                        Aucun versement enregistré pour cet investisseur.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </Card>
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
        <Button
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-2 rounded-full h-10 px-4 font-display text-xs font-semibold shadow-2xs"
        >
          <UserPlus className="size-4 shrink-0" />
          {showForm ? "Annuler" : "Nouvel investisseur"}
        </Button>
      </header>

      {/* Create form */}
      {showForm && (
        <Card className="border border-ink/10 bg-paper">
          <CardHeader>
            <CardTitle className="text-ink font-display font-semibold text-base">Enregistrer un investisseur</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ci-name" className="text-xs font-display font-medium text-ink">Nom complet *</Label>
                <Input
                  id="ci-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Ex. Konan Blaise"
                  className="border-ink/15 bg-paper text-ink text-sm"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ci-phone" className="text-xs font-display font-medium text-ink">Téléphone (facultatif)</Label>
                <Input
                  id="ci-phone"
                  value={createPhone}
                  onChange={(e) => setCreatePhone(e.target.value)}
                  placeholder="+225 05 00 00 00 00"
                  className="border-ink/15 bg-paper text-ink text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ci-contribution" className="text-xs font-display font-medium text-ink">Contribution convenue (XOF) *</Label>
                <Input
                  id="ci-contribution"
                  value={createContribution}
                  onChange={(e) => setCreateContribution(e.target.value)}
                  placeholder="2 500 000"
                  className="border-ink/15 bg-paper text-ink text-sm"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ci-user" className="text-xs font-display font-medium text-ink">Lier à un compte utilisateur (facultatif)</Label>
                <Select value={createUserId} onValueChange={setCreateUserId}>
                  <SelectTrigger id="ci-user" className="h-10 w-full border-ink/15 bg-paper text-ink text-sm">
                    <SelectValue placeholder="Choisir un compte" />
                  </SelectTrigger>
                  <SelectContent className="bg-paper border-ink/10">
                    <SelectItem value="none">Aucun compte (Pas d'accès de connexion)</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2 mt-2">
                <Button type="submit" disabled={createSubmitting} className="w-full font-display">
                  {createSubmitting ? "Enregistrement…" : "Enregistrer la fiche financière"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Financial stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6">
        <Card className="border border-ink/10 bg-paper p-5 flex flex-col justify-between min-h-[110px] relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-display font-semibold text-ink-soft uppercase tracking-wider">Investisseurs</p>
              <h3 className="text-lg font-display font-bold text-ink">{totalInvestors}</h3>
            </div>
            <div className="p-2 rounded-lg bg-teal-100 text-teal-950">
              <Users className="size-4" />
            </div>
          </div>
          <div className="pt-2 border-t border-ink/10 text-xs text-ink-soft font-display">
            <span>{totalInvestors} {totalInvestors > 1 ? "associés inscrits" : "associé inscrit"}</span>
          </div>
        </Card>

        <Card className="border border-ink/10 bg-paper p-5 flex flex-col justify-between min-h-[110px] relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-display font-semibold text-ink-soft uppercase tracking-wider">Capital Convenu</p>
              <h3 className="text-lg font-display font-bold text-ink">{formatMoney(totalAgreed)}</h3>
            </div>
            <div className="p-2 rounded-lg bg-teal-100/60 text-teal-950">
              <Wallet className="size-4" />
            </div>
          </div>
          <div className="pt-2 border-t border-ink/10 text-xs text-ink-soft font-display">
            <span>Engagement global</span>
          </div>
        </Card>

        <Card className="border border-ink/10 bg-paper p-5 flex flex-col justify-between min-h-[110px] relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-display font-semibold text-ink-soft uppercase tracking-wider">Total Investi</p>
              <h3 className="text-lg font-display font-bold text-positive">{formatMoney(totalPaid)}</h3>
            </div>
            <div className="p-2 rounded-lg bg-positive-bg text-positive">
              <Coins className="size-4" />
            </div>
          </div>
          <div className="pt-2 border-t border-ink/10 text-xs text-positive font-display font-semibold">
            <span>{totalAgreed > 0 ? Math.round((totalPaid / totalAgreed) * 100) : 0}% du capital convenu</span>
          </div>
        </Card>

        <Card className="border border-ink/10 bg-paper p-5 flex flex-col justify-between min-h-[110px] relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-display font-semibold text-ink-soft uppercase tracking-wider">Reste à Libérer</p>
              <h3 className="text-lg font-display font-bold text-negative">{formatMoney(totalOwed)}</h3>
            </div>
            <div className="p-2 rounded-lg bg-terracotta-100 text-terracotta-600">
              <Scale className="size-4" />
            </div>
          </div>
          <div className="pt-2 border-t border-ink/10 text-xs text-terracotta-600 font-display font-semibold">
            <span>{unpaidCount > 0 ? `${unpaidCount} ${unpaidCount > 1 ? "associés en attente" : "associé en attente"}` : "Aucun solde dû"}</span>
          </div>
        </Card>
      </div>

      {/* Investors List table */}
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
              {standings.map((s) => {
                const isEditing = editingId === s.id
                return (
                  <TableRow key={s.id} className="border-b border-ink/10 last:border-0 hover:bg-teal-100/30">
                    {/* Name */}
                    <TableCell className="text-xs font-display font-semibold text-ink">
                      {isEditing ? (
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 text-xs w-44 border-ink/15 bg-paper text-ink"
                        />
                      ) : (
                        <button
                          onClick={() => setSelectedInvestor(s)}
                          className="font-display font-semibold text-ink hover:text-teal-950 hover:underline text-left whitespace-nowrap"
                        >
                          {s.name}
                        </button>
                      )}
                    </TableCell>

                    {/* Phone */}
                    <TableCell className="hidden sm:table-cell text-xs text-ink-soft">
                      {isEditing ? (
                        <Input
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          className="h-8 text-xs w-36 border-ink/15 bg-paper text-ink"
                        />
                      ) : (
                        <span className="text-ink-soft text-xs">{s.phone || "—"}</span>
                      )}
                    </TableCell>

                    {/* Agreed Contribution */}
                    <TableCell className="text-right text-xs">
                      {isEditing ? (
                        <Input
                          value={editContribution}
                          onChange={(e) => setEditContribution(e.target.value)}
                          className="h-8 text-xs text-right w-28 ml-auto border-ink/15 bg-paper text-ink"
                        />
                      ) : (
                        <span className="text-ink text-xs font-display font-bold">{formatMoney(s.agreed_contribution)}</span>
                      )}
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
                        {isEditing ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-positive hover:text-positive/80 hover:bg-teal-100/50"
                              onClick={() => handleEdit(s.id)}
                              disabled={editSubmitting}
                              title="Enregistrer"
                            >
                              <Check className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-ink-soft hover:text-teal-950 hover:bg-teal-100/50"
                              onClick={cancelEdit}
                              title="Annuler"
                            >
                              <X className="size-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-ink-soft hover:text-teal-950 hover:bg-teal-100/50"
                              onClick={() => setSelectedInvestor(s)}
                              title="Voir la fiche détaillée"
                            >
                              <Eye className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-ink-soft hover:text-teal-950 hover:bg-teal-100/50"
                              onClick={() => startEdit(s)}
                              title="Modifier"
                            >
                              <Pencil className="size-4" />
                            </Button>
                          </>
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
      </div>
    </div>
  )
}
