# Current State — Wagnon Budget

Last updated 2026-07-29. Cap: 100 lines. See the compression protocol in
`AGENTS.md` before adding to this file.

## In flight — account lifecycle, investor read-only, notifications

- `docs/access-lifecycle-plan-2026-07-29.md` is the agreed plan for five asks:
  soft delete with a super-admin archive, attribution for deleted users, email
  reuse rules, investor read-only, and expense notifications. Build order is
  investor read-only first, then soft delete plus attribution plus email as
  one unit, then notifications last.
- **Investor read-only (Part 4) is landed**, verified live with Test Investor
  (`b9dc85ea`): `canManageFinance()` in `auth.tsx` mirrors
  `private.can_manage_finance()` in SQL. `/teachers`, `/students`, `/classes`
  now redirect investors to the dashboard (`RoleRoute` in `routes.tsx`);
  `/investors` is open to them read-only. The sidebar hides Académique and
  shows Investisseurs for investors. Expenses/categories hide their "create"
  buttons; the investors list/detail hide edit and create. `InvestorsPage`
  skips `listAdminUsers()` (the account-linking lookup) entirely for
  non-managers — that endpoint is admin/treasurer/super_admin-only, so an
  investor calling it always 403s. Parts 2, 3, 5 not started.
- Also landed, unrelated to the plan but same session: the sidebar is 15%
  narrower on desktop (`AppShell.tsx`, 12.5rem → 10.625rem) and 30% narrower
  on mobile (`sidebar.tsx`'s `SIDEBAR_WIDTH_MOBILE`, 18rem → 12.6rem), and the
  dashboard greeting dropped its trailing filler ("Prêt pour la journée
  scolaire ?" etc.) down to just the name, at Sam's request. Desktop width is
  set by `AppShell.tsx` inline, not `sidebar.tsx`'s `SIDEBAR_WIDTH` constant —
  that constant is dead code for this app, left at the shadcn default.
- Decided while planning: an investor sees **all** investors at their college,
  read-only, so no RLS change is needed; notifications are in-app only; a
  soft-deleted account's auth email is tombstoned so the address frees up,
  which is irreversible for that account.
- Realtime is deliberately stubbed out of the bundle
  (`src/lib/supabase-stubs/realtime.ts`, two aliases in `vite.config.ts`) to
  keep ~150 kB of idle `@supabase/realtime-js` off every page load, and
  `supabase.channel()` throws on purpose. Live notifications would undo that,
  so the plan backs the badge with polling instead and leaves the data model
  identical either way.
- Still undefined: whether "block" is a distinct action from deactivate, and
  whether a soft-deleted account should ever be restorable.

## Recently landed

R2 uploads, split settings, the dashboard balance fix, server-side paging,
real URLs via react-router, the expenses-page mobile pass, and `storage-sign`
scoped by college are all shipped — see git log and `AGENTS.md`, not this
file, for detail. Migration history is aligned; `supabase migration list` is
the source of truth, not a count here.

## Audits and past plans — pointers only, see the docs

- `docs/perf-audit-2026-07-26.md` (network/payload/bundle — sequential hops
  cost 5–10× a parallel one), `docs/ui-audit-2026-07-26.md` (contrast/type/
  images/layout), `docs/expenses-ux-benchmark-2026-07-27.md` +
  `docs/expenses-page-plan-2026-07-27.md` (expenses UX, six-phase plan — 1–4
  and 6 shipped 2026-07-27, phase 5 categories-money-columns still waiting on
  Sam), `docs/access-lifecycle-plan-2026-07-29.md` (current, see above).
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
- Artefacts from live verification, still real rows in the live project: a
  "Test audit" category (permanently in the dropdown, categories have no
  delete UI) and a `test@college.ci` account.
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
- Payee and payment method come from a *second, sequential* round trip
  (`queries.ts`, `.from("expenses").in("id", ids)` after the RPC) instead of
  `expenses_page`'s row payload. The perf audit's headline is that a
  sequential hop costs 5–10× a parallel one, and this runs on every page,
  sort and search. Fixing it is a migration — mind the overload gotcha.

## Password policy and account safety, 2026-07-28 — landed and deployed

- GoTrue's real policy (confirmed from Sam's live rejection): one lowercase,
  one uppercase, one digit, one special character, no known minimum length.
  `UsersPage.tsx` mirrors this; `ProfileSection.tsx`'s self-service password
  form still only checks length 8 — same latent mismatch, still not fixed.
- `admin-users` deployed with `checkCanActOn` (no account acts on itself, a
  `super_admin` target needs a `super_admin` caller) and a real DELETE,
  refused with 409 when `expenses`/`activity_log`/`investors` reference the
  profile — the in-flight plan turns that 409 into a soft delete instead.
- Users show a derived status ("En attente"/"Actif"/"Désactivé") from
  GoTrue's `last_sign_in_at` — purely informational, doesn't gate login.

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
