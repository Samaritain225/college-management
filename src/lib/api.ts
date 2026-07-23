// API client for the AdonisJS backend.
//
// Base URL is read from VITE_API_BASE_URL (set in .env / .env.local).
// Falls back to the Render-deployed URL for convenience so the app works
// without any env file in development.
//
// Token injection: call setTokenGetter() once from AuthProvider to wire up
// the live token without creating a circular import between auth.tsx and api.ts.

const DEFAULT_BASE_URL = "https://college-management-api-etgz.onrender.com/api/v1"

function getBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? DEFAULT_BASE_URL
}

// ---------------------------------------------------------------------------
// Typed error
//
// Note: `erasableSyntaxOnly` in tsconfig disallows class declarations.
// We use a plain object type + factory function instead.
// ---------------------------------------------------------------------------

export interface ApiError {
  readonly name: "ApiError"
  readonly status: number
  readonly message: string
  /** True when the server rejected the token (expired or invalid). */
  readonly isUnauthorized: boolean
}

export function makeApiError(status: number, message: string): ApiError {
  return {
    name: "ApiError",
    status,
    message,
    isUnauthorized: status === 401,
  }
}

export function isApiError(err: unknown): err is ApiError {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as ApiError).name === "ApiError"
  )
}

// ---------------------------------------------------------------------------
// Token getter injection (avoids circular import with auth.tsx)
// ---------------------------------------------------------------------------

type TokenGetter = () => string | null
type UnauthorizedRecovery = () => Promise<boolean>

let _getToken: TokenGetter = () => null
let _recoverUnauthorized: UnauthorizedRecovery | null = null

/** Called once by AuthProvider at mount time. */
export function setTokenGetter(fn: TokenGetter): void {
  _getToken = fn
}

/**
 * Called by AuthProvider to install the single-flight refresh flow used after
 * an authenticated request receives a 401.
 */
export function setUnauthorizedRecovery(fn: UnauthorizedRecovery | null): void {
  _recoverUnauthorized = fn
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: { withAuth?: boolean; retryOnUnauthorized?: boolean } = {},
): Promise<T> {
  const withAuth = options.withAuth ?? true
  const retryOnUnauthorized = options.retryOnUnauthorized ?? true
  const token = withAuth ? _getToken() : null

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "application/json",
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  const res = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    // Refresh once, then retry the original authenticated request. Refresh
    // itself is explicitly excluded so a rejected refresh cannot recurse.
    if (
      res.status === 401 &&
      withAuth &&
      retryOnUnauthorized &&
      _recoverUnauthorized &&
      (await _recoverUnauthorized())
    ) {
      return request<T>(method, path, body, {
        withAuth: true,
        retryOnUnauthorized: false,
      })
    }

    // Try to extract the backend's message field; fall back to statusText.
    let message = res.statusText
    try {
      const json = await res.json()
      // AdonisJS typically returns { message: "..." } or { errors: [{message}] }
      if (typeof json.message === "string") {
        message = json.message
      } else if (Array.isArray(json.errors) && json.errors[0]?.message) {
        message = json.errors[0].message
      }
    } catch {
      // Response body wasn't JSON — keep statusText
    }
    throw makeApiError(res.status, message)
  }

  // 204 No Content — return empty object cast to T
  if (res.status === 204) {
    return {} as T
  }

  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Convenience methods
// ---------------------------------------------------------------------------

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>("GET", path)
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("POST", path, body)
  },
  /** Used by login and refresh flows, which must never attach a bearer token. */
  postPublic<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("POST", path, body, {
      withAuth: false,
      retryOnUnauthorized: false,
    })
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("PATCH", path, body)
  },
  delete<T>(path: string): Promise<T> {
    return request<T>("DELETE", path)
  },
}
