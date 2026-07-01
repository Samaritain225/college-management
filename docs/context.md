# College Budget App — Project Summary & Agent Calibration

## Project Context
Sam is a lead/architect developer building for a private college in Ivory Coast recently bought by ~15 investors who pooled money to acquire it. Currently expenses are tracked manually in a notebook — no one has clear visibility into total budget, amount spent, or remaining balance. This app is phase one of a larger vision: eventually digitalizing the whole college system (teachers, students, timetables), but starting narrowly with expense/contribution tracking.

## Core Requirements
- **Offline-first**: must work with zero internet, syncing opportunistically when online (~70% connectivity expected)
- **Multi-device, multi-user**: several people (treasurer, admin staff) enter data from different devices; syncing doesn't need to be real-time, just eventual
- **Cross-platform**: one codebase installable on desktop, tablet, and mobile
- **Investors are dynamic**: not fixed at 15 — new investors can join later, so pool totals and ownership % must be *derived*, never stored as static numbers
- **Per-investor tracking**: each investor's agreed contribution, amount paid, amount owed, and ownership % (contribution ÷ live pool total)
- **Investors get read-only dashboard access**; admins can record expenses/contributions
- **Design**: simple, clean, intuitive — Slate/Indigo theme, tabular body font.

## Key Architectural Decisions

| Decision | Why |
|---|---|
| **React + Vite + TypeScript**, not Next.js | No SSR needed for an offline-first client-heavy app; Vite is lighter |
| **AdonisJS v7 + PostgreSQL backend** (separate from frontend) | Sam already has deep AdonisJS expertise, RBAC patterns (`@adonisjs/bouncer`), and an MCP server encoding AdonisJS conventions. This app is phase one of a bigger system that needs real domain modules — worth the separate-backend investment over a Next.js monolith |
| **Turso/libSQL for local storage**, not Dexie/IndexedDB | Turso's embedded-replica sync (`client.sync()`) handles offline-sync natively — no custom push/pull endpoints to hand-roll. Caveat: browser/OPFS support is newer/less proven than native environments |
| **Tauri wrapper**, not a pure browser PWA | Because of the Turso choice above — Tauri gives real filesystem access for embedded replicas. Tauri is just a native shell around the *same* React/Vite frontend — no change to how UI/logic is written, small Rust build step managed by Tauri's CLI, no Rust code to write |
| **Financial data is append-only** | No UPDATE/DELETE ever on investors/contributions/expenses/budget_categories. Corrections = new rows (expenses use `reverses_expense_id`). This is *the* mechanism that makes multi-device offline sync work without conflict resolution — two INSERTs never collide, two UPDATEs to the same row from different offline devices do. **This is a hard constraint, not a preference** |
| **shadcn/ui components**, hand-built initially | Sandbox lacked network access to `ui.shadcn.com`, so early `button.tsx`/`card.tsx`/etc. were approximations, not registry pulls. |
| **Active-user picker as auth placeholder** | Real PIN-based auth comes later; for now, a dropdown sets `activeUser` in React context, and `ExpensesPage` refuses submission without one — enforces "only a user can manage expenses" today, without building login yet |

## Current State of the Codebase
- `src/db/schema.ts` — append-only SQLite schema (investors, contributions, expenses, budget_categories, sync_state)
- `src/db/client.ts` — Turso/libSQL client wrapper, `initDb()`, `trySync()`
- `src/db/queries.ts` — queries (listInvestors, addInvestor, getInvestorStandings, addExpense, getSpentByCategory)
- `src/lib/active-user.tsx` — React context standing in for auth
- `src/features/dashboard/`, `src/features/investors/`, `src/features/expenses/` — working screens, live-wired to the local DB
- `src/components/ui/` — shadcn-style primitives
- Navigation — Sidebar inset layout
