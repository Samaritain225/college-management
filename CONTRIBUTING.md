# Contributing

Practical workflow for making changes to this project. Read
[`.agents/AGENTS.md`](.agents/AGENTS.md) first — it has the architectural
rules and gotchas this document assumes you already know.

## Local setup

1. `npm install`
2. Link the Supabase CLI to the project: `npx supabase login`, then
   `npx supabase link --project-ref <ref>`
3. Copy `.env.example` to `.env.local` and fill in your project's URL and
   publishable key (Supabase dashboard → Settings → API)
4. `npm run dev`

You'll need at least one seeded user with a role in `user_roles` to log
in — there's no self-service signup. See "Seeding a user" below.

## Environments

Two Supabase projects, two deployed Workers, one Cloudflare account:

| Branch | GitHub Environment | Supabase project | Cloudflare Worker |
| --- | --- | --- | --- |
| `dev` | `development` | `huqppixiuasclwmnngxh` (dev) | `wagnon-dev` |
| `main` | `production` | `etouhinfpmiexfhjebzh` (college-management-prod) | `wagnon` |

A push to either branch deploys automatically (`.github/workflows/deploy.yml`
picks the GitHub Environment, and therefore the `VITE_*` values, by branch).
There is no manual promotion step — merging `dev` into `main` *is* the
release. `main` should be a protected branch requiring a PR, so production is
only ever reached through a reviewed merge, never a direct push.

Local development (`npm run dev`) always points at the dev project via
`.env.local` — never point local dev at production credentials.

## Branches and commits

- Branch off `dev`, not `main`. Name branches by what they do:
  `feat/...`, `fix/...`, `refactor/...`, `chore/...`. Merge feature branches
  back into `dev`; open a PR from `dev` into `main` when you're ready to
  release to production.
- Commit messages: imperative summary line, then a body explaining *why*,
  not what (the diff already shows what). If a commit fixes a bug found
  while building something else, say so explicitly rather than burying it
  — this repo's history relies on that (see the recent Supabase-migration
  commits for the level of detail expected).
- Don't bundle unrelated changes into one commit. Cleanup, schema, and
  feature work are separate commits even on the same branch.

## Schema changes

This project is bitten by the same category of bug repeatedly when
migrations are written blind (see `.agents/AGENTS.md`'s gotchas section).
**Test locally before applying to the real project:**

```bash
brew install postgresql@16   # once
PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
pg_ctl -D /opt/homebrew/var/postgresql@16 -o "-p 5433" -l /tmp/pg16-test.log start
createdb -p 5433 scratch_test
psql -p 5433 -d scratch_test -c "create extension if not exists pgcrypto;"
```

Stub the Supabase-managed pieces your migration needs (`auth.users`,
`auth.uid()`, the `authenticated`/`anon` roles) with a small SQL file, run
your real migration against that database, and — this is the part that
actually catches bugs — **exercise it as a non-superuser role**, not just
check that it parses:

```sql
grant authenticated to current_user;
set role authenticated;
select set_config('test.current_user_id', '<a fake user id>', false);
-- now run real inserts/selects and confirm RLS actually blocks what it should
```

Once it's verified, apply it for real via the Supabase MCP
(`apply_migration`) or `supabase db push`, then:

1. Run `get_advisors` (security *and* performance) — fix what it flags.
2. Save the exact SQL as a file in `supabase/migrations/`, named with the
   **version Supabase actually assigned it** (check `supabase migration
   list` — don't invent a timestamp, they have to match or the CLI
   considers local and remote out of sync).

## Edge Functions

Anything needing the `service_role` key (creating/editing/banning users,
reading `auth.users`) goes in `supabase/functions/`, never in client code.
Deploy via the MCP `deploy_edge_function` tool, then save the deployed
source back into the repo so it isn't only living on Supabase's servers.

If a function needs to call GoTrue's Admin API
(`auth.admin.createUser`/`updateUserById`/`listUsers`), the
auto-provided `SUPABASE_SERVICE_ROLE_KEY` will likely **not** work — see
the key-format gotcha in `.agents/AGENTS.md`. Fetch the legacy JWT and set
it as a named custom secret instead.

## Seeding a user

There's no UI for creating the first user (chicken-and-egg — creating
users requires being logged in as an admin). Use the Auth Admin API
directly, server-side, with the legacy `service_role` JWT:

```js
await supabase.auth.admin.createUser({ email, password, email_confirm: true })
```

Then insert matching rows into `profiles` (or let the `handle_new_user`
trigger do it via `user_metadata.full_name`) and `user_roles`.

**Never** insert directly into `auth.users` via SQL — it skips password
hashing and identity linking that GoTrue manages internally.

## Code conventions

- `src/lib/queries.ts` is a **translation layer**: it exposes the field
  names the UI already expects, even where they differ from the database
  column names. Don't "fix" a field name in queries.ts without checking
  every consumer — that's deliberate, not an oversight.
- Every data table matches the pattern documented in `.agents/AGENTS.md`
  — check an existing one (`ExpensesPage.tsx`, `UsersPage.tsx`) before
  inventing a new table style.
- No comments explaining *what* code does — names should do that. Comment
  only the non-obvious *why* (a workaround, a constraint, a gotcha).
- Don't add abstractions, config flags, or error handling for scenarios
  that can't happen. Match the scope of the change to what was asked.

## Before pushing

```bash
npm run build   # tsc -b && vite build — must be clean
```

For anything touching a page's rendering or data fetching, actually load
it in a browser and click through the change — a clean build doesn't mean
the feature works. Check the browser console for errors, not just that
the page renders.
