import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Placeholder screen. Students, teachers and classes have no tables yet — that
// is Phase 7 — so this renders hardcoded rows to hold the shape of the page.

export function TeachersPage() {
  const [search, setSearch] = useState("")
  const teachers = [
    { name: "M. Jean Dupuis", subject: "Mathématiques", gender: "Homme", email: "j.dupuis@college.edu", status: "Actif" },
    { name: "Mme. Sophie Martin", subject: "Physique-Chimie", gender: "Femme", email: "s.martin@college.edu", status: "Actif" },
    { name: "M. Paul Koffi", subject: "Français", gender: "Homme", email: "p.koffi@college.edu", status: "Actif" },
    { name: "Mme. Amélie N'guessan", subject: "SVT", gender: "Femme", email: "a.nguessan@college.edu", status: "Actif" },
    { name: "M. David Traoré", subject: "Histoire-Géo", gender: "Homme", email: "d.traore@college.edu", status: "Actif" },
    { name: "Mme. Fatou Diallo", subject: "Anglais", gender: "Femme", email: "f.diallo@college.edu", status: "Inactif" },
  ]
  const filtered = teachers.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold text-ink">Corps Enseignant</h2>
          <p className="text-xs text-ink-soft">Liste des enseignants et leurs spécialités.</p>
        </div>
        <Input
          placeholder="Rechercher un enseignant..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-9 rounded-md border-ink/15 text-xs bg-paper text-ink"
        />
      </div>
      <div className="rounded-md border border-ink/10 bg-paper overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-ink/10">
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Nom</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Matière</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Genre</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Email</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft text-right">Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t, i) => (
              <TableRow key={i} className="border-b border-ink/10 last:border-0 hover:bg-teal-100/30">
                <TableCell className="text-xs font-display font-semibold text-ink">{t.name}</TableCell>
                <TableCell className="text-xs text-ink-soft">{t.subject}</TableCell>
                <TableCell className="text-xs text-ink-soft">{t.gender}</TableCell>
                <TableCell className="text-xs text-ink-soft font-sans">{t.email}</TableCell>
                <TableCell className="text-xs text-right">
                  <Badge variant={t.status === "Actif" ? "positive" : "negative"}>{t.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
