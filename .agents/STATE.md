# Current State — Wagnon Budget

Last updated 2026-07-26. Cap: 100 lines. See the compression protocol in
`AGENTS.md` before adding to this file.

## Recently landed

- R2 uploads work end to end for the college logo and profile avatars.
- Settings split into three sections; college identity is admin-only.
- Batch 1, free wins: mid-currency wrapping, the hardcoded admin email, the
  dark-mode flash, and three sub-AA light-mode colours.
- The dashboard's false negative balance is fixed — it read −102,928,756 on an
  account holding +79,321,244, because it summed cotisation alone and never
  `other_income`. The four stat cards now reconcile on screen and colour by sign.
- "Répartition du budget" is a doughnut. Card 2 is "Encaissements", not
  "Revenus": that would count investor capital as money the college earned.
- Every data table pages at ten rows. Expenses pages server-side via
  `expenses_page()` (656 kB → 4.5 kB, KPIs and category totals included, search
  debounced 300 ms); the small tables page in memory via `usePagedRows`.
- The activity log paginates via `activity_feed()` on a keyset cursor, and
  non-admins now read only their own rows — so a non-admin's "Activités
  récentes" shows only their own actions.
- **The app has real URLs** (react-router v7, English paths). Detail views are
  routes, so `/investors/:id` and `/users/:id` are linkable and survive a
  reload. That deleted the whole tab apparatus — `Tab`, `tabOrder`,
  `KNOWN_TABS`, the sessionStorage tab memory — and the `onBreadcrumbChange` +
  `backTrigger` channel, which existed only because detail views were state.
  `App.tsx` is 497 lines down to 27.

## Audits — both measured, both written down

- `docs/perf-audit-2026-07-26.md` — network, payload and bundle.
- `docs/ui-audit-2026-07-26.md` — contrast, type, images, layout.

Headline correction: reducing *parallel* round-trips is nearly worthless — 10
multiplexed requests measure the same wall-clock as 3 (~260 ms), because
`Promise.all` over one HTTP/2 connection already overlaps them. A *sequential*
step costs 5–10× more than an extra parallel one.

## Ordered batches

1. Free wins — done.
2. Payload & first paint — done. Fonts self-hosted, login artwork 591 KB →
   24 KB mobile / 37 KB desktop, Realtime + Storage out of the bundle (−27%).
3. Make it measurable — done. `supabase/seed/dev-seed.sql` (reversible via the
   `5eed…` id prefix); `scripts/bench.sh` is the repeatable baseline.
3b. Dashboard aggregate RPC — done. 2.76 MB → 14 kB, a 199× reduction.
4. Perceived speed — done. Auth hydrates from storage during the first render
   instead of awaiting `getSession()`, so a live session goes straight to the
   app and no session goes straight to login; only "session but no cached
   identity" still shows the spinner. Dashboard and category caches persist in
   sessionStorage.
5. **Design system — next, and the last batch.** Type and radius scales as
   tokens.
6. Dashboard redesign & architecture — done. The router landed last; the
   super-admin dashboard is now unblocked and is a routing/query problem only.

## Blocking and open risks

- Batch 4's happy path is unverified: the browser pane lost its session and an
  agent cannot log in. Confirmed by test instead — a synthetic dead session
  hydrated optimistically and was then correctly torn down, wiping both the
  cached identity and the cached balances. What nobody has watched is a *real*
  session reloading straight into the app with no spinner.

- The router cost **+28.5 kB gzipped** on the entry chunk (85.4 → 113.9), more
  than the ~20 kB estimated when choosing it. Most of that is the data-router
  runtime pulled in by `createBrowserRouter`, and this app uses no loaders or
  actions. Declarative `<BrowserRouter>` + `<Routes>` would drop it, at the cost
  of replacing the `useMatches()`/`handle` breadcrumb with a path→label map.
  Worth deciding before the next payload pass.
- The non-admin redirect off `/users` and `/investors` is unexercised: the
  project has exactly one user, a super_admin. The logic is `RequireRole` with a
  `<Navigate to="/" replace />` fallback, confirmed by reading only.
- **The `admin-users` audit logging is written but never deployed or run.** The
  Supabase MCP connection dropped and neither the Supabase CLI nor Deno is
  installed locally. Deploy it, create a test user, confirm a `USER_CREATE` row
  lands, and confirm service_role holds INSERT on `activity_log` — the code
  swallows that error by design, so a missing grant leaves the trail empty.
- Category creation is unaudited: `expense_categories` has no `log_activity()`
  trigger, so `EXPENSE_CATEGORY_CREATE` is handled in the UI but never emitted.
- Under a period filter "Solde Restant" is a *flow*, not a balance — July 2026
  alone nets −2,782,643, so it reads red and "Découvert" on a solvent college.
  Needs a period-aware label or exemption from the filter.
- `supabase/migrations/` has drifted from the applied history: no local file for
  `20260725015335_grant_service_role_full_access`, and the branding migration is
  `20260725143000` locally against `20260725133215` in the database.
- CAPTCHA is off in Supabase Auth — no bot protection on login. Re-enable once
  deployed to Pages, which supplies the domain Turnstile needs.
- Leaked-password protection is off. Dashboard setting, waiting on Sam.
- Delete-on-change for uploads has never run with a second upload, and avatar
  upload has never run at all. Same code path as the proven logo upload.

## Decided, not yet built

- Stay on Vite and React. Every screen is behind auth so nothing pre-renders,
  and SSR would add a round trip before first paint on these connections.
- The super-admin dashboard needs no new framework or schema work — tables carry
  `college_id`, RLS already scopes by college, and the router is in place. It is
  a routing and query problem now.
- Login keeps the split layout on desktop; mobile gets the artwork as a
  full-bleed background with the form on top, one right-sized image per viewport.
