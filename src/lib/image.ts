// Client-side image compression for receipt and profile-photo uploads.
//
// Runs before any upload so a 3-5 MB phone photo becomes a few hundred KB on
// a weak connection, without a server round-trip. Resizes to fit within
// maxDimension on the long edge and re-encodes as JPEG.

export interface CompressImageOptions {
  /** Longest edge in pixels after resize. Default 1600 — plenty for a legible receipt. */
  maxDimension?: number
  /** JPEG quality, 0-1. Default 0.8. */
  quality?: number
}

export async function compressImage(
  file: File,
  options: CompressImageOptions = {}
): Promise<File> {
  const { maxDimension = 1600, quality = 0.8 } = options

  if (!file.type.startsWith("image/")) {
    throw new Error(`compressImage: expected an image file, got "${file.type}"`)
  }

  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("compressImage: canvas 2d context unavailable")
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    )
    if (!blob) throw new Error("compressImage: canvas.toBlob failed")

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg"
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() })
  } finally {
    bitmap.close()
  }
}
