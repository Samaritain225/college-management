import React, { useEffect, useState } from "react"
import { listInvestors, addInvestor, type Investor } from "@/db/queries"
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
import { UserPlus } from "lucide-react"

export function UsersPage() {
  const [users, setUsers] = useState<Investor[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [role, setRole] = useState<"admin" | "investor">("investor")
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function loadUsers() {
    try {
      const data = await listInvestors()
      setUsers(data)
    } catch (err) {
      console.error("Failed to load users:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) return setError("Le nom est requis.")
    if (pin && !/^\d{4}$/.test(pin)) return setError("Le code PIN doit comporter exactement 4 chiffres.")

    setSubmitting(true)
    try {
      await addInvestor({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        role,
        pin: pin || undefined,
        agreedContribution: 0,
      })

      // Reset form
      setName("")
      setEmail("")
      setPhone("")
      setRole("investor")
      setPin("")
      setShowForm(false)
      await loadUsers()
    } catch (err) {
      console.error("Failed to add user:", err)
      setError("Erreur lors de la création de l'utilisateur.")
    } finally {
      setSubmitting(false)
    }
  }

  const totalUsers = users.length
  const totalAdmins = users.filter((u) => u.role === "admin").length
  const totalInvestors = users.filter((u) => u.role === "investor").length

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8 text-muted-foreground">
        Chargement des utilisateurs…
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="font-sans text-2xl font-bold tracking-tight text-foreground">
            Utilisateurs & Permissions
          </h1>
          <p className="text-sm text-muted-foreground">
            {totalUsers} {totalUsers > 1 ? "membres" : "membre"} enregistrés
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-2">
          <UserPlus className="size-4" />
          {showForm ? "Annuler" : "Nouvel utilisateur"}
        </Button>
      </header>

      {/* User Creation Form */}
      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-foreground font-semibold text-base">Créer un utilisateur</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-name">Nom complet *</Label>
                <Input
                  id="user-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex. Koné Amadou"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-email">Email (facultatif)</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Ex. amadou@wagnon.ci"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-phone">Téléphone (facultatif)</Label>
                <Input
                  id="user-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ex. +225 07 00 00 00 00"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-role">Rôle</Label>
                <Select value={role} onValueChange={(val) => setRole(val as "admin" | "investor")}>
                  <SelectTrigger id="user-role" className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrateur (lecture / écriture)</SelectItem>
                    <SelectItem value="investor">Investisseur (lecture seule)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-pin">Code PIN de sécurité (4 chiffres)</Label>
                <Input
                  id="user-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Ex. 1234 (optionnel)"
                />
              </div>
              <div className="flex flex-col gap-1.5 justify-end">
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? "Enregistrement…" : "Enregistrer l'utilisateur"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Utilisateurs Totaux</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-sans text-2xl font-bold text-foreground">{totalUsers}</p>
            <p className="text-xs text-muted-foreground mt-1">Personnes enregistrées dans la base</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Administrateurs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-sans text-2xl font-bold text-foreground">{totalAdmins}</p>
            <p className="text-xs text-muted-foreground mt-1">Droits d'écriture (dépenses & contributions)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Investisseurs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-sans text-2xl font-bold text-foreground">{totalInvestors}</p>
            <p className="text-xs text-muted-foreground mt-1">Accès en lecture seule au tableau de bord</p>
          </CardContent>
        </Card>
      </div>

      {/* Users Data Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground font-semibold text-base">Membres du collège</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>Date d'inscription</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium text-foreground">{user.name}</TableCell>
                  <TableCell>
                    {user.role === "admin" ? (
                      <Badge variant="positive">Administrateur</Badge>
                    ) : (
                      <Badge variant="neutral">Investisseur</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{user.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(user.joined_at).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
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
