import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Placeholder screen. Students, teachers and classes have no tables yet — that
// is Phase 7 — so this renders hardcoded rows to hold the shape of the page.

export function StudentsPage() {
  const [search, setSearch] = useState("")
  const students = [
    { name: "Kouassi Marc", class: "Terminale S", gender: "Garçon", parent: "M. Kouassi", id: "EL-092" },
    { name: "Diallo Mariam", class: "1ère ES", gender: "Fille", parent: "Mme. Diallo", id: "EL-103" },
    { name: "Kone Adama", class: "2nde A", gender: "Garçon", parent: "M. Kone", id: "EL-142" },
    { name: "N'guessan Marie", class: "3ème A", gender: "Fille", parent: "M. N'guessan", id: "EL-188" },
    { name: "Traoré Ibrahim", class: "4ème B", gender: "Garçon", parent: "Mme. Traoré", id: "EL-203" },
    { name: "Bamba Alima", class: "5ème A", gender: "Fille", parent: "M. Bamba", id: "EL-245" },
  ]
  const filtered = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.class.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold text-ink">Registre des Élèves</h2>
          <p className="text-xs text-ink-soft">Liste des élèves inscrits dans l'établissement.</p>
        </div>
        <Input
          placeholder="Rechercher un élève..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-9 rounded-md border-ink/15 text-xs bg-paper text-ink"
        />
      </div>
      <div className="rounded-md border border-ink/10 bg-paper overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-ink/10">
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Matricule</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Nom</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Classe</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Genre</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft text-right">Parent / Tuteur</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s, i) => (
              <TableRow key={i} className="border-b border-ink/10 last:border-0 hover:bg-teal-100/30">
                <TableCell className="text-xs font-sans font-bold text-ink">{s.id}</TableCell>
                <TableCell className="text-xs font-display font-semibold text-ink">{s.name}</TableCell>
                <TableCell className="text-xs text-ink-soft">{s.class}</TableCell>
                <TableCell className="text-xs text-ink-soft">{s.gender}</TableCell>
                <TableCell className="text-xs text-right text-ink-soft">{s.parent}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
