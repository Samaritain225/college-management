import React, { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Save, KeyRound, Mail, ShieldCheck, Camera, X } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { uploadFile, deleteFile, publicUrl } from "@/lib/uploads"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

const MIN_PASSWORD_LENGTH = 8
const MAX_AVATAR_BYTES = 2 * 1024 * 1024

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
  const { user } = useAuth()

  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [avatarKey, setAvatarKey] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)

  // Deferred like the college logo: nothing hits R2 until Save, so
  // selecting a photo then navigating away never orphans an upload.
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null)
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState<string | null>(null)
  const [avatarRemoved, setAvatarRemoved] = useState(false)
  const previewUrlRef = useRef<string | null>(null)

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)

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
        setFullName(data?.full_name ?? user.name)
        setPhone(data?.phone ?? "")
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

  function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast.error("Choisissez un fichier image (PNG ou JPG).")
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Image trop volumineuse. Choisissez un fichier de moins de 2 Mo.")
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

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    if (!fullName.trim()) {
      toast.error("Le nom est requis.")
      return
    }

    setSavingProfile(true)
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
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          avatar_key: nextAvatarKey,
        })
        .eq("id", user.id)
      if (error) throw error

      setAvatarKey(nextAvatarKey)
      toast.success("Profil mis à jour. Reconnectez-vous pour voir le nouveau nom partout.")

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
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`)
      return
    }
    if (password !== confirmPassword) {
      toast.error("Les deux mots de passe ne correspondent pas.")
      return
    }

    setSavingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setPassword("")
      setConfirmPassword("")
      toast.success("Mot de passe modifié.")
    } catch (err) {
      console.error("Failed to change password:", err)
      toast.error(err instanceof Error ? err.message : "Modification impossible.")
    } finally {
      setSavingPassword(false)
    }
  }

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
                  getInitials(fullName || user.name)
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
                disabled={savingProfile}
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
                {fullName || user.name}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">{roleLabel}</Badge>
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4 border-t border-ink/10 pt-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="profile-name" className="text-xs font-display font-medium text-ink">
                  Nom complet *
                </Label>
                <Input
                  id="profile-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={!loaded}
                  required
                  className="border-ink/15 bg-paper text-ink text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-phone" className="text-xs font-display font-medium text-ink">
                  Téléphone
                </Label>
                <Input
                  id="profile-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
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
                disabled={savingProfile || !loaded}
                className="flex items-center gap-2 font-display"
              >
                <Save className="size-4" />
                {savingProfile ? "Enregistrement…" : "Enregistrer"}
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="border-ink/15 bg-paper text-ink text-sm"
                />
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
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="border-ink/15 bg-paper text-ink text-sm"
                />
              </div>
            </div>

            <p className="text-xs text-ink-soft">
              Au moins {MIN_PASSWORD_LENGTH} caractères.
            </p>

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="outline"
                disabled={savingPassword || !password}
                className="flex items-center gap-2 font-display"
              >
                <KeyRound className="size-4" />
                {savingPassword ? "Modification…" : "Modifier le mot de passe"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
