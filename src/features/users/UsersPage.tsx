// Users management screen — visible only to admin and super_admin roles.
//
// Reads/writes go through the admin-users Edge Function (src/lib/adminUsers.ts),
// not the Supabase client directly — creating/editing auth users and reading
// email addresses requires the service_role key, which only exists inside
// that function.

import React, { useEffect, useRef, useState } from "react"
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
import { cn } from "@/lib/utils"
import { email as emailRule, firstError, maxLength, required } from "@/lib/validation"
import { useDebounced } from "@/lib/useDebounced"
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
  Check,
  Trash2,
} from "lucide-react"
import { ActivityFeed } from "@/features/activity/ActivityFeed"
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

interface UserFormErrors {
  name?: string
  email?: string
  password?: string
  role?: string
  general?: string
}

/** Field priority when more than one is invalid — top to bottom as they
 *  appear in the form, since that's the order a person reads and tabs
 *  through them in. */
const FIELD_ORDER: (keyof UserFormErrors)[] = ["name", "email", "password", "role"]

/**
 * Moves both keyboard focus and the viewport to the first invalid field.
 * `scrollIntoView` matters here specifically because both dialogs now scroll
 * internally on a phone (`max-h-[90svh] overflow-y-auto` — see AGENTS.md) —
 * a field below the fold can be invalid with nothing on screen to say so,
 * and `focus()` alone does not guarantee a scroll inside a nested scroll
 * container the way it would for the top-level page.
 */
function focusFirstInvalidField(
  errors: UserFormErrors,
  refs: Partial<Record<keyof UserFormErrors, React.RefObject<HTMLElement | null>>>
) {
  const firstKey = FIELD_ORDER.find((key) => errors[key])
  const el = firstKey ? refs[firstKey]?.current : null
  if (!el) return
  el.focus()
  el.scrollIntoView({ behavior: "smooth", block: "center" })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Mirrors the hosted project's actual GoTrue policy — confirmed 2026-07-28
// from the literal rejection text ("Password should contain at least one
// character of each: ..."), not derived from supabase/config.toml, whose
// `minimum_password_length` only governs the local Docker stack (never
// successfully started here — see AGENTS.md) and doesn't state a character-
// class rule at all. If the Dashboard policy changes, this drifts from it
// silently — there is no endpoint that reports the policy back to the
// client, so the only way to keep this honest is to update it by hand
// against the next real rejection.
const PASSWORD_SPECIAL_CHARS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~"

interface PasswordCheck {
  label: string
  met: boolean
}

function passwordChecks(pw: string): PasswordCheck[] {
  return [
    { label: "Une lettre minuscule", met: /[a-z]/.test(pw) },
    { label: "Une lettre majuscule", met: /[A-Z]/.test(pw) },
    { label: "Un chiffre", met: /[0-9]/.test(pw) },
    { label: "Un caractère spécial (!@#...)", met: [...pw].some((c) => PASSWORD_SPECIAL_CHARS.includes(c)) },
  ]
}

function passwordMeetsPolicy(pw: string): boolean {
  return passwordChecks(pw).every((c) => c.met)
}

const PASSWORD_POLICY_MESSAGE =
  "Le mot de passe doit contenir au moins une minuscule, une majuscule, un chiffre et un caractère spécial."

/** Shown before submission, not just on rejection — the whole point is that
 *  the rule is known while typing, not discovered after a round trip against
 *  a masked field. */
function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5">
      {passwordChecks(password).map((c) => (
        <li
          key={c.label}
          className={cn(
            "text-2xs flex items-center gap-1",
            c.met ? "text-positive" : "text-ink-soft"
          )}
        >
          {c.met ? <Check className="size-3 shrink-0" /> : <span className="size-3 shrink-0" />}
          {c.label}
        </li>
      ))}
    </ul>
  )
}

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

interface UsersPageProps {
  profileModeForceUserId?: string
}

