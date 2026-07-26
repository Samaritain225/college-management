// Build-time stub for @supabase/storage-js, aliased in vite.config.ts.
//
// This app stores files in Cloudflare R2, not Supabase Storage — uploads go
// through supabase/functions/storage-sign and src/lib/uploads.ts, which use
// plain fetch. There is no `supabase.storage` call anywhere in src, yet the
// real package shipped to every user (~106KB of source).
//
// supabase-js imports exactly two bindings from this package: StorageClient
// (constructed for the `storage` accessor) and StorageApiError, which it
// re-exports as part of its public API — so both must exist here or the
// build fails on a missing export.
//
// See .agents/AGENTS.md for why uploads live in R2.

export class StorageApiError extends Error {
  status: number
  statusCode: string

  constructor(message: string, status = 0, statusCode = "") {
    super(message)
    this.name = "StorageApiError"
    this.status = status
    this.statusCode = statusCode
  }
}

export class StorageClient {
  constructor(_url?: string, _headers?: Record<string, string>, _fetch?: unknown) {}

  from(): never {
    throw new Error(
      "Supabase Storage is stubbed out of this bundle — this app uploads to " +
        "Cloudflare R2 via src/lib/uploads.ts. Remove the alias in " +
        "vite.config.ts to use Supabase Storage instead."
    )
  }
}
