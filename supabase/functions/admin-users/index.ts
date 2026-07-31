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
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
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
  // Narrowed to a plain string so the nested `checkCanActOn` closure below
  // doesn't need TypeScript to re-prove `caller` is non-null across a
  // function boundary it can't see through.
  const callerId = caller.id

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
      const [
        { data: authUsers, error: listErr },
        { data: profiles, error: profilesErr },
        { data: roleRows, error: rolesErr },
      ] = await Promise.all([
        admin.auth.admin.listUsers({ perPage: 1000 }),
        // deleted_by is a self-referencing FK (profiles.deleted_by ->
        // profiles.id). PostgREST embeds for self-joins (`deleter:profiles!
        // profiles_deleted_by_fkey(full_name)`) kept 500ing with "Could not
        // find a relationship between 'profiles' and 'profiles'" even after
        // a schema-cache reload — every profile row is already fetched
        // below regardless, so `deleted_by` is resolved by a second lookup
        // into that same map instead of fighting the embed.
        admin
          .from("profiles")
          .select("id, full_name, phone, email, deleted_at, deleted_by, deleted_email, is_system_account"),
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
      if (profilesErr) throw profilesErr
      if (rolesErr) throw rolesErr

      const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
      const rolesByUser = new Map<string, string[]>()
      for (const r of roleRows ?? []) {
        const list = rolesByUser.get(r.user_id) ?? []
        list.push(r.role_id)
        rolesByUser.set(r.user_id, list)
      }

      const users = (authUsers?.users ?? [])
        // is_system_account (e.g. the bootstrap super_admin) never appears
        // in the roster for any caller — it's a service account, not a
        // person other admins should see or manage. The activity feed is a
        // separate code path (activity_log + profiles only) and is
        // unaffected: this account's actions still show up there.
        .filter((u) => {
          if (!rolesByUser.has(u.id)) return false
          // deno-lint-ignore no-explicit-any -- supabase-js's generated types
          // don't know about this project's schema.
          return !(profileById.get(u.id) as any)?.is_system_account
        })
        .map((u) => {
          // deno-lint-ignore no-explicit-any -- supabase-js's generated types
          // don't know about this project's schema.
          const profile = profileById.get(u.id) as any
          const banned = u.banned_until && new Date(u.banned_until) > new Date()
          const isDeleted = !!profile?.deleted_at
          return {
            id: u.id,
            name: profile?.full_name || u.email || "Utilisateur",
            // A soft-deleted identity's auth email is a tombstone — show the
            // real address that was captured just before it was overwritten.
            email: isDeleted ? profile?.deleted_email ?? "" : (u.email ?? ""),
            phone: profile?.phone ?? null,
            roleId: primaryRole(rolesByUser.get(u.id) ?? []),
            isActive: !banned,
            createdAt: u.created_at,
            updatedAt: u.updated_at ?? null,
            // GoTrue's own field — null means this identity has never
            // completed a sign-in. Nothing writes it; it's the credential
            // check itself that sets it, so it can't drift from reality the
            // way a hand-maintained "activated" flag could.
            lastSignInAt: u.last_sign_in_at ?? null,
            deletedAt: profile?.deleted_at ?? null,
            deletedByName: profile?.deleted_by
              ? (profileById.get(profile.deleted_by) as any)?.full_name ?? null
              : null,
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
      // — add the phone number (which that trigger doesn't carry) and arm
      // the forced-password-setup gate in the same update. The password an
      // admin picks here is always temporary, same as an admin-set password
      // on the edit form below — the account holder must replace it on
      // their first login.
      await admin
        .from("profiles")
        .update({ ...(phone ? { phone } : {}), must_set_password: true })
        .eq("id", newUserId)
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
      // An admin-set password is always temporary — re-arm the same gate a
      // brand-new account gets, so the target is forced to replace it with
      // one only they know.
      if (password) profileUpdate.must_set_password = true
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

    // No account can act on itself (deactivate, delete), at any privilege
    // level — this was previously enforced nowhere for deactivate: the UI
    // hid the button for a super_admin's own row only because it hid it for
    // every super_admin row, not because it checked identity, so a plain
    // admin viewing their own profile had no server-side guard at all.
    // A super_admin target can only be acted on by another super_admin — an
    // admin (scoped to one college) has no business touching an account with
    // global reach. Returns an error string, or null if the action may proceed.
    async function checkCanActOn(action: string): Promise<string | null> {
      if (targetId === callerId) {
        return `Vous ne pouvez pas ${action} votre propre compte.`
      }
      const { data: targetRoles } = await admin
        .from("user_roles")
        .select("role_id")
        .eq("user_id", targetId)
      const targetIsSuperAdmin = (targetRoles ?? []).some((r) => r.role_id === "super_admin")
      if (targetIsSuperAdmin && !isSuperAdmin) {
        return "Seul un super administrateur peut agir sur ce compte."
      }
      return null
    }

    // ---- DEACTIVATE / REACTIVATE --------------------------------------
    if (req.method === "PATCH" && (action === "deactivate" || action === "reactivate")) {
      const guardErr = await checkCanActOn("désactiver")
      if (guardErr) return json({ error: guardErr }, targetId === caller.id ? 400 : 403)

      const { error: banErr } = await admin.auth.admin.updateUserById(targetId, {
        ban_duration: action === "deactivate" ? "876000h" : "none",
      })
      if (banErr) return json({ error: banErr.message }, 400)

      await logAdminAction(action === "deactivate" ? "USER_DEACTIVATE" : "USER_REACTIVATE", {
        name: await targetName(targetId),
      })

      return json({ data: { ok: true } })
    }

    // ---- DELETE ----------------------------------------------------------
    // Two outcomes depending on whether financial/audit history points at
    // this person: expenses, activity_log and investors all reference
    // `profiles` with NO ACTION (see AGENTS.md's append-only rule), so
    // Postgres would refuse a hard delete anyway if any existed.
    //
    //   no references  -> hard delete, as before: user_roles, profiles,
    //                      auth.users all removed, nothing left behind.
    //   references exist -> soft delete: the account is banned permanently
    //                      and its auth email is tombstoned so the address
    //                      becomes reusable (see the plan doc for why this
    //                      can't be avoided), but `profiles` survives so
    //                      `recorded_by_name` keeps naming a person instead
    //                      of an orphaned uuid. user_roles is kept too —
    //                      dropping it would silently remove the account
    //                      from every role-scoped list, including the
    //                      super-admin archive meant to show it.
    //
    // Irreversible either way past this point: a hard delete for the usual
    // reason, a soft delete because the original email is gone from
    // auth.users the moment it's overwritten — restoring the account would
    // need a fresh address typed back in by hand.
    if (req.method === "DELETE") {
      const guardErr = await checkCanActOn("supprimer")
      if (guardErr) return json({ error: guardErr }, targetId === caller.id ? 400 : 403)

      const [{ count: expenseCount }, { count: activityCount }, { count: investorCount }] =
        await Promise.all([
          admin.from("expenses").select("id", { count: "exact", head: true }).eq("recorded_by", targetId),
          admin.from("activity_log").select("id", { count: "exact", head: true }).eq("user_id", targetId),
          admin.from("investors").select("id", { count: "exact", head: true }).eq("user_id", targetId),
        ])
      const totalRefs = (expenseCount ?? 0) + (activityCount ?? 0) + (investorCount ?? 0)

      // Read the name before anything changes — targetName() reads
      // `profiles`, which a hard delete is about to remove.
      const name = await targetName(targetId)

      if (totalRefs > 0) {
        // Captured before the tombstone write below — handle_updated_user()
        // (20260725012345) syncs profiles.email from auth.users on every
        // email change, so once the tombstone lands there's no reading the
        // real address back from anywhere except this moment.
        const { data: profileBeforeTombstone } = await admin
          .from("profiles")
          .select("email")
          .eq("id", targetId)
          .maybeSingle()
        const originalEmail = profileBeforeTombstone?.email ?? null

        // A reserved-by-RFC TLD (.invalid, RFC 2606) that can never resolve
        // or receive mail — the point is only to free the real address for
        // reuse, not to reach anyone at this one.
        const tombstoneEmail = `deleted+${targetId}@wagnon.invalid`
        const { error: tombstoneErr } = await admin.auth.admin.updateUserById(targetId, {
          email: tombstoneEmail,
          ban_duration: "876000h",
        })
        if (tombstoneErr) return json({ error: tombstoneErr.message }, 400)

        const { error: softDelErr } = await admin
          .from("profiles")
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by: callerId,
            deleted_email: originalEmail,
          })
          .eq("id", targetId)
        if (softDelErr) return json({ error: softDelErr.message }, 400)

        await logAdminAction("USER_SOFT_DELETE", {
          name,
          expense_count: expenseCount ?? 0,
          activity_count: activityCount ?? 0,
          investor_count: investorCount ?? 0,
        })

        return json({ data: { ok: true, mode: "soft" } })
      }

      // Children first: user_roles has no FK back to profiles/auth.users
      // (only to colleges and roles), so nothing would clean it up
      // automatically and it would otherwise dangle after the identity
      // it names is gone.
      await admin.from("user_roles").delete().eq("user_id", targetId)
      await admin.from("profiles").delete().eq("id", targetId)
      const { error: delErr } = await admin.auth.admin.deleteUser(targetId)
      if (delErr) return json({ error: delErr.message }, 400)

      // Logged as the *caller's* action (their own profile row still
      // exists) — this is the one entry in this function where the actor
      // and the subject are never the same person, since self-delete is
      // refused above.
      await logAdminAction("USER_DELETE", { name })

      return json({ data: { ok: true, mode: "hard" } })
    }

    return json({ error: "Not found" }, 404)
  } catch (err) {
    // A thrown Postgrest error (e.g. `if (profilesErr) throw profilesErr`
    // above) is a plain object with a `.message` string, not an `Error`
    // instance — `instanceof Error` alone silently discarded it in favor of
    // "Internal error", hiding the real reason behind every query failure
    // caught here. Checked for `.message` on any object, not just Errors.
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "Internal error"
    return json({ error: message }, 500)
  }
})
