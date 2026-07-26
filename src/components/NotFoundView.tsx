import { Compass } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Runtime safety net for an unrecognized tab/route — never expected given
 * the closed `Tab` union, but state can outlive the code that produced it
 * (e.g. a stale value restored from somewhere), so this replaces silently
 * rendering nothing. */
export function NotFoundView({ onGoHome }: { onGoHome: () => void }) {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-teal-950">
        <Compass className="size-5" />
      </div>
      <p className="font-display font-semibold text-ink">Page introuvable</p>
      <p className="max-w-sm text-sm text-ink-soft">
        Cette section n'existe pas ou plus. Retournez au tableau de bord pour continuer.
      </p>
      <Button onClick={onGoHome} className="mt-1 font-display">
        Retour au tableau de bord
      </Button>
    </div>
  )
}
