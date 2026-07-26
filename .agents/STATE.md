# Current State — Wagnon Budget

Where the project stands right now. Read this and `AGENTS.md` before doing
anything. Expect this file to change most weeks; when a line here becomes
permanently true, move it into `AGENTS.md` and delete it from here.

Last updated 2026-07-26.

## Recently landed

- File uploads to Cloudflare R2 work end to end for the college logo and for
  profile avatars, verified by a real upload that stored the object key in
  Postgres and served the image publicly.
- The Settings screen was split into three sections (Collège, Mon compte, À
  propos), and college identity is now editable only by admin and super_admin.
- College identity moved out of browser localStorage into the `colleges` table,
  so the name and logo are finally shared across devices instead of per-browser.
- All of this is merged into `main`. The `refactor/supabase-migration` branch is
  not ahead of `main`, so there is nothing waiting in a pull request.

## Blocking and open risks

- CAPTCHA protection is switched off in Supabase Auth right now, which means the
  login endpoint has no bot protection at all. It was turned off to unblock
  login after Turnstile was made inert on the client. Re-enable it once the app
  is deployed to Cloudflare Pages, because Turnstile needs a real domain and the
  Pages domain provides one at no cost.
- Leaked-password protection is also disabled in Supabase Auth. The advisors
  flag it; it is a dashboard setting rather than a code change, so it needs
  Sam's decision.
- The delete-on-change behaviour for uploads has never been exercised with a
  second upload, and avatar upload has never been run at all. Both share the
  code path that the logo upload proved, but neither is verified.

## Next two to four items

1. Query the `college_pool` and `expense_standings` views instead of
   downloading whole tables to sum them in JavaScript, and remove the duplicate
   fetches in `src/lib/queries.ts`. One Dashboard load currently makes about ten
   Supabase round trips and fetches `expenses` four times.
2. Initialise auth state synchronously from the cached user so returning users
   stop seeing the session spinner. The cache already exists but is read after
   first paint, which defeats it.
3. Add TanStack Query so pages render cached data immediately instead of
   replaying skeletons on every reload.
4. Add a router. Do this before any work starts on the super-admin dashboard,
   not after.

## Decided but not yet built

- Stay on Vite and React. A framework change was considered and rejected:
  every screen is behind auth, so nothing can be pre-rendered, and server
  rendering would add a round trip before first paint on the weak connections
  this app targets.
- The super-admin dashboard needs no new framework or schema work. The tables
  already carry `college_id`, super_admin rows are global, and RLS already
  scopes by college, so it is a routing and query problem.

## Waiting on Sam

- Whether to re-enable leaked-password protection in Supabase Auth.
