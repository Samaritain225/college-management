// Client for the admin-users Edge Function — the only path for creating,
// editing, deactivating, or reactivating platform users. Can't be done
// with the publishable key: creating an auth user, reading another user's
// email, and banning an account all require the service_role key, which
// lives only inside that function. See supabase/functions/admin-users/.

import { supabase } from "@/lib/supabase"

export interface ApiUser {
  id: string
  name: string
  email: string
  phone: string | null
  roleId: string
  isActive: boolean
  createdAt: string
  updatedAt: string | null
  /** GoTrue's own field — null means this identity has never completed a
   *  sign-in. Derives the "pending / active / disabled" status shown in the
   *  UI; nothing here is a separate hand-maintained flag. */
  lastSignInAt: string | null
  /** Set only by a soft delete (see deleteAdminUser) — the profile row
   *  survives so recorded_by_name keeps naming a person, but the account is
   *  gone in every other sense: banned, its email tombstoned. Null for
   *  every account that hasn't been through that path, including hard-
   *  deleted ones, which don't appear in this list at all anymore. */
  deletedAt: string | null
  /** Who performed the soft delete, for the super-admin archive view. */
  deletedByName: string | null
}

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error("Not authenticated")

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }
  )

  const json = await res.json()
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
  return json as T
}

export function listAdminUsers() {
  return call<{ data: { users: ApiUser[] } }>("", "GET")
}

export function createAdminUser(input: {
  name: string
  email: string
  phone: string | null
  password: string
  roleId: string
}) {
  return call<{ data: { user: { id: string } } }>("", "POST", input)
}

export function updateAdminUser(
  id: string,
  input: { name?: string; email?: string; phone?: string | null; roleId?: string; password?: string }
) {
  return call<{ data: { ok: true } }>(`/${id}`, "PATCH", input)
}

export function setAdminUserActive(id: string, active: boolean) {
  return call<{ data: { ok: true } }>(`/${id}/${active ? "reactivate" : "deactivate"}`, "PATCH")
}

/**
 * Distinct from `setAdminUserActive(id, false)` — and, unlike before, not
 * always a permanent erase. The server decides which: `mode: "hard"` when
 * nothing referenced the account (identical to the old behavior — every
 * trace gone), `mode: "soft"` when expenses/activity-log/investor rows do
 * (banned permanently, email tombstoned and freed for reuse, but the
 * profile survives so financial history stays attributable). Report
 * whichever actually happened — never describe a soft delete as an erase.
 */
export function deleteAdminUser(id: string) {
  return call<{ data: { ok: true; mode: "soft" | "hard" } }>(`/${id}`, "DELETE")
}
