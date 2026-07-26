import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Placeholder screen. Students, teachers and classes have no tables yet — that
// is Phase 7 — so this renders hardcoded rows to hold the shape of the page.

export function ClassesPage() {
  const [search, setSearch] = useState("")
  const classes = [
    { name: "Terminale S", count: 35, headTeacher: "M. Jean Dupuis", level: "Lycée" },
    { name: "1ère ES", count: 32, headTeacher: "Mme. Sophie Martin", level: "Lycée" },
    { name: "2nde A", count: 38, headTeacher: "M. Paul Koffi", level: "Lycée" },
    { name: "3ème A", count: 42, headTeacher: "Mme. Amélie N'guessan", level: "Collège" },
    { name: "4ème B", count: 40, headTeacher: "M. David Traoré", level: "Collège" },
  ]
  const filtered = classes.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.headTeacher.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold text-ink">Gestion des Classes</h2>
          <p className="text-xs text-ink-soft">Liste des classes et professeurs principaux.</p>
        </div>
        <Input
          placeholder="Rechercher une classe..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-9 rounded-md border-ink/15 text-xs bg-paper text-ink"
        />
      </div>
      <div className="rounded-md border border-ink/10 bg-paper overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-ink/10">
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Nom de la classe</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Niveau</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Professeur Principal</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft text-right">Effectif</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c, i) => (
              <TableRow key={i} className="border-b border-ink/10 last:border-0 hover:bg-teal-100/30">
                <TableCell className="text-xs font-display font-semibold text-ink">{c.name}</TableCell>
                <TableCell className="text-xs text-ink-soft">{c.level}</TableCell>
                <TableCell className="text-xs text-ink-soft">{c.headTeacher}</TableCell>
                <TableCell className="text-xs text-right font-sans font-semibold text-ink">{c.count} élèves</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
