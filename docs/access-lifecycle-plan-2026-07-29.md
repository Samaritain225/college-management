# Implementation plan — account lifecycle, investor read-only, notifications

Written 2026-07-29. Covers five requests: soft delete with an archive,
attribution for deleted users, email reuse rules, investor read-only access,
and expense notifications with badges.

Read this alongside `.agents/AGENTS.md`. Nothing here is built yet.

---

## Part 0 — What is already true

Three of the five asks are smaller than they appear, because the groundwork
exists. Checking this first avoids rebuilding what is there.

- **Investors already cannot write finance data.** `private.can_manage_finance()`
  (`20260725005537_initial_schema.sql:350`) allows insert on `expenses`,
  `expense_categories`, `contributions` and the rest only to `admin`,
  `treasurer` and `super_admin`. An investor calling the API directly is
  rejected by Postgres. The work is UI honesty — hiding controls that would
  fail anyway — not closing a security hole.
- **Attribution survives a soft delete for free.** `recorded_by_name` is
  rendered as plain text, never a link (`ExpensesPage.tsx:1470` and `:1605`).
  As long as the `profiles` row stays, the name keeps appearing with no
  profile route to reach and no action to perform.
- **`profiles` already carries `email`**, populated from `auth.users`. That is
  the display copy, which matters for the email-reuse design below.

And one thing that is *not* free:

- **Realtime is stubbed out of the bundle on purpose.**
  `src/lib/supabase-stubs/realtime.ts` replaces `@supabase/realtime-js` through
  two aliases in `vite.config.ts`, because `SupabaseClient` constructs a
  `RealtimeClient` eagerly whether or not you use it — roughly 150 KB of source
  that shipped to every user and never did anything. Calling
  `supabase.channel()` today throws a deliberate, explicit error. Live
  notifications mean putting that weight back. See Part 5.

---

## Part 1 — Decisions locked before writing code

| Question | Decision |
|---|---|
| Investor sees whose data? | **All investors at their college**, read-only. Zero database work — current RLS already permits exactly this. Every investor will see every other investor's contribution amounts; that is accepted. |
| Notification delivery | **In-app only.** No email provider, no API key, no outward-facing sends. |
| Soft-deleted account's email | **Released for reuse** by tombstoning the `auth.users` email. Irreversible for that account. |
| Soft-deleted account's roles | **Kept**, not deleted. Access is denied by the permanent ban. Removing the rows would make the account vanish from the admin list entirely, since the list filters on having a role. |

### Why the email must be tombstoned

The rule is: a *deactivated* email stays locked, a *deleted* email becomes
reusable. Two of the three cases already behave correctly, and one does not.

| State | `auth.users` row | Email today | Wanted |
|---|---|---|---|
| Deactivated (banned) | present | locked by GoTrue | locked ✔ already correct |
| Hard deleted | gone | free | free ✔ already correct |
| Soft deleted | **present** | **locked** ✘ | free |

A soft delete keeps the auth row — that is what makes it soft — so GoTrue keeps
rejecting the address. The only way to free it while keeping the row is to
rewrite the auth email to a tombstone (`deleted+<uuid>@wagnon.invalid`,
a reserved-by-RFC TLD that can never receive mail) and keep the real address on
`profiles.email` for display.

**This cannot be undone.** Once tombstoned, the original address is a display
string only; restoring the account would need it typed back in by hand, and by
then someone else may hold it. This is inherent to the rule as specified, not a
shortcut.

---

## Part 2 — Soft delete and the archive

### Migration

```sql
alter table profiles
  add column deleted_at  timestamptz,
  add column deleted_by  uuid references profiles(id);

-- Only the service_role (the edge function) may set these. Without this,
-- profiles_update_own — which permits `auth.uid() = id` — would let any
-- user mark their own account deleted.
revoke update (deleted_at, deleted_by) on profiles from authenticated;
```

