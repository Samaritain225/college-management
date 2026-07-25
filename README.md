# Wagnon Budget

A finance-tracking app for **Wagnon**, a private college in Côte d'Ivoire
recently acquired by a group of investors. It replaces a paper notebook
for tracking investor contributions and college expenses — phase one of a
larger vision to grow into a full school management system (teachers,
students, timetables, grades).

## Stack

- **Frontend** — Vite + React 19 + TypeScript, a static SPA (no SSR —
  every screen is behind login). Deploy target is Cloudflare Pages.
- **Backend** — [Supabase](https://supabase.com): Postgres, Auth, Edge
  Functions. RLS enforces multi-college scoping and role-based access
  directly in the database.
- **Styling** — Tailwind CSS v4 + shadcn-style primitives.

No AdonisJS, no Tauri, no libSQL/Turso — all three were removed during the
Supabase migration (see [`docs/refactor-plan.md`](docs/refactor-plan.md)
for why).

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project's URL + publishable key
npm run dev
```

The app opens at `http://localhost:5173`. You'll need a Supabase project
with the migrations in `supabase/migrations/` applied and at least one
user seeded with a role in `user_roles` — see
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the full local-setup workflow.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc -b`) then production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run oxlint |

## Project structure

```text
├── .agents/AGENTS.md      # compressed project context for AI agents — read this first
├── docs/                  # architecture decisions, phase checklists
├── supabase/
│   ├── migrations/        # applied schema, in order
│   └── functions/         # Edge Functions (service-role operations only)
├── src/
│   ├── components/        # shared components (AppSidebar, ActiveUserBar)
│   │   └── ui/             # shadcn-style primitives
│   ├── features/          # one folder per screen (dashboard, expenses, investors, users, settings, auth)
│   ├── lib/                # supabase client, queries.ts (data layer), auth context
│   └── App.tsx             # shell, routing (tab-based, no router), providers
```

## Data model, in brief

- Everything is scoped by `college_id` — single-tenant in practice today,
  multi-tenant-ready in the schema.
- Financial ledger tables (`contributions`, `expenses`, `expense_payments`,
  `other_income`) are **append-only**. Corrections are new rows, never
  edits — see `.agents/AGENTS.md` for why this matters.
- Derived numbers (ownership %, reliquat, pool totals) are database views,
  never stored columns.
- Roles are many-to-many (`user_roles`) — a person can be an investor and
  a teacher at once.

Full schema reasoning: [`docs/refactor-plan.md`](docs/refactor-plan.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).
