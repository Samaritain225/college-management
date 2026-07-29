import { useState } from "react"
import { formatMoney } from "@/lib/utils"

export interface CategorySpend {
  name: string
  amount: number
}

interface BudgetDonutProps {
  /** Total resources — every cash inflow, not cotisation alone. The ring's
   *  full circumference is this figure, so the open arc reads as "Restant". */
  totalPool: number
  spentByCategory: CategorySpend[]
}

/** Five categorical slots, assigned in fixed order and never cycled. A sixth
 *  category folds into "Autres" on a neutral, which is what keeps the ring at
 *  the six-segment ceiling past which adjacent arcs stop being tellable apart. */
const SLOTS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
]
const OTHER_COLOR = "var(--color-ink-soft)"
const MAX_SLICES = 5

const RADIUS = 70
/** Thinner than it looks like it should be: the hole has to fit a full
 *  `formatMoney` string, and those are joined by non-breaking spaces so they
 *  overflow rather than wrap. */
const STROKE = 15
const CIRC = 2 * Math.PI * RADIUS
/** Surface gap between adjacent arcs, in path units. Keeps two segments from
 *  reading as one continuous band when their colours are close. */
const GAP = 3

interface Slice {
  name: string
  amount: number
  color: string
  /** Categories folded into "Autres", for the hover readout. */
  members?: string[]
}

function buildSlices(spentByCategory: CategorySpend[]): Slice[] {
  const sorted = [...spentByCategory].sort((a, b) => b.amount - a.amount)
  const head = sorted.slice(0, MAX_SLICES)
  const tail = sorted.slice(MAX_SLICES)

  const slices: Slice[] = head.map((c, i) => ({
    name: c.name,
    amount: c.amount,
    color: SLOTS[i],
  }))

  if (tail.length > 0) {
    slices.push({
      name: "Autres",
      amount: tail.reduce((sum, c) => sum + c.amount, 0),
      color: OTHER_COLOR,
      members: tail.map((c) => c.name),
    })
  }

  return slices
}

/**
 * Part-to-whole for the budget: one ring, segmented by category, with the
 * unspent remainder left as open track — the same question the old stacked bar
 * answered ("how much is left, and where did the rest go"), in the doughnut
 * form the Élèves and Enseignants cards already use.
 *
 * Absolute amounts stay in the legend rather than living only in the arcs.
 * That is deliberate: two of these categories sit within 3% of each other and
 * are not distinguishable as arcs, so the ring carries the shape and the legend
 * carries the numbers.
 */