export function UsersPage({
  profileModeForceUserId,
}: UsersPageProps) {
  const { user: me } = useAuth()
  const isAdmin = me?.role === "admin" || me?.role === "super_admin"

  const [users, setUsers] = useState<ApiUser[]>([])
  const [roles, setRoles] = useState<ApiRole[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  // Navigation sub-views
  // The URL owns which record is open. /profile pins it to the signed-in user
  // instead, which is why this is not simply `useParams().id`.
  const { id: routeUserId } = useParams()
  const navigate = useNavigate()
  const selectedUserId = profileModeForceUserId ?? routeUserId ?? null

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
  const [showCreatePassword, setShowCreatePassword] = useState(false)
  const [createRole, setCreateRole] = useState("")
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createFieldErrors, setCreateFieldErrors] = useState<UserFormErrors>({})
  const createNameRef = useRef<HTMLInputElement>(null)
  const createEmailRef = useRef<HTMLInputElement>(null)
  const createPasswordRef = useRef<HTMLInputElement>(null)
  const createRoleRef = useRef<HTMLButtonElement>(null)

  // Detail/Edit view state
  const [detailUser, setDetailUser] = useState<ApiUser | null>(null)
  const [editName, setEditName] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editRole, setEditRole] = useState("")
  const [editPassword, setEditPassword] = useState("") // Optional on edit
  const [showEditPassword, setShowEditPassword] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editFieldErrors, setEditFieldErrors] = useState<UserFormErrors>({})
  const editNameRef = useRef<HTMLInputElement>(null)
  const editEmailRef = useRef<HTMLInputElement>(null)
  const editPasswordRef = useRef<HTMLInputElement>(null)
  const editRoleRef = useRef<HTMLButtonElement>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Live email format check — flags an invalid address once typing pauses,
  // instead of waiting for submit to be the first time the user hears about
  // it. Debounced, not checked on every keystroke: validating "amadou@colleg"
  // as invalid while the user is still mid-word toward "amadou@college.ci"
  // would flag a shape that was never meant to be final. Only checks format,
  // never "required" — an empty field mid-typing isn't a mistake yet, and
  // submit already covers that case.
  const debouncedCreateEmail = useDebounced(createEmail, 500)
  useEffect(() => {
    if (!debouncedCreateEmail.trim()) return
    const err = emailRule("Adresse email invalide.")(debouncedCreateEmail)
    setCreateFieldErrors((prev) => ({ ...prev, email: err }))
  }, [debouncedCreateEmail])

  const debouncedEditEmail = useDebounced(editEmail, 500)
  useEffect(() => {
    if (!debouncedEditEmail.trim()) return
    const err = emailRule("Adresse email invalide.")(debouncedEditEmail)
    setEditFieldErrors((prev) => ({ ...prev, email: err }))
  }, [debouncedEditEmail])

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
          setEditFieldErrors({})
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
  }, [selectedUserId, profileModeForceUserId])

  // Helpers to fetch role attributes
  // Only once detailUser has resolved — a crumb reading "Détails : undefined"
  // while the fetch is in flight is worse than no crumb. Suppressed entirely on
  // /profile: there is no list to go back to there, so a trailing crumb would
  // turn "Mon compte" into a link pointing at the page you are already on.
  useSetPageTitle(
    !profileModeForceUserId && selectedUserId && detailUser
      ? `Détails : ${detailUser.name}`
      : null
  )

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

  function validateCreateForm(): UserFormErrors {
    const errors: UserFormErrors = {}
    errors.name = firstError(createName, [
      required("Le nom est requis."),
      maxLength(255, "Le nom ne doit pas dépasser 255 caractères."),
    ])
    errors.email = firstError(createEmail, [
      required("L'email est requis."),
      emailRule("Adresse email invalide."),
    ])
    if (!createPassword) errors.password = "Le mot de passe est requis."
    else if (!passwordMeetsPolicy(createPassword)) errors.password = PASSWORD_POLICY_MESSAGE
    if (!createRole) errors.role = "Le rôle est requis."
    return errors
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()

    const errors = validateCreateForm()
    setCreateFieldErrors(errors)
    if (Object.values(errors).some(Boolean)) {
      focusFirstInvalidField(errors, {
        name: createNameRef,
        email: createEmailRef,
        password: createPasswordRef,
        role: createRoleRef,
      })
      return
    }

    setCreateSubmitting(true)
    try {
      await createAdminUser({
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
      setCreateFieldErrors({})
      setShowForm(false)
      await loadData()
    } catch (err) {
      // Kept inline, not just a toast that can fade before it's read — this
      // is the real message from the server (GoTrue's own rejection text for
      // a password policy violation, for instance), not a generic fallback,
      // so it's worth leaving visible next to the field it's about.
      const message = err instanceof Error ? err.message : "Erreur lors de la création de l'utilisateur."
      toast.error(message)
      setCreateFieldErrors((prev) => ({ ...prev, general: message }))
    } finally {
      setCreateSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Edit user
  // ---------------------------------------------------------------------------

  /** Nothing to send if none of these differ from what's already loaded — a
   *  password reset is the one exception, since typing one is always a
   *  deliberate action regardless of whether the other fields moved. */
  function isEditFormDirty(): boolean {
    if (!detailUser) return false
    return (
      editName.trim() !== detailUser.name ||
      editEmail.trim() !== detailUser.email ||
      (editPhone.trim() || null) !== detailUser.phone ||
      editRole !== detailUser.roleId ||
      editPassword.trim() !== ""
    )
  }

  function validateEditForm(): UserFormErrors {
    const errors: UserFormErrors = {}
    errors.name = firstError(editName, [
      required("Le nom est requis."),
      maxLength(255, "Le nom ne doit pas dépasser 255 caractères."),
    ])
    errors.email = firstError(editEmail, [
      required("L'email est requis."),
      emailRule("Adresse email invalide."),
    ])
    if (!editRole) errors.role = "Le rôle est requis."
    if (editPassword.trim() && !passwordMeetsPolicy(editPassword.trim())) {
      errors.password = PASSWORD_POLICY_MESSAGE
    }
    return errors
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!detailUser) return
    // Belt-and-suspenders: the submit button is disabled while unchanged,
    // but Enter inside a text field still submits the form in most browsers
    // regardless of the default button's disabled state.
    if (!isEditFormDirty()) return

    const errors = validateEditForm()
    setEditFieldErrors(errors)
    if (Object.values(errors).some(Boolean)) {
      focusFirstInvalidField(errors, {
        name: editNameRef,
        email: editEmailRef,
        password: editPasswordRef,
        role: editRoleRef,
      })
      return
    }

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

      await updateAdminUser(detailUser.id, payload)
      toast.success("Fiche utilisateur mise à jour avec succès.")
      setEditPassword("")
      setEditFieldErrors({})
      await loadData()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors de la mise à jour."
      toast.error(message)
      setEditFieldErrors((prev) => ({ ...prev, general: message }))
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
      await deleteAdminUser(detailUser.id)
      toast.success("Utilisateur supprimé définitivement.")
      setDeleteDialogOpen(false)
      navigate("/users")
      await loadData()
    } catch (err) {
      // The server's message already explains why (a related-records count)
      // and suggests deactivating instead — worth showing as-is rather than
      // a generic fallback.
      toast.error(err instanceof Error ? err.message : "Une erreur est survenue.")
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

  // One profile today, a handful later — paged in memory over the already
  // fetched list, like the other small tables.
  const userPaging = usePagedRows(filteredUsers)

  const totalActive = users.filter((u) => u.isActive).length

  // ---------------------------------------------------------------------------
  // Render sub-page: User Details View
  // ---------------------------------------------------------------------------

  if (selectedUserId && detailUser) {
    const isSuperAdmin = detailUser.roleId === "super_admin"
    const isMe = me?.id === detailUser.id
    // A super_admin target can only be deactivated by another super_admin —
    // an admin scoped to one college has no business banning a globally-
    // privileged account. Nobody, at any level, can act on their own row;
    // the server enforces both independently, this only decides what to show.
    const canToggleActive = !isMe && (!isSuperAdmin || me?.role === "super_admin")
    const showBack = !profileModeForceUserId // Hide back button if forced to view own profile
    const isDirty = isEditFormDirty()

    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        {showBack && (
          <Button
            variant="ghost"
            onClick={() => navigate("/users")}
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
                      ref={editNameRef}
                      value={editName}
                      onChange={(e) => {
                        setEditName(e.target.value)
                        setEditFieldErrors((prev) => ({ ...prev, name: undefined }))
                      }}
                      disabled={!isAdmin}
                      aria-invalid={!!editFieldErrors.name}
                      className="border-ink/15 bg-paper text-ink"
                      required
                    />
                    {editFieldErrors.name && (
                      <p className="text-xs text-negative font-medium">{editFieldErrors.name}</p>
                    )}
                  </div>

                  {/* Email */}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ed-email" className="text-xs text-ink-soft font-semibold flex items-center gap-1.5">
                      <Mail className="size-3.5" /> Adresse email
                    </Label>
                    <Input
                      id="ed-email"
                      ref={editEmailRef}
                      type="email"
                      value={editEmail}
                      onChange={(e) => {
                        setEditEmail(e.target.value)
                        setEditFieldErrors((prev) => ({ ...prev, email: undefined }))
                      }}
                      disabled={!isAdmin}
                      aria-invalid={!!editFieldErrors.email}
                      className="border-ink/15 bg-paper text-ink"
                      required
                    />
                    {editFieldErrors.email && (
                      <p className="text-xs text-negative font-medium">{editFieldErrors.email}</p>
                    )}
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
                      <Select
                        value={editRole}
                        onValueChange={(v) => {
                          setEditRole(v)
                          setEditFieldErrors((prev) => ({ ...prev, role: undefined }))
                        }}
                      >
                        <SelectTrigger
                          id="ed-role"
                          ref={editRoleRef}
                          aria-invalid={!!editFieldErrors.role}
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
                    ) : (
                      <Input
                        id="ed-role"
                        value={getRoleLabel(detailUser.roleId)}
                        disabled
                      />
                    )}
                    {editFieldErrors.role && (
                      <p className="text-xs text-negative font-medium">{editFieldErrors.role}</p>
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
                          ref={editPasswordRef}
                          type={showEditPassword ? "text" : "password"}
                          value={editPassword}
                          onChange={(e) => {
                            setEditPassword(e.target.value)
                            setEditFieldErrors((prev) => ({ ...prev, password: undefined }))
                          }}
                          placeholder="Laisser vide pour ne pas modifier"
                          aria-invalid={!!editFieldErrors.password}
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
                      {editFieldErrors.password && (
                        <p className="text-xs text-negative font-medium">{editFieldErrors.password}</p>
                      )}
                      {editPassword.length > 0 && <PasswordChecklist password={editPassword} />}
                    </div>
                  )}
                </div>

                {editFieldErrors.general && (
                  <p className="text-xs text-negative font-medium bg-negative-bg p-2 rounded-sm border border-negative/20">
                    {editFieldErrors.general}
                  </p>
                )}

                {/* Metadata: creation date and last sign-in. The latter is
                    GoTrue's own field, read-only here — see `userStatus`. */}
                <div className="pt-4 border-t border-ink/10 text-xs text-ink-soft/70 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="size-3.5" /> Compte créé le {new Date(detailUser.createdAt).toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1.5">
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
                    <Button type="submit" disabled={editSubmitting || !isDirty} title={!isDirty ? "Aucune modification à enregistrer" : undefined}>
                      {editSubmitting ? "Enregistrement…" : "Enregistrer les modifications"}
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
                Cette action est définitive et ne peut pas être annulée. Le compte et son accès
                seront supprimés. Si ce compte a déjà enregistré des dépenses, des investissements
                ou une activité quelconque, la suppression sera refusée — désactivez-le à la place.
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
        <Button onClick={() => setShowForm(true)} className="flex items-center gap-2 font-display">
          <UserPlus className="size-4" />
          Nouvel utilisateur
        </Button>
      </header>

      {/* Create dialog */}
      {/* max-h + overflow-y-auto: DialogContent is `fixed` and centred with no
          height cap of its own, so a form taller than the viewport spills off
          both edges and cannot be scrolled to. See AGENTS.md. */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open)
          if (!open) setCreateFieldErrors({})
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
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2 pt-1" noValidate>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="cu-name" className="text-xs font-display font-medium text-ink">
                Nom complet *
              </Label>
              <Input
                id="cu-name"
                ref={createNameRef}
                value={createName}
                onChange={(e) => {
                  setCreateName(e.target.value)
                  setCreateFieldErrors((prev) => ({ ...prev, name: undefined }))
                }}
                placeholder="Ex. Koné Amadou"
                required
                aria-invalid={!!createFieldErrors.name}
                className="border-ink/15 bg-paper text-ink text-sm"
              />
              {createFieldErrors.name && (
                <p className="text-xs text-negative font-medium">{createFieldErrors.name}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="cu-email" className="text-xs font-display font-medium text-ink">
                Email *
              </Label>
              <Input
                id="cu-email"
                ref={createEmailRef}
                type="email"
                value={createEmail}
                onChange={(e) => {
                  setCreateEmail(e.target.value)
                  setCreateFieldErrors((prev) => ({ ...prev, email: undefined }))
                }}
                placeholder="amadou@college.ci"
                required
                aria-invalid={!!createFieldErrors.email}
                className="border-ink/15 bg-paper text-ink text-sm"
              />
              {createFieldErrors.email && (
                <p className="text-xs text-negative font-medium">{createFieldErrors.email}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cu-phone" className="text-xs font-display font-medium text-ink">
                Téléphone (facultatif)
              </Label>
              <Input
                id="cu-phone"
                value={createPhone}
                onChange={(e) => setCreatePhone(e.target.value)}
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
                  ref={createPasswordRef}
                  type={showCreatePassword ? "text" : "password"}
                  value={createPassword}
                  onChange={(e) => {
                    setCreatePassword(e.target.value)
                    setCreateFieldErrors((prev) => ({ ...prev, password: undefined }))
                  }}
                  placeholder="••••••••"
                  required
                  aria-invalid={!!createFieldErrors.password}
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
              {createFieldErrors.password && (
                <p className="text-xs text-negative font-medium">{createFieldErrors.password}</p>
              )}
              <PasswordChecklist password={createPassword} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="cu-role" className="text-xs font-display font-medium text-ink">
                Rôle *
              </Label>
              <Select
                value={createRole}
                onValueChange={(v) => {
                  setCreateRole(v)
                  setCreateFieldErrors((prev) => ({ ...prev, role: undefined }))
                }}
              >
                <SelectTrigger
                  id="cu-role"
                  ref={createRoleRef}
                  aria-invalid={!!createFieldErrors.role}
                  className="h-10 w-full border-ink/15 bg-paper text-ink text-sm"
                >
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
              {createFieldErrors.role && (
                <p className="text-xs text-negative font-medium">{createFieldErrors.role}</p>
              )}
            </div>

            {createFieldErrors.general && (
              <p className="sm:col-span-2 text-xs text-negative font-medium bg-negative-bg p-2 rounded-sm border border-negative/20">
                {createFieldErrors.general}
              </p>
            )}

            <DialogFooter className="sm:col-span-2 pt-3 border-t border-ink/10 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false)
                  setCreateFieldErrors({})
                }}
                disabled={createSubmitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={createSubmitting} className="font-display">
                {createSubmitting ? "Enregistrement…" : "Enregistrer l'utilisateur"}
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
                <TableCell colSpan={6} className="text-center h-24 text-ink-soft">
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
