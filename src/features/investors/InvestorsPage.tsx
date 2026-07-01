import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
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
import { Badge } from "@/components/ui/badge"
import { formatMoney } from "@/lib/utils"
import { useActiveUser } from "@/lib/active-user"
import { addInvestor, getInvestorStandings, type InvestorStanding } from "@/db/queries"

export function InvestorsPage({ onChange }: { onChange?: () => void }) {
  const { activeUser } = useActiveUser()
  const [standings, setStandings] = useState<InvestorStanding[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [contribution, setContribution] = useState("")
  const [role, setRole] = useState<"admin" | "investor">("investor")
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setStandings(await getInvestorStandings())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const amount = Number(contribution.replace(/\D/g, ""))
    if (!name.trim()) return setError("Veuillez saisir un nom.")
    if (!amount || amount <= 0) return setError("Veuillez saisir le montant de la contribution convenue.")
    if (pin && !/^\d{4}$/.test(pin)) return setError("Le code PIN de sécurité doit comporter exactement 4 chiffres.")

    await addInvestor({
      name: name.trim(),
      phone: phone.trim() || undefined,
      role,
      pin: pin || undefined,
      agreedContribution: amount,
      addedBy: activeUser?.id,
    })

    setName("")
    setPhone("")
    setContribution("")
    setRole("investor")
    setPin("")
    setShowForm(false)
    await refresh()
    onChange?.()
  }

  const totalPool = standings.reduce((sum, s) => sum + s.agreed_contribution, 0)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Investisseurs</h1>
          <p className="text-sm text-ink-soft">
            {standings.length} {standings.length > 1 ? "investisseurs" : "investisseur"} · fonds total {formatMoney(totalPool)}
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Annuler" : "Ajouter un investisseur"}
        </Button>
      </header>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Nouvel investisseur</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Nom complet</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">Téléphone (facultatif)</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contribution">Contribution convenue (XOF)</Label>
                <Input
                  id="contribution"
                  inputMode="numeric"
                  value={contribution}
                  onChange={(e) => setContribution(e.target.value)}
                  placeholder="2 500 000"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="role">Rôle</Label>
                <Select value={role} onValueChange={(val) => setRole(val as "admin" | "investor")}>
                  <SelectTrigger id="role" className="h-10 w-full bg-white border-ink/15 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="investor">Investisseur (lecture seule)</SelectItem>
                    <SelectItem value="admin">Administrateur (peut saisir les dépenses)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pin">Code PIN de sécurité (4 chiffres)</Label>
                <Input
                  id="pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Ex. 1234 (optionnel)"
                />
              </div>
              {error && <p className="sm:col-span-2 text-sm text-negative">{error}</p>}
              <div className="sm:col-span-2">
                <Button type="submit">Enregistrer l'investisseur</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-ink-soft">
                <th className="pb-2 font-display font-medium">Nom</th>
                <th className="pb-2 font-display font-medium">Rôle</th>
                <th className="pb-2 font-display font-medium text-right">Convenu</th>
                <th className="pb-2 font-display font-medium text-right">Payé</th>
                <th className="pb-2 font-display font-medium text-right">Dû</th>
                <th className="pb-2 font-display font-medium text-right">Part</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => (
                <tr key={s.id} className="border-b border-ink/5 last:border-0">
                  <td className="py-2.5">{s.name}</td>
                  <td className="py-2.5">
                    <Badge variant={s.role === "admin" ? "accent" : "neutral"}>
                      {s.role === "admin" ? "Administrateur" : "Investisseur"}
                    </Badge>
                  </td>
                  <td className="py-2.5 text-right">{formatMoney(s.agreed_contribution)}</td>
                  <td className="py-2.5 text-right">{formatMoney(s.paid)}</td>
                  <td className="py-2.5 text-right">
                    {s.owed > 0 ? (
                      <span className="text-negative">{formatMoney(s.owed)}</span>
                    ) : (
                      <Badge variant="positive">Payé en totalité</Badge>
                    )}
                  </td>
                  <td className="py-2.5 text-right">{s.ownership_pct.toFixed(1)}%</td>
                </tr>
              ))}
              {standings.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <img
                        src="/empty-state.png"
                        alt="Aucun investisseur"
                        className="h-32 w-32 object-contain mb-4 rounded-xl opacity-80"
                      />
                      <p className="text-sm font-medium text-foreground">Aucun investisseur pour le moment.</p>
                      <p className="text-xs text-muted-foreground mt-1">Ajoutez le premier investisseur en utilisant le formulaire ci-dessus.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
