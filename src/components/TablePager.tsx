import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { pageWindow } from "@/lib/pagination"

interface TablePagerProps {
  /** 1-based. */
  page: number
  pageSize: number
  /** Total rows across every page, after filters. */
  total: number
  onPageChange: (page: number) => void
  className?: string
  /** Plural noun for the count line, e.g. "dépenses". */
  itemLabel?: string
}

export function TablePager({
  page,
  pageSize,
  total,
  onPageChange,
  className,
  itemLabel = "éléments",
}: TablePagerProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  const go = (p: number) => onPageChange(Math.min(Math.max(p, 1), pageCount))

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3",
        className
      )}
    >
      <p className="text-xs text-ink-soft tabular-nums">
        {total === 0 ? (
          `Aucun résultat`
        ) : (
          <>
            <span className="font-display font-semibold text-ink">
              {first}–{last}
            </span>{" "}
            sur <span className="font-display font-semibold text-ink">{total}</span> {itemLabel}
          </>
        )}
      </p>

      {pageCount > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button
            type="button"
            onClick={() => go(page - 1)}
            disabled={page <= 1}
            aria-label="Page précédente"
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-soft hover:bg-teal-100/50 hover:text-teal-950 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>

          {pageWindow(page, pageCount).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} className="px-1 text-xs text-ink-soft/60 select-none">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => go(p)}
                aria-label={`Page ${p}`}
                aria-current={p === page ? "page" : undefined}
                className={cn(
                  "h-8 min-w-8 px-2 rounded-md text-xs font-display font-semibold tabular-nums transition-colors",
                  p === page
                    ? "bg-teal-950 text-white"
                    : "text-ink-soft hover:bg-teal-100/50 hover:text-teal-950"
                )}
              >
                {p}
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => go(page + 1)}
            disabled={page >= pageCount}
            aria-label="Page suivante"
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-soft hover:bg-teal-100/50 hover:text-teal-950 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
        </nav>
      )}
    </div>
  )
}
