# Current State — Wagnon Budget

Last updated 2026-07-27. Cap: 100 lines. See the compression protocol in
`AGENTS.md` before adding to this file.

## Recently landed

- R2 uploads, split settings, the dashboard balance fix, server-side paging
  for expenses and the activity feed, real URLs via react-router, and the
  y=48/x=28 shell datum are all shipped — see git log and `AGENTS.md` rather
  than this file for their detail.
- The period filter no longer turns balances into nonsense. Three stat figures
  divided a period flow by an all-time total; the worst read "Solde Restant /
  Découvert" in red on a solvent college. Filtered, that card is now "Flux net".
- Migration history is aligned, nothing local-only or remote-only —
  `supabase migration list` is the source of truth, not a count here.

## Audits — both measured, both written down

- `docs/perf-audit-2026-07-26.md` — network, payload and bundle. Headline:
  reducing *parallel* round-trips is nearly worthless (10 multiplexed requests
  ≈ 3, ~260 ms, because `Promise.all` over one HTTP/2 connection already
  overlaps them) — a *sequential* step costs 5–10× more than an extra parallel one.
- `docs/ui-audit-2026-07-26.md` — contrast, type, images, layout.
- `docs/expenses-ux-benchmark-2026-07-27.md` and
  `docs/expenses-page-plan-2026-07-27.md` — the expenses pages judged as a
  user, six-phase plan. Phases 1–4 and 6 are landed — see below. Phase 5
  (categories money columns) is planned but not started, waiting on Sam.

## Expenses page — Phase 1–4 + 6 landed 2026-07-27

- `expenses_page` v2 (migration `20260727094500`, overload cleanup in
  `20260727095800` — see the `create or replace` gotcha in `AGENTS.md`) adds
  `paid`/`reliquat`/`receipt_key` per row, period-scoped
  `reliquat_amount`/`unpaid_count`/largest-expense fields, a same-length
  prior-period comparison (`prev_amount`/`elapsed_days`), a `filtered_total`
  that respects search, and whitelisted sort params.
- Client fixes: the receipt panel shows the real `receipt_key` instead of a
  hardcoded "no file" state that also promised an upload that doesn't exist;
  the category sheet's two conflicting counts (760 vs a 200-row cap) now
  agree; the period filter renders on the Categories tab too (it was already
  being applied there, invisibly); KPI footers say "sur la période" instead of
  "au total" when a period is selected; dates are forced `fr-FR` day-only via
  `formatDay()` in `utils.ts`, replacing browser-locale `toLocaleDateString`/
  `toLocaleString` (the latter fabricated a `00:00:00` next to a plain date).
- The four KPI cards are now "Dépensé sur la période" (with a same-length
  prior-period % change), "Reste à payer" (terracotta above zero, green
  "Tout est soldé" at zero — not full red/`text-negative`, since that colour
  is reserved elsewhere in the app for a genuinely overdrawn account and an
  unpaid invoice lagging a few days is routine, not alarming), "Poste le plus
  lourd" and "Plus grosse dépense". "Aujourd'hui" and "Dépense moyenne" are
  gone — verified live: the −53% comparison for "Ce mois-ci" matched the
  manual calculation exactly.
- The table is sortable on Date/Catégorie/Montant (verified live: ascending
  amount surfaced the real 5,000 F CFA floor, descending surfaced the
  2,700,000 salary runs), has a total row that respects every filter
  (`filtered_total` from the RPC), shows a small "Reste X" line under any row
  with a positive reliquat, and the responsive column order is reversed —
  Description now survives to mobile; Enregistré par is what drops first,
  since the description is the row's name and the recorder isn't.
- Phase 6 was revised from CSV to print/PDF at Sam's request: one "Imprimer"
  button, a print-only report (`ExpensesPage.tsx`), and `window.print()` —
  the browser's own dialog covers page range and "Save as PDF". "Enregistré
  par" is omitted from the printout only (Sam: not needed on paper). Three
  bugs surfaced and were fixed verifying this live — all three are now
  gotchas in `AGENTS.md`: the PostgREST 1000-row cap on `expenses_export`,
  `window.print()` needing `flushSync`, and the vendored sidebar's
  `h-svh overflow-hidden` wrapper crushing the report onto one tiny page.
- Not yet cleaned up: a "Test phase 2 verification" expense (12,345 F CFA,
  category Administration, receipt `RECU-TEST-001`) from verifying the
  receipt fix in-browser — same bucket as the artifacts under "Blocking" below.

## Blocking and open risks

- Supabase work goes through the **CLI**, not the MCP server — the remote MCP
  endpoint (`mcp.supabase.com`, OAuth) has been down and `ToolSearch` finds no
  supabase tool. `supabase` 2.109 is installed, logged in and linked. Docker is
  not running, so `db dump`, `db diff` and `db reset` all fail; `migration
  list`, `db push`, `migration fetch` and `functions deploy` work fine.

- The router cost **+28.5 kB gzipped** on the entry chunk, more than the
  ~20 kB estimated — `createBrowserRouter`'s data-router runtime, unused
  since this app has no loaders/actions. Swapping to declarative
  `<BrowserRouter>` would drop it but needs a path→label map to replace the
  `useMatches()` breadcrumb first. Worth deciding before the next payload pass.
- Two artefacts from verifying the audit trail on 2026-07-27: a "Test audit"
  category, permanently in the dropdown because categories have no delete UI,
  and a `test@college.ci` account. Both are real rows in the live project.
- The non-admin redirect off `/users` and `/investors` is still unexercised.
  There are two accounts now, but the test user was given `admin`, so nothing
  in the project holds a non-admin role. Needs an `investor`-role account.
- CAPTCHA is off in Supabase Auth — no bot protection on login. Re-enable once
  deployed to Pages, which supplies the domain Turnstile needs.
- Leaked-password protection is off. Dashboard setting, waiting on Sam.
- Delete-on-change for uploads has never run with a second upload, and avatar
  upload has never run at all. Same code path as the proven logo upload.
- **No UI writes to `expense_payments`.** The Phase 1 RPC surfaced
  "Payé"/"Reste" on every expense, and Sam asked (reasonably) where that data
  comes from — the answer is nowhere reachable from the app: the table is
  read-only from the client today, so every new expense shows "Payé: 0" and
  a full reliquat forever. Whatever payment rows exist were seeded directly
  in Postgres. Recording a payment (amount + date against an expense) is new
  scope, not part of the six-phase plan — flagged for Sam to decide on.

## Decided, not yet built

- Stay on Vite and React. Every screen is behind auth so nothing pre-renders,
  and SSR would add a round trip before first paint on these connections.
- The super-admin dashboard needs no new framework or schema work — tables carry
  `college_id`, RLS already scopes by college, and the router is in place. It is
  a routing and query problem now.
- Login keeps the split layout on desktop; mobile gets the artwork as a
  full-bleed background with the form on top, one right-sized image per viewport.
- An agent will not hold app credentials. Verifying a flow that needs a login is
  split: Sam performs the write, the agent reads the result back. If unattended
  verification is ever wanted, the sanctioned shape is a seeded account on a
  non-production project with the password injected from the environment at run
  time — never in the repo, never in agent memory.
