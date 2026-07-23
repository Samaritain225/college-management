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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { toast } from "sonner"
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
  UserPlus,
  Ban,
  RefreshCw,
  ArrowLeft,
  ShieldAlert,
  User,
  Mail,
  Phone,
  Calendar,
  Lock,
  Eye,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types — camelCase to match backend response exactly
// ---------------------------------------------------------------------------

interface ApiUser {
  id: string
  name: string
  email: string
  phone: string | null
  roleId: string
  isActive: boolean
  createdAt: string
  updatedAt: string | null
}

interface ApiRole {
  id: string
  label: string
  description: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface UsersPageProps {
  profileModeForceUserId?: string
  onBreadcrumbChange?: (items: string[]) => void
  backTrigger?: number
  initialSelectedUserId?: string | null
  onClearInitialSelectedUserId?: () => void
}

export function UsersPage({
  profileModeForceUserId,
  onBreadcrumbChange,
  backTrigger,
  initialSelectedUserId,
  onClearInitialSelectedUserId,
}: UsersPageProps) {
  const { user: me } = useAuth()
  const isAdmin = me?.role === "admin" || me?.role === "super_admin"

  const [users, setUsers] = useState<ApiUser[]>([])
  const [roles, setRoles] = useState<ApiRole[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  // Navigation sub-views
  // selectedUserId handles the detail card "page" view
  const [selectedUserId, setSelectedUserId] = useState<string | null>(profileModeForceUserId || null)

  // Filters and search
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedRole, setSelectedRole] = useState("all")
  const [selectedStatus, setSelectedStatus] = useState("all")

  // Create form
  const [showForm, setShowForm] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createEmail, setCreateEmail] = useState("")
  const [createPhone, setCreatePhone] = useState("")
  const [createPassword, setCreatePassword] = useState("")
  const [createRole, setCreateRole] = useState("")
  const [createSubmitting, setCreateSubmitting] = useState(false)

