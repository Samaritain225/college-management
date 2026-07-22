import { createClient, type Client } from "@libsql/client"
import { SCHEMA_STATEMENTS } from "./schema"
import { v4 as uuid } from "uuid"

// Local-first Turso client. In the Tauri build this points at a real file
// on disk via TAURI_DB_PATH (set in src-tauri); falls back to an in-memory
// DB during plain `vite dev` in a browser tab.

let client: Client | null = null

function createBrowserFallbackClient(): Client {
  const dummyClient: any = {
    async execute(_stmt: any) {
      return { rows: [], columns: [], rowsAffected: 0, lastInsertRowid: undefined }
    },
    async batch(stmts: any[]) {
      return stmts.map(() => ({ rows: [], columns: [], rowsAffected: 0, lastInsertRowid: undefined }))
    },
    async sync() {
      return { clientReads: 0, serverWrites: 0 } as any
    },
    close() {},
  }
  return dummyClient as Client
}

export function getDb(): Client {
  if (client) return client

  const syncUrl = import.meta.env.VITE_TURSO_SYNC_URL
  const authToken = import.meta.env.VITE_TURSO_AUTH_TOKEN
  const localPath = import.meta.env.VITE_LOCAL_DB_PATH

  const isBrowserMode =
    typeof window !== "undefined" &&
    !(window as any).__TAURI__ &&
    !(window as any).__TAURI_INTERNALS__

  // In a plain browser tab (vite dev without Tauri or Turso URL),
  // @libsql/client/web does not support file: or :memory: schemes.
  if (isBrowserMode && !syncUrl) {
    client = createBrowserFallbackClient()
    return client
  }

  try {
    const targetUrl = syncUrl || localPath || ":memory:"
    client = createClient({
      url: targetUrl,
      ...(authToken ? { authToken } : {}),
    })
  } catch (err) {
    console.warn("Failed to initialize @libsql/client, using browser fallback:", err)
    client = createBrowserFallbackClient()
  }

  return client
}

export async function initDb() {
  const db = getDb()
  try {
    for (const stmt of SCHEMA_STATEMENTS) {
      await db.execute(stmt)
    }

    // Run dynamic migrations for existing tables
    const tableInfo = await db.execute("PRAGMA table_info(investors)")
    const columns = tableInfo.rows.map((r: any) => r.name)
    if (columns.length > 0 && !columns.includes("user_id")) {
      await db.execute("ALTER TABLE investors ADD COLUMN user_id TEXT")
      console.log("Successfully migrated: added user_id to investors table")
    }

    const catTableInfo = await db.execute("PRAGMA table_info(budget_categories)")
    const catColumns = catTableInfo.rows.map((r: any) => r.name)
    if (catColumns.length > 0 && !catColumns.includes("description")) {
      await db.execute("ALTER TABLE budget_categories ADD COLUMN description TEXT")
      console.log("Successfully migrated: added description to budget_categories table")
    }
  } catch (e) {
    console.warn("Migration check warning:", e)
  }

  // Seed default admin if no investors exist
  try {
    const res = await db.execute("SELECT COUNT(*) as count FROM investors")
    if (res.rows && res.rows.length > 0 && Number(res.rows[0].count) === 0) {
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
        ],
      })
    }
  } catch (e) {
    console.warn("Failed to seed default admin:", e)
  }

  // Seed default budget categories if none exist
  try {
    const catRes = await db.execute("SELECT COUNT(*) as count FROM budget_categories")
    if (catRes.rows && catRes.rows.length > 0 && Number(catRes.rows[0].count) === 0) {
      const now = new Date().toISOString()
      const defaultCategories = [
        { name: "Mobilier & Équipements", description: "Tables, bancs, chaises et matériels de classe" },
        { name: "Fournitures & Pédagogie", description: "Manuels, registres, rames de papier et consommables" },
        { name: "Maintenance & Entretien", description: "Travaux de rénovation, plomberie et électricité" },
        { name: "Événements & Activités", description: "Fêtes d'école, cérémonies et activités sportives" },
        { name: "Frais Généraux & Divers", description: "Dépenses imprévues et fournitures administratives" },
      ]

      for (const cat of defaultCategories) {
        await db.execute({
          sql: "INSERT INTO budget_categories (id, name, description, created_at) VALUES (?, ?, ?, ?)",
          args: [uuid(), cat.name, cat.description, now],
        })
      }
    }
  } catch (e) {
    console.warn("Failed to seed default budget categories:", e)
  }
}

export async function trySync() {
  const db = getDb()
  try {
    await db.sync()
    return true
  } catch {
    return false
  }
}
