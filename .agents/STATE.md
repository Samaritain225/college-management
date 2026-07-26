# Current State — Wagnon Budget

Last updated 2026-07-26. Cap: 60 lines. See the compression protocol in
`AGENTS.md` before adding to this file.

## Recently landed

- R2 uploads work end to end for the college logo and profile avatars.
- Settings split into three sections; college identity is admin-only.
- The dashboard's false negative balance is fixed. `dashboard_summary` now
  returns `total_resources` (every contribution plus `other_income`, mirroring
  the `college_pool` view) and the balance reads +79,321,244 instead of
  −102,928,756. The stat row was reworked so the four cards reconcile on screen:
  Fonds Engagé 75,000,000 (66% libéré) · Ressources Réelles 231,857,144 (dont
  178,500,000 autres revenus) · Fonds Dépensé 152,535,900 (66% des ressources) ·
  Solde Restant +79,321,244, now coloured by sign rather than always green.
- Every data table pages at ten rows with a numbered pager
  (`components/TablePager.tsx`). Expenses pages on the server via
  `expenses_page()` — 656 kB per load down to 4.5 kB, and that page now also
  carries the KPI strip and category totals that used to be derived from the
  same full download. Categories (9 rows), investors (15) and users (1) page in
  memory through `usePagedRows`, because a round trip per page click would be
  strictly slower at those sizes. Investors gained a name/phone search and a
  paid/owing filter; expenses search is server-side and debounced 300 ms.
- Every data table paginates at ten rows with numbered pages
  (`TablePager` + `usePagedRows`). Expenses pages on the server via
  `expenses_page()` — 1,801 rows, and its KPI strip and category totals now come
  back with the page, so the screen no longer downloads the whole ledger.
  Categories (9), investors (15) and users (1) page in memory on purpose: a
  round trip per click would be strictly slower at those sizes.
- Money strings can wrap between the amount and "F CFA" but never inside
  either. They used to be joined entirely with non-breaking spaces, which made
  them atomic and silently clipped every KPI card — "152 535 900 F CFA" wants
  202px and the cards gave it 153px.
- The activity log is paginated and scoped. `activity_feed()` pages on an
  opaque (cursorAt, id) keyset — never OFFSET, and never on the displayed
  `createdAt`, which is truncated to whole seconds while real rows carry
  microseconds. `dashboard_summary` delegates its 20 activities to it, so one
  normaliser serves both. The dashboard card and a new per-user card on the
  user-detail screen both infinite-scroll through it.
- Non-admins now read only their own `activity_log` rows (admin/treasurer/
  super_admin still see the whole college). Deliberate consequence: a
  non-admin's dashboard "Activités récentes" shows only their own actions.
- "Répartition du budget" is a doughnut now (`BudgetDonut.tsx`, replacing
  `BudgetBar.tsx`): top five categories plus "Autres", amount alone in the hole
  because `formatMoney` joins with non-breaking spaces and overflows rather than
  wrapping, label and ratio under the ring. Card 2 is "Encaissements" — not
  "Revenus", which would have counted 53,357,144 of investor capital as money
  the college earned.
- Batch 1 of the audit backlog: money no longer wraps mid-currency, the
  hardcoded admin email is gone from the login form, a theme bootstrap script
  in `index.html` kills the dark-mode flash, and the three light-mode semantic
  colours now pass WCAG AA.

## Two audits, both measured, both written down

- `docs/perf-audit-2026-07-26.md` — network, payload and bundle.
- `docs/ui-audit-2026-07-26.md` — contrast, type, images, layout.

The headline correction from the perf audit: **reducing parallel round-trips is
nearly worthless** — 10 multiplexed requests measure the same wall-clock as 3
(~260 ms), because `Promise.all` over one HTTP/2 connection already overlaps
them. A *sequential* step costs 5–10× more than an extra parallel one. The
round-trip work is a scaling fix (2.9 MB per dashboard load at two years of
data), not a current one.

## Ordered batches

1. **Free wins** — done.
2. **Payload & first paint** — done. Fonts self-hosted (removed ~1.5 s of
   blocking on two extra origins), login artwork 591 KB → 24 KB mobile /
   37 KB desktop and now actually rendered on phones, Realtime + Storage
   stubbed out of the bundle (vendor chunk −27%).
3. **Make it measurable** — done. Real project seeded
   (`supabase/seed/dev-seed.sql`, fully reversible via `5eed…` id prefix);
   `scripts/bench.sh` is the repeatable baseline.
3b. **Dashboard aggregate RPC** — done, pulled forward once the seed proved it
   was the largest cost. `dashboard_summary()` replaces ten calls with one:
   **2.76 MB → 14 kB, a 199× reduction**, verified to return identical totals.
   Also removed the dependent activity-name query and five now-dead client
   functions that each downloaded whole tables.
4. **Perceived speed** — synchronous auth hydration, persisted cache. Cheaper
   to do now that the payload it caches is 14 kB rather than 2.76 MB.
5. **Design system** — type and radius scales as tokens.
6. **Dashboard redesign & architecture** — mock-vs-real separation, hero
   number, sparklines, aggregate RPC, router.

Live task list is the harness task tool (16 items, ids referenced above).

## Blocking and open risks

- CAPTCHA is off in Supabase Auth — the login endpoint has no bot protection.
  Re-enable once deployed to Pages, which supplies the domain Turnstile needs.
- Leaked-password protection is off. Dashboard setting, waiting on Sam.
- Delete-on-change for uploads has never run with a second upload, and avatar
  upload has never run at all. Same code path as the proven logo upload.
- Under a period filter, "Solde Restant" is a *flow*, not a balance — July 2026
  alone nets −2,782,643, so the card now reads red and "Découvert" on a college
  that is not overdrawn. The card needs either a period-aware label or exemption
  from the filter.
- `supabase/migrations/` has drifted from the applied history: no local file for
  `20260725015335_grant_service_role_full_access`, and the branding migration is
  `20260725143000` locally against `20260725133215` in the database. The
  convention in AGENTS.md says versions must match exactly.

## Decided, not yet built

- Stay on Vite and React. Every screen is behind auth so nothing pre-renders,
  and SSR would add a round trip before first paint on the connections this app
  targets.
- The super-admin dashboard needs no new framework or schema work — tables
  already carry `college_id`, RLS already scopes by college. It is a routing
  and query problem, and the router must land first.
- Login keeps the split layout on desktop; mobile gets the artwork as a
  full-bleed background with the form on top, served as one right-sized image
  per viewport rather than suppressed.
