// storage-sign: mints short-lived presigned URLs for Cloudflare R2.
//
// The R2 credentials are S3 write credentials for the whole bucket — they can
// never reach the browser (anything in a VITE_* var is inlined into the
// shipped bundle and world-readable). So the browser asks this function for a
// URL scoped to one object key, then PUTs the file straight to R2.
//
// Uploading direct-to-R2 rather than proxying the bytes through here is
// deliberate: Edge Functions cap request size, and on the ~70%-connectivity
// links this app targets, one hop beats two.
//
// Authorization is per upload kind, mirroring the RLS rules:
//   logo    -> admin / super_admin only (college identity)
//   avatar  -> any authenticated user, but only ever their own key
//   receipt -> admin / super_admin / treasurer (finance)
//
// Required secrets (supabase secrets set ...):
//   R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
import { createClient } from "npm:@supabase/supabase-js@2"
import { AwsClient } from "npm:aws4fetch@1.0.20"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
const SERVICE_ROLE_KEY = Deno.env.get("LEGACY_SERVICE_ROLE_KEY")!

const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!
const R2_BUCKET = Deno.env.get("R2_BUCKET")!
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!

const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  })
}

type UploadKind = "logo" | "avatar" | "receipt"

const ALLOWED_KINDS: UploadKind[] = ["logo", "avatar", "receipt"]

// Images only for logo/avatar. Receipts additionally allow PDF, which is what
// a supplier invoice usually arrives as.
const ALLOWED_CONTENT_TYPES: Record<UploadKind, string[]> = {
  logo: ["image/jpeg", "image/png", "image/webp"],
  avatar: ["image/jpeg", "image/png", "image/webp"],
  receipt: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
}

const MAX_BYTES: Record<UploadKind, number> = {
  logo: 2 * 1024 * 1024,
  avatar: 2 * 1024 * 1024,
  receipt: 10 * 1024 * 1024,
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
}

const PRESIGN_TTL_SECONDS = 300

const r2 = new AwsClient({
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  service: "s3",
  region: "auto",
})

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401)

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user: caller },
  } = await asCaller.auth.getUser()
  if (!caller) return json({ error: "Invalid session" }, 401)

  let body: { kind?: string; contentType?: string; size?: number }
  try {
    body = await req.json()
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }

  const kind = body.kind as UploadKind
  if (!kind || !ALLOWED_KINDS.includes(kind)) {
    return json({ error: `kind must be one of: ${ALLOWED_KINDS.join(", ")}` }, 400)
  }

  const contentType = body.contentType ?? ""
  if (!ALLOWED_CONTENT_TYPES[kind].includes(contentType)) {
    return json(
      { error: `contentType must be one of: ${ALLOWED_CONTENT_TYPES[kind].join(", ")}` },
      400
    )
  }

  // Advisory only — the client reports its own size. The hard ceiling is the
  // bucket lifecycle/quota; this just fails fast before a doomed upload.
  const size = typeof body.size === "number" ? body.size : 0
  if (size > MAX_BYTES[kind]) {
    return json({ error: `File exceeds the ${MAX_BYTES[kind] / 1024 / 1024} MB limit` }, 400)
  }

  // Role lookup with service_role: user_roles is RLS-protected, and scoping by
  // the caller's own token here would be circular. super_admin rows are global
  // (college_id is null) — see AGENTS.md.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data: roleRows } = await admin
    .from("user_roles")
    .select("role_id")
    .eq("user_id", caller.id)
  const roles = (roleRows ?? []).map((r) => r.role_id)

  const isSuperAdmin = roles.includes("super_admin")
  const isAdmin = isSuperAdmin || roles.includes("admin")
  const canManageFinance = isAdmin || roles.includes("treasurer")

  if (kind === "logo" && !isAdmin) {
    return json({ error: "Forbidden — admin or super_admin role required" }, 403)
  }
  if (kind === "receipt" && !canManageFinance) {
    return json({ error: "Forbidden — finance role required" }, 403)
  }
  // avatar: any authenticated user, and the key below is derived from their
  // own id, so one user can never overwrite another's.

  const ext = EXTENSIONS[contentType]
  const unique = crypto.randomUUID()

  // Keys are server-derived, never client-supplied — a client-chosen key would
  // let any caller overwrite any object in the bucket.
  const key =
    kind === "avatar"
      ? `avatars/${caller.id}/${unique}.${ext}`
      : kind === "logo"
        ? `logos/${unique}.${ext}`
        : `receipts/${new Date().getFullYear()}/${unique}.${ext}`

  // Expiry rides as a query param (X-Amz-Expires), not a header — that's how
  // SigV4 query-string signing carries it.
  const target = new URL(`${R2_ENDPOINT}/${R2_BUCKET}/${key}`)
  target.searchParams.set("X-Amz-Expires", String(PRESIGN_TTL_SECONDS))

  // content-type is deliberately left unsigned: signing it would force the
  // browser's PUT header to match byte-for-byte or R2 rejects with an opaque
  // 403. The key is server-derived and the URL lives 5 minutes, so the
  // remaining exposure is a wrong content-type on one object.
  const signed = await r2.sign(new Request(target, { method: "PUT" }), {
    aws: { signQuery: true },
  })

  return json({ data: { uploadUrl: signed.url, key, expiresIn: PRESIGN_TTL_SECONDS } })
})
