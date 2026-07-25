import React, { useEffect, useState } from "react"
import { toast } from "sonner"
import { Upload, X, Save, Building, Calendar, Phone, MapPin, Lock } from "lucide-react"
import { useSettings } from "@/lib/settings"
import { compressImage } from "@/lib/image"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// The logo is persisted as a base64 data URL in localStorage, which shares a
// ~5 MB quota with everything else stored there. Compressing on upload keeps
// a phone photo in the tens-of-KB range instead of silently blowing the quota
// (settings.tsx only console.errors a failed write, so an oversized logo used
// to look like it saved and didn't).
const MAX_LOGO_BYTES = 2 * 1024 * 1024

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
    collegeAddress,
    collegePhone,
    academicYear,
    updateSettings,
  } = useSettings()

  const [name, setName] = useState(collegeName)
  const [logo, setLogo] = useState<string | null>(collegeLogo)
  const [address, setAddress] = useState(collegeAddress)
  const [phone, setPhone] = useState(collegePhone)
  const [year, setYear] = useState(academicYear)
  const [uploading, setUploading] = useState(false)

  // Re-seed if the stored settings change from elsewhere; local edits win
  // while the form is dirty, so this only ever syncs a clean form.
  useEffect(() => {
    setName(collegeName)
    setLogo(collegeLogo)
    setAddress(collegeAddress)
    setPhone(collegePhone)
    setYear(academicYear)
  }, [collegeName, collegeLogo, collegeAddress, collegePhone, academicYear])

  const hasChanges =
    name !== collegeName ||
    logo !== collegeLogo ||
    address !== collegeAddress ||
    phone !== collegePhone ||
    year !== academicYear

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-selecting the same file after an error
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast.error("Choisissez un fichier image (PNG ou JPG).")
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Image trop volumineuse. Choisissez un fichier de moins de 2 Mo.")
      return
    }

    setUploading(true)
    try {
      const compressed = await compressImage(file, { maxDimension: 512, quality: 0.85 })
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(compressed)
      })
      setLogo(dataUrl)
    } catch (err) {
      console.error("Logo compression failed:", err)
      toast.error("Impossible de traiter cette image. Essayez un autre fichier.")
    } finally {
      setUploading(false)
    }
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error("Le nom du collège est requis.")
      return
    }
    try {
      updateSettings({
        collegeName: name.trim(),
        collegeLogo: logo,
        collegeAddress: address.trim(),
        collegePhone: phone.trim(),
        academicYear: year.trim(),
      })
      toast.success("Paramètres enregistrés.")
    } catch (err) {
      console.error("Failed to save settings:", err)
      toast.error("Enregistrement impossible. Le logo est peut-être trop lourd.")
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <Card className="border border-ink/10 bg-paper">
        <CardHeader>
          <CardTitle className="text-ink font-display font-semibold text-base">
            Identité visuelle
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ink/15 bg-teal-100/30">
              {logo ? (
                <>
                  <img src={logo} alt="Logo du collège" className="h-full w-full object-contain p-2" />
                  <button
                    type="button"
                    onClick={() => setLogo(null)}
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
                  {uploading ? "Traitement…" : "Choisir un fichier"}
                </div>
              </Label>
              <input
                id="logo-upload"
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                disabled={uploading}
                className="hidden"
              />
              <p className="text-xs text-ink-soft">
                PNG ou JPG carré, 2 Mo maximum. L'image est compressée automatiquement.
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Collège Moderne de Bouaké"
              className="border-ink/15 bg-paper text-ink text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="academic-year" className="text-xs font-display font-medium text-ink">
                Année académique
              </Label>
              <Input
                id="academic-year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
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
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
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
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ex. Quartier Commerce, Rue des Banques, Bouaké"
              className="border-ink/15 bg-paper text-ink text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Only appears once there's something to save — no permanently-greyed button. */}
      {hasChanges && (
        <div className="sticky bottom-0 flex items-center justify-end gap-3 rounded-lg border border-ink/10 bg-paper/95 p-3 backdrop-blur-none">
          <span className="mr-auto text-xs text-ink-soft">Modifications non enregistrées</span>
          <Button type="submit" disabled={uploading} className="flex items-center gap-2 font-display">
            <Save className="size-4" />
            Enregistrer
          </Button>
        </div>
      )}
    </form>
  )
}

export function CollegeIdentitySection({ canEdit }: { canEdit: boolean }) {
  return canEdit ? <EditableIdentity /> : <ReadOnlyIdentity />
}
