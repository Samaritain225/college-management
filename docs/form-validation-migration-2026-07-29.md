# Form validation migration — zod + react-hook-form, 2026-07-29

All six forms in the app moved from hand-rolled `useState` + `src/lib/validation.ts`
validators to `zod` schemas resolved through `react-hook-form`
(`@hookform/resolvers/zod`). `zod` was already a dependency but unused before this;
`react-hook-form` and `@hookform/resolvers` were added. Migrated one page at a time,
in this order: UsersPage, ExpensesPage, InvestorsPage, LoginPage,
CollegeIdentitySection, ProfileSection.

## Shared pieces this migration created

- `src/lib/formFocus.ts` — `focusFirstInvalidField(errors, order, setFocus)`.
  react-hook-form's own `shouldFocusError` only calls `.focus()`, not
  `scrollIntoView`, which several dialogs need on mobile (they scroll
  internally — see AGENTS.md's dialog-scroll gotcha). Extracted from
  `UsersPage.tsx` once ExpensesPage needed the same behavior.
- `src/lib/passwordPolicy.ts` — `passwordChecks`/`passwordMeetsPolicy`/
  `PASSWORD_POLICY_MESSAGE`, mirroring GoTrue's real policy (one lowercase,
  one uppercase, one digit, one special character). Extracted from
  `UsersPage.tsx` so the zod schema could `.refine` against it.
- `src/components/PasswordChecklist.tsx` — the live green-check list shown
  under a password field while typing. Extracted from `UsersPage.tsx` when
  `ProfileSection` needed it too.
- Convention: `mode: "onTouched"` on every `useForm` call — validates a field
  once it's been left (or after first submit attempt), then revalidates on
  every change. Replaces ad-hoc debounced-validation `useEffect`s that
  existed before (e.g. UsersPage's email-format check).

## Per-page notes

**UsersPage** — reference implementation. Create dialog and edit-profile
form. Verified live: empty-submit validation, live email-format and
password-policy errors, the dirty-gated edit submit button, focus+scroll on
invalid submit.

**ExpensesPage** — new-expense dialog and standalone new-category dialog.
- `paymentMethod` narrows `string` → the `PaymentMethod` union via a
  type-predicate `.refine`, which makes the schema's input and output types
  diverge (defaults are plain strings; the parsed submit value is the
  narrowed type). `ExpenseFormValues` (input) vs `ExpenseFormOutput` (output)
  are both exported from `expenseFormSchemas.ts`; `useForm<Input, any,
  Output>`'s third generic is what makes `handleSubmit`'s callback receive
  the narrowed type. `z.enum(...).pipe(...)` has the same narrowing effect
  and would also work — refine was chosen only because it reads slightly
  clearer.
- The "create a new category inline" sentinel (`NEW_CATEGORY_SENTINEL`,
  `"new-category-placeholder"`) is validated with `superRefine` attaching its
  error to the `categoryId` path, not a separate field — matches the old UX
  where "no category" and "category selected but no name typed" shared one
  error slot under the Select.
- The receipt file input stays outside the zod schema on purpose:
  `validateUpload` already validates it immediately on selection, before the
  form is ever submitted. It shares the form's general-error slot.
- Verified live: all six field errors with focus+scroll; the new-category
  sentinel flow; a full create (new category + expense) and a standalone
  category create, both round-tripped through the real
  `addCategory`/`addExpense` calls with KPIs updating live.
- Left uncleanable test data: a "Test Zod Category" and a 25 000 F CFA test
  expense. Expenses and categories are append-only with no delete UI (see
  AGENTS.md's architectural rules).

**InvestorsPage** — create-investor card and the inline table-row editor.
- The edit path is an inline table row (click the pencil, a cell becomes an
  `Input`), not a `<form>` in a dialog — no room for a per-field error
  paragraph. `submitEdit` still runs through the zod schema and
  `focusFirstInvalidField`, but on failure also fires a toast with the first
  error message, matching the page's pre-migration behavior.
- The row has no `userId` field at all (this app has never let you re-link an
  account after creation) — `editForm`'s `userId` value carries through
  unchanged from whatever `startEdit()` loaded via `reset()`.
- Verified live: empty-submit on the create card; the inline row correctly
  rejects an emptied name via toast + focus (caught a false negative here —
  a raw `Delete` keypress didn't actually clear the input on first attempt,
  so the old value round-tripped as a false pass; confirmed properly on
  retry); a real field edit and a full create both succeeded live.
- Left uncleanable test data: a "Test Zod Investor" row (1 000 000 F CFA).
  Investors aren't on the append-only list architecturally, but there is no
  delete function anywhere in `queries.ts` or the UI.

**LoginPage** — the one form with no client validation at all before (no
`fieldErrors`, no `noValidate`, just native `required`/`type="email"` and a
server-error toast). Migrating it fixed a standing inconsistency with the
rest of the app's `noValidate` pattern, not just added a schema.
- `submitting` stays a plain `useState`, not `loginForm.formState
  .isSubmitting`: when Cloudflare Turnstile is enabled, the real login
  happens later inside Turnstile's `onSuccess` callback, outside the promise
  `handleSubmit` awaits — RHF's own flag would flip back to `false` the
  instant `captchaRef.current.execute()` returns, well before the login
  round trip finishes.
- `executeLogin` reads `loginForm.getValues()` at call time rather than
  closing over `email`/`password`, since it can run well after the initial
  submit (the Turnstile round trip).
- Verified live: both required errors with focus; live email-format error;
  password's required error clears on first keystroke. Did not attempt an
  actual login (no real credentials available to the agent) — the server
  round trip and Turnstile path weren't touched by this migration.

**CollegeIdentitySection** — only `name` is required; address/phone/academic
year stay optional. `hasChanges` (the sticky "Enregistrer" bar's gate) is
`form.formState.isDirty || pendingLogoFile !== null || logoRemoved` — logo
stays outside the schema, same reasoning as the receipt file. The "re-seed on
external settings change" `useEffect` now calls `form.reset(...)` instead of
four `setState` calls.
- First verification attempt: could not test live — browser session had
  expired and the agent doesn't hold app credentials to log back in. Backed
  only by a clean `tsc -b --force` and a manual diff review at that point.
- Verified live in a later session once logged in again: empty-submit
  correctly blocks with focus+scroll, no console errors.

**ProfileSection** — profile form (name, phone, avatar) and password-change
form, now two separate `useForm` instances.
- Fixed a real latent bug while migrating: the password form previously only
  checked length ≥ 8 (`MIN_PASSWORD_LENGTH`), while GoTrue's actual policy
  also requires character classes (see `passwordPolicy.ts`) — flagged as
  unfixed in this project's state notes before this session. Now shares the
  exact same `passwordChangeSchema` rule UsersPage validates admin-created
  passwords against, plus the same live `PasswordChecklist`.
- Confirm-password mismatch uses a top-level `.refine` with
  `path: ["confirmPassword"]`.
- Verified live: profile loads pre-filled; the shared `PasswordChecklist`
  ticks live; submitting a policy-violating password is now correctly
  blocked (previously would have passed the old length-only check).

## Deliberately not done here

- TanStack Query for data fetching — recommended as a separate follow-up,
  not bundled with this migration. Data fetching (`useEffect` + manual
  loading/error state in ~8 files, `src/lib/queries.ts`) is an orthogonal
  concern from form validation.
