import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Save, KeyRound, Mail, ShieldCheck, Camera, X, Clock } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { uploadFile, deleteFile, publicUrl, validateUpload } from "@/lib/uploads"
import { focusFirstInvalidField } from "@/lib/formFocus"
import {
  profileFormSchema,
  passwordChangeSchema,
  type ProfileFormValues,
  type PasswordChangeFormValues,
} from "./profileFormSchemas"
import { PasswordChecklist } from "@/components/PasswordChecklist"
import { ActivityFeed } from "@/features/activity/ActivityFeed"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super administrateur",
  admin: "Administrateur",
  treasurer: "Trésorier",
  investor: "Investisseur",
  teacher: "Enseignant",
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function ProfileSection() {
  const { user, refreshUser } = useAuth()

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    mode: "onTouched",
    defaultValues: { fullName: "", phone: "" },
  })
  const [avatarKey, setAvatarKey] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Deferred like the college logo: nothing hits R2 until Save, so
  // selecting a photo then navigating away never orphans an upload.
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null)
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState<string | null>(null)
  const [avatarRemoved, setAvatarRemoved] = useState(false)
  const previewUrlRef = useRef<string | null>(null)

  const fullNameValue = profileForm.watch("fullName")

  const passwordForm = useForm<PasswordChangeFormValues>({
    resolver: zodResolver(passwordChangeSchema),
    mode: "onTouched",
    defaultValues: { password: "", confirmPassword: "" },
  })
  const passwordValue = passwordForm.watch("password")

  // Read straight from `profiles` rather than the cached auth user: the cache
  // is a point-in-time snapshot kept for offline rendering, and `phone`/
  // `avatar_key` aren't part of it at all.
  useEffect(() => {
    if (!user) return
    let cancelled = false

    supabase
      .from("profiles")
      .select("full_name, phone, avatar_key")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error("Failed to load profile:", error)
          toast.error("Impossible de charger votre profil.")
        }
        profileForm.reset({ fullName: data?.full_name ?? user.name, phone: data?.phone ?? "" })
        setAvatarKey(data?.avatar_key ?? null)
        setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  if (!user) return null

  const roleLabel = ROLE_LABELS[user.role] ?? user.role
  const avatarUrl = avatarRemoved ? null : pendingAvatarPreview ?? publicUrl(avatarKey)

  function handleAvatarSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    const err = validateUpload(file, "avatar")
    if (err) {
      toast.error(err)
      return
    }

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const preview = URL.createObjectURL(file)
    previewUrlRef.current = preview

    setPendingAvatarFile(file)
    setPendingAvatarPreview(preview)
    setAvatarRemoved(false)
  }

  function handleRemoveAvatar() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPendingAvatarFile(null)
    setPendingAvatarPreview(null)
    setAvatarRemoved(true)
  }

  const handleSaveProfile = profileForm.handleSubmit(
    async (values) => {
      if (!user) return
      const previousAvatarKey = avatarKey

      try {
        let nextAvatarKey = avatarKey
        if (pendingAvatarFile) {
          nextAvatarKey = await uploadFile(pendingAvatarFile, "avatar")
        } else if (avatarRemoved) {
          nextAvatarKey = null
        }

        const { error } = await supabase
          .from("profiles")
          .update({
            full_name: values.fullName.trim(),
            phone: values.phone?.trim() || null,
            avatar_key: nextAvatarKey,
          })
          .eq("id", user.id)
        if (error) throw error

        setAvatarKey(nextAvatarKey)
        await refreshUser()
        toast.success("Profil mis à jour.")

        // Same ordering as the college logo: only delete the old object once
        // the row pointing at the new one has committed.
        if (previousAvatarKey && previousAvatarKey !== nextAvatarKey) {
          deleteFile(previousAvatarKey, "avatar").catch((err) =>
            console.warn("Failed to delete previous avatar from R2:", err)
          )
        }

        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current)
          previewUrlRef.current = null
        }
        setPendingAvatarFile(null)
        setPendingAvatarPreview(null)
        setAvatarRemoved(false)
      } catch (err) {
        console.error("Failed to save profile:", err)
        toast.error(err instanceof Error ? err.message : "Enregistrement impossible.")
      }
    },
    (errors) => focusFirstInvalidField(errors, ["fullName", "phone"], profileForm.setFocus)
  )

  const handleChangePassword = passwordForm.handleSubmit(
    async (values) => {
      try {
        const { error } = await supabase.auth.updateUser({ password: values.password })
        if (error) throw error
        passwordForm.reset({ password: "", confirmPassword: "" })
        toast.success("Mot de passe modifié.")
      } catch (err) {
        console.error("Failed to change password:", err)
        toast.error(err instanceof Error ? err.message : "Modification impossible.")
      }
    },
    (errors) =>
      focusFirstInvalidField(errors, ["password", "confirmPassword"], passwordForm.setFocus)
  )

  return (
    <div className="space-y-6">
      <Card className="border border-ink/10 bg-paper">
        <CardHeader>
          <CardTitle className="text-ink font-display font-semibold text-base">
            Mon compte
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="flex size-14 items-center justify-center overflow-hidden rounded-full bg-teal-100 font-display text-lg font-bold text-teal-950">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  getInitials(fullNameValue || user.name)
                )}
              </div>
              <Label
                htmlFor="avatar-upload"
                className="absolute -bottom-1 -right-1 flex size-6 cursor-pointer items-center justify-center rounded-full border-2 border-paper bg-teal-950 text-white transition-colors hover:bg-teal-900"
                title="Changer la photo"
              >
                <Camera className="size-3" />
              </Label>
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={handleAvatarSelect}
                disabled={profileForm.formState.isSubmitting}
                className="hidden"
              />
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-terracotta-600 text-white transition-colors hover:bg-terracotta-600/85"
                  title="Supprimer la photo"
                  aria-label="Supprimer la photo"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
            <div className="min-w-0 space-y-1">
              <p className="font-display font-semibold text-ink truncate">
                {fullNameValue || user.name}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">{roleLabel}</Badge>
              </div>
            </div>
          </div>

          {/* noValidate — see the matching comment in CollegeIdentitySection.tsx;
              the full-name field below carries `required`. */}
          <form onSubmit={handleSaveProfile} className="space-y-4 border-t border-ink/10 pt-5" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="profile-name" className="text-xs font-display font-medium text-ink">
                  Nom complet *
                </Label>
                <Input
                  id="profile-name"
                  {...profileForm.register("fullName")}
                  disabled={!loaded}
                  required
                  aria-invalid={!!profileForm.formState.errors.fullName}
                  className="border-ink/15 bg-paper text-ink text-sm"
                />
                {profileForm.formState.errors.fullName && (
                  <p className="text-xs text-negative font-medium">
                    {profileForm.formState.errors.fullName.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-phone" className="text-xs font-display font-medium text-ink">
                  Téléphone
                </Label>
                <Input
                  id="profile-phone"
                  {...profileForm.register("phone")}
                  disabled={!loaded}
                  placeholder="+225 07 00 00 00 00"
                  className="border-ink/15 bg-paper text-ink text-sm"
                />
              </div>
            </div>

            {/* Email changes are an auth-level operation with a verification
                flow — out of scope here, so it's shown as identity, not input. */}
            <div className="space-y-1.5">
              <Label className="text-xs font-display font-medium text-ink">Email</Label>
              <div className="flex items-center gap-2 rounded-md border border-ink/10 bg-teal-100/20 px-3 py-2">
                <Mail className="size-3.5 shrink-0 text-ink-soft" />
                <span className="truncate text-sm text-ink">{user.email}</span>
              </div>
              <p className="text-xs text-ink-soft">
                Contactez un administrateur pour changer votre adresse email.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={profileForm.formState.isSubmitting || !loaded}
                className="flex items-center gap-2 font-display"
              >
                <Save className="size-4" />
                {profileForm.formState.isSubmitting ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border border-ink/10 bg-paper">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-ink font-display font-semibold text-base">
            <ShieldCheck className="size-4 text-teal-950" />
            Sécurité
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-xs font-display font-medium text-ink">
                  Nouveau mot de passe *
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  {...passwordForm.register("password")}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  aria-invalid={!!passwordForm.formState.errors.password}
                  className="border-ink/15 bg-paper text-ink text-sm"
                />
                {passwordForm.formState.errors.password && (
                  <p className="text-xs text-negative font-medium">
                    {passwordForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="confirm-password"
                  className="text-xs font-display font-medium text-ink"
                >
                  Confirmer *
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  {...passwordForm.register("confirmPassword")}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  aria-invalid={!!passwordForm.formState.errors.confirmPassword}
                  className="border-ink/15 bg-paper text-ink text-sm"
                />
                {passwordForm.formState.errors.confirmPassword && (
                  <p className="text-xs text-negative font-medium">
                    {passwordForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
            </div>

            <PasswordChecklist password={passwordValue} />

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="outline"
                disabled={passwordForm.formState.isSubmitting || !passwordValue}
                className="flex items-center gap-2 font-display"
              >
                <KeyRound className="size-4" />
                {passwordForm.formState.isSubmitting ? "Modification…" : "Modifier le mot de passe"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border border-ink/10 bg-paper">
        <CardHeader className="border-b border-ink/10 pb-4">
          <CardTitle className="flex items-center gap-2 text-ink font-display font-semibold text-base">
            <Clock className="size-4 text-ink-soft" />
            Mon activité
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <ActivityFeed
            userId={user.id}
            className="max-h-[30rem]"
            emptyLabel="Vous n'avez encore enregistré aucune action."
          />
        </CardContent>
      </Card>
    </div>
  )
}