  // Detail/Edit view state
  const [detailUser, setDetailUser] = useState<ApiUser | null>(null)
  const [editName, setEditName] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editRole, setEditRole] = useState("")
  const [editPassword, setEditPassword] = useState("") // Optional on edit
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // ---------------------------------------------------------------------------
  // Load users & roles
  // ---------------------------------------------------------------------------

  async function loadData() {
    setListError(null)
    try {
      const [usersRes, rolesRes] = await Promise.all([
        api.get<{ data: { users: ApiUser[] } }>("/users"),
        api.get<{ data: { roles: ApiRole[] } }>("/roles"),
      ])
      setUsers(usersRes.data.users)
      setRoles(rolesRes.data.roles)
      if (rolesRes.data.roles.length > 0) {
        const defaultRole = rolesRes.data.roles.find((r) => r.id === "investor") || rolesRes.data.roles[0]
        setCreateRole(defaultRole.id)
      }

      // If viewing a details view, load/refresh the active profile user
      const targetId = selectedUserId || profileModeForceUserId
      if (targetId) {
        const matched = usersRes.data.users.find((u) => u.id === targetId)
        if (matched) {
          setDetailUser(matched)
          setEditName(matched.name)
          setEditEmail(matched.email)
          setEditPhone(matched.phone || "")
          setEditRole(matched.roleId)
        }
      }
    } catch (err) {
      if (isApiError(err)) {
        setListError(err.message)
      } else {
        setListError("Impossible de charger les données.")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedUserId, profileModeForceUserId])

  // Listen to global back-trigger to clear details view
  useEffect(() => {
    if (backTrigger && backTrigger > 0) {
      setSelectedUserId(null)
    }
  }, [backTrigger])

  // Listen to cross-tab routing inputs
  useEffect(() => {
    if (initialSelectedUserId) {
      setSelectedUserId(initialSelectedUserId)
      onClearInitialSelectedUserId?.()
    }
  }, [initialSelectedUserId, onClearInitialSelectedUserId])

  // Sync breadcrumbs with details view state
  useEffect(() => {
    if (selectedUserId && detailUser) {
      onBreadcrumbChange?.(["Détails : " + detailUser.name])
    } else {
      onBreadcrumbChange?.([])
    }
  }, [selectedUserId, detailUser, onBreadcrumbChange])

  // Helpers to fetch role attributes
  function getRoleLabel(roleId: string): string {
    const r = roles.find((role) => role.id === roleId)
    return r ? r.label : roleId
  }

  function roleBadgeVariant(roleId: string): "accent" | "neutral" {
    return roleId === "super_admin" || roleId === "admin" ? "accent" : "neutral"
  }

  // ---------------------------------------------------------------------------
  // Create user
  // ---------------------------------------------------------------------------

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()

    if (!createName.trim()) return toast.error("Le nom est requis.")
    if (!createEmail.trim()) return toast.error("L'email est requis.")
    if (!createPassword) return toast.error("Le mot de passe est requis.")
    if (!createRole) return toast.error("Le rôle est requis.")

    setCreateSubmitting(true)
    try {
      await api.post("/users", {
        name: createName.trim(),
        email: createEmail.trim(),
        phone: createPhone.trim() || null,
        password: createPassword,
        roleId: createRole,
      })
      toast.success("Utilisateur créé avec succès.")
      setCreateName("")
      setCreateEmail("")
      setCreatePhone("")
      setCreatePassword("")
      setShowForm(false)
      await loadData()
    } catch (err) {
      if (isApiError(err)) {
        toast.error(err.message)
      } else {
        toast.error("Erreur lors de la création de l'utilisateur.")
      }
    } finally {
      setCreateSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Edit user
  // ---------------------------------------------------------------------------

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!detailUser) return

    if (!editName.trim()) return toast.error("Le nom est requis.")
    if (!editEmail.trim()) return toast.error("L'email est requis.")
    if (!editRole) return toast.error("Le rôle est requis.")

    setEditSubmitting(true)
    try {
      const payload: Record<string, any> = {
        name: editName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim() || null,
        roleId: editRole,
      }
      if (editPassword.trim()) {
        payload.password = editPassword
      }

      await api.patch(`/users/${detailUser.id}`, payload)
      toast.success("Fiche utilisateur mise à jour avec succès.")
      setEditPassword("")
      await loadData()
    } catch (err) {
      if (isApiError(err)) {
        toast.error(err.message)
      } else {
        toast.error("Erreur lors de la mise à jour.")
      }
    } finally {
      setEditSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Toggle status
  // ---------------------------------------------------------------------------

  async function handleToggleActive() {
    if (!detailUser) return
    setActionLoading(true)

    try {
      const endpoint = detailUser.isActive
        ? `/users/${detailUser.id}/deactivate`
        : `/users/${detailUser.id}/reactivate`
      await api.patch(endpoint)
      toast.success(
        detailUser.isActive
          ? "Utilisateur désactivé avec succès."
          : "Utilisateur réactivé avec succès."
      )
      await loadData()
    } catch (err) {
      const msg = isApiError(err) ? err.message : "Une erreur est survenue."
      toast.error(msg)
    } finally {
      setActionLoading(false)
    }
  }

  // Filter logic
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRole = selectedRole === "all" || u.roleId === selectedRole
    const matchesStatus =
      selectedStatus === "all" ||
      (selectedStatus === "active" && u.isActive) ||
      (selectedStatus === "inactive" && !u.isActive)
    return matchesSearch && matchesRole && matchesStatus
  })

  const totalActive = users.filter((u) => u.isActive).length

  // ---------------------------------------------------------------------------
  // Render sub-page: User Details View
  // ---------------------------------------------------------------------------

  if (selectedUserId && detailUser) {
    const isSuperAdmin = detailUser.roleId === "super_admin"
    const isMe = me?.id === detailUser.id
    const showBack = !profileModeForceUserId // Hide back button if forced to view own profile

    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        {showBack && (
          <Button
            variant="ghost"
            onClick={() => setSelectedUserId(null)}
            className="mb-6 flex items-center gap-2 hover:bg-teal-100/50 text-ink-soft hover:text-ink font-display"
          >
            <ArrowLeft className="size-4" />
            Retour à la liste
          </Button>
        )}

        <div className="space-y-6">
          {/* Header Card */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-paper p-6 border border-ink/10 rounded-xl shadow-xs">
            <div className="flex items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
                {detailUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-ink">{detailUser.name}</h2>
                  {isMe && <Badge variant="neutral">Vous</Badge>}
                </div>
                <p className="text-xs text-ink-soft">{detailUser.email}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={roleBadgeVariant(detailUser.roleId)}>
                {getRoleLabel(detailUser.roleId)}
              </Badge>
              <Badge variant={detailUser.isActive ? "positive" : "negative"}>
                {detailUser.isActive ? "Actif" : "Inactif"}
              </Badge>
            </div>
          </div>

          {/* Form details */}
          <Card className="border border-ink/10 bg-paper">
            <CardHeader className="border-b border-ink/10 pb-4">
              <CardTitle className="text-ink font-semibold text-base">
                {isAdmin ? "Éditer le profil" : "Détails du compte"}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleEditSave} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Nom complet */}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ed-name" className="text-xs text-ink-soft font-semibold flex items-center gap-1.5">
                      <User className="size-3.5" /> Nom complet
                    </Label>
                    <Input
                      id="ed-name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      disabled={!isAdmin}
                      className="border-ink/15 bg-paper text-ink"
                      required
                    />
                  </div>

                  {/* Email */}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ed-email" className="text-xs text-ink-soft font-semibold flex items-center gap-1.5">
                      <Mail className="size-3.5" /> Adresse email
                    </Label>
                    <Input
                      id="ed-email"
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      disabled={!isAdmin}
                      className="border-ink/15 bg-paper text-ink"
                      required
                    />
                  </div>

                  {/* Phone */}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ed-phone" className="text-xs text-ink-soft font-semibold flex items-center gap-1.5">
                    <Phone className="size-3.5" /> Téléphone
                    </Label>
                    <Input
                      id="ed-phone"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="—"
                      disabled={!isAdmin}
                    />
                  </div>

                  {/* Role selection */}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ed-role" className="text-xs text-ink-soft font-semibold flex items-center gap-1.5">
                    <ShieldAlert className="size-3.5" /> Rôle affecté
                    </Label>
                    {isAdmin && !isSuperAdmin ? (
                      <Select value={editRole} onValueChange={setEditRole}>
                        <SelectTrigger id="ed-role" className="bg-paper">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roles.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="ed-role"
                        value={getRoleLabel(detailUser.roleId)}
                        disabled
                      />
                    )}
                  </div>

                  {/* Password change (Admin Only) */}
                  {isAdmin && (
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <Label htmlFor="ed-pass" className="text-xs text-ink-soft font-semibold flex items-center gap-1.5">
                        <Lock className="size-3.5" /> Réinitialiser le mot de passe (facultatif)
                      </Label>
                      <Input
                        id="ed-pass"
                        type="password"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        placeholder="Laisser vide pour ne pas modifier"
                      />
                    </div>
                  )}
                </div>

                {/* Metadata creation date */}
                <div className="pt-4 border-t border-ink/10 text-xs text-ink-soft/70 flex items-center gap-1.5">
                  <Calendar className="size-3.5" /> Compte créé le {new Date(detailUser.createdAt).toLocaleString()}
                </div>

                {/* Action buttons */}
                {isAdmin && (
                  <div className="pt-4 border-t border-ink/10 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                    {/* Deactivate Button */}
                    <div>
                      {!isSuperAdmin && (
                        <Button
                          type="button"
                          variant={detailUser.isActive ? "destructive" : "outline"}
                          disabled={actionLoading}
                          onClick={handleToggleActive}
                          className="flex items-center gap-2"
                        >
                          {detailUser.isActive ? (
                            <>
                              <Ban className="size-4" /> Désactiver le compte
                            </>
                          ) : (
                            <>
                              <RefreshCw className="size-4" /> Réactiver le compte
                            </>
                          )}
                        </Button>
                      )}
                    </div>

                    {/* Save Changes */}
                    <Button type="submit" disabled={editSubmitting}>
                      {editSubmitting ? "Enregistrement…" : "Enregistrer les modifications"}
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render main page: Users list and search
  // ---------------------------------------------------------------------------

  if (loading) {
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

  if (listError) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <p className="text-sm text-destructive">{listError}</p>
        <Button variant="outline" className="mt-4" onClick={loadData}>Réessayer</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            Utilisateurs &amp; Permissions
          </h1>
          <p className="text-sm text-ink-soft">
            {users.length} {users.length > 1 ? "membres" : "membre"} enregistrés · {totalActive} actifs
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-2 font-display">
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
                <Label htmlFor="cu-phone">Téléphone (facultatif)</Label>
                <Input
                  id="cu-phone"
                  value={createPhone}
                  onChange={(e) => setCreatePhone(e.target.value)}
                  placeholder="+225 07 00 00 00 00"
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
                <Label htmlFor="cu-role">Rôle *</Label>
                <Select value={createRole} onValueChange={setCreateRole}>
                  <SelectTrigger id="cu-role" className="h-10 w-full">
                    <SelectValue placeholder="Choisir un rôle" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5 justify-end">
                <Button type="submit" disabled={createSubmitting} className="w-full">
                  {createSubmitting ? "Enregistrement…" : "Enregistrer l'utilisateur"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Advanced search and filter panel */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between py-4">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filtrer les utilisateurs par nom, email..."
          className="max-w-sm h-9"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="h-9 w-40 bg-paper border-border text-xs">
              <SelectValue placeholder="Rôle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les rôles</SelectItem>
              {roles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="h-9 w-40 bg-paper border-border text-xs">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="active">Actifs uniquement</SelectItem>
              <SelectItem value="inactive">Inactifs uniquement</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Users table */}
      <div className="rounded-md border border-ink/10 bg-paper overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-ink/10">
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Nom</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft hidden sm:table-cell">Email</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft hidden md:table-cell">Téléphone</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Rôle</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft hidden sm:table-cell">Statut</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => {
              const isMe = me?.id === user.id
              return (
                <TableRow key={user.id} className="border-b border-ink/10 last:border-0 hover:bg-teal-100/30">
                  {/* Name */}
                  <TableCell className="font-semibold text-ink">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Avatar className="h-8 w-8 sm:h-10 sm:w-10 border border-ink/10 shrink-0">
                        <AvatarFallback className="bg-teal-100 text-teal-950 text-xs font-semibold">
                          {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm truncate max-w-[120px] sm:max-w-none">{user.name}</span>
                        {isMe && (
                          <span className="text-xs text-ink-soft font-normal">(vous)</span>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Email */}
                  <TableCell className="text-ink-soft text-xs hidden sm:table-cell whitespace-nowrap">
                    {user.email}
                  </TableCell>

                  {/* Phone */}
                  <TableCell className="text-ink-soft text-xs hidden md:table-cell">
                    {user.phone || "—"}
                  </TableCell>

                  {/* Role */}
                  <TableCell>
                    <Badge variant={roleBadgeVariant(user.roleId)}>
                      {getRoleLabel(user.roleId)}
                    </Badge>
                  </TableCell>

                  {/* Status */}
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={user.isActive ? "positive" : "negative"}>
                      {user.isActive ? "Actif" : "Inactif"}
                    </Badge>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 hover:text-teal-950"
                      onClick={() => setSelectedUserId(user.id)}
                      title="Consulter et éditer"
                    >
                      <Eye className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}

            {filteredUsers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                  <p className="text-sm font-medium text-foreground">Aucun membre correspondant trouvé.</p>
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
