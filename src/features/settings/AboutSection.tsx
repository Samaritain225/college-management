import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

// Kept deliberately accurate: the previous copy described the retired
// Tauri + libSQL architecture ("offline-first", "fonctionne sans connexion",
// "droits régis localement"), none of which is true post-Supabase migration.
// Claims about where data lives and how it's secured are the ones users
// actually rely on — see docs/refactor-plan.md for the current architecture.

export function AboutSection() {
  return (
    <Card className="border border-ink/10 bg-paper">
      <CardHeader>
        <CardTitle className="text-ink font-display font-semibold text-base">
          À propos de l'application
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-ink-soft leading-relaxed">
        <p>
          <strong className="text-ink font-display">Wagnon Budget</strong> assure le suivi
          transparent du budget du collège : contributions des investisseurs, dépenses et
          soldes, en remplacement du registre papier.
        </p>

        <h3 className="font-display font-semibold text-ink text-sm mt-4">
          Principes fondamentaux
        </h3>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong className="text-ink font-display">Écritures définitives</strong> : les
            opérations financières ne sont jamais modifiées ni supprimées. Une correction
            s'enregistre comme une nouvelle écriture qui annule la précédente, afin que
            l'historique reste vérifiable.
          </li>
          <li>
            <strong className="text-ink font-display">Montants calculés</strong> : parts
            d'associés, reliquats et totaux sont recalculés à partir des écritures à chaque
            consultation, jamais stockés — ils ne peuvent donc pas diverger du registre.
          </li>
          <li>
            <strong className="text-ink font-display">Accès selon le rôle</strong> : les
            droits de lecture et d'écriture sont appliqués par le serveur, pas par
            l'interface. Masquer un bouton ne suffit pas à autoriser une action.
          </li>
          <li>
            <strong className="text-ink font-display">Connexion requise</strong> : les
            données sont hébergées et synchronisées en ligne. Le fonctionnement hors
            connexion est prévu pour une version ultérieure.
          </li>
        </ul>

        <div className="border-t border-ink/10 pt-4 mt-6 flex justify-between text-xs text-ink-soft font-display">
          <span>Version {__APP_VERSION__}</span>
          <span>© {new Date().getFullYear()} Wagnon Budget</span>
        </div>
      </CardContent>
    </Card>
  )
}
