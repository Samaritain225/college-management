# Agent Brain — Wagnon Budget

Compressed, load-bearing context for this project. Read this before making
architectural decisions. Full history and reasoning live in `docs/` —
this file is the fast-orientation summary, not the source of truth for
*why* (see pointers at the bottom).

## What this is

A finance-tracking app for **Wagnon**, a private college in Côte d'Ivoire
recently bought by ~15 investors. Phase one of a larger vision — the app
will eventually grow into a full school system (teachers, students,
timetables, grades) — but today it does exactly one thing: track investor
contributions and college expenses, replacing a paper notebook.

Single college today (`colleges` table has one row). Schema is
multi-tenant-ready (`college_id` on every table) but nothing enforces
multi-tenant UI yet — see "Known gaps" below.

## Stack

- **Frontend**: Vite + React 19 + TypeScript, deployed as a static SPA
  (Cloudflare Pages target — not yet actually deployed there).
- **Backend**: Supabase — Postgres, Auth, Edge Functions. **No Adonis, no
  Tauri, no libSQL/Turso** — all three were removed. If you see references
  to them anywhere outside `docs/refactor-plan.md`'s history section, that
  reference is stale.
- **Styling**: Tailwind CSS v4 + shadcn-style primitives (`src/components/ui`).

## Where things live

- `supabase/migrations/` — the schema, applied via Supabase MCP
  (`apply_migration`), then hand-mirrored here as files (versions must
  match exactly what the MCP tool assigned — check with
  `supabase migration list` before naming a new file).
- `supabase/functions/admin-users/` — the only way to create/edit/
  deactivate users. Needs `service_role`; must never run client-side.
- `src/lib/queries.ts` — **a translation layer**, not a thin passthrough.
  It exposes the *old* field names the UI was built against
  (`agreed_contribution`, `description`, `spent_at`) while reading the
  *new* schema's columns (`target_contribution`, `label`, `occurred_on`).
  Don't rename UI-facing fields to match the DB without checking every
  consumer.
- `src/lib/adminUsers.ts` — client for the Edge Function above.
- `src/lib/settings.tsx` — college identity (name, logo key, address, phone,
  academic year) is stored in the `colleges` table, not localStorage.
  localStorage holds only a display cache so the login screen can show branding
  before a session exists. It used to be localStorage-only, which made the
  college name per-browser — renaming it on one laptop changed nothing for
  anyone else. Never write settings there as the source of truth again.
- `docs/refactor-plan.md` — the architecture decisions and why, plus
  open business questions.
- `docs/phase-0-checklist.md`, `docs/animation-backlog.md` — narrower,
  point-in-time worklists. Read `refactor-plan.md` first.

## Architectural rules (violating these breaks real guarantees)

1. **Financial tables are append-only.** `contributions`, `other_income`,
   `expenses`, `expense_payments`, `activity_log` — no `UPDATE`/`DELETE`
   grant exists for `authenticated` on any of them. Corrections are new
   rows (`expenses.reverses_expense_id`). This is what makes offline
   multi-device sync safe later: two INSERTs never conflict, two UPDATEs
   from different devices do.
2. **Derived numbers are never stored.** Ownership %, reliquat, pool
   totals — always views (`investor_standings`, `expense_standings`,
   `college_pool`), never columns. If you're about to add a
   `percentage numeric` column, stop.
3. **Ownership excludes adhésion.** Only `cotisation`-type contributions
   count toward ownership %. `college_settings.ownership_basis` toggles
   whether ownership is computed on `target_contribution` or amount
   actually paid — currently `'target'`.
4. **Roles are many-to-many** (`user_roles`), not a single FK — a person
   can be an investor *and* a teacher. `super_admin` rows are global
   (`college_id IS NULL`); every other role is scoped to a college. A
   schema constraint enforces this — get it backwards and inserts fail.
5. **Currency is XOF** — no minor unit. Amounts are plain integers,
   never floats, never cents.
6. **"How much cash is there" is always contributions of *both* types plus
   `other_income`.** Two places encode this — the `college_pool` view and
   `dashboard_summary`'s `total_resources` — and they must agree; change one,
   change the other. Never compute a balance from cotisation alone: cotisation
   answers a different question (who owns what stake), and using it as cash is
   what made the dashboard report a negative balance on a solvent account.

