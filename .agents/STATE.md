# Current State — Wagnon Budget

Last updated 2026-07-29. Cap: 100 lines. See the compression protocol in
`AGENTS.md` before adding to this file.

## Landed — zod + react-hook-form form-validation migration, 2026-07-29

All six forms (UsersPage, ExpensesPage, InvestorsPage, LoginPage,
CollegeIdentitySection, ProfileSection) now validate through `zod` schemas
resolved via `react-hook-form`. Full evidence, per-page gotchas, and what
was verified live vs. by diff review only: `docs/form-validation-migration-
2026-07-29.md`. The durable convention (shared helpers, `mode: "onTouched"`,
where schemas live) is now in AGENTS.md, not repeated here.
While migrating ProfileSection, also fixed a real latent bug: the
self-service password form only checked length ≥ 8 instead of GoTrue's real
character-class policy — now shares the same schema UsersPage uses.
Two live-verification gaps worth closing next time someone's in the app:
CollegeIdentitySection's logo-upload-plus-save path, and an actual LoginPage
sign-in (both were validation-only checks, not full round trips).
Uncleanable test artifacts from this work, same bucket as the ones below:
a "Test Zod Category" + a 25 000 F CFA test expense, and a "Test Zod
Investor" row (1 000 000 F CFA) — no delete path exists for any of them.
- Not yet decided: whether to also add TanStack Query for data fetching —
  recommended as a *separate* follow-up (see conversation), not bundled with
  this migration, since data fetching (`useEffect` + manual loading/error
  state in ~8 files, `src/lib/queries.ts`) is an orthogonal concern from form
  validation.

## Landed — unified "Mon compte", 2026-07-29

The app used to have two different self-profile screens: the header avatar's
"Mon compte" opened `/profile`, which reused the admin `UsersPage` detail view
(email/role/password fields, no avatar upload); Settings' own "Mon compte" tab
rendered a separate `ProfileSection` (avatar upload, name/phone, password) with
no activity history. Reconciled by keeping `ProfileSection` (settings/
ProfileSection.tsx) as the one self-profile page and retiring the `UsersPage`
reuse: the header link now points at `/settings?tab=profile`
(`ActiveUserBar.tsx`), `SettingsPage.tsx` reads that query param to open
directly on the account tab, and the old `/profile` route is now a redirect to
the same URL so bookmarks don't 404. Also ported over what `UsersPage`'s
detail view had that `ProfileSection` didn't: a "Mon activité" card using the
same `ActivityFeed` component, scoped to the signed-in user. Removed the now-
dead `profileModeForceUserId` prop and the `showBack`/breadcrumb branches in
`UsersPage.tsx` that existed only to serve the retired `/profile` reuse.
Verified live: header link lands on Settings' account tab with activity
feed populated, `/profile` redirects correctly, `/users/:id` (admin viewing
another user) still works unaffected. `tsc -b --force` clean, no new oxlint
warnings.

## In flight — account lifecycle, notifications

- `docs/access-lifecycle-plan-2026-07-29.md` is the agreed plan for five asks:
  soft delete with a super-admin archive, attribution for deleted users, email
  reuse rules, investor read-only, and expense notifications.
- **Investor read-only is landed**, verified live with Test Investor
  (`b9dc85ea`): `canManageFinance()` in `auth.tsx` mirrors
  `private.can_manage_finance()` in SQL. `/teachers`, `/students`, `/classes`
  now redirect investors to the dashboard (`RoleRoute` in `routes.tsx`);
  `/investors` is open to them read-only. The sidebar hides Académique and
  shows Investisseurs for investors. Expenses/categories hide their "create"
  buttons; the investors list/detail hide edit and create. `InvestorsPage`
  skips `listAdminUsers()` (the account-linking lookup) entirely for
  non-managers — that endpoint is admin/treasurer/super_admin-only, so an
  investor calling it always 403s.
