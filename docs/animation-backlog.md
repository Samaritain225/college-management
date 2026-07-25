# Animation & Motion Backlog

Findings from a motion review of `dev` @ f367780, held for implementation after the
architecture refactor lands. Two parts: **fixes** (existing motion that's wrong) and
**opportunities** (missing motion worth adding).

Standard applied: Emil Kowalski's animation philosophy — UI motion under 300ms,
`transform`/`opacity` only, never animate keyboard-initiated actions, `ease-out` for
enter/exit, never `scale(0)`.

## House curve

There are no easing tokens today; `cubic-bezier(0.16, 1, 0.3, 1)` is hardcoded in
`index.css:192` and `Dashboard.tsx:408`. Promote it to `@theme` as `--ease-out` and
use it everywhere rather than introducing a second curve.

---

## Part 1 — Fixes (blocking)

| Location | Problem | Fix |
| --- | --- | --- |
| `sidebar.tsx:221`, `:232` (trigger `:100`) | Sidebar width/left/right animates on ⌘B — a keyboard action | Delete the transition. Keyboard-initiated = no animation, ever |
| `button.tsx:8` | `transition-all`, no `:active` state anywhere in the app | `active:scale-[0.97]`, `transition: transform 160ms var(--ease-out)`; enumerate properties |
| `ExpensesPage.tsx:425`, `:431` | `hover:w-52 transition-all duration-500 ease-in-out` | `clip-path`/`transform` reveal, 200ms `ease`, gated by `@media (hover:hover) and (pointer:fine)` |
| `BudgetBar.tsx:28-33` | `@keyframes slideIn { from { width: 0 } }` at 800ms | `scaleX(0) → scaleX(1)`, `transform-origin: left`, 300ms |
| `BudgetBar.tsx:39` | `transition-all` fighting the keyframe on the same property | Remove `transition-all` |
| `Dashboard.tsx:406` | `stroke-dasharray: 600` hardcoded — **paths longer than 600px render with a permanent gap**; 1.5s draw | Measure via `path.getTotalLength()`; cap draw at ~600ms |
| `Dashboard.tsx:518` | Chart tooltip positioned by `left`/`top` with `transition-all` | `translate3d()` + `transition-[transform,opacity] 100ms ease-out` |
| `index.css:145`, `:149-157` | Four infinite decorative animations on login, one repainting SVG `stop-color` every frame | Wrap in `@media (prefers-reduced-motion: no-preference)`; consider cutting the 6s gradient cycle entirely |
| `index.css:206-212` | Reduced-motion guard covers only `::view-transition-*` | Extend to `.marching-ants-border`, `.gradient-stop-*`, `.animate-bar`, `.animate-line` |
| `App.tsx:139`, `LoginPage.tsx:218` | `transition-all` on elements whose state never changes | Delete |
| `index.css:192-202` | 300ms full-viewport slide on every tab change — core navigation | 180-200ms, or fade + 8px slide instead of a 100% translate |
| `sheet.tsx:63` | 500ms open / 300ms close, `ease-in-out` | 300ms open / 200ms close, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` |

Also: the `<style>` blocks inside `BudgetBar.tsx:27` and `Dashboard.tsx:401` re-inject a
`<style>` element on every render. Move both to `index.css`.

---

## Part 2 — Opportunities (additive, ordered by leverage)

| # | Location | Today | Purpose | Suggested motion |
| --- | --- | --- | --- | --- |
| 1 | `button.tsx:8` | No press feedback anywhere | Feedback | `active:scale-[0.97]`, 160ms — below conscious notice, which is why it survives daily-use frequency |
| 2 | `Dashboard.tsx:175`, `ExpensesPage.tsx:383`, `InvestorsPage.tsx:270`, `UsersPage.tsx:518` | Skeleton snaps to content in one frame | Preventing a jarring change | `@starting-style { opacity:0; translateY(4px) }`, 200ms `var(--ease-out)` |
| 3 | `ExpensesPage.tsx:936`, `UsersPage.tsx:500`, `InvestorsPage.tsx:566`, `LoginPage.tsx:166` | Submit label hard-swaps to "Enregistrement…", button width jumps | State indication | Blur-masked crossfade: `filter: blur(2px); opacity: 0.7`, 200ms `ease`; add `min-width` |
| 4 | `ExpensesPage.tsx:633`, `UsersPage.tsx:752`, `InvestorsPage.tsx:773`, `RecentActivities.tsx:235` | Empty state appears instantly where rows were | Preventing a jarring change | `@starting-style { opacity:0; scale(0.98) }`, 200ms |
| 5 | `InvestorsPage.tsx:337`, `:711` | Badge flips to "Libéré" instantly when a partner's balance clears | Delight | The one emotional moment in the app. Single `scale(1.06)` beat + colour, 300ms. Spend the delight budget here and nowhere else |

### Deliberately rejected

- **⌘B sidebar, main tab navigation** — keyboard-initiated / core navigation, 100+/day.
- **Expenses ↔ Catégories inner tab swap** — the inconsistency is real, but the fix is
  making the *outer* navigation quieter, not adding a second slide.
- **Table rows re-rendering during search** — keystroke-driven, and it's data being read.
- **Chart crosshair, dots, tooltip** — functional financial data. Instant is correct.
- **Sonner toasts, Radix tooltip/popover/dropdown/dialog** — already correct
  (origin-aware, `zoom-in-95`, symmetric exits, modals centered). Nothing to add.

---

## Net assessment

The app currently spends its motion budget in the wrong places — an 800ms bar slide, a
1.5s chart draw, a 500ms hover expand, four infinite login animations — while the moments
that actually need a bridge (skeleton→content, submit-in-flight, list→empty) happen in a
single hard frame. The correction is a **transfer, not an addition**. This is a financial
dashboard used daily; the right personality is crisp and fast.

Highest leverage by a wide margin: the `:active` press scale on `button.tsx:8`. One line,
every pressable surface, fills the only feedback gap a user feels physically.
