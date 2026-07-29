import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Upload, X, Save, Building, Calendar, Phone, MapPin, Lock } from "lucide-react"
import { useSettings } from "@/lib/settings"
import { uploadFile, deleteFile, validateUpload } from "@/lib/uploads"
import { focusFirstInvalidField } from "@/lib/formFocus"
import { collegeIdentitySchema, type CollegeIdentityFormValues } from "./collegeIdentitySchema"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** Read-only presentation for roles that can't edit — deliberately a summary,
 *  not a disabled form, so nothing suggests an action they can't take. */
function ReadOnlyIdentity() {
  const { collegeName, collegeLogo, collegeAddress, collegePhone, academicYear } = useSettings()

  const rows = [
    { icon: Building, label: "Nom du collège", value: collegeName },
    { icon: Calendar, label: "Année académique", value: academicYear },
    { icon: Phone, label: "Téléphone", value: collegePhone },
    { icon: MapPin, label: "Adresse", value: collegeAddress },
  ]

  return (
    <Card className="border border-ink/10 bg-paper">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-ink font-display font-semibold text-base">
          Informations du collège
        </CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-ink-soft font-display">
          <Lock className="size-3.5" />
          Lecture seule
        </span>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ink/15 bg-teal-100/30">
            {collegeLogo ? (
              <img src={collegeLogo} alt="" className="h-full w-full object-contain p-1.5" />
            ) : (
              <span className="font-display text-xl font-bold text-teal-950">
                {collegeName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-display text-lg font-bold text-ink truncate">{collegeName}</p>
            <p className="text-xs text-ink-soft">{academicYear || "Année non renseignée"}</p>
          </div>
        </div>

        <dl className="divide-y divide-ink/5 border-t border-ink/10">
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start justify-between gap-4 py-2.5">
              <dt className="flex items-center gap-2 text-xs font-display font-medium text-ink-soft">
                <Icon className="size-3.5 shrink-0" />
                {label}
              </dt>
              <dd className="text-xs text-ink text-right break-words">
                {value || <span className="text-ink-soft">—</span>}
              </dd>
            </div>
          ))}
        </dl>

        <p className="text-xs text-ink-soft">
          Contactez un administrateur pour corriger ces informations.
        </p>
      </CardContent>
    </Card>
  )
}