`profiles_select` is `using (true)`, so deleted rows stay readable and
attribution keeps working. No policy change needed.

### Edge function — `admin-users` DELETE

Today the handler counts referencing rows in `expenses`, `activity_log` and
`investors`, and returns 409 if any exist. That count becomes a fork instead of
a refusal:

- **No referencing rows** → hard delete, unchanged from today. `user_roles` →
  `profiles` → `auth.users`. Logs `USER_DELETE`.
- **Referencing rows exist** → soft delete: ban permanently, tombstone the auth
  email, set `deleted_at`/`deleted_by`, keep `user_roles`. Logs
  `USER_SOFT_DELETE` with the blocking counts in metadata.

The response reports which path ran — `{ ok: true, mode: "soft" | "hard" }` —
so the UI can say what actually happened rather than guessing. A soft delete
must never be described to the user as a permanent erase.

`checkCanActOn` already guards both paths: never yourself, and a `super_admin`
target needs a `super_admin` caller. No change there.

### LIST and the client

- Return `deletedAt` on each user; add it to `ApiUser` in `adminUsers.ts`.
- `UsersPage` filters soft-deleted rows out of the main table.
- A **Comptes supprimés** view, visible to `super_admin` only, lists them with
  the deletion date, who did it, and the original email. Read-only: no edit, no
  deactivate, no re-delete.
- A soft-deleted user's detail route renders read-only with every action
  suppressed.

Restore is deliberately **not** in scope. It would need a fresh email typed in
by hand (see Part 1) and is a separate decision.

---

## Part 3 — Attribution for deleted users

Small, because the rendering is already plain text.

- Join `profiles.deleted_at` wherever `recorded_by_name` is resolved
  (`queries.ts:238` and the `expenses_page` payload) and expose
  `recorded_by_deleted`.
- Where true, render the name with a muted "(compte supprimé)" suffix.
- `/users/:id` for a deleted profile: read-only, no action buttons.

The name itself never disappears. Financial history stays attributable, which
is the point of soft-deleting rather than erasing.

---

## Part 4 — Investor read-only

No database work at all, given the "all investors at their college" decision.
Every item is UI and routing.

Add one helper next to the existing role plumbing in `auth.tsx`, named to
mirror the SQL function it shadows so the two are obviously a pair:

```ts
/** Mirrors private.can_manage_finance() in SQL. The database is the real
 *  gate; this exists so the UI does not offer actions that will be refused. */
export function canManageFinance(user: AppUser | null): boolean
```

Then:

- **Sidebar** (`AppSidebar.tsx`): hide Enseignants / Élèves / Classes from
  investors; show Investisseurs *to* investors — it is currently gated to
  `admin`/`super_admin` at line 113, so an investor cannot reach it today.
- **Routes** (`routes.tsx`): put a `RoleRoute` on `teachers`, `students` and
  `classes` excluding investor; widen the `investors` gate to include investor.
  Hiding a nav row is not access control — the URL must be gated too.
- **Expenses / Categories**: hide "Nouvelle dépense" and "Nouvelle catégorie",
  and every row-level edit, when `canManageFinance` is false.
- **Investors page**: hide add, edit, and record-contribution controls.
- **Settings**: investor sees `ProfileSection` only, not
  `CollegeIdentitySection` — college branding is an admin concern.

Updating their own profile stays available, as asked.

---

## Part 5 — Notifications and badges

The largest item, and the one with a real cost attached.

### The bundle tradeoff, stated plainly

Live notifications require deleting `src/lib/supabase-stubs/realtime.ts` and
the two aliases in `vite.config.ts`, putting ~150 KB of source (meaningfully
less gzipped, but not nothing) back on every page load — for an app whose
users are on Ivorian mobile connections, and whose last performance audit was
specifically about payload.

There is a cheaper shape that delivers the same visible feature: **poll the
unread count on an interval** (30–60 s) and on window focus. No bundle cost at
all, one small indexed query, and the badge is at most a minute stale. For
"an expense was recorded," a minute is not a meaningful delay.