## Hard-won gotchas (each cost real debugging time — don't rediscover these)

- **This Supabase project mixes legacy and new-format API keys.** The
  auto-provided `SUPABASE_SERVICE_ROLE_KEY` env var inside Edge Functions
  resolves to the *new* `sb_secret_...` format, which GoTrue's Admin API
  (`auth.admin.*`) cannot yet verify — fails with "unrecognized JWT kid".
  The fix: fetch the **legacy** service_role JWT
  (`supabase projects api-keys --reveal`) and set it as a custom secret
  (`LEGACY_SERVICE_ROLE_KEY`). Same story hit while seeding the first
  admin user via `auth.admin.createUser`.
- **`service_role` bypassing RLS still needs the base table GRANT
  first.** Postgres checks table privileges before RLS is ever evaluated.
  Enabling RLS + writing policies is not enough — see the
  `grant_service_role_full_access` migration. Skipping this produces
  "permission denied for table X", not empty results, which is a useful
  tell.
- **The type and radius scales are pinned in `@theme`, not inherited.** They
  are restated at Tailwind 4.3's own values on purpose, so a framework upgrade
  cannot silently resize 250 `text-xs` labels or reshape every card. If you
  change a `--text-*`, change its `--text-*--line-height` sibling in the same
  edit — setting one without the other reflows every screen at once.
  `--text-2xs` (11px) and `--text-3xs` (10px) are ours; Tailwind has no name
  below 12px and this app needs two. `--radius-lg` is `var(--radius)`, so the
  app's corner is one number.
- **Tailwind v4 needs the `--color-` prefix inside `@theme` to generate a
  utility at all.** A plain `:root { --sidebar: ... }` custom property
  does *not* make `bg-sidebar` work — the class is silently a no-op. This
  is exactly what caused the mobile sidebar sheet to render fully
  transparent (its own dialog backdrop showed through). Any new design
  token must go in `@theme` as `--color-<name>`.
- **Two paging styles, and they are not interchangeable.** Keyset (opaque
  `cursorAt` + `id`) for the activity feed, because it writes constantly and an
  OFFSET boundary shifts under a reader mid-scroll. OFFSET for the expenses grid,
  because numbered pages must jump to page N and a cursor cannot. Before adding
  a third, check the row count: only `expenses` (1,801 and growing) is big
  enough to justify a server round trip at all — categories, investors and users
  are single- and double-digit and page in memory.
- **Search short French labels with `pg_trgm` + ILIKE, not full-text.**
  `to_tsquery('salaire')` does not match "Salaires"; a trigram ILIKE does. Keep
  both arms of a search OR as predicates on the *same* table — an
  `or joined_table.col ilike …` forces a join filter and makes the trigram index
  unusable at any size.
- **The breadcrumb reads route `handle` metadata, so `createBrowserRouter` is
  load-bearing.** `useMatches()` only exists on a data router. Swapping to
  declarative `<BrowserRouter>`/`<Routes>` to shed the data-router bundle means
  replacing that with a path-to-label map first — the breadcrumb will silently
  render nothing otherwise, since `handle` is simply absent.
- **`supabase migration fetch` rewrites every local file, not just the missing
  ones.** It reformats what it touches — `$function$` collapsed to `$$`, stray
  trailing semicolons, and comments replaced by whatever text the history table
  stored. Run it to recover a genuinely absent file, then revert everything else
  it touched; the committed files are the reviewed artifact and the history
  table is not.
- **Check the version `apply_migration` actually assigned before naming the
  file.** Re-applying a migration (delete the `schema_migrations` row, apply
  again) mints a *new* version, so a file named from the previous attempt
  silently becomes local-only. This has now caused drift twice, once from an
  agent that had just written the rule down. `supabase migration list` shows it
  immediately — anything with an empty `local` or `remote` is drift.
