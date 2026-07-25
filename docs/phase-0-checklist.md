# Phase 0 Checklist — Cleanup & Infrastructure

Concrete, file-by-file. No business logic changes — this only removes dead weight and adds
groundwork that every later phase needs regardless of open questions. Reviewed against the
actual code, not assumed from file names.

## 1. Extract the real data layer out of `src/db/`

**Correction to the original plan:** `src/db/` is not dead code. `queries.ts` makes real
`api.get`/`api.post` calls to the Adonis backend — that's live and needed. But every function
also mirrors the result into `getDb()` (a Turso/libSQL client), and since no
`VITE_TURSO_SYNC_URL` is set anywhere in this repo, `getDb()` always resolves to a stub whose
`execute()` silently no-ops. In production today, every screen load does a real API call, then
loops writing to a database that discards it, then occasionally falls back to reading from a
store that never has data. It's inert scaffolding around code that matters, not unused code.

| File | Action |
| --- | --- |
| `src/db/queries.ts` (561 lines, 15 functions) | Strip every `getDb()`/`db.execute()` call and the local-mirroring try/catch. Keep the `api.get`/`api.post` calls and the exported types (`Investor`, `Contribution`, `Expense`, `Activity`, `UserActivityLog`, `BudgetCategory`, `InvestorStanding`). Move to `src/lib/queries.ts` |
| `src/db/client.ts` (147 lines) | Delete. `getDb`, `initDb`, `trySync`, the browser-fallback stub — all gone |
| `src/db/schema.ts` | Delete. SQLite schema for a client that no longer exists |
| `src/App.tsx:9` | Remove `import { initDb } from "@/db/client"` and its call site |
| `src/features/dashboard/Dashboard.tsx:21` | Change import path `@/db/queries` → `@/lib/queries` |
| `src/features/dashboard/RecentActivities.tsx:4` | Same import path change |
| `src/features/expenses/ExpensesPage.tsx:51` | Same import path change |
| `src/features/investors/InvestorsPage.tsx:32` | Same import path change |

This is the one item in Phase 0 that touches logic (not just deletion), so it gets tested
against every screen before moving on: dashboard totals, expense list, investor standings,
recent activity feed, add/edit flows for investors and expenses.

## 2. Remove the Tauri shell

| Item | Action |
| --- | --- |
| `src-tauri/` (whole directory) | Delete |
| `src/lib/auth.tsx` | Remove Tauri-conditional code paths (grep hit — check what it branches on) |
| `package.json` | Remove `@tauri-apps/api`, `@tauri-apps/cli`; remove scripts `tauri`, `desktop:dev`, `desktop:build` |
| `vite.config.ts` | Remove the `clearScreen: false` / fixed-port-1420 block — that's a Tauri requirement, not a web one |
| `.gitignore` | Remove Tauri-specific ignores if present |

## 3. Remove unused dependencies

Confirmed by import search — zero references anywhere in `src/`:

| Package | Notes |
| --- | --- |
| `@dnd-kit/core`, `@dnd-kit/modifiers`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | Never imported |
| `@tanstack/react-table` | Never imported (tables are hand-built) |
| `@libsql/client` | Only used by `src/db/client.ts`, deleted above |

## 4. Remove unused UI primitives

Confirmed unused outside `components/ui/` itself:

| File | Pulls in | Action |
| --- | --- | --- |
| `src/components/ui/chart.tsx` | `recharts` (~100 KB gzipped) | Delete file, remove `recharts` from `package.json` |
| `src/components/ui/drawer.tsx` | `vaul` | Delete file, remove `vaul` from `package.json` |
| `src/components/ui/toggle-group.tsx` | — | Delete file |

`ui/table.tsx` and `ui/calendar.tsx` (→ `react-day-picker`) stay — both are actively used.

## 5. Route-level code splitting

`src/App.tsx` currently imports all five feature pages eagerly. Convert to `React.lazy` +
`Suspense` per tab:

- `Dashboard`, `ExpensesPage`, `InvestorsPage`, `UsersPage`, `SettingsPage`

Pair with a lightweight fallback (skeleton, not a spinner — matches the existing loading
pattern already used on each page).

## 6. Client-side image compression utility

New file, `src/lib/image.ts`. Needed for receipt/profile-photo upload regardless of which
storage backend lands (R2 either way). Resize to ~1600px on the long edge, JPEG quality 80.
No UI wiring yet — Phase 4 (receipts) and Phase 2 (profile photos) call it.

## 7. Deploy current app to Cloudflare Pages

- Connect the repo, confirm the build command (`tsc -b && vite build`) and output dir (`dist`)
- Verify against an Abidjan-adjacent network trace which PoP actually serves the request
- Carry over `VITE_API_BASE_URL` as a Pages environment variable (still points at the Render
  Adonis API until Phase 3 — Phase 0 doesn't touch the backend)

## 8. Documentation

- `docs/context.md` — replace the stale sections: active-user picker is not the auth model
  anymore (real login exists), theme is teal/terracotta not Slate/Indigo, offline-first via
  Turso is being replaced by the Phase 5 PWA outbox
- Cross-link `docs/refactor-plan.md`, `docs/animation-backlog.md`, this file

---

## Explicitly not in Phase 0

No schema changes, no Supabase/RLS work, no auth changes, no animation fixes (that's Phase 6),
no receipt upload UI, no `other_income`/`suppliers` tables. Those all depend on the still-open
Supabase MCP authentication and, for the finance rebuild, are already scoped in
`docs/refactor-plan.md`.

## Verification before calling Phase 0 done

- [ ] `npm run build` succeeds with zero TypeScript errors
- [ ] `npm run dev` — dashboard, expenses, investors, users, settings all load and read data
      exactly as before (this is a refactor, not a behavior change)
- [ ] Add-expense and add-investor flows still write successfully through the API
- [ ] Bundle size before/after comparison (expect a meaningful drop from recharts + dnd-kit +
      libsql removal)
- [ ] Cloudflare Pages deployment is live and reachable