export function BudgetDonut({ totalPool, spentByCategory }: BudgetDonutProps) {
  const [hovered, setHovered] = useState<number | null>(null)

  const slices = buildSlices(spentByCategory)
  const totalSpent = slices.reduce((sum, s) => sum + s.amount, 0)
  const remaining = totalPool - totalSpent
  const pct = (amount: number) => (totalPool > 0 ? amount / totalPool : 0)

  // Running offset so each arc starts where the previous one ended.
  let cursor = 0
  const arcs = slices.map((s) => {
    const fraction = pct(s.amount)
    const full = fraction * CIRC
    // Never let the gap eat a slice whole — a sub-gap category still shows a
    // hairline rather than vanishing.
    const dash = Math.max(full - GAP, 0.75)
    const arc = { dash, offset: -cursor * CIRC }
    cursor += fraction
    return arc
  })

  const active = hovered !== null ? slices[hovered] : null

  return (
    // Side-by-side only at xl. This card is 7 of 12 columns inside a max-w-5xl
    // shell with a sidebar beside it, so a `sm:` breakpoint measures the
    // viewport while the column stays ~300px — wide enough to look fine in the
    // markup and far too narrow in practice, which clipped the amounts.
    <div className="flex flex-col xl:flex-row xl:items-center gap-6">
      <div className="shrink-0 mx-auto xl:mx-0 flex flex-col items-center gap-2">
       <div className="relative">
        <svg
          viewBox="0 0 180 180"
          className="h-44 w-44 xl:h-48 xl:w-48 -rotate-90"
          role="img"
          aria-label={`Répartition du budget : ${formatMoney(totalSpent)} dépensés sur ${formatMoney(totalPool)}`}
        >
          {/* Unspent track. Drawn first so the arcs sit on top of it. */}
          <circle
            cx="90"
            cy="90"
            r={RADIUS}
            fill="transparent"
            stroke="currentColor"
            className="text-ink/10"
            strokeWidth={STROKE}
          />
          {slices.map((s, i) => (
            <circle
              key={s.name}
              cx="90"
              cy="90"
              r={RADIUS}
              fill="transparent"
              stroke={s.color}
              strokeWidth={hovered === i ? STROKE + 4 : STROKE}
              strokeDasharray={`${arcs[i].dash} ${CIRC - arcs[i].dash}`}
              strokeDashoffset={arcs[i].offset}
              className="transition-all duration-150 pointer-events-none"
              opacity={hovered === null || hovered === i ? 1 : 0.35}
            />
          ))}
          {/* Hit targets, kept separate from the visual arcs above: a stable
              geometry that never changes size on hover. The visible arc grows
              by STROKE+4 to show which slice is active, and if that same
              element owned the mouse events, the growth would shift the
              hit area under the cursor and flip hover between neighbours. */}
          {slices.map((s, i) => (
            <circle
              key={`${s.name}-hit`}
              cx="90"
              cy="90"
              r={RADIUS}
              fill="transparent"
              stroke="transparent"
              strokeWidth={STROKE + 4}
              strokeDasharray={`${arcs[i].dash} ${CIRC - arcs[i].dash}`}
              strokeDashoffset={arcs[i].offset}
              className="cursor-pointer"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <title>{`${s.name} : ${formatMoney(s.amount)}`}</title>
            </circle>
          ))}
        </svg>

        {/* Centre carries the amount alone — the label and ratio sit under the
            ring, where they have the card's full width instead of the hole's
            ~120px. Swaps to the hovered category rather than floating a tooltip
            box, which would overflow this column when it is stacked. */}
        <div className="absolute inset-0 flex items-center justify-center text-center px-3 pointer-events-none">
          <span className="text-sm font-display font-bold text-ink tabular-nums text-balance leading-tight">
            {formatMoney(active ? active.amount : totalSpent)}
          </span>
        </div>
       </div>

        <div className="text-center max-w-[12rem]">
          <p className="text-2xs font-display font-semibold uppercase tracking-wider text-ink-soft truncate">
            {active ? active.name : "Dépensé"}
          </p>
          <p className="text-2xs text-ink-soft tabular-nums">
            {Math.round(pct(active ? active.amount : totalSpent) * 100)}% des ressources
          </p>
        </div>
      </div>

      <div className="flex-1 min-w-0 grid grid-cols-1 gap-y-2 text-xs">
        {slices.map((s, i) => (
          <div
            key={s.name}
            className="flex items-center gap-2 min-w-0 cursor-pointer"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            title={s.members ? s.members.join(", ") : undefined}
          >
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
            />
            {/* flex-1 min-w-0 on the name and shrink-0 on the amount, or the
                nowrap amount wins the squeeze and truncates the label to
                nothing — which would leave identity carried by colour alone. */}
            <span className="flex-1 min-w-0 truncate text-ink-soft font-display font-medium">
              {s.name}
            </span>
            <span className="shrink-0 font-semibold text-ink tabular-nums whitespace-nowrap">
              {formatMoney(s.amount)}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2 min-w-0 pt-2 mt-1 border-t border-ink/10 col-span-full">
          <span className="h-2.5 w-2.5 rounded-full border border-ink/20 bg-paper shrink-0" />
          <span className="flex-1 min-w-0 truncate text-ink-soft font-display font-medium">
            Restant
          </span>
          <span className="shrink-0 font-semibold text-ink tabular-nums whitespace-nowrap">
            {formatMoney(remaining)}
          </span>
        </div>
      </div>
    </div>
  )
}
