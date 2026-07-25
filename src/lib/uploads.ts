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

async function requestSignedUrl(
  kind: UploadKind,
  contentType: string,
  size: number
): Promise<SignResponse["data"]> {
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
      body: JSON.stringify({ kind, contentType, size }),
    }
  )

  const json = await res.json()
  if (!res.ok) throw new Error(json.error || `Upload could not be authorized (${res.status})`)
  return (json as SignResponse).data
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

  const { uploadUrl, key } = await requestSignedUrl(kind, payload.type, payload.size)

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