- **`activity_log` has exactly one non-trigger writer: the `admin-users` edge
  function, as service_role.** Everything else is written by `log_activity()`
  on INSERT, and the client must never write it directly — that part of the
  rule stands. User lifecycle is the exception because it happens in
  `auth.users`: deactivation is a `banned_until` change in a schema no trigger
  here can watch, and a role change is a DELETE plus an INSERT on `user_roles`
  that would log as two events describing neither. Only the function knows the
  intent. Its inserts deliberately swallow errors so auditing can never fail an
  account operation, which also means a missing service_role INSERT grant would
  surface only in the edge-function logs, never in the UI.
- **`formatMoney` mixes two kinds of space, and the difference is load-bearing.**
  Non-breaking inside the number and inside "F CFA"; an ordinary breakable space
  between them. Make that last one non-breaking and the whole string becomes
  atomic — it cannot wrap, so it overflows and gets clipped by any card narrower
  than it, silently and at every viewport.
- **An IntersectionObserver sentinel inside a scroll container must set
  `root` to that container.** With the default root it measures against the
  viewport, so a feed that lives below the fold in its own scroll box never
  fires no matter how far the reader scrolls inside it. Also give the box left
  padding if its children are negatively positioned: setting `overflow-y` makes
  `overflow-x` compute to `auto`, which clips them.
