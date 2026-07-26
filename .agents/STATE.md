# Current State — Wagnon Budget

Last updated 2026-07-26. Cap: 60 lines. See the compression protocol in
`AGENTS.md` before adding to this file.

## Recently landed

- R2 uploads work end to end for the college logo and profile avatars.
- Settings split into three sections; college identity is admin-only.
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

1. **Free wins** — done, except this file's own rewrite.
2. **Payload & first paint** — self-host fonts (~1.5 s blocking), rework the
   login artwork (591 KB fetched on mobile and never rendered), drop Realtime.
3. **Make it measurable** — seed the real project, commit the bench script.
   Sam approved seeding the real project rather than a branch.
4. **Perceived speed** — synchronous auth hydration, persisted cache.
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
- The database is effectively empty (0 investors, 0 contributions, 1 expense),
  so no performance claim can be verified until batch 3 lands.

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
