// Local SQLite schema (synced via Turso embedded replicas to the remote
// Turso DB, which the AdonisJS backend also has access to as the source
// of truth across all devices).
//
// Design rule: financial rows are APPEND-ONLY. Nothing here is ever
// UPDATEd or DELETEd once synced — corrections are made by inserting a
// reversing/adjustment row. This is what lets multiple offline devices
// sync without conflict-resolution logic: two inserts never collide,
// only edits to the same row would.
//
// Auth note: this schema holds NO credentials. Login is online-required
// against the AdonisJS backend; only a session token is cached locally
// (outside this synced database, in local secure storage), never
// replicated to other devices.
//
// Display names / emails of linked users are fetched from the backend's
// /users REST endpoint and mapped in memory, avoiding duplicating auth
// fields onto the local SQLite offline cache.

export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS investors (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    phone TEXT,
    agreed_contribution INTEGER NOT NULL,
    joined_at TEXT NOT NULL,
    created_by TEXT,
    synced_at TEXT,
    created_at TEXT,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS contributions (
    id TEXT PRIMARY KEY,
    investor_id TEXT NOT NULL REFERENCES investors(id),
    amount INTEGER NOT NULL,
    paid_at TEXT NOT NULL,
    method TEXT,
    note TEXT,
    recorded_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    synced_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS budget_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    synced_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES budget_categories(id),
    amount INTEGER NOT NULL,
    description TEXT NOT NULL,
    receipt_photo_path TEXT,
    spent_at TEXT NOT NULL,
    recorded_by TEXT NOT NULL,
    recorder_name TEXT,
    reverses_expense_id TEXT REFERENCES expenses(id),
    created_at TEXT NOT NULL,
    synced_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS expense_recorder_cache (
    expense_id TEXT PRIMARY KEY REFERENCES expenses(id),
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    cached_at TEXT NOT NULL
  )`,
]
