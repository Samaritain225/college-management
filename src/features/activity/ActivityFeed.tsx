import { useCallback, useEffect, useRef, useState } from "react"
import { TrendingUp, TrendingDown, Activity as ActivityIcon, Loader2 } from "lucide-react"
import { formatMoney, cn } from "@/lib/utils"
import {
  listActivityFeed,
  cursorFrom,
  type ActivityCursor,
  type UserActivityLog,
} from "@/lib/queries"
import { formatActivityItem, relativeTime } from "./formatActivity"

export function ActivityRow({ act }: { act: UserActivityLog }) {
  const formatted = formatActivityItem(act)
  // Contributions and other income are both money in and render identically.
  const isInflow = formatted.type === "contribution" || formatted.type === "income"
  const isExpense = formatted.type === "expense"
  const amountColor = isInflow ? "text-positive" : isExpense ? "text-terracotta-600" : "text-ink"
  const amountBg = isInflow ? "bg-positive/8" : isExpense ? "bg-terracotta-600/8" : "bg-ink/5"
  const iconColor = isInflow ? "text-positive" : isExpense ? "text-terracotta-600" : "text-teal-950"

  return (
    <div className="relative flex items-start justify-between gap-3">
      <span
        className={cn(
          "absolute -left-[25px] top-1 flex h-4 w-4 items-center justify-center rounded-full border border-ink/10 bg-paper shrink-0",
          iconColor
        )}
      >
        {isInflow ? (
          <TrendingUp className="size-3" />
        ) : isExpense ? (
          <TrendingDown className="size-3" />
        ) : (
          <ActivityIcon className="size-3" />
        )}
      </span>

      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-display font-bold text-ink truncate">
            {formatted.actor}
          </span>
          {formatted.amount !== null && (
            <div className={cn("shrink-0 rounded-md px-2 py-0.5", amountBg)}>
              <span className={cn("text-2xs font-bold font-mono tabular-nums", amountColor)}>
                {isInflow ? "+" : isExpense ? "−" : ""}
                {formatMoney(formatted.amount)}
              </span>
            </div>
          )}
        </div>
        <p className="text-xs font-normal text-ink-soft leading-tight">{formatted.actionText}</p>
        {formatted.subtitle && (
          <p className="text-2xs text-ink-soft/70 leading-tight font-normal truncate">
            {formatted.subtitle}
          </p>
        )}
        <p className="text-3xs text-ink-soft/50 leading-none font-normal pt-0.5">
          {relativeTime(act.createdAt)}
        </p>
      </div>
    </div>
  )
}

interface ActivityFeedProps {
  /** Restrict to one person's history. Presentation only — the RLS policy on
   *  activity_log is what actually stops a non-admin reading someone else's. */
  userId?: string | null
  /** Rows already fetched elsewhere (the dashboard RPC preloads 20), so the
   *  first screen costs no extra round trip. */
  initialItems?: UserActivityLog[]
  /** Height of the scroll area. The sentinel only fires inside a scroll
   *  container, so this cannot be `auto`. */
  className?: string
  emptyLabel?: string
}

/**
 * The activity log as an infinite-scrolling timeline.
 *
 * Pages on an opaque (cursorAt, id) cursor handed back by the server rather
 * than an offset — entries are written constantly, and an offset boundary
 * shifts under a reader mid-scroll, repeating or skipping rows.
 */
export function ActivityFeed({
  userId = null,
  initialItems,
  className,
  emptyLabel = "Aucune activité enregistrée.",
}: ActivityFeedProps) {
  const seeded = initialItems && initialItems.length > 0
  const [items, setItems] = useState<UserActivityLog[]>(initialItems ?? [])
  const [cursor, setCursor] = useState<ActivityCursor | null>(
    seeded ? cursorFrom(initialItems!) : null
  )
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(false)
  // Guards against the observer firing again for the same cursor before the
  // in-flight request resolves, which would append a duplicate page.
  const inFlight = useRef(false)
  const sentinel = useRef<HTMLDivElement | null>(null)
  const scrollBox = useRef<HTMLDivElement | null>(null)

  const loadMore = useCallback(async () => {
    if (inFlight.current || done) return
    inFlight.current = true
    setLoading(true)
    setError(false)
    try {
      const page = await listActivityFeed({ userId, cursor })
      setItems((prev) => {
        // Belt and braces: the cursor makes overlap impossible, but a
        // double-mount in StrictMode would otherwise show doubled rows.
        const seen = new Set(prev.map((i) => i.id))
        return [...prev, ...page.items.filter((i) => !seen.has(i.id))]
      })
      setCursor(page.nextCursor)
      if (!page.nextCursor) setDone(true)
    } catch (err) {
      console.error("Activity feed failed to load:", err)
      setError(true)
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [userId, cursor, done])

  // Reset when the subject changes — otherwise one user's rows stay on screen
  // under another user's name.
  useEffect(() => {
    setItems(initialItems ?? [])
    setCursor(initialItems && initialItems.length > 0 ? cursorFrom(initialItems) : null)
    setDone(false)
    setError(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // First page, when nothing was preloaded.
  useEffect(() => {
    if (items.length === 0 && !done && !loading && !error) void loadMore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    const node = sentinel.current
    if (!node || done || error) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore()
      },
      {
        // Observe against the scroll box, not the viewport. With the default
        // root the sentinel only counts as visible once the *page* scrolls to
        // it — and this feed is its own scroll container sitting below the
        // fold, so it would never fire no matter how far the reader scrolled
        // inside it.
        root: scrollBox.current,
        // Start fetching a little before the sentinel is actually visible, so
        // the next page is usually there by the time the reader reaches it.
        rootMargin: "160px",
      }
    )
    io.observe(node)
    return () => io.disconnect()
  }, [loadMore, done, error])

  if (items.length === 0 && done) {
    return <p className="text-xs text-ink-soft text-center py-6">{emptyLabel}</p>
  }

  return (
    // pl-3 is not decoration: the timeline dots are absolutely positioned at
    // -left-[25px] against rows that sit 16px in, so they start 9px outside
    // this box — and setting overflow-y makes overflow-x compute to auto,
    // which clips them.
    <div ref={scrollBox} className={cn("overflow-y-auto pl-3 pr-1", className)}>
      <div className="relative border-l border-ink/10 pl-4 space-y-3.5">
        {items.map((act) => (
          <ActivityRow key={act.id} act={act} />
        ))}
      </div>

      <div ref={sentinel} className="h-px" />

      {loading && (
        <div className="flex justify-center py-3 text-ink-soft">
          <Loader2 className="size-4 animate-spin" />
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center gap-2 py-3">
          <p className="text-2xs text-ink-soft">Impossible de charger la suite.</p>
          <button
            type="button"
            onClick={() => void loadMore()}
            className="text-2xs font-display font-semibold text-teal-950 hover:underline"
          >
            Réessayer
          </button>
        </div>
      )}

      {done && items.length > 0 && (
        <p className="text-center text-3xs text-ink-soft/60 py-3">Fin de l'historique</p>
      )}
    </div>
  )
}
