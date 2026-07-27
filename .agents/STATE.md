# Current State — Wagnon Budget

Last updated 2026-07-27. Cap: 100 lines. See the compression protocol in
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
- Every data table pages at ten rows; expenses pages server-side via
  `expenses_page()` (656 kB → 4.5 kB), the small tables in memory.
- The activity log paginates via `activity_feed()` on a keyset cursor, and
  non-admins now read only their own rows — so a non-admin's "Activités
  récentes" shows only their own actions.
- The audit trail is verified end to end: creating a user and creating a
  category both land in the feed with the right copy. `admin-users` is deployed
  (ACTIVE v8) and `expense_categories` has its trigger.
- **The app has real URLs** (react-router v7, English paths). Detail views are
  routes, so `/investors/:id` is linkable and survives a reload. That deleted
  the tab apparatus and the `onBreadcrumbChange`/`backTrigger` channel;
  `App.tsx` went from 497 lines to 27.
- Migration history is aligned for the first time: 14 migrations, nothing
  local-only or remote-only.
- The period filter no longer turns balances into nonsense. Three stat figures
  divided a period flow by an all-time total; the worst read "Solde Restant /
  Découvert" in red on a solvent college. Filtered, that card is now "Flux net".
- The shell has one horizontal datum (y=48) and one left rail (x=28); sidebar
  is 12.5rem. The arithmetic behind both is in AGENTS.md — it breaks silently
  if the topbar height or the sidebar inset changes.

## Audits — both measured, both written down

- `docs/perf-audit-2026-07-26.md` — network, payload and bundle.
- `docs/ui-audit-2026-07-26.md` — contrast, type, images, layout.

Headline correction: reducing *parallel* round-trips is nearly worthless — 10
multiplexed requests measure the same wall-clock as 3 (~260 ms), because
`Promise.all` over one HTTP/2 connection already overlaps them. A *sequential*
step costs 5–10× more than an extra parallel one.

## Batches — all seven done

The audit backlog is closed. Order was not the plan's: 6 jumped ahead of 5
because the router blocked the super-admin dashboard, and 3b was pulled forward
once the seed proved the dashboard payload was the single largest cost.

Two results worth keeping: `dashboard_summary()` took the dashboard from
2.76 MB to 14 kB, and a warm reload now paints at FCP 208 ms while the network
does not answer for 5.8 s. Everything else is in git.

## Blocking and open risks

- Supabase work goes through the **CLI**, not the MCP server — the remote MCP
  endpoint (`mcp.supabase.com`, OAuth) has been down and `ToolSearch` finds no
  supabase tool. `supabase` 2.109 is installed, logged in and linked. Docker is
  not running, so `db dump`, `db diff` and `db reset` all fail; `migration
  list`, `db push`, `migration fetch` and `functions deploy` work fine.

- Two `text-[0.8rem]` remain in `components/ui/calendar.tsx`, left alone
  deliberately: it is vendored shadcn, and 0.8rem sits between `xs` and `sm`,
  so folding it would change the date picker's appearance rather than codify it.

- The router cost **+28.5 kB gzipped** on the entry chunk (85.4 → 113.9), more
  than the ~20 kB estimated when choosing it. Most of that is the data-router
  runtime pulled in by `createBrowserRouter`, and this app uses no loaders or
  actions. Declarative `<BrowserRouter>` + `<Routes>` would drop it, at the cost
  of replacing the `useMatches()`/`handle` breadcrumb with a path→label map.
  Worth deciding before the next payload pass.
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
