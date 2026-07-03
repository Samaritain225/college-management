// Users management screen — visible only to admin and super_admin roles.
//
// All data comes from the AdonisJS backend REST API via src/lib/api.ts.
// No local SQLite queries are used here — this is the canonical source of truth
// for user management (create, edit, deactivate, reactivate).

import React, { useEffect, useState } from "react"
import { api, isApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import { UserPlus, Pencil, Ban, RefreshCw, X, Check } from "lucide-react"
import { formatMoney } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types — camelCase to match backend response exactly
// ---------------------------------------------------------------------------

interface ApiUser {
  id: string
  name: string
  email: string
  role: "investor" | "admin" | "super_admin"
  isActive: boolean
  agreedContribution: number
  joinedAt: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roleBadgeVariant(role: ApiUser["role"]): "accent" | "neutral" {
  return role === "super_admin" || role === "admin" ? "accent" : "neutral"
}

function roleLabel(role: ApiUser["role"]): string {
  switch (role) {
    case "super_admin": return "Super Admin"
    case "admin": return "Administrateur"
    default: return "Investisseur"
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<ApiUser[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  // Create form
  const [showForm, setShowForm] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createEmail, setCreateEmail] = useState("")
  const [createPassword, setCreatePassword] = useState("")
  const [createRole, setCreateRole] = useState<"investor" | "admin">("investor")
  const [createContribution, setCreateContribution] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSubmitting, setCreateSubmitting] = useState(false)

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editRole, setEditRole] = useState<"investor" | "admin">("investor")
  const [editContribution, setEditContribution] = useState("")
  const [editError, setEditError] = useState<string | null>(null)
  const [editSubmitting, setEditSubmitting] = useState(false)

  // Per-row action error (deactivate/reactivate)
  const [actionError, setActionError] = useState<Record<string, string>>({})
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})

  // ---------------------------------------------------------------------------
  // Load users
  // ---------------------------------------------------------------------------

  async function loadUsers() {
    setListError(null)
    try {
      const data = await api.get<{ data: { users: ApiUser[] } }>("/users")
      setUsers(data.data.users)
    } catch (err) {
      if (isApiError(err)) {
        setListError(err.message)
      } else {
        setListError("Impossible de charger les utilisateurs.")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  // ---------------------------------------------------------------------------
  // Create user
  // ---------------------------------------------------------------------------

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)

    if (!createName.trim()) return setCreateError("Le nom est requis.")
    if (!createEmail.trim()) return setCreateError("L'email est requis.")
    if (!createPassword) return setCreateError("Le mot de passe est requis.")

    const contribution = Number(createContribution.replace(/\D/g, ""))

    setCreateSubmitting(true)
    try {
      await api.post("/users", {
        name: createName.trim(),
        email: createEmail.trim(),
        password: createPassword,
        role: createRole,
        agreedContribution: contribution,
      })
      // Reset form
      setCreateName("")
      setCreateEmail("")
      setCreatePassword("")
      setCreateRole("investor")
      setCreateContribution("")
      setShowForm(false)
      await loadUsers()
    } catch (err) {
      if (isApiError(err)) {
        setCreateError(err.message)
      } else {
        setCreateError("Erreur lors de la création de l'utilisateur.")
      }
    } finally {
      setCreateSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Inline edit
  // ---------------------------------------------------------------------------

  function startEdit(user: ApiUser) {
    setEditingId(user.id)
    setEditName(user.name)
    setEditEmail(user.email)
    setEditRole(user.role === "super_admin" ? "admin" : user.role)
    setEditContribution(String(user.agreedContribution))
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditError(null)
  }

  async function handleEdit(userId: string) {
    setEditError(null)
    if (!editName.trim()) return setEditError("Le nom est requis.")
    if (!editEmail.trim()) return setEditError("L'email est requis.")

    setEditSubmitting(true)
    try {
      await api.patch(`/users/${userId}`, {
        name: editName.trim(),
        email: editEmail.trim(),
        role: editRole,
        agreedContribution: Number(editContribution.replace(/\D/g, "")),
      })
      setEditingId(null)
      await loadUsers()
    } catch (err) {
      if (isApiError(err)) {
        setEditError(err.message)
      } else {
        setEditError("Erreur lors de la mise à jour.")
      }
    } finally {
      setEditSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Deactivate / Reactivate
  // ---------------------------------------------------------------------------

  async function handleToggleActive(user: ApiUser) {
    setActionError((prev) => ({ ...prev, [user.id]: "" }))
    setActionLoading((prev) => ({ ...prev, [user.id]: true }))

    try {
      const endpoint = user.isActive
        ? `/users/${user.id}/deactivate`
        : `/users/${user.id}/reactivate`
      await api.patch(endpoint)
      await loadUsers()
    } catch (err) {
      const msg =
        isApiError(err)
          ? err.message
          : "Une erreur est survenue."
      setActionError((prev) => ({ ...prev, [user.id]: msg }))
    } finally {
      setActionLoading((prev) => ({ ...prev, [user.id]: false }))
    }
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  const totalUsers = users.length
  const totalAdmins = users.filter((u) => u.role === "admin" || u.role === "super_admin").length
  const totalActive = users.filter((u) => u.isActive).length

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8 text-muted-foreground">
        Chargement des utilisateurs…
      </div>
    )
  }

  if (listError) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <p className="text-sm text-destructive">{listError}</p>
        <Button variant="outline" className="mt-4" onClick={loadUsers}>Réessayer</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="font-sans text-2xl font-bold tracking-tight text-foreground">
            Utilisateurs &amp; Permissions
          </h1>
          <p className="text-sm text-muted-foreground">
            {totalUsers} {totalUsers > 1 ? "membres" : "membre"} enregistrés · {totalActive} actifs
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-2">
          <UserPlus className="size-4" />
          {showForm ? "Annuler" : "Nouvel utilisateur"}
        </Button>
      </header>

      {/* Create form */}
      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-foreground font-semibold text-base">Créer un utilisateur</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cu-name">Nom complet *</Label>
                <Input
                  id="cu-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Ex. Koné Amadou"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cu-email">Email *</Label>
                <Input
                  id="cu-email"
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="amadou@college.ci"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cu-password">Mot de passe *</Label>
                <Input
                  id="cu-password"
                  type="password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cu-role">Rôle</Label>
                {/* super_admin can only be created via seeder — intentionally omitted */}
                <Select value={createRole} onValueChange={(val) => setCreateRole(val as "investor" | "admin")}>
                  <SelectTrigger id="cu-role" className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="investor">Investisseur (lecture seule)</SelectItem>
                    <SelectItem value="admin">Administrateur (lecture / écriture)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cu-contribution">Contribution convenue (XOF)</Label>
                <Input
                  id="cu-contribution"
                  inputMode="numeric"
                  value={createContribution}
                  onChange={(e) => setCreateContribution(e.target.value)}
                  placeholder="2 500 000"
                />
              </div>
              <div className="flex flex-col gap-1.5 justify-end">
                {createError && <p className="text-sm text-destructive">{createError}</p>}
                <Button type="submit" disabled={createSubmitting} className="w-full">
                  {createSubmitting ? "Enregistrement…" : "Enregistrer l'utilisateur"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Quick stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Membres totaux</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-sans text-2xl font-bold text-foreground">{totalUsers}</p>
            <p className="text-xs text-muted-foreground mt-1">Personnes enregistrées</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Administrateurs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-sans text-2xl font-bold text-foreground">{totalAdmins}</p>
            <p className="text-xs text-muted-foreground mt-1">Droits d'écriture</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Actifs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-sans text-2xl font-bold text-foreground">{totalActive}</p>
            <p className="text-xs text-muted-foreground mt-1">Sessions autorisées</p>
          </CardContent>
        </Card>
      </div>

      {/* Users table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground font-semibold text-base">Membres du collège</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Contribution</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isEditing = editingId === user.id
                const isSuperAdmin = user.role === "super_admin"
                const isMe = me?.id === user.id
                const rowActionLoading = actionLoading[user.id] ?? false
                const rowActionError = actionError[user.id] ?? ""

                return (
                  <React.Fragment key={user.id}>
                    <TableRow>
                      {/* Name */}
                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <span className="font-medium text-foreground">
                            {user.name}
                            {isMe && (
                              <span className="ml-1.5 text-3xs text-muted-foreground">(vous)</span>
                            )}
                          </span>
                        )}
                      </TableCell>

                      {/* Email */}
                      <TableCell>
                        {isEditing ? (
                          <Input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <span className="text-muted-foreground text-sm">{user.email}</span>
                        )}
                      </TableCell>

                      {/* Role */}
                      <TableCell>
                        {isEditing && !isSuperAdmin ? (
                          <Select
                            value={editRole}
                            onValueChange={(v) => setEditRole(v as "investor" | "admin")}
                          >
                            <SelectTrigger className="h-8 text-sm w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="investor">Investisseur</SelectItem>
                              <SelectItem value="admin">Administrateur</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={roleBadgeVariant(user.role)}>
                            {roleLabel(user.role)}
                          </Badge>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge variant={user.isActive ? "positive" : "negative"}>
                          {user.isActive ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>

                      {/* Agreed contribution */}
                      <TableCell className="text-right">
                        {isEditing ? (
                          <Input
                            inputMode="numeric"
                            value={editContribution}
                            onChange={(e) => setEditContribution(e.target.value)}
                            className="h-8 text-sm text-right w-28 ml-auto"
                          />
                        ) : (
                          <span className="text-sm">{formatMoney(user.agreedContribution)}</span>
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
                                className="h-7 w-7 text-positive"
                                onClick={() => handleEdit(user.id)}
                                disabled={editSubmitting}
                                title="Enregistrer"
                              >
                                <Check className="size-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={cancelEdit}
                                title="Annuler"
                              >
                                <X className="size-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => startEdit(user)}
                                title="Modifier"
                              >
                                <Pencil className="size-3.5" />
                              </Button>

                              {/* Deactivate / Reactivate */}
                              <div
                                title={
                                  isSuperAdmin
                                    ? "Les super administrateurs ne peuvent pas être désactivés depuis l'interface"
                                    : user.isActive
                                    ? "Désactiver cet utilisateur"
                                    : "Réactiver cet utilisateur"
                                }
                              >
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className={`h-7 w-7 ${
                                    isSuperAdmin
                                      ? "opacity-30 cursor-not-allowed"
                                      : user.isActive
                                      ? "text-destructive hover:text-destructive"
                                      : "text-positive hover:text-positive"
                                  }`}
                                  onClick={() => !isSuperAdmin && handleToggleActive(user)}
                                  disabled={isSuperAdmin || rowActionLoading}
                                  aria-disabled={isSuperAdmin}
                                >
                                  {user.isActive ? (
                                    <Ban className="size-3.5" />
                                  ) : (
                                    <RefreshCw className="size-3.5" />
                                  )}
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Inline error rows */}
                    {isEditing && editError && (
                      <TableRow>
                        <TableCell colSpan={6} className="pt-0 pb-2 px-4">
                          <p className="text-xs text-destructive">{editError}</p>
                        </TableCell>
                      </TableRow>
                    )}
                    {!isEditing && rowActionError && (
                      <TableRow>
                        <TableCell colSpan={6} className="pt-0 pb-2 px-4">
                          <p className="text-xs text-destructive">{rowActionError}</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                )
              })}

              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                    <div className="flex flex-col items-center justify-center py-4">
                      <img
                        src="/empty-state.png"
                        alt="Aucun utilisateur"
                        className="h-32 w-32 object-contain mb-4 rounded-xl opacity-80"
                      />
                      <p className="text-sm font-medium text-foreground">Aucun utilisateur trouvé.</p>
                      <p className="text-xs text-muted-foreground mt-1">Créez le premier utilisateur avec le bouton ci-dessus.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