- **Soft delete + attribution + email reuse are also landed**
  (migrations `20260729100000_soft_delete_profiles`,
  `20260729100500_soft_delete_email_capture`,
  `20260729101000_expenses_page_recorded_by_deleted`): `admin-users`'s DELETE
  now bans the auth account permanently, tombstones its email to free the
  address, and keeps the `profiles` row (`deleted_at`/`deleted_by`/
  `deleted_email`) instead of erasing it, so financial history stays
  attributable to a name. `expenses_page` renders "(compte supprimé)" for a
  soft-deleted `recorded_by`. Only expense notifications (part 5) remain
  unbuilt.
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
real URLs via react-router, the expenses-page mobile pass, `storage-sign`
scoped by college, the account-lifecycle migrations above, and a pass of
expense-flow polish (attachment preview, required category, mobile sheet,
independent table period filter, button/currency standardization, create
confirmation) are all shipped — see git log and `AGENTS.md`, not this file,
for detail. Migration history is aligned; `supabase migration list` is the
source of truth, not a count here.
**The app is live**: `.github/workflows/deploy.yml` deploys to Cloudflare
Workers (not Pages — that line was stale) on every push to main (`06daef5`,
hardened in `654ae82`/`4ff51c2`).

## In flight — invitation emails and forced onboarding, 2026-07-30

Sam wants a new user created in `UsersPage` to receive an email (via Resend)
with a one-time link, land on the platform already signed in, and be forced
to set their own password before anything else is usable. Built on
`feat/invite-emails-onboarding`, code complete, **not yet configured or
end-to-end tested** — blocked on Sam's Resend account having no verified
sending domain, so real delivery only works to the Resend account owner's own
address until one is verified.

- **Landed**: migration `20260730195256_add_must_set_password_onboarding`
  (dev only — `profiles.must_set_password`, column-revoked from
  `authenticated` same as `deleted_at`/`is_system_account`, cleared only via
  the new `complete_password_setup()` RPC scoped to `auth.uid()`).
  `admin-users` CREATE no longer accepts a password — it creates the account,
  arms the flag, and mints+emails a `type: "recovery"` link via the new
  `POST /admin-users/:id/invite` (also reachable standalone, as a resend). An
  admin setting a password on the edit form now re-arms the same flag, so an
  admin-chosen password is always temporary too. New shared
  `supabase/functions/_shared/email.ts` (Resend POST, env read inside the
  handler per the storage-sign module-scope gotcha) and `_shared/templates/
  invite.ts`, meant to be reused by the still-unbuilt expense notifications.
  Client: `src/lib/supabase.ts` flips `detectSessionInUrl` to `true` (was
  `false` — would have silently dropped every invite token), `AuthUser` gains
  `mustSetPassword`, new `SetPasswordPage` + `RequireOnboarded` route wrapper
  in `routes.tsx` hold a gated user on a set-password screen in place of
  `AppShell` (deep link survives), `UsersPage` drops the password field from
  create and adds a "Renvoyer l'invitation" action. `tsc -b --force`, oxlint,
  and `npm run build` all clean. `admin-users` deployed to dev (v19),
  confirmed booting via a live `OPTIONS` 200 — not yet exercised by an actual
  invite send.
- **Not yet done**: `RESEND_API_KEY`/`EMAIL_FROM`/`APP_URL` secrets are unset
  on both projects — until then `sendInviteEmail` returns `emailSent: false`
  with a config-error message rather than throwing, so account creation still
  works, just without mail. Also unset: `R2_PUBLIC_BASE_URL` as an edge
  secret (separate from the existing `VITE_`-prefixed client one — Deno can't
  read Vite env vars), which only affects whether the email shows a college
  logo, nothing functional. Auth → Redirect URLs needs `/bienvenue` added for
  both environments plus localhost. Auth → Email OTP expiry (default 1h)
  worth raising given the ~70% connectivity this app targets. None of this
  has been end-to-end verified live — see the plan's verification section
  for the split (Sam clicks through, agent reads the result back over MCP).

## In flight — dev/prod environment split, 2026-07-30

Sam created a second Supabase project, `college-management-prod`
(ref `etouhinfpmiexfhjebzh`, eu-north-1), to be production; the existing
project (`huqppixiuasclwmnngxh`) stays as dev. `origin/dev` is the
development branch.

**The first attempt at this shipped a real production outage, now fully
resolved and verified.** Two independent causes, both fixed:

