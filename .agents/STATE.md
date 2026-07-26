# Current State — Wagnon Budget

Last updated 2026-07-26. Cap: 60 lines. See the compression protocol in
`AGENTS.md` before adding to this file.

## Recently landed

- R2 uploads work end to end for the college logo and profile avatars.
- Settings split into three sections; college identity is admin-only.
- Batch 1, free wins: money no longer wraps mid-currency, the hardcoded admin
  email is gone from the login form, a theme bootstrap script in `index.html`
  kills the dark-mode flash, and the three light-mode semantic colours pass AA.
- The dashboard's false negative balance is fixed. `dashboard_summary` returns
  `total_resources` — every contribution plus `other_income`, mirroring the
  `college_pool` view — so it reads +79,321,244 instead of −102,928,756. The
  four stat cards now reconcile on screen and colour by sign.
- "Répartition du budget" is a doughnut (`BudgetDonut.tsx`). Card 2 is
  "Encaissements", not "Revenus": that would have counted 53,357,144 of
  investor capital as money the college earned.
- Every data table pages at ten rows (`components/TablePager.tsx`). Expenses
  pages server-side via `expenses_page()` — 656 kB per load down to 4.5 kB, and
  that page also carries the KPI strip and category totals that used to be
  derived from the same full download. Categories (9 rows), investors (15) and
  users (1) page in memory via `usePagedRows`, because a round trip per click
  would be strictly slower at those sizes. Investors gained a name/phone search
  and a paid/owing filter; expenses search is server-side, debounced 300 ms.
- Money can wrap between the amount and "F CFA" but never inside either. It was
  joined entirely with non-breaking spaces, which made it atomic and silently
  clipped every KPI card.
- The activity log paginates via `activity_feed()` on an opaque (cursorAt, id)
  keyset, and `dashboard_summary` delegates its 20 activities to it so one
  normaliser serves both. Non-admins now read only their own rows, so a
  non-admin's "Activités récentes" shows only their own actions.

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
4. **Perceived speed — next.** Synchronous auth hydration, persisted cache.
   Cheaper now that the payload it caches is 14 kB rather than 2.76 MB.
5. Design system — type and radius scales as tokens.
6. Dashboard redesign & architecture — the aggregate RPC, hero stat row and
   donut have landed; the router is the remaining piece, and it blocks the
   super-admin dashboard.

## Blocking and open risks

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
  `college_id`, RLS already scopes by college. It is a routing and query
  problem, and the router must land first.
- Login keeps the split layout on desktop; mobile gets the artwork as a
  full-bleed background with the form on top, one right-sized image per viewport.
