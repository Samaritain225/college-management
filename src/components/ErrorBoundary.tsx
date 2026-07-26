import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

// A failed dynamic import (React.lazy) throws a plain Error whose message
// varies by bundler/browser but always references the module fetch itself.
// Distinguishing it matters: a stale chunk needs a full reload (new HTML +
// asset manifest), while a real render bug just needs the subtree reset.
const CHUNK_LOAD_ERROR_RE = /dynamically imported module|loading chunk|failed to fetch/i

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error in app shell:", error, info)
  }

  handleRetry = () => {
    if (this.state.error && CHUNK_LOAD_ERROR_RE.test(this.state.error.message)) {
      window.location.reload()
      return
    }
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const isChunkError = CHUNK_LOAD_ERROR_RE.test(error.message)

    return (
      <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-negative-bg text-negative">
          <AlertTriangle className="size-5" />
        </div>
        <p className="font-display font-semibold text-ink">
          {isChunkError ? "Impossible de charger cette page" : "Une erreur est survenue"}
        </p>
        <p className="max-w-sm text-sm text-ink-soft">
          {isChunkError
            ? "Votre connexion a peut-être été interrompue pendant le chargement. Rechargez la page pour réessayer."
            : "Quelque chose s'est mal passé de notre côté. Vous pouvez réessayer."}
        </p>
        <Button onClick={this.handleRetry} className="mt-1 font-display">
          {isChunkError ? "Recharger la page" : "Réessayer"}
        </Button>
      </div>
    )
  }
}