function EditableIdentity() {
  const {
    collegeName,
    collegeLogo,
    collegeLogoKey,
    collegeAddress,
    collegePhone,
    academicYear,
    updateSettings,
  } = useSettings()

  const form = useForm<CollegeIdentityFormValues>({
    resolver: zodResolver(collegeIdentitySchema),
    mode: "onTouched",
    defaultValues: {
      name: collegeName,
      address: collegeAddress,
      phone: collegePhone,
      academicYear: academicYear,
    },
  })

  // The new logo isn't uploaded to R2 until Save — selecting a file, then
  // hitting Annuler/navigating away, should never leave an orphaned object
  // in the bucket with nothing pointing at it.
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null)
  const [pendingLogoPreview, setPendingLogoPreview] = useState<string | null>(null)
  const [logoRemoved, setLogoRemoved] = useState(false)
  const [saving, setSaving] = useState(false)
  const previewUrlRef = useRef<string | null>(null)

  // Re-seed if the stored settings change from elsewhere; local edits win
  // while the form is dirty, so this only ever syncs a clean form.
  useEffect(() => {
    form.reset({
      name: collegeName,
      address: collegeAddress,
      phone: collegePhone,
      academicYear: academicYear,
    })
    setPendingLogoFile(null)
    setPendingLogoPreview(null)
    setLogoRemoved(false)
  }, [collegeName, collegeLogoKey, collegeAddress, collegePhone, academicYear])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  const displayedLogo = logoRemoved ? null : pendingLogoPreview ?? collegeLogo

  const hasChanges = form.formState.isDirty || pendingLogoFile !== null || logoRemoved

  function handleLogoSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-selecting the same file after an error
    if (!file) return

    const err = validateUpload(file, "logo")
    if (err) {
      toast.error(err)
      return
    }

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const preview = URL.createObjectURL(file)
    previewUrlRef.current = preview

    setPendingLogoFile(file)
    setPendingLogoPreview(preview)
    setLogoRemoved(false)
  }

  function handleRemoveLogo() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPendingLogoFile(null)
    setPendingLogoPreview(null)
    setLogoRemoved(true)
  }

  const handleSave = form.handleSubmit(
    async (values) => {
      setSaving(true)
      const previousLogoKey = collegeLogoKey

      try {
        let nextLogoKey = collegeLogoKey
        if (pendingLogoFile) {
          nextLogoKey = await uploadFile(pendingLogoFile, "logo")
        } else if (logoRemoved) {
          nextLogoKey = null
        }

        await updateSettings({
          collegeName: values.name.trim(),
          collegeLogoKey: nextLogoKey,
          collegeAddress: values.address?.trim() || "",
          collegePhone: values.phone?.trim() || "",
          academicYear: values.academicYear?.trim() || "",
        })

        toast.success("Paramètres enregistrés.")

        // Only remove the old object once the row pointing at the new one has
        // safely committed — never the other way around. Best-effort: a
        // failure here leaves an orphaned object, not a broken save.
        if (previousLogoKey && previousLogoKey !== nextLogoKey) {
          deleteFile(previousLogoKey, "logo").catch((err) =>
            console.warn("Failed to delete previous logo from R2:", err)
          )
        }

        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current)
          previewUrlRef.current = null
        }
        setPendingLogoFile(null)
        setPendingLogoPreview(null)
        setLogoRemoved(false)
      } catch (err) {
        console.error("Failed to save settings:", err)
        toast.error(err instanceof Error ? err.message : "Enregistrement impossible.")
      } finally {
        setSaving(false)
      }
    },
    (errors) => focusFirstInvalidField(errors, ["name", "address", "phone", "academicYear"], form.setFocus)
  )

  return (
    // noValidate: the college-name field below carries `required`, and
    // without this the browser blocks submission natively before
    // `handleSave` ever runs — the zod error it would show would be
    // unreachable for an empty field. Same failure diagnosed and fixed on
    // UsersPage's two forms; see the comment there for how it was confirmed.
    <form onSubmit={handleSave} className="space-y-6" noValidate>
      <Card className="border border-ink/10 bg-paper">
        <CardHeader>
          <CardTitle className="text-ink font-display font-semibold text-base">
            Identité visuelle
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ink/15 bg-teal-100/30">
              {displayedLogo ? (
                <>
                  <img
                    src={displayedLogo}
                    alt="Logo du collège"
                    className="h-full w-full object-contain p-2"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-terracotta-600 text-white transition-colors hover:bg-terracotta-600/85"
                    title="Supprimer le logo"
                    aria-label="Supprimer le logo"
                  >
                    <X className="size-3" />
                  </button>
                </>
              ) : (
                <span className="text-xs text-ink-soft">Pas de logo</span>
              )}
            </div>

            <div className="flex-1 space-y-2">
              <Label htmlFor="logo-upload" className="cursor-pointer">
                <div className="inline-flex items-center justify-center gap-2 rounded-lg border border-ink/15 bg-paper px-4 py-2 font-display text-sm font-medium text-ink transition-colors hover:bg-teal-100/50">
                  <Upload className="size-4 text-ink-soft" />
                  Choisir un fichier
                </div>
              </Label>
              <input
                id="logo-upload"
                type="file"
                accept="image/*"
                onChange={handleLogoSelect}
                disabled={saving}
                className="hidden"
              />
              <p className="text-xs text-ink-soft">
                PNG ou JPG carré, 2 Mo maximum. Envoyé lors de l'enregistrement.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-ink/10 bg-paper">
        <CardHeader>
          <CardTitle className="text-ink font-display font-semibold text-base">
            Informations générales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="college-name" className="text-xs font-display font-medium text-ink">
              Nom du collège *
            </Label>
            <Input
              id="college-name"
              {...form.register("name")}
              placeholder="Ex. Collège Moderne de Bouaké"
              aria-invalid={!!form.formState.errors.name}
              className="border-ink/15 bg-paper text-ink text-sm"
              required
            />
            {form.formState.errors.name && (
              <p className="text-xs text-negative font-medium">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="academic-year" className="text-xs font-display font-medium text-ink">
                Année académique
              </Label>
              <Input
                id="academic-year"
                {...form.register("academicYear")}
                placeholder="Ex. 2025 - 2026"
                className="border-ink/15 bg-paper text-ink text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="college-phone" className="text-xs font-display font-medium text-ink">
                Téléphone
              </Label>
              <Input
                id="college-phone"
                {...form.register("phone")}
                placeholder="Ex. +225 07 00 00 00 00"
                className="border-ink/15 bg-paper text-ink text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="college-address" className="text-xs font-display font-medium text-ink">
              Adresse physique
            </Label>
            <Input
              id="college-address"
              {...form.register("address")}
              placeholder="Ex. Quartier Commerce, Rue des Banques, Bouaké"
              className="border-ink/15 bg-paper text-ink text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Only appears once there's something to save — no permanently-greyed button. */}
      {hasChanges && (
        <div className="sticky bottom-0 flex items-center justify-end gap-3 rounded-lg border border-ink/10 bg-paper/95 p-3">
          <span className="mr-auto text-xs text-ink-soft">Modifications non enregistrées</span>
          <Button type="submit" disabled={saving} className="flex items-center gap-2 font-display">
            <Save className="size-4" />
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      )}
    </form>
  )
}

export function CollegeIdentitySection({ canEdit }: { canEdit: boolean }) {
  return canEdit ? <EditableIdentity /> : <ReadOnlyIdentity />
}
