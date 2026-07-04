import { createClient, type Client } from "@libsql/client"
import { SCHEMA_STATEMENTS } from "./schema"
import { v4 as uuid } from "uuid"

// Local-first Turso client. In the Tauri build this points at a real file
// on disk via TAURI_DB_PATH (set in src-tauri); falls back to an in-memory
// DB during plain `vite dev` in a browser tab.
//
// `syncUrl` + `authToken` point at the remote Turso database (the same one
// AdonisJS reads/writes server-side). Calling `client.sync()` pulls/pushes
// changes whenever the device has internet — that's the entire offline
// sync mechanism, no custom push/pull endpoints needed.

let client: Client | null = null

export function getDb(): Client {
  if (client) return client

  // In Tauri, VITE_LOCAL_DB_PATH points at a real file on disk.
  // In a plain browser tab (vite dev without Tauri), file: URLs aren't
  // supported by the web build of @libsql/client — fall back to :memory:.
  const localPath = import.meta.env.VITE_LOCAL_DB_PATH ?? ":memory:"

  const syncUrl = import.meta.env.VITE_TURSO_SYNC_URL
  const authToken = import.meta.env.VITE_TURSO_AUTH_TOKEN

  client = createClient({
    url: localPath,
    ...(syncUrl ? { syncUrl, authToken } : {}),
  })

  return client
}

export async function initDb() {
  const db = getDb()
  for (const stmt of SCHEMA_STATEMENTS) {
    await db.execute(stmt)
  }

  // Run dynamic migrations for existing tables
  try {
    const tableInfo = await db.execute("PRAGMA table_info(investors)")
    const columns = tableInfo.rows.map((r: any) => r.name)
    if (!columns.includes("user_id")) {
      await db.execute("ALTER TABLE investors ADD COLUMN user_id TEXT")
      console.log("Successfully migrated: added user_id to investors table")
    }
  } catch (e) {
    console.error("Migration check failed:", e)
  }

  // Seed default admin if no investors exist
  try {
    const res = await db.execute("SELECT COUNT(*) as count FROM investors")
    if (res.rows && Number(res.rows[0].count) === 0) {
      const id = uuid()
      const joinedAt = new Date().toISOString()
      await db.execute({
        sql: `INSERT INTO investors (id, name, phone, agreed_contribution, joined_at, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          "Directeur (Admin)",
          "+225 07 00 00 00 00",
          0,
          joinedAt,
          joinedAt,
        ]
      })
    }
  } catch (e) {
    console.error("Failed to seed default admin:", e)
  }
}

export async function trySync() {
  const db = getDb()
  try {
    await db.sync()
    return true
  } catch {
    // Offline or sync server unreachable — local DB still fully usable.
    return false
  }
}