- **Chart series use `--color-chart-1..5`, never the brand teals.**
  `--color-teal-950` and `--color-teal-900` measure OKLCH chroma 0.045 and
  0.059, under the 0.1 categorical floor, and they are near-identical in hue —
  as adjacent chart segments they read as two grays. The chart tokens are
  stepped separately for each mode (the dark lightness band is 0.48–0.67 against
  light's 0.43–0.77, so light values do not carry over) and are validated with
  the dataviz skill's `validate_palette.js`. Re-run it if you change one.
- **PostgREST can only embed through a real FK.** `investors.user_id`,
  `expenses.recorded_by`, and `activity_log.user_id` originally pointed
  at `auth.users` (correct for integrity, since that's the real FK
  target) — but the client can't query `auth.users` at all, and
  PostgREST couldn't auto-embed `profiles(...)` through a FK that points
  elsewhere. Retargeted to `profiles(id)`, which mirrors `auth.users`
  1:1 via trigger.
- **`user_roles` queries scoped to `college_id = X` silently exclude
  `super_admin`** (whose row has `college_id IS NULL`). Every query
  against `user_roles` that's meant to include admins must filter
  `college_id.eq.X,college_id.is.null`, not just `.eq()`.
- **Supabase Vault ≠ Edge Function Secrets.** Vault (`vault.secrets`, set
  from the dashboard's Vault page) is a *database* store read via SQL.
  `Deno.env.get()` inside an Edge Function reads a completely different
  store — Edge Function Secrets (`supabase secrets set`, or Dashboard >
  Edge Functions > Secrets). Putting the R2 credentials in Vault made every
  `Deno.env.get()` return `undefined`; because the R2 client was built at
  module scope, that threw during module load, so the function never booted
  and *every* request — including the CORS preflight — returned a bare 500.
  In the browser that surfaces only as "Failed to fetch". Two lessons:
  never construct clients from env at module scope in an Edge Function, and
  reach for `get_logs` (service `edge-function`) first — it showed
  `OPTIONS | 500` immediately.
- **Presigned R2 uploads need bucket CORS.** The browser PUTs directly to
  R2, and it sends `Content-Type: image/jpeg`, which is *not* a
  CORS-safelisted value — so it triggers a preflight. The bucket's CORS
  policy must allow `PUT` and the `Content-Type` header from the app origin
  (scheme + host + port must match exactly).

## File uploads (Cloudflare R2)

`supabase/functions/storage-sign/` mints 5-minute presigned PUT URLs and
performs authorized deletes; `src/lib/uploads.ts` is the client half.
Object keys are **server-derived, never client-supplied** — a client-chosen
key would let any caller overwrite any object. Layout: `logos/<uuid>.<ext>`,
`avatars/<user-id>/<uuid>.<ext>`, `receipts/<year>/<uuid>.<ext>`. Only the
key is stored in Postgres; the public base URL is deployment config
(`VITE_R2_PUBLIC_BASE_URL`). Replacing a file deletes the old object, but
only *after* the row pointing at the new key has committed.

## Deliberately absent by design

These are scope decisions, not oversights. Current status and near-term gaps
live in `STATE.md`, not here.

- Students, teachers and classes have no tables — that is Phase 7. The
  Dashboard's "420 élèves, 18 enseignants" figures are hardcoded mock data in
  `App.tsx`, and the Teachers/Students/Classes screens are placeholders.
- `other_income` still has no write UI on purpose — rows go in by hand. It holds
  lump-sum revenue such as student fees, and it is by far the largest inflow
  (178,500,000 of the 231,857,144 pool). It now reads out on the dashboard,
  because leaving it out of the balance made a healthy account report
  −102,928,756 F CFA. See `docs/refactor-plan.md` for the full reasoning.
- Expenses have no line-item table and no work-package table. Each ledger row
  is one expense, and categories carry the grouping.

## Datatable convention (verified against ExpensesPage/UsersPage/InvestorsPage)

Every data table in the app follows this exact pattern — match it for any new one:
- Container: `<div className="rounded-md border border-ink/10 bg-paper overflow-hidden"><div className="overflow-x-auto">`
- Header: `<TableHeader><TableRow className="border-b border-ink/10">` with `<TableHead className="text-xs font-display font-semibold text-ink-soft">`
- Body rows: `<TableRow className="border-b border-ink/10 last:border-0 hover:bg-teal-100/30">`
- Cells: `text-xs` always. Primary identifiers: `font-display font-semibold text-ink`. Subtext: `text-ink-soft`. Money: `formatMoney(amount)` with `font-display font-bold text-ink`.
- Row actions: `h-8 w-8 text-ink-soft hover:text-teal-950 hover:bg-teal-100/50`.
- Non-essential columns: `hidden sm:table-cell` / `hidden md:table-cell`.

## Testing discipline

Before applying any migration to the real project: stand up a throwaway
local Postgres (`brew install postgresql@16`, a scratch data dir, stub
`auth.users`/`auth.uid()`), run the migration for real, and exercise the
actual RLS behavior as a non-superuser role — not just "it parses."
This caught four real bugs during the Supabase migration that
`get_advisors` alone would not have (a broken window-function view, a
recursive-policy trap, a silently-wrong pool-total calc, and the
`super_admin` exclusion bug above). Always run `get_advisors` (security +
performance) after any schema change regardless.

## Context compression protocol

Chat context is the most expensive and least durable place to keep a fact.
Facts travel in one direction only, and get shorter at every step:

```
chat  →  docs/<topic>-audit-<date>.md  →  STATE.md  →  AGENTS.md (this file)
        (full evidence, written once)    (≤60 lines)   (only what outlives
                                          what is true   the current work)
                                          right now)
```

**Rules, all of them cheap to follow:**

1. **Never duplicate across tiers.** If a fact is in `STATE.md`, this file
   should not restate it — it should be *replaced* by it when it stops being
   temporary. A fact in two files will drift.
2. **Deep investigations get one dated file in `docs/`**, written once, with
   the raw numbers. `STATE.md` then carries a single line pointing at it, not
   a summary of it. This is what keeps `STATE.md` short while keeping the
   evidence.
3. **One fact per line. Absolute dates.** No "we discussed", no "as mentioned",
   no narrative of how the conclusion was reached — only the conclusion and, if
   it is surprising, the one number that forces it.
4. **Delete superseded lines, do not annotate them.** "Formerly X, now Y" is
   two facts where one is wrong. Git already holds the history.
5. **Compact at batch boundaries**, not continuously — when a batch of work
   closes, fold what survived into the right tier and delete the rest.
6. **Never record what git, the code, or `CLAUDE.md` already says.** Schema
   shape, file structure and past fixes are all recoverable; judgement calls
   and measured surprises are not.

The test for whether a line belongs here at all: *would a competent agent make
the wrong call without it?* If it would merely be nice to know, drop it.

## Pointers

- `docs/refactor-plan.md` — full architecture decision record
- `docs/phase-0-checklist.md` — the cleanup pass (Tauri/libSQL removal)
- `docs/animation-backlog.md` — motion/animation fixes, not yet applied
- `CONTRIBUTING.md` — workflow for making changes
- `README.md` — setup instructions
