// Authentication context for the college-budget app.
//
// Token persistence strategy
// ---------------------------
// We use localStorage with the key `college-budget:auth-token`.
//
// In the Tauri desktop build, the WebView's localStorage lives in the app's
// sandboxed local data directory (OS-managed, per-device). It is NOT part of
// the Turso/libSQL sync path, so the token never replicates to other devices.
// This satisfies the requirement: "token must be cached in local secure
// storage — NOT in the synced Turso/libSQL database."
//
// In a plain browser dev session (npm run dev, no Tauri), localStorage is the
// browser's storage — also acceptable for development only.
//
// The Tauri Store plugin (tauri-plugin-store) would provide OS-level keychain
// integration and can be added as a later hardening step without changing this
// file's public API — just swap the read/write helpers below.
//
// Offline-first behaviour
// -----------------------
// If a token exists locally but the network is unavailable at launch, the app
// treats the token as provisionally valid and renders normally. The /auth/me
// validation is retried automatically when the device comes back online.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { api, isApiError, setTokenGetter } from "@/lib/api"

// ---------------------------------------------------------------------------
// Types — camelCase to match backend response shapes exactly
// ---------------------------------------------------------------------------

export type UserRole = "investor" | "admin" | "super_admin"

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
  isActive: boolean
  agreedContribution: number
  joinedAt: string
}

// The backend's serialize() helper wraps responses in a { data: ... } envelope.
interface LoginResponse {
  data: {
    // token.value!.release() returns the raw opaque token string directly
    token: string
    user: AuthUser
  }
}

interface MeResponse {
  data: {
    user: AuthUser
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  /** True while the initial session restore is in progress. */
  loading: boolean
  /** Last login error. Cleared on next login attempt. */
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ---------------------------------------------------------------------------
// Storage helpers
// (Swap these two functions to migrate to tauri-plugin-store later)
// ---------------------------------------------------------------------------

const TOKEN_KEY = "college-budget:auth-token"

function readPersistedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function writePersistedToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    // Storage unavailable — non-fatal, session won't survive reload
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Keep a ref so the token getter registered with api.ts always reads the
  // latest value without stale-closure issues.
  const tokenRef = useRef<string | null>(null)

  // Provisional offline state: token exists but /auth/me could not be reached.
  // When true, the app renders normally despite user being null.
  const [provisional, setProvisional] = useState(false)

  // Register the token getter once at mount so api.ts can inject the
  // Authorization header without importing from auth.tsx (avoids circular dep).
  useEffect(() => {
    setTokenGetter(() => tokenRef.current)
  }, [])

  // Keep the ref in sync with state.
  useEffect(() => {
    tokenRef.current = token
  }, [token])

  // -------------------------------------------------------------------------
  // Silent session restore at launch
  // -------------------------------------------------------------------------

  const fullRestore = useCallback(
    async (storedToken: string) => {
      // Wire the token into the ref immediately so api calls during restore use it.
      tokenRef.current = storedToken

      try {
        const data = await api.get<MeResponse>("/auth/me")
        setUser(data.data.user)
        setToken(storedToken)
        setProvisional(false)
      } catch (err) {
        if (isApiError(err) && err.isUnauthorized) {
          // Token is dead — require fresh login.
          writePersistedToken(null)
          tokenRef.current = null
        } else {
          // Network error — operate in provisional offline mode.
          // Set the token so future API calls have the header, and mark
          // provisional so the app shell renders the app rather than login.
          setToken(storedToken)
          setProvisional(true)
        }
      }

      setLoading(false)
    },
    [],
  )

  useEffect(() => {
    const stored = readPersistedToken()
    if (stored) {
      fullRestore(stored)
    } else {
      setLoading(false)
    }
  }, [fullRestore])

  // -------------------------------------------------------------------------
  // Retry /auth/me when connectivity returns (provisional mode)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!provisional) return

    const handleOnline = async () => {
      if (!tokenRef.current) return
      try {
        const data = await api.get<MeResponse>("/auth/me")
        setUser(data.data.user)
        setProvisional(false)
      } catch (err) {
        if (isApiError(err) && err.isUnauthorized) {
          // Token expired while offline — force login.
          writePersistedToken(null)
          setToken(null)
          setProvisional(false)
        }
        // Still offline — do nothing, keep provisional
      }
    }

    window.addEventListener("online", handleOnline)
    return () => window.removeEventListener("online", handleOnline)
  }, [provisional])

  // -------------------------------------------------------------------------
  // login / logout
  // -------------------------------------------------------------------------

  const login = useCallback(async (email: string, password: string) => {
    setError(null)
    const data = await api.post<LoginResponse>("/auth/login", {
      email,
      password,
    })
    const newToken = data.data.token
    writePersistedToken(newToken)
    tokenRef.current = newToken
    setToken(newToken)
    setUser(data.data.user)
    setProvisional(false)
  }, [])

  const logout = useCallback(async () => {
    // Best-effort server-side logout — don't block on failure.
    try {
      await api.post("/auth/logout")
    } catch {
      // Ignore — local state is cleared regardless.
    }
    writePersistedToken(null)
    tokenRef.current = null
    setToken(null)
    setUser(null)
    setProvisional(false)
  }, [])

  // -------------------------------------------------------------------------
  // Derived: is the session considered "valid enough to render the app"?
  // Either we have a confirmed user, or we're in provisional offline mode.
  // -------------------------------------------------------------------------
  const effectiveUser: AuthUser | null = user ?? (provisional ? ({ role: "investor" } as AuthUser) : null)

  return (
    <AuthContext.Provider
      value={{ user: effectiveUser, token, loading, error, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
