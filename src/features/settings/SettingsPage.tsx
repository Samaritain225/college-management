import React, { useState } from "react"
import { useSettings } from "@/lib/settings"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { UsersPage } from "@/features/users/UsersPage"
import {
  Upload,
  X,
  Save,
  Info,
  Building,
  UserCog,
  Sun,
} from "lucide-react"

export function SettingsPage() {
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
  const [success, setSuccess] = useState(false)

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setLogo(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    updateSettings({
      collegeName: name,
      collegeLogo: logo,
      collegeAddress: address,
      collegePhone: phone,
      academicYear: year,
    })
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  const hasChanges =
    name !== collegeName ||
    logo !== collegeLogo ||
    address !== collegeAddress ||
    phone !== collegePhone ||
    year !== academicYear

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
          Paramètres
        </h1>
        <p className="text-sm text-ink-soft">
          Gérez l'identité du collège, les utilisateurs & permissions, et l'apparence de l'application
        </p>
      </header>

      <Tabs defaultValue="info" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="info" className="flex items-center gap-2">
            <Building className="size-4" />
            <span className="hidden sm:inline">Identité</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center gap-2">
            <Sun className="size-4" />
            <span className="hidden sm:inline">Apparence</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <UserCog className="size-4" />
            <span className="hidden sm:inline">Utilisateurs</span>
          </TabsTrigger>
          <TabsTrigger value="about" className="flex items-center gap-2">
            <Info className="size-4" />
            <span className="hidden sm:inline">À Propos</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: College Info */}
        <TabsContent value="info">
          <form onSubmit={handleSave} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground font-semibold text-base">Identité Visuelle</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  {/* Logo Preview */}
                  <div className="relative flex h-24 w-24 items-center justify-center rounded-xl border border-border bg-slate-50 dark:bg-slate-900 overflow-hidden shadow-inner">
                    {logo ? (
                      <>
                        <img src={logo} alt="College Logo" className="h-full w-full object-contain p-2" />
                        <button
                          type="button"
                          onClick={() => setLogo(null)}
                          className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-white shadow-xs hover:bg-destructive/90 transition-colors"
                          title="Supprimer le logo"
                        >
                          <X className="size-3" />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-ink-soft font-sans">Pas de logo</span>
                    )}
                  </div>

                  {/* Upload Action */}
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="logo-upload" className="cursor-pointer">
                      <div className="inline-flex items-center justify-center gap-2 rounded-lg border border-ink/15 bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-teal-100/50 transition-colors font-display">
                        <Upload className="size-4 text-ink-soft" />
                        Choisir un fichier
                      </div>
                    </Label>
                    <input
                      id="logo-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <p className="text-xs text-muted-foreground">
                      Format recommandé : PNG ou JPG carré, max 2 Mo
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-foreground font-semibold text-base">Informations Générales</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="college-name">Nom du Collège</Label>
                  <Input
                    id="college-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex. Collège Moderne de Bouaké"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="academic-year">Année Académique</Label>
                    <Input
                      id="academic-year"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      placeholder="Ex. 2025 - 2026"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="college-phone">Téléphone</Label>
                    <Input
                      id="college-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Ex. +225 07 00 00 00 00"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="college-address">Adresse Physique</Label>
                  <Input
                    id="college-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ex. Quartier Commerce, Rue des Banques, Bouaké"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-4">
              {success && (
                <span className="text-sm font-medium text-green-600 transition-all animate-in fade-in">
                  Paramètres enregistrés avec succès !
                </span>
              )}
              <Button type="submit" disabled={!hasChanges} className="flex items-center gap-2">
                <Save className="size-4" />
                Enregistrer
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* Tab 2: Appearance & Theme Toggle */}
        <TabsContent value="appearance">
          <form onSubmit={handleSave} className="space-y-6">
            <Card className="border border-ink/10 bg-paper">
              <CardHeader>
                <CardTitle className="text-ink font-display font-semibold text-base">Thème de l'application</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-ink-soft">
                  Thème visuel basé sur la charte graphique officielle du collège.
                </p>
                <div className="flex gap-4">
                  <div
                    className="flex flex-1 flex-col items-center gap-3 rounded-xl border border-teal-950 bg-teal-100/50 p-4 text-center"
                  >
                    <Sun className="size-6 text-terracotta-600" />
                    <div className="space-y-1">
                      <p className="text-sm font-display font-semibold text-ink">Thème Officiel (Clair)</p>
                      <p className="text-xs text-ink-soft">Couleurs Teal &amp; Terracotta</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-4">
              {success && (
                <span className="text-sm font-medium text-positive transition-all animate-in fade-in">
                  Thème enregistré avec succès !
                </span>
              )}
              <Button type="submit" disabled={!hasChanges} className="flex items-center gap-2 font-display">
                <Save className="size-4" />
                Enregistrer
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* Tab 3: Consolidated Users Management Section */}
        <TabsContent value="users">
          <div className="border border-ink/10 rounded-xl bg-paper p-2 sm:p-4">
            <UsersPage />
          </div>
        </TabsContent>

        {/* Tab 4: About Section */}
        <TabsContent value="about">
          <Card className="border border-ink/10 bg-paper">
            <CardHeader>
              <CardTitle className="text-ink font-display font-semibold text-base">À Propos de l'Application</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-ink-soft leading-relaxed">
              <p>
                <strong className="text-ink font-display">Wagnon Budget</strong> est un système local et offline-first conçu pour suivre en toute transparence le budget, les contributions des investisseurs, et les dépenses du collège.
              </p>
              <h3 className="font-display font-semibold text-ink text-sm mt-4">Principes Fondamentaux :</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong className="text-ink font-display">Offline-First</strong> : L'application fonctionne intégralement sans connexion Internet. Elle synchronise les données de manière opportuniste dès qu'un réseau est disponible.
                </li>
                <li>
                  <strong className="text-ink font-display">Transactions Immuables</strong> : Pour des raisons de traçabilité et de synchronisation multi-appareils sans conflit, toutes les opérations financières sont en ajout seul (append-only). Aucune modification ou suppression directe n'est effectuée sur les transactions validées.
                </li>
                <li>
                  <strong className="text-ink font-display">Sécurité Locale</strong> : Les droits d'écriture et de lecture sont régis localement selon le rôle de l'utilisateur actif.
                </li>
              </ul>
              <div className="border-t border-ink/10 pt-4 mt-6 flex justify-between text-xs text-ink-soft font-display">
                <span>Version 1.0.0</span>
                <span>© {new Date().getFullYear()} Wagnon Budget</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
