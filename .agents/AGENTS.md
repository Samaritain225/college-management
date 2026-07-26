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
- **Tailwind v4 needs the `--color-` prefix inside `@theme` to generate a
  utility at all.** A plain `:root { --sidebar: ... }` custom property
  does *not* make `bg-sidebar` work — the class is silently a no-op. This
  is exactly what caused the mobile sidebar sheet to render fully
  transparent (its own dialog backdrop showed through). Any new design
  token must go in `@theme` as `--color-<name>`.
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
- `other_income` exists as a table with no UI on purpose. It holds lump-sum
  revenue such as student fees, and it is load-bearing: without it the
  dashboard understates the pool by roughly 17.6 M FCFA and the treasurer
  stops trusting the app. See `docs/refactor-plan.md` for the full reasoning.
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

## Pointers

- `docs/refactor-plan.md` — full architecture decision record
- `docs/phase-0-checklist.md` — the cleanup pass (Tauri/libSQL removal)
- `docs/animation-backlog.md` — motion/animation fixes, not yet applied
- `CONTRIBUTING.md` — workflow for making changes
- `README.md` — setup instructions
