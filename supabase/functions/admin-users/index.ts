// admin-users: create/list/update/deactivate/reactivate platform users.
//
// This exists because none of it can happen from the browser with the
// publishable key — creating an auth user, reading another user's email,
// and banning an account all require the service_role key, which must
// never reach client code. verify_jwt (set at deploy time) rejects
// unauthenticated calls before this code runs; the authorization check
// below additionally requires the caller to hold admin/super_admin for
// the target college.
import { createClient } from "npm:@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
// The auto-provided SUPABASE_SERVICE_ROLE_KEY resolves to this project's
// new sb_secret_... format, which GoTrue's Admin API
// (auth.admin.listUsers/createUser/updateUserById — everything this
// function does) can't yet verify: "unrecognized JWT kid" — the same
// failure hit while seeding the first admin user. The legacy service_role
// JWT works for both the Admin API and normal table access, so it's used
// everywhere here rather than juggling two keys.
const SERVICE_ROLE_KEY = Deno.env.get("LEGACY_SERVICE_ROLE_KEY")!

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  })
}

const ROLE_PRIORITY = ["super_admin", "admin", "treasurer", "investor", "teacher"]
function primaryRole(roleIds: string[]): string {
  for (const r of ROLE_PRIORITY) if (roleIds.includes(r)) return r
  return roleIds[0] ?? "investor"
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Identify the caller from their own JWT (verify_jwt already validated
  // it's well-formed; this resolves it to a user).
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401)

  // Resolved with the anon key + the caller's own JWT, per Supabase's
  // documented pattern for this.
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user: caller },
  } = await asCaller.auth.getUser()
  if (!caller) return json({ error: "Invalid session" }, 401)

  // Every user this app manages today belongs to the one seeded college.
  // Scoping by the caller's own admin/super_admin role, not a client-
  // supplied college id, so a treasurer can't pass an arbitrary college.
  const { data: callerRoles } = await admin
    .from("user_roles")
    .select("role_id, college_id")
    .eq("user_id", caller.id)

  const isSuperAdmin = (callerRoles ?? []).some((r) => r.role_id === "super_admin")
  const adminCollegeId = (callerRoles ?? []).find(
    (r) => r.role_id === "admin" && r.college_id
  )?.college_id

  if (!isSuperAdmin && !adminCollegeId) {
    return json({ error: "Forbidden — admin or super_admin role required" }, 403)
  }

  // super_admin with no college row of their own still needs a college to
  // scope new users into. There is exactly one college today; once
  // multi-college support lands this becomes a required request param.
  const { data: colleges } = await admin.from("colleges").select("id").limit(1)
  const targetCollegeId = adminCollegeId ?? colleges?.[0]?.id
  if (!targetCollegeId) return json({ error: "No college configured" }, 500)

  // ---- Audit trail -----------------------------------------------------
  // User lifecycle is the one thing activity_log cannot capture with a
  // trigger. The finance tables all log via log_activity() on INSERT, but
  // these actions happen in auth.users — deactivation is a banned_until
  // change in a schema triggers here cannot watch, and a role change is a
  // DELETE plus an INSERT on user_roles, which would log as two events that
  // describe neither. Only this function knows the intent, so it writes the
  // row itself, as service_role.
  //
  // Never let auditing fail the operation: the account has already been
  // created or banned by the time we get here, and returning an error would
  // tell the caller a thing that did happen did not.
  // Parameter is `logAction`, not `action`: there is already an `action` in
  // this scope holding the URL segment, and shadowing it here would read as
  // though the two were the same thing.
  async function logAdminAction(logAction: string, metadata: Record<string, unknown>) {
    const { error } = await admin.from("activity_log").insert({
      college_id: targetCollegeId,
      user_id: caller!.id,
      action: logAction,
      metadata,
    })
    // Swallowed on purpose (see above) — which means a missing service_role
    // INSERT grant would show up only here, never in the UI.
    if (error) console.error(`activity_log insert failed for ${logAction}:`, error.message)
  }

  /** Read the target's display name so the entry names a person, not a uuid. */
  async function targetName(id: string): Promise<string | null> {
    const { data } = await admin.from("profiles").select("full_name").eq("id", id).maybeSingle()
    return data?.full_name ?? null
  }

  const url = new URL(req.url)
  const segments = url.pathname.split("/").filter(Boolean)
  // .../functions/v1/admin-users[/:id[/:action]]
  const afterFn = segments.slice(segments.indexOf("admin-users") + 1)
  const targetId = afterFn[0]
  const action = afterFn[1]

  try {
    // ---- LIST ----------------------------------------------------------
    if (req.method === "GET" && !targetId) {
      const [{ data: authUsers, error: listErr }, { data: profiles }, { data: roleRows }] =
        await Promise.all([
          admin.auth.admin.listUsers({ perPage: 1000 }),
          admin.from("profiles").select("id, full_name, phone, email"),
          // super_admin rows are global (college_id null) — include them
          // alongside this college's own roles, or every super_admin
          // silently vanishes from the roster (including the caller,
          // the very first time this endpoint was tested).
          admin
            .from("user_roles")
            .select("user_id, role_id")
            .or(`college_id.eq.${targetCollegeId},college_id.is.null`),
        ])
      if (listErr) throw listErr

      const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
      const rolesByUser = new Map<string, string[]>()
      for (const r of roleRows ?? []) {
        const list = rolesByUser.get(r.user_id) ?? []
        list.push(r.role_id)
        rolesByUser.set(r.user_id, list)
      }

      const users = (authUsers?.users ?? [])
        .filter((u) => rolesByUser.has(u.id))
        .map((u) => {
          const profile = profileById.get(u.id)
          const banned = u.banned_until && new Date(u.banned_until) > new Date()
          return {
            id: u.id,
            name: profile?.full_name || u.email || "Utilisateur",
            email: u.email ?? "",
            phone: profile?.phone ?? null,
            roleId: primaryRole(rolesByUser.get(u.id) ?? []),
            isActive: !banned,
            createdAt: u.created_at,
            updatedAt: u.updated_at ?? null,
          }
        })

      return json({ data: { users } })
    }

    // ---- CREATE ----------------------------------------------------------
    if (req.method === "POST" && !targetId) {
      if (!isSuperAdmin && !adminCollegeId) return json({ error: "Forbidden" }, 403)
      const body = await req.json()
      const { name, email, phone, password, roleId } = body
      if (!name || !email || !password || !roleId) {
        return json({ error: "name, email, password, and roleId are required" }, 400)
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      })
      if (createErr) return json({ error: createErr.message }, 400)

      const newUserId = created.user.id
      // handle_new_user() already inserted a profiles row from user_metadata
      // — just add the phone number, which that trigger doesn't carry.
      if (phone) {
        await admin.from("profiles").update({ phone }).eq("id", newUserId)
      }
      // super_admin rows must be global (college_id null) — a schema
      // constraint enforces this, so getting it right here avoids a
      // needlessly opaque constraint-violation error.
      await admin.from("user_roles").insert({
        user_id: newUserId,
        role_id: roleId,
        college_id: roleId === "super_admin" ? null : targetCollegeId,
      })

      await logAdminAction("USER_CREATE", { name, email, role_id: roleId })

      return json({ data: { user: { id: newUserId } } }, 201)
    }

    if (!targetId) return json({ error: "Not found" }, 404)

    // ---- UPDATE ------------------------------------------------------
    if (req.method === "PATCH" && !action) {
      const body = await req.json()
      const { name, email, phone, roleId, password } = body

      const authUpdate: Record<string, unknown> = {}
      if (email) authUpdate.email = email
      if (password) authUpdate.password = password
      if (Object.keys(authUpdate).length > 0) {
        const { error: updateErr } = await admin.auth.admin.updateUserById(targetId, authUpdate)
        if (updateErr) return json({ error: updateErr.message }, 400)
      }

      const profileUpdate: Record<string, unknown> = {}
      if (name) profileUpdate.full_name = name
      if (phone !== undefined) profileUpdate.phone = phone || null
      if (Object.keys(profileUpdate).length > 0) {
        await admin.from("profiles").update(profileUpdate).eq("id", targetId)
      }

      if (roleId) {
        // Same college-or-null scoping as the LIST query above — a
        // super_admin's role row has college_id null, so scoping the
        // delete to targetCollegeId alone would leave their old role in
        // place (or orphan it) on promotion/demotion.
        await admin
          .from("user_roles")
          .delete()
          .eq("user_id", targetId)
          .or(`college_id.eq.${targetCollegeId},college_id.is.null`)
        await admin.from("user_roles").insert({
          user_id: targetId,
          role_id: roleId,
          college_id: roleId === "super_admin" ? null : targetCollegeId,
        })
      }

      // `name` is only present when the caller changed it — fall back to the
      // stored one so the entry always names someone, even for a phone- or
      // role-only edit.
      await logAdminAction("USER_UPDATE", {
        name: name ?? (await targetName(targetId)),
        ...(roleId ? { role_id: roleId } : {}),
      })

      return json({ data: { ok: true } })
    }

    // ---- DEACTIVATE / REACTIVATE --------------------------------------
    if (req.method === "PATCH" && (action === "deactivate" || action === "reactivate")) {
      const { error: banErr } = await admin.auth.admin.updateUserById(targetId, {
        ban_duration: action === "deactivate" ? "876000h" : "none",
      })
      if (banErr) return json({ error: banErr.message }, 400)

      await logAdminAction(action === "deactivate" ? "USER_DEACTIVATE" : "USER_REACTIVATE", {
        name: await targetName(targetId),
      })

      return json({ data: { ok: true } })
    }

    return json({ error: "Not found" }, 404)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500)
  }
})
