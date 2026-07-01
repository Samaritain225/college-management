# Wagnon Budget

An offline-first expense and contribution tracker for Wagnon College, built as a robust foundation that will later expand into a full school management system (teachers, students, timetables) without requiring a rewrite.

## Technology Stack

- **Frontend Core**: React 19 + Vite 8 + TypeScript.
- **Styling**: Tailwind CSS v4 + Hand-built Shadcn UI components (`src/components/ui`).
- **Local Database**: libSQL/Turso (`@libsql/client`) – works fully offline (file-based or in-memory) and syncs to a remote Turso DB opportunistically when online.
- **Desktop/Mobile Native Container**: Tauri v2 wrapper configured (`src-tauri`).

---

## Core Architectural Rules & Conventions

### 1. Offline-First & Sync Mechanics
This application relies on a local-first schema designed to prevent replication conflicts:
- **Strict Append-Only**: Financial tables (`expenses`, `contributions`, `investors`, `budget_categories`) are **append-only**.
- **No Direct Edits/Deletions**: Once synced, records are never updated or deleted. Corrections are made by inserting a reversing row (e.g. expenses use a `reverses_expense_id` field).
- **Opportunistic Synchronization**: Syncing is performed using `@libsql/client` background replication (`client.sync()`) targeting a remote Turso DB, ensuring eventual consistency.

### 2. Currency (XOF) Calculations
- The app handles **XOF (West African CFA franc)**.
- **Integer Representation**: Since XOF has no cents/minor subdivisions, all currency values are represented and stored as **integers**. No floats or divisions should be used in monetary states.

---

## Project Structure

```text
├── .agents/               # Custom workspace rules and agent skills
├── docs/                  # Detailed architectural context documents
├── src-tauri/             # Tauri native configuration and source code
├── src/
│   ├── components/        # Global components (ActiveUserBar, AppSidebar)
│   │   └── ui/            # UI components (Radix primitives, theme layout)
│   ├── db/                # libSQL DB Client, local queries, and SQL schema
│   ├── features/          # Feature-based pages (auth, dashboard, expenses, settings, users)
│   ├── lib/               # Custom hooks and context (settings, active-user)
│   └── main.tsx           # Application entry point
```

---

## Getting Started

### Local Web Development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Launch Vite development server:
   ```bash
   npm run dev
   ```
3. Opens at `http://localhost:1420`. The local database is created automatically on first load.

### Tauri Desktop Wrapper
To build or preview the native desktop wrapper:
- **Run dev app**: `npm run desktop:dev`
- **Build production binary**: `npm run desktop:build`

---

## Demonstration Credentials
The database seeds a default administrator account automatically upon initialization:
- **Email**: `admin@college.ci`
- **PIN/Password**: `1234`
