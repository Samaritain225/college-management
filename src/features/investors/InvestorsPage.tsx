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
  type InvestorStanding,
} from "@/db/queries"
import { toast } from "sonner"
import { UserPlus, Pencil, X, Check, Link } from "lucide-react"

interface LinkableUser {
  id: string
  name: string
  email: string
  roleId: string
  isActive: boolean
}

export function InvestorsPage({ onChange, dbReady }: { onChange?: () => void; dbReady: boolean }) {
  const { user: me } = useAuth()
  const [standings, setStandings] = useState<InvestorStanding[]>([])
  const [users, setUsers] = useState<LinkableUser[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)

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
      // Non-fatal, just logs empty list
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

  function getLinkedAccountText(userId: string | null): string {
    if (!userId) return "Pas d'accès"
    const matched = users.find((u) => u.id === userId)
    return matched ? `${matched.name} (${matched.email})` : "Utilisateur lié"
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  const totalInvestors = standings.length
  const totalAgreed = standings.reduce((acc, curr) => acc + curr.agreed_contribution, 0)
  const totalPaid = standings.reduce((acc, curr) => acc + curr.paid, 0)
  const totalOwed = standings.reduce((acc, curr) => acc + curr.owed, 0)

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between py-4">
          <div className="h-9 w-64 bg-ink/10 rounded-md" />
          <div className="h-9 w-40 bg-ink/10 rounded-md" />
        </div>
        <div className="rounded-md border border-ink/10 bg-paper p-4 space-y-4">
          <div className="h-6 bg-ink/10 rounded-sm w-full" />
          <div className="h-6 bg-ink/10 rounded-sm w-full" />
          <div className="h-6 bg-ink/10 rounded-sm w-full" />
          <div className="h-6 bg-ink/10 rounded-sm w-full" />
          <div className="h-6 bg-ink/10 rounded-sm w-full" />
        </div>
      </div>
    )
  }

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
        <Button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-2 font-display">
          <UserPlus className="size-4" />
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
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Card className="border border-ink/10 bg-paper">
          <CardHeader className="pb-2">
            <CardTitle className="text-ink-soft text-xs uppercase tracking-wider font-display">Total Convenu</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-xl font-bold text-ink">{formatMoney(totalAgreed)}</p>
            <p className="text-xs text-ink-soft mt-1">Fonds promis par les associés</p>
          </CardContent>
        </Card>
        <Card className="border border-ink/10 bg-paper">
          <CardHeader className="pb-2">
            <CardTitle className="text-ink-soft text-xs uppercase tracking-wider font-display">Total Libéré</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-xl font-bold text-positive">{formatMoney(totalPaid)}</p>
            <p className="text-xs text-ink-soft mt-1">Contributions reçues en banque</p>
          </CardContent>
        </Card>
        <Card className="border border-ink/10 bg-paper">
          <CardHeader className="pb-2">
            <CardTitle className="text-ink-soft text-xs uppercase tracking-wider font-display">Reste à Libérer</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-xl font-bold text-negative">{formatMoney(totalOwed)}</p>
            <p className="text-xs text-ink-soft mt-1">Dettes dues par les associés</p>
          </CardContent>
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
              <TableHead className="text-xs font-display font-semibold text-ink-soft hidden md:table-cell">Compte lié</TableHead>
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
                      <span className="font-display font-semibold text-ink whitespace-nowrap">{s.name}</span>
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
                      <span className="text-ink text-xs font-display font-semibold">{formatMoney(s.agreed_contribution)}</span>
                    )}
                  </TableCell>

                  {/* Paid */}
                  <TableCell className="text-right text-ink-soft text-xs hidden sm:table-cell whitespace-nowrap">
                    {formatMoney(s.paid)}
                  </TableCell>

                  {/* Owed */}
                  <TableCell className="text-right text-xs whitespace-nowrap">
                    {s.owed > 0 ? (
                      <span className="text-negative font-semibold text-xs">{formatMoney(s.owed)}</span>
                    ) : (
                      <Badge variant="positive">Libéré</Badge>
                    )}
                  </TableCell>

                  {/* Ownership Pct */}
                  <TableCell className="text-right text-ink-soft text-xs hidden md:table-cell whitespace-nowrap">
                    {s.ownership_pct.toFixed(1)}%
                  </TableCell>

                  {/* Linked User Account */}
                  <TableCell className="hidden md:table-cell text-xs">
                    {isEditing ? (
                      <Select value={editUserId} onValueChange={setEditUserId}>
                        <SelectTrigger className="h-8 text-xs w-48 bg-paper border-ink/15 text-ink">
                          <SelectValue placeholder="Lier un compte" />
                        </SelectTrigger>
                        <SelectContent className="bg-paper border-ink/10">
                          <SelectItem value="none">Aucun compte</SelectItem>
                          {users.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs">
                        {s.user_id ? (
                          <>
                            <Link className="size-3.5 text-ink-soft/60" />
                            <span className="text-ink font-medium">{getLinkedAccountText(s.user_id)}</span>
                          </>
                        ) : (
                          <span className="text-ink-soft/50 italic">Pas d'accès</span>
                        )}
                      </div>
                    )}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {isEditing ? (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-positive hover:text-positive/80"
                            onClick={() => handleEdit(s.id)}
                            disabled={editSubmitting}
                            title="Enregistrer"
                          >
                            <Check className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={cancelEdit}
                            title="Annuler"
                          >
                            <X className="size-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-ink-soft hover:text-ink"
                          onClick={() => startEdit(s)}
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
                <TableCell colSpan={8} className="text-center h-24 text-ink-soft">
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