1. PR #8 added `--env dev` on the wrangler *deploy* step, but
   `@cloudflare/vite-plugin` resolves the environment at *build* time into
   `dist/wrangler.json`, so the flag selected nothing and a push to `dev`
   deployed straight onto the production Worker (`wagnon`). Separately, PR #9
   then merged to `main` and built against the *empty* prod Supabase project
   (zero tables — nobody could log in) because the prod database bootstrap
   hadn't happened yet. Fixed: `wrangler.jsonc` now declares explicit
   `env.production` (`wagnon`) and `env.dev` (`wagnon-dev`); `deploy.yml`
   sets `CLOUDFLARE_ENV` on the **build** step and no longer passes `--env`
   to the deploy step. See the `CLOUDFLARE_ENV` gotcha in `AGENTS.md`.
2. **`wagnon` had Cloudflare's own native "Workers Builds" Git integration
   connected** (Dashboard → Workers & Pages → wagnon → Settings → Builds),
   completely separate from `.github/workflows/deploy.yml`. It auto-deployed
   on pushes using its own dashboard-configured env vars — which still
   pointed at the dev project — so even after the `CLOUDFLARE_ENV` fix
   landed and GitHub Actions deployed correctly, this second pipeline kept
   silently overwriting `wagnon` right back to the dev config on every push.
   Confirmed by comparing the live-served asset filenames/content against
   every known GitHub Actions run — none matched, proving a build from
   *outside* our workflow was live. **Sam disabled it in the Cloudflare
   dashboard.** If a Worker deploy ever again doesn't match what
   `deploy.yml` built, check for this before debugging the workflow file —
   it produces no trace in `gh run list` at all.

- **Landed and verified end-to-end**: all 23 migrations applied to prod,
  schema/advisors match dev, college row + settings inserted (placeholder
  "Wagnon" name, same UUID as dev — real branding still needs Sam's input).
  Both edge functions deployed to prod; `LEGACY_SERVICE_ROLE_KEY` and the R2
  credentials are set there (verified via `supabase secrets list` — hashes
  differ per key, no more `<value>` placeholder). Two GitHub Environments
  (`production`/`development`) exist with correct per-project `VITE_*`
  values; `main` and `dev` are both protected branches (PR required,
  admin-enforced, no required-reviewer count). **Both Workers verified live**
  by fetching their actual served JS bundles and grepping the embedded
  Supabase URL: `wagnon` → `etouhinfpmiexfhjebzh.supabase.co` (prod),
  `wagnon-dev` → `huqppixiuasclwmnngxh.supabase.co` (dev). Do not trust a
  green Action checkmark alone for this class of bug — verify the live
  bundle content, since two different failure modes here both produced
  successful-looking deploys.
- **Not yet done**: the `super_admin` role binding (blocked on Sam creating
  `admin@college.ci` in the prod Dashboard — agent never touches passwords).
  R2 bucket CORS still needs the prod Worker origin added. Leaked-password
  protection still off on prod (same open item as dev).
- `.mcp.json` is temporarily repointed at the prod project ref for this
  session's bootstrap work and is **uncommitted** — must be reverted to the
  two-project form once the prod work is done. Attempting a second
  simultaneous Supabase MCP connection (dev + prod) didn't work in this
  environment: only one `mcp__supabase__*` tool namespace ever appeared,
  regardless of how many entries were in `.mcp.json`.
- The R2 bucket is **shared** between dev and prod (Sam's call).

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

- The Supabase **MCP server is back** (`mcp.supabase.com`, OAuth) — confirmed
  2026-07-29 via live `list_tables`/`list_migrations`/`get_project_url`
  calls. CLI (`supabase` 2.109, logged in and linked) is still needed for
  anything Docker-backed (`db dump`, `db diff`, `db reset`), which stays
  broken since Docker isn't running.
- CAPTCHA is still off in Supabase Auth despite the app now being deployed to
  Pages — re-enabling Turnstile with the real domain is unblocked, just not
  done yet.

- The router cost **+28.5 kB gzipped** on the entry chunk, more than the
  ~20 kB estimated — `createBrowserRouter`'s data-router runtime, unused
  since this app has no loaders/actions. Swapping to declarative
  `<BrowserRouter>` would drop it but needs a path→label map to replace the
  `useMatches()` breadcrumb first. Worth deciding before the next payload pass.
- Artefacts from live verification, still real rows in the live project: a
  "Test audit" category (permanently in the dropdown, categories have no
  delete UI) and a `test@college.ci` account.
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
  `UsersPage.tsx` and `ProfileSection.tsx` both validate against this now
  (`src/lib/passwordPolicy.ts`) — see the 2026-07-29 form-validation
  migration above; they used to disagree.
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
