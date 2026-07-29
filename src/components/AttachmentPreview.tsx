import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { ExternalLink, FileQuestion } from "lucide-react"
import { useEffect, useState } from "react"

type AttachmentKind = "image" | "pdf" | "unknown"
type PreviewState = "loading" | "ready" | "error"

interface AttachmentPreviewProps {
  url: string
  objectKey: string
  alt: string
}

function attachmentKind(objectKey: string): AttachmentKind {
  const extension = objectKey.split(".").pop()?.toLowerCase()
  if (extension && ["jpg", "jpeg", "png", "webp"].includes(extension)) return "image"
  if (extension === "pdf") return "pdf"
  return "unknown"
}

function attachmentName(objectKey: string): string {
  return objectKey.split("/").pop() || "Pièce justificative"
}

function PreviewUnavailable() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-56 w-full flex-col items-center justify-center gap-2 p-6 text-center sm:min-h-72"
    >
      <FileQuestion aria-hidden="true" className="size-7 text-ink-soft" />
      <p className="text-sm font-display font-semibold text-ink">Aperçu indisponible</p>
      <p className="max-w-xs text-xs text-ink-soft">
        Ouvrez le fichier original pour consulter cette pièce justificative.
      </p>
    </div>
  )
}

export function AttachmentPreview({ url, objectKey, alt }: AttachmentPreviewProps) {
  const kind = attachmentKind(objectKey)
  const filename = attachmentName(objectKey)
  const [previewState, setPreviewState] = useState<PreviewState>("loading")

  useEffect(() => {
    setPreviewState("loading")
  }, [url])

  const originalFileAction = (
    <Button asChild variant="link" size="xs" className="min-h-11 shrink-0">
      <a href={url} target="_blank" rel="noreferrer">
        Ouvrir l'original
        <ExternalLink data-icon="inline-end" aria-hidden="true" />
        <span className="sr-only"> dans un nouvel onglet</span>
      </a>
    </Button>
  )

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {kind === "image" ? (
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label={`Agrandir ${alt}`}
              disabled={previewState === "error"}
              className="relative flex min-h-56 w-full touch-manipulation items-center justify-center overflow-hidden rounded-lg border border-ink/10 bg-teal-100/10 outline-none transition-colors hover:border-teal-950/30 hover:bg-teal-100/20 focus-visible:ring-2 focus-visible:ring-teal-950 focus-visible:ring-offset-2 disabled:cursor-default disabled:hover:border-ink/10 disabled:hover:bg-teal-100/10 sm:min-h-72"
            >
              {previewState === "loading" && (
                <Skeleton className="absolute inset-0 size-full rounded-none" />
              )}
              {previewState === "error" ? (
                <PreviewUnavailable />
              ) : (
                <img
                  src={url}
                  alt={alt}
                  width={1600}
                  height={1200}
                  loading="lazy"
                  onLoad={() => setPreviewState("ready")}
                  onError={() => setPreviewState("error")}
                  className="max-h-[42svh] w-full object-contain"
                />
              )}
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[92svh] w-[calc(100%-2rem)] max-w-5xl overscroll-contain overflow-y-auto border-ink/10 bg-paper p-3 sm:p-4">
            <DialogHeader className="min-w-0 pr-8">
              <DialogTitle className="text-base font-display font-bold text-ink">
                Pièce justificative
              </DialogTitle>
              <DialogDescription className="truncate text-xs text-ink-soft">
                {filename}
              </DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-lg bg-teal-100/10">
              <img
                src={url}
                alt={alt}
                width={1600}
                height={1200}
                className="max-h-[78svh] w-auto max-w-full object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : kind === "pdf" ? (
        <div className="relative min-h-80 overflow-hidden rounded-lg border border-ink/10 bg-teal-100/10 sm:min-h-96">
          {previewState === "loading" && (
            <Skeleton className="absolute inset-0 size-full rounded-none" />
          )}
          <object
            data={url}
            type="application/pdf"
            aria-label={alt}
            onLoad={() => setPreviewState("ready")}
            onError={() => setPreviewState("error")}
            className="h-[48svh] min-h-80 w-full sm:min-h-96"
          >
            <PreviewUnavailable />
          </object>
          {previewState === "error" && (
            <div className="absolute inset-0 bg-paper">
              <PreviewUnavailable />
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink/10 bg-teal-100/10">
          <PreviewUnavailable />
        </div>
      )}

      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="truncate text-xs text-ink-soft" title={filename}>
          {filename}
        </span>
        {originalFileAction}
      </div>
    </div>
  )
}
