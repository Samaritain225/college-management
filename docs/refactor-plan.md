# Refactor & Migration Plan

Decided direction, domain findings from the source ledger, and the phased path forward.
Supersedes the architecture section of `context.md`.

## Target stack

| Concern | Choice | Why |
| --- | --- | --- |
| Frontend | **Vite SPA (existing), as a PWA** | No SSR need — every screen is behind auth. Keeps ~5,200 lines of working French UI. Next.js adds an RSC rewrite for no user-visible gain |
| Hosting | **Cloudflare Pages** | Free, and has an Abidjan PoP — matters on weak mobile |
| Database + Auth | **Supabase Postgres** (Paris / eu-west-3) | Relational domain, RLS gives multi-tenant + super-admin scoping at the DB layer. No cold start |
| File storage | **Cloudflare R2** | 10 GB free and zero egress vs Supabase Storage's 1 GB. Receipts and profile photos live here |
| Retired | AdonisJS API, Tauri shell, `src/db/` libSQL layer | Supabase + RLS replaces the API; Tauri was solving an offline problem we now solve with a PWA outbox |

**Not chosen: Cloudflare D1.** Generous and fast, but it's SQLite — no row-level security, no
rich types, weaker constraints, and no auth. RLS is precisely what makes the multi-tenant
super-admin model cheap here. Splitting the database across two systems would cost more than
it saves.

**Running cost:** $0 to start. The only reason to reach the ~$25/mo Supabase Pro tier is
managed backups — moving receipts to R2 removed the storage pressure that would have forced
it. Until then: scheduled `pg_dump` to R2 on a GitHub Actions cron.

---

## Domain findings from the source ledger

Read from the scanned accounting sheets (`Scanned_20260724-2333.pdf`, 4 pages). These change
the schema, and none of them are represented in the current model.

### 1. Two income streams feed one pool

The sheet's bottom line is `T = 61 368 000`, which reconciles exactly as:

```
43 750 000  investor adhésions + cotisations received
17 618 000  student fees received (inscription, scolarité, droit d'examen)
-----------
61 368 000
```

So **student fees are not a separate concern — they're already part of the same pool** the
expenses draw from. The model needs a general resources ledger, not just investor contributions.

### 2. "Reliquat" (outstanding balance) is a first-class concept everywhere

It appears in all three tables — investor cotisations, student fees per class, and expenses
(money still owed to a supplier, e.g. `AVANCE ENTREPRENEUR 7 283 000, reliquat 117 000`).

The current schema has no notion of partial payment. **Expenses need a total and a payment
history; reliquat is derived, never stored** — same principle already applied to ownership %.

### 3. Expenses have line items

`MONTAGE R+1` lists `prix unitaire × quantité = montant` per row (sable 25 000 × 24 =
600 000). The current flat-amount expense can't express this. Needs `expense_items`.

Units are free-text and inconsistent: `6t`, `5.5 t`, `20 P` (paquets), `2 BOT` (bottes), `25`.
Store the unit as text; do not try to enumerate it.

### 4. Expenses group into work packages, not just categories

`MONTAGE R+1 (1)` is a construction work package containing dozens of line items. That's a
grouping layer distinct from category — a category is "matériaux", a work package is "the
first-floor build". Both are needed.

### 5. Dates are imprecise, and the schema must tolerate it

Real values in the sheet: `21/10/24` (exact), `DU 20/12/24 AU 5/01/25` (range), `04/25`
(month only), `/03/25` (partial), and many blank. Forcing a single exact date will either
block data entry or silently fabricate precision.

Proposal: `occurred_on date`, `occurred_to date NULL`, `date_precision enum('day','month','range','unknown')`.

### 6. Investor targets are uniform — but overpayment happens

