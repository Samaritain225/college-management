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
