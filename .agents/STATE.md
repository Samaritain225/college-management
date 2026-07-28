# Current State — Wagnon Budget

Last updated 2026-07-28. Cap: 100 lines. See the compression protocol in
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
  user, six-phase plan.

## Expenses page — Phases 1–4 and 6 landed 2026-07-27

- Shipped: `expenses_page` v2 (migrations `20260727094500` and
  `20260727095800`), sortable Date/Catégorie/Montant, a filter-respecting
  total row, `formatDay()` for `fr-FR` day-only dates, and print/PDF via
  `window.print()` instead of CSV at Sam's request. Detail is in the git log
  and in the three `AGENTS.md` gotchas it produced.
- Phase 5 (categories money columns) is planned, not started, waiting on Sam.
- Not yet cleaned up: a "Test phase 2 verification" expense (12,345 F CFA,
  Administration, receipt `RECU-TEST-001`) from verifying the receipt fix
  in-browser — same bucket as the artifacts under "Blocking" below.

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
- The non-admin redirect off `/users` and `/investors` is still unexercised,
  but no longer blocked: "Test Investor" (`b9dc85ea`) holds `investor` at this
  college, so the redirect can now actually be driven.
- CAPTCHA is off in Supabase Auth — no bot protection on login. Re-enable once
  deployed to Pages, which supplies the domain Turnstile needs.
- Leaked-password protection is off. Dashboard setting, waiting on Sam.
- Avatar and logo upload are both proven end to end, verified 2026-07-28 by
  fetching the stored keys at the public base URL: `logos/7318eb58….jpg`
  returns 200 (5.7 kB) and `avatars/1f829b24…/3b595908….jpg` returns 200
  (35.6 kB), so compression, presign, PUT and `publicUrl` all work.
  **Receipt upload has never actually run** — the only `receipt_key` in the
  table is the hand-typed `RECU-TEST-001`, which 404s. Delete-on-change has
  still never run with a second upload.
- The `expense_payments` question is settled: an expense is a *completed*
  outflow, so there is no "Reste à payer" and no payment-recording UI. See
  `docs/superpowers/specs/2026-07-28-cash-expenses-design.md`. The `paid` /
  `reliquat` fields still come back from `expenses_page` and are now dead
  weight on every page load.

## Expense page mobile pass, 2026-07-28 — landed, verified in-browser at 375px

- The period filter reaches the ledger table again. It had been dropped from
  the table query while the default period moved from "all" to "this_month",
  so the KPI card read "3 137 845 F CFA · 57 dépenses" directly above a footer
  reading "1802 dépenses filtrées · 152 548 245". Both now read 57 /
  3 137 845. `selectedPeriod` is back in the `setPage(1)` effect's deps.
- Below `sm` the ledger is a card list, not a table. The table measured 589px
  inside a 331px column — 258px of horizontal drag on the same surface the
  reader swipes to scroll the page. Each card carries date, category,
  description, amount, payee and method, so nothing is lost to a hidden
  column; the table is unchanged from `sm` up (688px in 688px, no overflow).
- Payee and payment method are in the detail sheet now. They had existed only
  in a `hidden md:table-cell` column, so a phone could not reach either.
- All four dialogs in the app now scroll on a phone — three on the expenses
  page plus the user-create dialog — see the `DialogContent` gotcha in
  `AGENTS.md`. There are only four; investors, categories and settings turned
  out to use no modal at all.
- Three KPI cards, not four. "Transactions enregistrées" repeated the count
  already in the first card's footer.
- Legacy paper receipt references and R2 object keys share the `receipt_key`
  column. `isUploadedReceiptKey` in `uploads.ts` tells them apart on the slash
  in the key; a reference renders as text now, not a link that 404s.
- The receipt size gate applies to PDFs only. Gating the raw file at 10 MB
  rejected the commonest mobile case — a phone photo arrives at 8–15 MB and
  `compressImage` re-encodes it to well under 1 MB *after* the input's
  onChange. Images are left to compression plus the edge function's ceiling.
- Still open: payee and payment method come from a *second, sequential* round
  trip (`queries.ts`, `.from("expenses").in("id", ids)` after the RPC) instead
  of `expenses_page`'s row payload. The perf audit's headline is that a
  sequential hop costs 5–10× a parallel one, and this runs on every page, sort
  and search. Fixing it is a migration — mind the overload gotcha.

## storage-sign — college-scoped, deployed and exercised 2026-07-28

- A role now only counts at the college it was granted at. The old code read
  every `user_roles` row for the caller regardless of `college_id`, so a
  treasurer at any college passed the finance check for every other college's
  receipts. `super_admin` is matched on its global `college_id IS NULL` row.
- New objects land under `colleges/<college-id>/logos/…` and
  `colleges/<college-id>/receipts/<year>/…`. Avatars stay `avatars/<user-id>/`
  on purpose — roles are many-to-many across colleges, so a person is not
  owned by one college the way a logo or a receipt is.
- Receipt deletes are refused outright. `expenses` is append-only, so leaving
  the document deletable put a hole through that guarantee. Nothing calls it —
  `deleteFile` is only ever reached with "avatar" and "logo".
- `LEGACY_LOGO_PREFIX` exists because the one stored logo predates the layout
  (`logos/7318eb58….jpg`); without it, replacing the logo would stop cleaning
  up the old object.
- Verified against the deployed function with live credentials, all
  non-destructive: correct college signs a `colleges/<id>/receipts/2026/…`
  key (200); missing collegeId 400; a college the caller holds no role at 403;
  receipt delete 403; avatar signs unchanged and needs no college; a logo-kind
  request carrying an avatar key 403; another college's logo key 403; a legacy
  `logos/…` key still accepted. Logo and avatar objects re-fetched afterwards,
  both still 200 — nothing was destroyed proving this.
- Never executed locally: Docker is down, so there is no local stack. The
  above is the deployed function answering real requests, which is stronger,
  but it means there is no pre-deploy test gate for the next change here.

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
