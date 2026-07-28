// Client half of the R2 upload path. See supabase/functions/storage-sign/.
//
// Flow: compress (images only) -> ask storage-sign for a presigned PUT scoped
// to one server-derived key -> PUT straight to R2 -> hand the key back to the
// caller, which stores it on the relevant row (colleges.logo_key,
// profiles.avatar_key, expenses.receipt_key).
//
// Only the object key is ever persisted. The public base URL is deployment
// config, so switching buckets or putting a custom domain in front never
// requires rewriting stored rows.

import { supabase } from "@/lib/supabase"
import { compressImage } from "@/lib/image"
import { COLLEGE_ID } from "@/lib/queries"

export type UploadKind = "logo" | "avatar" | "receipt"

/** Longest edge per kind. A logo renders at ~64px, an avatar at ~56px; a
 *  receipt has to stay legible enough to read line items back off it. */
const MAX_DIMENSION: Record<UploadKind, number> = {
  logo: 512,
  avatar: 512,
  receipt: 1600,
}

const PUBLIC_BASE_URL = import.meta.env.VITE_R2_PUBLIC_BASE_URL as string | undefined

interface SignResponse {
  data: { uploadUrl: string; key: string; expiresIn: number }
}

/** Resolve a stored object key to a fetchable URL. Returns null for a missing
 *  key so callers can fall back to initials/placeholder rather than rendering
 *  a broken image. */
export function publicUrl(key: string | null | undefined): string | null {
  if (!key) return null
  if (!PUBLIC_BASE_URL) {
    console.warn("VITE_R2_PUBLIC_BASE_URL is not set — uploaded files cannot be displayed.")
    return null
  }
  return `${PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`
}

/**
 * Whether a stored `receipt_key` is a real uploaded object or a hand-typed
 * paper reference (e.g. "RECU-TEST-001") from before uploads existed. Both
 * live in the same column, and handing the latter to `publicUrl` produces a
 * link that resolves and 404s. Every key this app writes is server-derived
 * as `<kind>/…/<uuid>.<ext>`, so the slash is the tell — a reference someone
 * typed off a paper receipt has no path structure.
 */
export function isUploadedReceiptKey(key: string | null | undefined): boolean {
  return !!key && key.includes("/")
}

async function callStorageSign<T>(body: Record<string, unknown>): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error("Not authenticated")

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/storage-sign`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  )

  const json = await res.json()
  if (!res.ok) throw new Error(json.error || `Requête refusée (${res.status})`)
  return (json as { data: T }).data
}

/**
 * Compress if it's an image, upload to R2, return the object key to persist.
 * Throws with a user-presentable message on any failure.
 */
export async function uploadFile(file: File, kind: UploadKind): Promise<string> {
  let payload = file

  // PDFs (receipts only) pass through untouched — compressImage is raster-only.
  if (file.type.startsWith("image/")) {
    try {
      payload = await compressImage(file, {
        maxDimension: MAX_DIMENSION[kind],
        quality: kind === "receipt" ? 0.8 : 0.85,
      })
    } catch (err) {
      // A codec the browser can't decode shouldn't block the upload outright;
      // the Edge Function still enforces the size ceiling.
      console.warn("Image compression failed, uploading original:", err)
    }
  }

  // The college the object belongs to. The function does not take the
  // caller's word for it — it verifies the caller actually holds the required
  // role *at this college* before signing anything.
  const { uploadUrl, key } = await callStorageSign<SignResponse["data"]>({
    action: "sign",
    kind,
    collegeId: COLLEGE_ID,
    contentType: payload.type,
    size: payload.size,
  })

  // The signature covers content-type, so it must match exactly what was signed.
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": payload.type },
    body: payload,
  })

  if (!putRes.ok) {
    throw new Error(
      putRes.status === 403
        ? "Le lien d'envoi a expiré. Réessayez."
        : `Échec de l'envoi du fichier (${putRes.status}).`
    )
  }

  return key
}

/**
 * Delete a previously uploaded object. Call this only *after* the row that
 * referenced the old key has been successfully updated to the new one — a
 * best-effort cleanup that must never be allowed to undo a save that already
 * succeeded. Callers should catch and log rather than surface this failing.
 */
export async function deleteFile(key: string, kind: UploadKind): Promise<void> {
  await callStorageSign<{ deleted: true }>({ action: "delete", kind, collegeId: COLLEGE_ID, key })
}
