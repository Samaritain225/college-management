// Users management screen — visible only to admin and super_admin roles.
//
// Reads/writes go through the admin-users Edge Function (src/lib/adminUsers.ts),
// not the Supabase client directly — creating/editing auth users and reading
// email addresses requires the service_role key, which only exists inside
// that function.

import React, { useEffect, useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { focusFirstInvalidField } from "@/lib/formFocus"
import {
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  setAdminUserActive,
  deleteAdminUser,
  type ApiUser,
} from "@/lib/adminUsers"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"
import {
  createUserSchema,
  editUserSchema,
  type CreateUserFormValues,
  type EditUserFormValues,
} from "./userFormSchemas"
import { PasswordChecklist } from "@/components/PasswordChecklist"
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
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
  EyeOff,
  Clock,
  Trash2,
} from "lucide-react"
import { ActivityFeed } from "@/features/activity/ActivityFeed"
import { relativeTime } from "@/features/activity/formatActivity"
import { useNavigate, useParams } from "react-router-dom"
import { useSetPageTitle } from "@/lib/pageTitle"
import { TablePager } from "@/components/TablePager"
import { usePagedRows } from "@/lib/usePagedRows"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiRole {
  id: string
  label: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// A new account is "En attente" until the person completes their first sign-
// in — purely a read of GoTrue's own `last_sign_in_at`, not a separate flag
// this app maintains, so it can never drift from what actually happened.
// This is transparency only: an account in this state can already log in,
// nothing here blocks it. "Désactivé" (banned) always wins over "never
// logged in yet" — a deactivated account that also never signed in should
// not read as merely pending.
type UserStatus = "pending" | "active" | "disabled"

function userStatus(u: ApiUser): UserStatus {
  if (!u.isActive) return "disabled"
  if (!u.lastSignInAt) return "pending"
  return "active"
}

const STATUS_LABEL: Record<UserStatus, string> = {
  pending: "En attente",
  active: "Actif",
  disabled: "Désactivé",
}

const STATUS_BADGE_VARIANT: Record<UserStatus, "positive" | "negative" | "neutral"> = {
  pending: "neutral",
  active: "positive",
  disabled: "negative",
}

function StatusBadge({ user }: { user: ApiUser }) {
  const status = userStatus(user)
  return <Badge variant={STATUS_BADGE_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
}

export function UsersPage() {
  const { user: me } = useAuth()
  const isAdmin = me?.role === "admin" || me?.role === "super_admin"
  // The archive of soft-deleted accounts is super_admin only — an admin
  // scoped to one college has no business seeing a record of who erased
  // whom, only super_admin does that kind of cross-cutting oversight.
  const iAmSuperAdmin = me?.role === "super_admin"

  const [users, setUsers] = useState<ApiUser[]>([])
  const [roles, setRoles] = useState<ApiRole[]>([])
  // super_admin is seeded, never created from the app — keep it out of the
  // create-user form's role choices without affecting the filter or an
  // existing user's role-change control, which still need to show it.
  const creatableRoles = roles.filter((r) => r.id !== "super_admin")
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  // Navigation sub-views — the URL owns which record is open.
  const { id: routeUserId } = useParams()
  const navigate = useNavigate()
  const selectedUserId = routeUserId ?? null

  // Filters and search
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedRole, setSelectedRole] = useState("all")
  const [selectedStatus, setSelectedStatus] = useState("all")

  // Create form — react-hook-form + zod (userFormSchemas.ts). `mode:
  // "onTouched"` validates a field once it's been left (or after the first
  // submit attempt), then keeps revalidating on every change — this is what
  // replaces the old hand-rolled debounce-then-check-email-format effect.
  const [showForm, setShowForm] = useState(false)
  const [showCreatePassword, setShowCreatePassword] = useState(false)
  const createForm = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    mode: "onTouched",
    defaultValues: { name: "", email: "", phone: "", password: "", roleId: "" },
  })
  const createPasswordValue = createForm.watch("password")

  // Detail/Edit view state
  const [detailUser, setDetailUser] = useState<ApiUser | null>(null)
  const [showEditPassword, setShowEditPassword] = useState(false)
  const editForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    mode: "onTouched",
    defaultValues: { name: "", email: "", phone: "", roleId: "", password: "" },
  })
  const editPasswordValue = editForm.watch("password") ?? ""
  const [actionLoading, setActionLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  // super_admin only — a separate view rather than a filter pill, since a
  // soft-deleted account isn't a status like the others, it's a different
  // kind of row: no actions, no edit, nothing but a record of what happened.
  const [showArchive, setShowArchive] = useState(false)

  // ---------------------------------------------------------------------------
  // Load users & roles
  // ---------------------------------------------------------------------------

  async function loadData() {
    setListError(null)
    try {
      const [usersRes, rolesRes] = await Promise.all([
        listAdminUsers(),
        supabase.from("roles").select("id, label"),
      ])
      if (rolesRes.error) throw new Error(rolesRes.error.message)

      const rolesList = rolesRes.data as ApiRole[]
      setUsers(usersRes.data.users)
      setRoles(rolesList)
      if (rolesList.length > 0) {
        const defaultRole = rolesList.find((r) => r.id === "investor") || rolesList[0]
        createForm.setValue("roleId", defaultRole.id)
      }

      // If viewing a details view, load/refresh the active profile user
      if (selectedUserId) {
        const matched = usersRes.data.users.find((u) => u.id === selectedUserId)
        if (matched) {
          setDetailUser(matched)
          // reset(), not individual setValue calls — this also clears
          // isDirty/errors from any previous edit session on this same page
          // instance (profile mode never unmounts between users).
          editForm.reset({
            name: matched.name,
            email: matched.email,
            phone: matched.phone || "",
            roleId: matched.roleId,
            password: "",
          })
        }
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Impossible de charger les données.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedUserId])

  // Helpers to fetch role attributes
  // Only once detailUser has resolved — a crumb reading "Détails : undefined"
  // while the fetch is in flight is worse than no crumb.
  useSetPageTitle(selectedUserId && detailUser ? `Détails : ${detailUser.name}` : null)

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

  const CREATE_FIELD_ORDER: (keyof CreateUserFormValues)[] = ["name", "email", "password", "roleId"]
  const [createGeneralError, setCreateGeneralError] = useState<string | null>(null)

  const submitCreate = createForm.handleSubmit(
    async (values) => {
      setCreateGeneralError(null)
      try {
        await createAdminUser({
          name: values.name.trim(),
          email: values.email.trim(),
          phone: values.phone?.trim() || null,
          password: values.password,
          roleId: values.roleId,
        })
        toast.success("Utilisateur créé avec succès.")
        createForm.reset()
        setShowForm(false)
        await loadData()
      } catch (err) {
        // Kept inline, not just a toast that can fade before it's read — this
        // is the real message from the server (GoTrue's own rejection text for
        // a password policy violation, for instance), not a generic fallback,
        // so it's worth leaving visible next to the field it's about.
        const message = err instanceof Error ? err.message : "Erreur lors de la création de l'utilisateur."
        toast.error(message)
        setCreateGeneralError(message)
      }
    },
    (errors) => focusFirstInvalidField(errors, CREATE_FIELD_ORDER, createForm.setFocus)
  )

  // ---------------------------------------------------------------------------
  // Edit user
  // ---------------------------------------------------------------------------

  const EDIT_FIELD_ORDER: (keyof EditUserFormValues)[] = ["name", "email", "password", "roleId"]
  const [editGeneralError, setEditGeneralError] = useState<string | null>(null)

  const submitEditSave = editForm.handleSubmit(
    async (values) => {
      if (!detailUser) return
      setEditGeneralError(null)
      try {
        const payload: Record<string, any> = {
          name: values.name.trim(),
          email: values.email.trim(),
          phone: values.phone?.trim() || null,
          roleId: values.roleId,
        }
        if (values.password?.trim()) {
          payload.password = values.password
        }

        await updateAdminUser(detailUser.id, payload)
        toast.success("Fiche utilisateur mise à jour avec succès.")
        await loadData()
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erreur lors de la mise à jour."
        toast.error(message)
        setEditGeneralError(message)
      }
    },
    (errors) => focusFirstInvalidField(errors, EDIT_FIELD_ORDER, editForm.setFocus)
  )

  /** Belt-and-suspenders: the submit button is disabled while unchanged, but
   *  Enter inside a text field still submits the form in most browsers
   *  regardless of the default button's disabled state — so the guard has
   *  to live here too, before react-hook-form even runs validation. */
  function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editForm.formState.isDirty) return
    submitEditSave()
  }

  // ---------------------------------------------------------------------------
  // Toggle status
  // ---------------------------------------------------------------------------

  async function handleToggleActive() {
    if (!detailUser) return
    setActionLoading(true)

    try {
      await setAdminUserActive(detailUser.id, !detailUser.isActive)
      toast.success(
        detailUser.isActive
          ? "Utilisateur désactivé avec succès."
          : "Utilisateur réactivé avec succès."
      )
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Une erreur est survenue.")
    } finally {
      setActionLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Delete (permanent — see the server-side FK check this relies on)
  // ---------------------------------------------------------------------------

  async function handleDeleteUser() {
    if (!detailUser) return
    setActionLoading(true)
    try {
      const { data } = await deleteAdminUser(detailUser.id)
      // The server decides which happened — never assume "definitive" the
      // way the old copy always did, since a referenced account is now
      // banned and tombstoned rather than erased.
      toast.success(
        data.mode === "hard"
          ? "Utilisateur supprimé définitivement."
          : "Compte supprimé — l'historique associé a été conservé, l'accès est révoqué."
      )
      setDeleteDialogOpen(false)
      navigate("/users")
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Une erreur est survenue.")
    } finally {
      setActionLoading(false)
    }
  }

  // Filter logic — soft-deleted accounts never appear in the everyday list,
  // no matter what's searched or selected. They live only in the archive.
  const activeUsers = users.filter((u) => !u.deletedAt)
  const deletedUsers = users.filter((u) => u.deletedAt)

  const filteredUsers = activeUsers.filter((u) => {
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

  // One profile today, a handful later — paged in memory over the already
  // fetched list, like the other small tables.
  const userPaging = usePagedRows(filteredUsers)
  const archivePaging = usePagedRows(deletedUsers)

  const totalActive = activeUsers.filter((u) => u.isActive).length

  // ---------------------------------------------------------------------------
  // Render sub-page: User Details View
  // ---------------------------------------------------------------------------

  if (selectedUserId && detailUser?.deletedAt) {
    // Reachable only by a direct link — the list itself never links to a
    // soft-deleted row. No edit form, no actions: everything about this
    // account that could still change already has (banned, tombstoned).
    // What's left is a record, not a profile to manage.
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate("/users")}
          className="mb-6 flex items-center gap-2 hover:bg-teal-100/50 text-ink-soft hover:text-ink font-display"
        >
          <ArrowLeft className="size-4" />
          Retour à la liste
        </Button>
        <Card className="border border-ink/10 bg-paper">
          <CardHeader className="border-b border-ink/10 pb-4">
            <CardTitle className="text-ink font-semibold text-base flex items-center gap-2">
              <Trash2 className="size-4 text-ink-soft" />
              {detailUser.name}
              <Badge variant="negative">Compte supprimé</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-2 text-xs text-ink-soft">
            <p>Ancien email : {detailUser.email || "—"}</p>
            <p>Rôle : {getRoleLabel(detailUser.roleId)}</p>
            <p>
              Supprimé le{" "}
              {detailUser.deletedAt ? new Date(detailUser.deletedAt).toLocaleString() : "—"}
              {detailUser.deletedByName ? ` par ${detailUser.deletedByName}` : ""}.
            </p>
            <p className="pt-2 border-t border-ink/10">
              L'accès est révoqué et la fiche n'est plus modifiable. Son historique financier
              reste attribué à ce nom dans les dépenses, activités et investissements existants.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (selectedUserId && detailUser) {
    const isSuperAdmin = detailUser.roleId === "super_admin"
    const isMe = me?.id === detailUser.id
    // A super_admin target can only be deactivated by another super_admin —
    // an admin scoped to one college has no business banning a globally-
    // privileged account. Nobody, at any level, can act on their own row;
    // the server enforces both independently, this only decides what to show.
    const canToggleActive = !isMe && (!isSuperAdmin || me?.role === "super_admin")
    const isDirty = editForm.formState.isDirty
    const editErrors = editForm.formState.errors

    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate("/users")}
          className="mb-6 flex items-center gap-2 hover:bg-teal-100/50 text-ink-soft hover:text-ink font-display"
        >
          <ArrowLeft className="size-4" />
          Retour à la liste
        </Button>

        <div className="space-y-6">
          {/* Header Card */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-paper p-6 border border-ink/10 rounded-xl shadow-xs">
            <div className="flex items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-full bg-teal-100 text-teal-950 font-display font-bold text-lg">
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
              <StatusBadge user={detailUser} />
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
              {/* noValidate: the browser's own constraint validation runs
                  before React ever sees the submit — an empty `required`
                  field blocks the native form submission outright, so the
                  `submit` event (and this handler) never fires at all. That
                  left every custom error message and the focus-the-first-
                  invalid-field behavior below completely unreachable for the
                  one case they exist to handle. Verified live: with
                  noValidate absent, `form.requestSubmit()` produced no
                  `submit` event and no console error — just silent native
                  focus on the empty field, nothing this app's UI controlled. */}
              <form onSubmit={handleEditSave} className="space-y-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Nom complet */}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ed-name" className="text-xs text-ink-soft font-semibold flex items-center gap-1.5">
                      <User className="size-3.5" /> Nom complet
                    </Label>
                    <Input
                      id="ed-name"
                      {...editForm.register("name")}
                      disabled={!isAdmin}
                      aria-invalid={!!editErrors.name}
                      className="border-ink/15 bg-paper text-ink"
                      required
                    />
                    {editErrors.name && (
                      <p className="text-xs text-negative font-medium">{editErrors.name.message}</p>
                    )}
                  </div>

                  {/* Email */}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ed-email" className="text-xs text-ink-soft font-semibold flex items-center gap-1.5">
                      <Mail className="size-3.5" /> Adresse email
                    </Label>
                    <Input
                      id="ed-email"
                      type="email"
                      {...editForm.register("email")}
                      disabled={!isAdmin}
                      aria-invalid={!!editErrors.email}
                      className="border-ink/15 bg-paper text-ink"
                      required
                    />
                    {editErrors.email && (
                      <p className="text-xs text-negative font-medium">{editErrors.email.message}</p>
                    )}
                  </div>

                  {/* Phone */}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ed-phone" className="text-xs text-ink-soft font-semibold flex items-center gap-1.5">
                    <Phone className="size-3.5" /> Téléphone
                    </Label>
                    <Input
                      id="ed-phone"
                      {...editForm.register("phone")}
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
                      <Controller
                        control={editForm.control}
                        name="roleId"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger
                              id="ed-role"
                              ref={field.ref}
                              aria-invalid={!!editErrors.roleId}
                              className="bg-paper"
                            >
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
                        )}
                      />
                    ) : (
                      <Input
                        id="ed-role"
                        value={getRoleLabel(detailUser.roleId)}
                        disabled
                      />
                    )}
                    {editErrors.roleId && (
                      <p className="text-xs text-negative font-medium">{editErrors.roleId.message}</p>
                    )}
                  </div>

                  {/* Password change (Admin Only) */}
                  {isAdmin && (
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <Label htmlFor="ed-pass" className="text-xs text-ink-soft font-semibold flex items-center gap-1.5">
                        <Lock className="size-3.5" /> Réinitialiser le mot de passe (facultatif)
                      </Label>
                      <div className="relative">
                        <Input
                          id="ed-pass"
                          type={showEditPassword ? "text" : "password"}
                          {...editForm.register("password")}
                          placeholder="Laisser vide pour ne pas modifier"
                          aria-invalid={!!editErrors.password}
                          className="pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowEditPassword((v) => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink"
                          title={showEditPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                        >
                          {showEditPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                      {editErrors.password && (
                        <p className="text-xs text-negative font-medium">{editErrors.password.message}</p>
                      )}
                      {editPasswordValue.length > 0 && (
                        <>
                          <PasswordChecklist password={editPasswordValue} />
                          <p className="text-2xs text-ink-soft">
                            Ce mot de passe sera temporaire — l'utilisateur devra le remplacer à sa
                            prochaine connexion.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {editGeneralError && (
                  <p className="text-xs text-negative font-medium bg-negative-bg p-2 rounded-sm border border-negative/20">
                    {editGeneralError}
                  </p>
                )}

                {/* Metadata: creation date and last sign-in. The latter is
                    GoTrue's own field, read-only here — see `userStatus`. */}
                <div className="pt-4 border-t border-ink/10 text-xs text-ink-soft/70 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="size-3.5" /> Compte créé le {new Date(detailUser.createdAt).toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Clock className="size-3.5" />
                    {detailUser.lastSignInAt
                      ? `Dernière connexion le ${new Date(detailUser.lastSignInAt).toLocaleString()}`
                      : "Jamais connecté"}
                  </div>
                </div>

                {/* Action buttons */}
                {isAdmin && (
                  <div className="pt-4 border-t border-ink/10 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                    {/* Deactivate / Delete */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      {canToggleActive ? (
                        <>
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
                          <Button
                            type="button"
                            variant="outline"
                            disabled={actionLoading}
                            onClick={() => setDeleteDialogOpen(true)}
                            className="flex items-center gap-2 text-negative border-negative/30 hover:bg-negative-bg hover:text-negative"
                          >
                            <Trash2 className="size-4" /> Supprimer
                          </Button>
                        </>
                      ) : isMe ? (
                        <p className="text-xs text-ink-soft">Vous ne pouvez pas désactiver ou supprimer votre propre compte.</p>
                      ) : (
                        <p className="text-xs text-ink-soft">Seul un super administrateur peut agir sur ce compte.</p>
                      )}
                    </div>

                    {/* Save Changes */}
                    <Button
                      type="submit"
                      disabled={editForm.formState.isSubmitting || !isDirty}
                      title={!isDirty ? "Aucune modification à enregistrer" : undefined}
                    >
                      {editForm.formState.isSubmitting ? "Enregistrement…" : "Enregistrer les modifications"}
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Activity history. Scoped by user_id, but that filter is only
              presentation — activity_log's RLS policy is what actually stops a
              non-admin from reading anyone else's rows, so this is safe to
              render for whoever is being viewed. */}
          <Card className="border border-ink/10 bg-paper">
            <CardHeader className="border-b border-ink/10 pb-4">
              <CardTitle className="text-ink font-semibold text-base flex items-center gap-2">
                <Clock className="size-4 text-ink-soft" />
                {isMe ? "Mon activité" : "Activité de ce compte"}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <ActivityFeed
                userId={detailUser.id}
                className="max-h-[30rem]"
                emptyLabel={
                  isMe
                    ? "Vous n'avez encore enregistré aucune action."
                    : "Ce compte n'a encore enregistré aucune action."
                }
              />
            </CardContent>
          </Card>
        </div>

        {/* Delete confirmation — the server is the real safety net (it
            refuses the request outright if any expense, activity-log or
            investor row points at this person), so this dialog's job is
            just to make sure a click here was deliberate, not a checkbox
            to re-derive that safety client-side. */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="sm:max-w-sm p-6 space-y-4 bg-paper border border-ink/10 max-h-[90svh] overflow-y-auto">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-lg font-display font-bold flex items-center gap-2 text-ink">
                <Trash2 className="size-5 text-negative" />
                Supprimer {detailUser.name} ?
              </DialogTitle>
              <DialogDescription className="text-xs text-ink-soft">
                Si ce compte n'a jamais enregistré de dépense, d'investissement ni d'activité, il
                sera effacé définitivement. S'il en a, il sera plutôt désactivé de façon
                permanente et son email libéré pour être réutilisé — sa fiche reste visible dans
                l'historique financier, mais l'accès et toute action sont révoqués. Dans les deux
                cas, cette action ne peut pas être annulée.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="pt-3 border-t border-ink/10 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={actionLoading}
              >
                Annuler
              </Button>
              <Button type="button" variant="destructive" onClick={handleDeleteUser} disabled={actionLoading}>
                {actionLoading ? "Suppression…" : "Supprimer définitivement"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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

  // ---------------------------------------------------------------------------
  // Render sub-page: soft-delete archive (super_admin only)
  // ---------------------------------------------------------------------------

  if (showArchive && iAmSuperAdmin) {
    return (
      <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-8">
        <Button
          variant="ghost"
          onClick={() => setShowArchive(false)}
          className="mb-6 flex items-center gap-2 hover:bg-teal-100/50 text-ink-soft hover:text-ink font-display"
        >
          <ArrowLeft className="size-4" />
          Retour à la liste
        </Button>

        <header className="mb-6 space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            Comptes supprimés
          </h1>
          <p className="text-sm text-ink-soft">
            {deletedUsers.length} {deletedUsers.length > 1 ? "comptes" : "compte"} — l'historique
            financier associé (dépenses, activité, investissements) empêchait une suppression
            définitive, donc l'accès a été révoqué sans effacer la fiche.
          </p>
        </header>

        <div className="rounded-md border border-ink/10 bg-paper overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-ink/10">
                  <TableHead className="text-xs font-display font-semibold text-ink-soft">Nom</TableHead>
                  <TableHead className="text-xs font-display font-semibold text-ink-soft hidden sm:table-cell">Ancien email</TableHead>
                  <TableHead className="text-xs font-display font-semibold text-ink-soft">Rôle</TableHead>
                  <TableHead className="text-xs font-display font-semibold text-ink-soft">Supprimé le</TableHead>
                  <TableHead className="text-xs font-display font-semibold text-ink-soft hidden sm:table-cell">Par</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archivePaging.pageRows.map((user) => (
                  <TableRow key={user.id} className="border-b border-ink/10 last:border-0">
                    <TableCell className="font-semibold text-ink text-sm">{user.name}</TableCell>
                    <TableCell className="text-ink-soft text-xs hidden sm:table-cell whitespace-nowrap">
                      {user.email || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeVariant(user.roleId)}>{getRoleLabel(user.roleId)}</Badge>
                    </TableCell>
                    <TableCell className="text-ink-soft text-xs whitespace-nowrap">
                      {user.deletedAt ? new Date(user.deletedAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-ink-soft text-xs hidden sm:table-cell">
                      {user.deletedByName || "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {deletedUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center h-24 text-ink-soft">
                      <p className="text-sm font-medium text-ink">Aucun compte supprimé.</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="px-4 pb-3">
            <TablePager
              page={archivePaging.page}
              pageSize={archivePaging.pageSize}
              total={archivePaging.total}
              onPageChange={archivePaging.setPage}
              itemLabel="comptes"
            />
          </div>
        </div>
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
            {activeUsers.length} {activeUsers.length > 1 ? "membres" : "membre"} enregistrés · {totalActive} actifs
          </p>
        </div>
        <div className="flex items-center gap-2">
          {iAmSuperAdmin && deletedUsers.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setShowArchive(true)}
              className="flex items-center gap-2 font-display text-ink-soft"
            >
              <Trash2 className="size-4" />
              Comptes supprimés ({deletedUsers.length})
            </Button>
          )}
          <Button onClick={() => setShowForm(true)} className="flex items-center gap-2 font-display">
            <UserPlus className="size-4" />
            Nouvel utilisateur
          </Button>
        </div>
      </header>

      {/* Create dialog */}
      {/* max-h + overflow-y-auto: DialogContent is `fixed` and centred with no
          height cap of its own, so a form taller than the viewport spills off
          both edges and cannot be scrolled to. See AGENTS.md. */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open)
          // Field values deliberately persist across a cancel (only real
          // submission errors get cleared) — matches the previous behavior
          // where closing without submitting kept the draft for next time.
          if (!open) setCreateGeneralError(null)
        }}
      >
        <DialogContent
          className="sm:max-w-md p-6 sm:p-7 space-y-4 bg-paper border border-ink/10 max-h-[90svh] overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-display font-bold flex items-center gap-2 text-ink">
              <UserPlus className="size-5 text-teal-950" />
              Créer un utilisateur
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-soft">
              Ajouter un nouveau membre et lui attribuer un rôle
            </DialogDescription>
          </DialogHeader>

          {/* noValidate — see the matching comment on the edit form above. */}
          <form onSubmit={submitCreate} className="grid gap-4 sm:grid-cols-2 pt-1" noValidate>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="cu-name" className="text-xs font-display font-medium text-ink">
                Nom complet *
              </Label>
              <Input
                id="cu-name"
                {...createForm.register("name")}
                placeholder="Ex. Koné Amadou"
                required
                aria-invalid={!!createForm.formState.errors.name}
                className="border-ink/15 bg-paper text-ink text-sm"
              />
              {createForm.formState.errors.name && (
                <p className="text-xs text-negative font-medium">{createForm.formState.errors.name.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="cu-email" className="text-xs font-display font-medium text-ink">
                Email *
              </Label>
              <Input
                id="cu-email"
                type="email"
                {...createForm.register("email")}
                placeholder="amadou@college.ci"
                required
                aria-invalid={!!createForm.formState.errors.email}
                className="border-ink/15 bg-paper text-ink text-sm"
              />
              {createForm.formState.errors.email && (
                <p className="text-xs text-negative font-medium">{createForm.formState.errors.email.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cu-phone" className="text-xs font-display font-medium text-ink">
                Téléphone (facultatif)
              </Label>
              <Input
                id="cu-phone"
                {...createForm.register("phone")}
                placeholder="+225 07 00 00 00 00"
                className="border-ink/15 bg-paper text-ink text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cu-password" className="text-xs font-display font-medium text-ink">
                Mot de passe *
              </Label>
              <div className="relative">
                <Input
                  id="cu-password"
                  type={showCreatePassword ? "text" : "password"}
                  {...createForm.register("password")}
                  placeholder="••••••••"
                  required
                  aria-invalid={!!createForm.formState.errors.password}
                  className="border-ink/15 bg-paper text-ink text-sm pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink"
                  title={showCreatePassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showCreatePassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {createForm.formState.errors.password && (
                <p className="text-xs text-negative font-medium">{createForm.formState.errors.password.message}</p>
              )}
              <PasswordChecklist password={createPasswordValue} />
              <p className="text-2xs text-ink-soft">
                Ce mot de passe sera temporaire — l'utilisateur devra le remplacer à sa première
                connexion.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="cu-role" className="text-xs font-display font-medium text-ink">
                Rôle *
              </Label>
              <Controller
                control={createForm.control}
                name="roleId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="cu-role"
                      ref={field.ref}
                      aria-invalid={!!createForm.formState.errors.roleId}
                      className="h-10 w-full border-ink/15 bg-paper text-ink text-sm"
                    >
                      <SelectValue placeholder="Choisir un rôle" />
                    </SelectTrigger>
                    <SelectContent>
                      {creatableRoles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {createForm.formState.errors.roleId && (
                <p className="text-xs text-negative font-medium">{createForm.formState.errors.roleId.message}</p>
              )}
            </div>

            {createGeneralError && (
              <p className="sm:col-span-2 text-xs text-negative font-medium bg-negative-bg p-2 rounded-sm border border-negative/20">
                {createGeneralError}
              </p>
            )}

            <DialogFooter className="sm:col-span-2 pt-3 border-t border-ink/10 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false)
                  setCreateGeneralError(null)
                }}
                disabled={createForm.formState.isSubmitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={createForm.formState.isSubmitting} className="font-display">
                {createForm.formState.isSubmitting ? "Enregistrement…" : "Enregistrer l'utilisateur"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
              <TableHead className="text-xs font-display font-semibold text-ink-soft hidden lg:table-cell">Dernière connexion</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {userPaging.pageRows.map((user) => {
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
                    <StatusBadge user={user} />
                  </TableCell>

                  {/* Last login — GoTrue's own `last_sign_in_at`, read-only
                      here just like on the detail view. */}
                  <TableCell className="text-ink-soft text-xs hidden lg:table-cell whitespace-nowrap">
                    {user.lastSignInAt ? relativeTime(user.lastSignInAt) : "Jamais connecté"}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 hover:text-teal-950"
                      onClick={() => navigate(`/users/${user.id}`)}
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
                <TableCell colSpan={7} className="text-center h-24 text-ink-soft">
                  <p className="text-sm font-medium text-ink">Aucun membre correspondant trouvé.</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>

        <div className="px-4 pb-3">
          <TablePager
            page={userPaging.page}
            pageSize={userPaging.pageSize}
            total={userPaging.total}
            onPageChange={userPaging.setPage}
            itemLabel="membres"
          />
        </div>
      </div>
    </div>
  )
}