Every investor: 100 000 adhésion + 3 500 000 cotisation target (14 × 3 500 000 = 49 000 000,
matching the sheet's `OBJECTIF` exactly). Reliquat = target − paid.

But **M. KOFFI ETTIEN paid 5 200 000** — well over target, reliquat 0. So the model must
allow overpayment, and it raises a business question (below) about whether that increases his
ownership share.

### 7. Classes already exist in the finance data

Student fees are tracked per class: `6E, 5E, 4E, 3E, 2nd A/C, 1E A/D, Tle` — 214 students
total. The bridge to the future SIS phase is already present in the accounting.

### 8. ⚠️ The investor table does not reconcile — needs checking against the original

Summing the 14 individual cotisations as read gives **45 350 000**, against a stated
`TOTAL(T1)` of **43 550 000** — a 1 800 000 gap. Reliquat sums to 5 350 000 against a
stated 5 400 000. An unlabelled `45 250 000` sits at the bottom of the same table.

Two explanations, and a scan can't distinguish them:

- **The totals are wrong.** The rows are internally consistent: reliquat per row equals
  `3 500 000 − paid`, and the 1 700 000 excess (paid − reliquat vs target) is exactly
  Koffi Ettien's overpayment. On this reading `T` should be 64 368 000, not 61 368 000.
- **A row was misread.** If Koffi Ettien's cotisation is 3 500 000 rather than 5 200 000,
  nearly everything reconciles to within 100 000. But his `ADHESION + COTISATIONS` cell
  independently reads 5 300 000, which supports 5 200 000 being correct.

The stated totals are self-consistent with each other (43 550 000 / 49 000 000 = the stated
88.88%), so whichever way it resolves, one layer of the sheet disagrees with the other.

The student fee table, by contrast, reconciles perfectly in all three columns.

**Action: verify the investor table against the paper original before migrating this data.**
Whatever the cause, a 1.8–3 M FCFA ambiguity in the headline figure is the clearest possible
statement of why this app should exist.

### 9. Currency

XOF (FCFA) has no minor unit. Store amounts as plain integers. The existing
`integer` column type is correct — do not switch to cents.

---

## Business decisions (settled)

| Question | Decision |
| --- | --- |
| **Ownership basis** | **Target** (agreed cotisation), not amount paid. Stored as `ownership_basis: 'target' \| 'paid'` in college settings so it can be switched without a migration |
| **Adhésion in ownership** | **Excluded — confirmed.** It's an entry fee, not fund capital. Ownership is computed on cotisation only |
| **Investor data migration** | **Migrate as-is**, using the figures already on the paper sheet (no reconciliation pass). Investors can correct their own records later inside the app — this doubles as the reason to build correction/reversal rows early, not just append |
| **Dilution** | **Retroactive.** Percentages always reflect the current investor set; adding investor #15 moves everyone from 7.14% to 6.67%. Never stored, always derived |
| **Student fees** | **Deferred** — no student or class model in this phase. But see the `other_income` note below; omitting the money entirely is not an option |
| **Work packages** | **Not a separate table.** Categories carry the grouping ("Montage R+1" is a category). Each ledger row becomes one expense with optional quantity / unit / unit price |
| **Suppliers** | **Table added now**, while the domain is still being built |
| **Approval workflow** | None. Record-after-the-fact. Keep a status column so one can be added later |
| **Year boundaries** | None for expenses |

### Consequence: target-based ownership is currently just 1 ÷ N

Every investor's target is the same 3 500 000, so target-based ownership is an equal split.
The percentage column only becomes meaningful when an investor subscribes a *different*
amount. Note the trade-off the investors are accepting: **Koffi Ettien paid 1 700 000 over
target and receives the same share as someone who paid 2 900 000.** A `paid` basis would
reward him. That's a governance question, not a technical one — hence the config switch.

### ⚠️ Consequence: deferring student fees distorts the headline number

| | With student fees | Investors only |
| --- | --- | --- |
| Resources | 61 368 000 | 43 750 000 |
| Expenses | 41 380 783 | 41 380 783 |
| **Remaining** | **~19 987 000** | **~2 369 000** |

If the dashboard shows 2.4 M remaining when the paper sheet says 20 M, the treasurer will
stop trusting the app immediately.

**Mitigation:** add a generic `other_income` table now — date, label, amount, note. No
student model, no classes, no per-student tracking. The treasurer records one line
("Frais de scolarité — trimestre 1 — 17 618 000") and the pool stays correct. Phase 7
replaces those lump entries with per-student detail without changing the pool logic.

---

## Phases

### Phase 0 — Cleanup & infrastructure *(no business logic; safe to start now)*

1. Delete `src-tauri/` and unused deps: `@dnd-kit/*` ×4, `@tanstack/react-table`,
   `@libsql/client`. `src/db/queries.ts` (561 lines) is not dead — it makes real API calls
   wrapped in inert local-DB mirroring (no `VITE_TURSO_SYNC_URL` is configured anywhere, so
   every `db.execute()` silently no-ops in production). Extract the live logic to
   `src/lib/queries.ts`, delete `src/db/client.ts` and `src/db/schema.ts`. Full breakdown in
   `docs/phase-0-checklist.md`
2. Delete unused primitives: `ui/chart.tsx` (**pulls in recharts, ~100 KB gz**),
   `ui/drawer.tsx` (vaul), `ui/toggle-group.tsx`
3. Route-level code splitting (`React.lazy` per feature page)
4. Client-side image compression utility (resize ~1600px, JPEG q80 — 3 MB → ~300 KB).
   Needed for receipts on a weak uplink regardless of anything else
5. Deploy current app to Cloudflare Pages; confirm the Abidjan edge
6. Refresh `docs/context.md` — it still describes the active-user picker as auth and a
   Slate/Indigo theme

### Phase 1 — Schema design

Core tables, multi-tenant-ready but single-tenant in practice:

```
colleges                      -- tenant root
college_settings              -- ownership_basis: 'target' | 'paid'
profiles                      -- extends auth.users
roles, user_roles             -- MANY-TO-MANY (an investor can also be a teacher)
user_colleges                 -- which colleges a user may access

investors                     -- user_id nullable (investor without a login)
                              -- membership_fee, target_contribution
contributions                 -- append-only; type: adhesion | cotisation
other_income                  -- append-only; lump student fees & misc revenue

suppliers
expense_categories            -- doubles as the work-package grouping
expenses                      -- label, note, category, supplier?,
                              -- quantity? unit? unit_price?, total_amount,
                              -- occurred_on, occurred_to?, date_precision,
                              -- receipt_key (R2)
expense_payments              -- append-only; reliquat = total − Σ payments

activity_log                  -- audit trail, via triggers
```

Deliberately absent: `expense_items` (each ledger row is one expense),
`work_packages` (categories carry it), `students` / `school_classes` (Phase 7).

Rules enforced at the database, not in app code:
- `REVOKE UPDATE, DELETE` on all financial tables; corrections are reversal rows
- Ownership %, reliquat, and pool totals are **views or generated**, never stored columns
- `college_id` on every table from day one

### Phase 2 — Auth & RBAC

- Supabase Auth replaces the custom token flow. Most of `src/lib/auth.tsx` (500 lines,
  largely refresh handling) gets **deleted**, not ported
- Fix the role model: `users.role_id` today is a **single** FK — it cannot express
  "teacher who is also an investor". Replace with `user_roles`
- RLS policies per role: `super_admin` sees all colleges; `college_admin`/`treasurer` see
  their own; `investor` gets read-only on finance; `teacher` scoped to academics
- Test policies with a seeded matrix — this is where migrations of this kind lose time

### Phase 3 — Data layer port

- Replace `src/lib/api.ts` (204 lines) with the Supabase client
- Port the 5 feature pages' queries
- Migrate production data from Render Postgres (`pg_dump` → restore → transform)

### Phase 4 — Finance domain rebuild

Build what the ledger actually needs: line items, work packages, partial payments and derived
reliquat, imprecise dates, the resources/emplois split, receipt upload to R2.

### Phase 5 — PWA & resilience

Service worker + cached shell, IndexedDB outbox for offline writes (cheap because the data is
append-only — two INSERTs never collide), install prompt, optimistic UI.

### Phase 6 — Motion polish

Apply `docs/animation-backlog.md`. Starts with the one-line `:active` press feedback fix.

### Phase 7 — SIS foundations *(future)*

Students, teachers, enrolment, attendance, timetables, grades. The role model and
`school_classes` from Phase 1 are the hooks. Finance and academics share only users, roles,
and the college — so this stays cleanly modular.

---

## Estimate

| Phase | Days |
| --- | --- |
| 0 — Cleanup & infra | 1 |
| 1 — Schema | 1.5 |
| 2 — Auth & RBAC | 2.5 |
| 3 — Data layer port | 3 |
| 4 — Finance domain rebuild | 2.5 |
| 5 — PWA & outbox | 2 |
| 6 — Motion polish | 1 |

**~13.5 working days of execution, ~3 calendar weeks** with review cycles. Dropping
`expense_items` and `work_packages` paid for the added `suppliers` and `other_income` tables,
so Phase 4 came back down. RLS debugging in Phase 2 is the usual place estimates slip.