**Recommendation: build the notifications table, trigger and UI first, backed
by polling. Un-stub realtime later only if the delay proves annoying in
practice.** The data model is identical either way, so this costs nothing to
change your mind about later.

### Migration

```sql
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  college_id  uuid not null references colleges(id),
  user_id     uuid not null references profiles(id) on delete cascade,
  kind        text not null,              -- 'expense_created' for now
  title       text not null,
  body        text,
  entity_type text,                       -- 'expense'
  entity_id   uuid,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_unread_idx
  on notifications (user_id, created_at desc)
  where read_at is null;
```

RLS, following the pattern the rest of the schema uses:

- `select`: `user_id = (select auth.uid())` — you read only your own.
- `update`: same, but the client must not be able to rewrite content. Grant
  update on the `read_at` column only.
- **No insert policy for `authenticated`.** Rows come exclusively from the
  trigger, exactly like `activity_log`.

`on delete cascade` on `user_id` is deliberate and differs from the ledger
tables: a notification is disposable, so it must not block a hard delete the
way `expenses` does.

### Trigger

`after insert on expenses`, security definer, fanning out one row per
`admin` / `treasurer` / `super_admin` at that college, **excluding the person
who recorded it** — nobody needs telling about their own action.

Note this makes notification volume scale with admin count × expenses. Fine at
Wagnon's size; worth remembering before a multi-college rollout.

### UI

- Bell in `Header` (`AppShell.tsx:38`) with an unread-count badge.
- Dropdown listing recent notifications; clicking one routes to the expense and
  marks it read; a "tout marquer comme lu" action.
- Sidebar badge on Dépenses for the unread expense count.
- Investors are not recipients — they cannot record expenses and the trigger
  targets finance roles only.

---

## Part 6 — Order, verification, risk

### Order

1. **Part 4, investor read-only.** No migration, no deploy, no irreversible
   step. Highest value per unit of risk.
2. **Parts 2 + 3 + the email rules, as one unit.** One migration, one
   `admin-users` deploy. They share the `deleted_at` column and testing one
   without the others proves little.
3. **Part 5, notifications.** Own migration, own session.

### Verification

The standing constraint holds: an agent does not hold app credentials. Sam
performs any write that needs a login; the agent reads the result back.

- Part 4 is verifiable live end to end — "Test Investor" (`b9dc85ea`) holds
  `investor` at this college, so the redirects and hidden controls can actually
  be driven rather than reasoned about.
- Part 2 needs a **disposable account with a referencing row** to exercise the
  soft path. Creating one is a real write to a live project; it must be agreed
  before it happens, not assumed. The last session's accidental account is a
  standing reminder of what happens otherwise.
- The email matrix in Part 1 needs all three cases tested explicitly. The soft
  case is the only one that is new, and the only one that can silently fail.

### Risks worth naming now

- **Tombstoning is irreversible.** Repeated here because it is the only step in
  this plan that destroys information.
- **`revoke update (deleted_at, ...)` is easy to forget** and its absence is
  invisible until someone soft-deletes themselves. It belongs in the same
  migration as the columns, never a follow-up.
- **Hiding a nav item is not access control.** Every hidden route needs a
  `RoleRoute` in the same change, or the URL still works.
- **Un-stubbing realtime silently undoes a deliberate optimisation.** If it
  ever happens, the comment at the top of `realtime.ts` should be moved into
  `AGENTS.md` rather than deleted with the file.

### Still open

- Should a soft-deleted account be restorable at all? Currently out of scope —
  it needs a fresh email, so it is closer to "create a new account" than
  "undo".
- "Disable, block or delete" named three actions. Deactivate (ban) and delete
  are covered. If **block** is meant to be distinct from deactivate — a
  different reason, a different message at the login screen, a different audit
  entry — it needs defining before it can be built.
