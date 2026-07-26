import { Compass } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"

/** The catch-all route. Reachable for real now that URLs are typed by hand
 * and shared, where before it was only a guard against a stale tab value. */
export function NotFoundView() {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-teal-950">
        <Compass className="size-5" />
      </div>
      <p className="font-display font-semibold text-ink">Page introuvable</p>
      <p className="max-w-sm text-sm text-ink-soft">
        Cette section n'existe pas ou plus. Retournez au tableau de bord pour continuer.
      </p>
      <Button asChild className="mt-1 font-display">
        <Link to="/">Retour au tableau de bord</Link>
      </Button>
    </div>
  )
}
