// Authentication context for the college-budget app.
//
// Token persistence strategy
// ---------------------------
// We use localStorage for the access token, refresh token, token issue time,
// and cached user. The Tauri Store/Stronghold migration has not happened yet.
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
import { api, isApiError, setTokenGetter, setUnauthorizedRecovery } from "@/lib/api"
import { LoginPage } from "@/features/auth/LoginPage"

// ---------------------------------------------------------------------------
// Types — camelCase to match backend response shapes exactly
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string
  name: string
  email: string
  role: string // Sourced from roleId on backend
  isActive: boolean
}

interface ApiAuthUser {
  id: string
  name: string
  email: string
  phone: string | null
  roleId: string
  isActive: boolean
}

// The backend's serialize() helper wraps responses in a { data: ... } envelope.
interface LoginResponse {
  data: {
    accessToken: string
    refreshToken: string
    user: ApiAuthUser
  }
}

interface MeResponse {
  data: {
    user: ApiAuthUser
  }
}

interface RefreshResponse {
  accessToken: string
  refreshToken: string
}

export type AuthStatus = "checking" | "authenticated" | "unauthenticated"

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  /** True while the initial session restore is in progress. */
  loading: boolean
  status: AuthStatus
  /** Last login error. Cleared on next login attempt. */
  error: string | null
  login: (email: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ---------------------------------------------------------------------------
// Storage helpers
// (Swap these functions to migrate to tauri-plugin-store later)
// ---------------------------------------------------------------------------

const TOKEN_KEY = "college-budget:auth-token"
const REFRESH_TOKEN_KEY = "college-budget:refresh-token"
const ACCESS_TOKEN_ISSUED_AT_KEY = "college-budget:access-token-issued-at"
const USER_KEY = "college-budget:auth-user"
const DAY_MS = 24 * 60 * 60 * 1000
const ACCESS_TOKEN_REFRESH_AFTER_MS = 6 * DAY_MS

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
    // Storage unavailable
  }
}

function readPersistedRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  } catch {
    return null
  }
}

function writePersistedRefreshToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, token)
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY)
    }
  } catch {
    // Storage unavailable
  }
}

function readPersistedAccessTokenIssuedAt(): number | null {
  try {
    const value = localStorage.getItem(ACCESS_TOKEN_ISSUED_AT_KEY)
    const timestamp = value ? Number(value) : Number.NaN
    return Number.isFinite(timestamp) ? timestamp : null
  } catch {
    return null
  }
}

function writePersistedAccessTokenIssuedAt(timestamp: number | null): void {
  try {
    if (timestamp) {
      localStorage.setItem(ACCESS_TOKEN_ISSUED_AT_KEY, String(timestamp))
    } else {
      localStorage.removeItem(ACCESS_TOKEN_ISSUED_AT_KEY)
    }
  } catch {
    // Storage unavailable
  }
}

function readPersistedUser(): AuthUser | null {
  try {
    const val = localStorage.getItem(USER_KEY)
    return val ? JSON.parse(val) : null
  } catch {
    return null
  }
}

function writePersistedUser(user: AuthUser | null): void {
  try {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(USER_KEY)
    }
  } catch {
    // Storage unavailable
  }
}

function mapApiUserToAuthUser(u: ApiAuthUser): AuthUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.roleId,
    isActive: u.isActive,
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<AuthStatus>("checking")
  const [error, setError] = useState<string | null>(null)

  // Keep a ref so the token getter registered with api.ts always reads the
  // latest value without stale-closure issues.
  const tokenRef = useRef<string | null>(null)
  const refreshTokenRef = useRef<string | null>(null)
  const accessTokenIssuedAtRef = useRef<number | null>(null)
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null)

  // Provisional offline state: token exists but /auth/me could not be reached.
  const [provisional, setProvisional] = useState(false)

  const clearSession = useCallback(() => {
    writePersistedToken(null)
    writePersistedRefreshToken(null)
    writePersistedAccessTokenIssuedAt(null)
    writePersistedUser(null)
    tokenRef.current = null
    refreshTokenRef.current = null
    accessTokenIssuedAtRef.current = null
    setToken(null)
    setUser(null)
    setStatus("unauthenticated")
    setProvisional(false)
  }, [])

  const persistTokenPair = useCallback((accessToken: string, refreshToken: string) => {
    const issuedAt = Date.now()
    writePersistedToken(accessToken)
    writePersistedRefreshToken(refreshToken)
    writePersistedAccessTokenIssuedAt(issuedAt)
    tokenRef.current = accessToken
    refreshTokenRef.current = refreshToken
    accessTokenIssuedAtRef.current = issuedAt
    setToken(accessToken)
  }, [])

  const refreshSession = useCallback(async (): Promise<boolean> => {
    const currentRefreshToken = refreshTokenRef.current
    if (!currentRefreshToken) {
      clearSession()
      return false
    }

    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current
    }

    const refreshAttempt = (async () => {
      try {
        const data = await api.postPublic<RefreshResponse>("/auth/refresh", {
          refreshToken: currentRefreshToken,
        })
        persistTokenPair(data.accessToken, data.refreshToken)
        setStatus("authenticated")
        setProvisional(false)
        return true
      } catch (err) {
        // A rejected refresh token requires a real login. Network failures do
        // not erase the cached session, preserving offline-first behaviour.
        if (isApiError(err) && err.isUnauthorized) {
          clearSession()
        }
        return false
      } finally {
        refreshInFlightRef.current = null
      }
    })()

    refreshInFlightRef.current = refreshAttempt
    return refreshAttempt
  }, [clearSession, persistTokenPair])

  // Register the live token getter and 401 recovery path without importing
  // AuthProvider from api.ts (which would create a circular dependency).
  useEffect(() => {
    setTokenGetter(() => tokenRef.current)
    setUnauthorizedRecovery(refreshSession)
    return () => setUnauthorizedRecovery(null)
  }, [refreshSession])

  // -------------------------------------------------------------------------
  // Silent session restore at launch
  // -------------------------------------------------------------------------

  const fullRestore = useCallback(
    async (storedToken: string) => {
      // Wire the token into the ref immediately so api calls during restore use it.
      tokenRef.current = storedToken

      try {
        const data = await api.get<MeResponse>("/auth/me")
        const mappedUser = mapApiUserToAuthUser(data.data.user)
        setUser(mappedUser)
        writePersistedUser(mappedUser)
        setToken(storedToken)
        setStatus("authenticated")
        setProvisional(false)
      } catch (err) {
        if (isApiError(err) && err.isUnauthorized) {
          // The API client already attempted one refresh. Both tokens are no
          // longer usable, so require a fresh login.
          clearSession()
        } else {
          // Network error — operate in provisional offline mode.
          // Set the token so future API calls have the header, and keep
          // authenticated status so the app shell renders rather than login.
          setToken(storedToken)
          setStatus("authenticated")
          setProvisional(true)
        }
      }
    },
    [clearSession],
  )

  useEffect(() => {
    const storedToken = readPersistedToken()
    const storedRefreshToken = readPersistedRefreshToken()
    const storedIssuedAt = readPersistedAccessTokenIssuedAt()
    const storedUser = readPersistedUser()
    if (storedToken) {
      tokenRef.current = storedToken
      refreshTokenRef.current = storedRefreshToken
      accessTokenIssuedAtRef.current = storedIssuedAt
      setToken(storedToken)
      setUser(storedUser)
      setStatus("authenticated")
      fullRestore(storedToken)
    } else {
      setStatus("unauthenticated")
    }
  }, [fullRestore])

  // Refresh in the background after six days, one day before the fixed
  // seven-day access-token expiry. Sessions created before this metadata was
  // added refresh once on launch when a refresh token is available.
  useEffect(() => {
    if (!token || !refreshTokenRef.current) return

    const issuedAt = accessTokenIssuedAtRef.current
    const age = issuedAt ? Date.now() - issuedAt : ACCESS_TOKEN_REFRESH_AFTER_MS
    const delay = Math.max(0, ACCESS_TOKEN_REFRESH_AFTER_MS - age)
    const timer = window.setTimeout(() => {
      void refreshSession()
    }, delay)

    return () => window.clearTimeout(timer)
  }, [refreshSession, token])

  // -------------------------------------------------------------------------
  // Retry /auth/me when connectivity returns (provisional mode)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!provisional) return

    const handleOnline = async () => {
      if (!tokenRef.current) return
      try {
        const data = await api.get<MeResponse>("/auth/me")
        const mappedUser = mapApiUserToAuthUser(data.data.user)
        setUser(mappedUser)
        writePersistedUser(mappedUser)
        setProvisional(false)
      } catch (err) {
        if (isApiError(err) && err.isUnauthorized) {
          // The API client already attempted one refresh before this point.
          clearSession()
        }
        // Still offline — do nothing, keep provisional
      }
    }

    window.addEventListener("online", handleOnline)
    return () => window.removeEventListener("online", handleOnline)
  }, [clearSession, provisional])

  // -------------------------------------------------------------------------
  // login / logout
  // -------------------------------------------------------------------------

  const login = useCallback(async (email: string, password: string) => {
    setError(null)
    const data = await api.postPublic<LoginResponse>("/auth/login", {
      email,
      password,
    })
    const mappedUser = mapApiUserToAuthUser(data.data.user)
    writePersistedUser(mappedUser)
    persistTokenPair(data.data.accessToken, data.data.refreshToken)
    setUser(mappedUser)
    setStatus("authenticated")
    setProvisional(false)
    return mappedUser
  }, [persistTokenPair])

  const logout = useCallback(async () => {
    // Best-effort server-side logout — don't block on failure.
    try {
      await api.post("/auth/logout")
    } catch {
      // Ignore — local state is cleared regardless.
    }
    clearSession()
  }, [clearSession])

  // -------------------------------------------------------------------------
  // Derived: is the session considered "valid enough to render the app"?
  // Either we have a confirmed user, or we're in provisional offline mode.
  // -------------------------------------------------------------------------
  const effectiveUser: AuthUser | null =
    user ??
    (provisional || status === "authenticated"
      ? ({ role: "investor", name: "Utilisateur", email: "" } as AuthUser)
      : null)

  const loading = status === "checking"

  return (
    <AuthContext.Provider
      value={{
        user: effectiveUser,
        token,
        loading,
        status,
        error,
        login,
        logout,
      }}
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

// ---------------------------------------------------------------------------
// Route Guards
// ---------------------------------------------------------------------------

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()

  if (status === "checking") {
    return (
      <div className="flex h-screen items-center justify-center bg-background font-sans text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm font-medium">Chargement de la session…</span>
        </div>
      </div>
    )
  }

  if (status === "unauthenticated") {
    return <LoginPage />
  }

  return <>{children}</>
}

export function RequireRole({
  roles,
  children,
  fallback = null,
}: {
  roles: string[]
  children: ReactNode
  fallback?: ReactNode
}) {
  const { user } = useAuth()

  if (!user || !roles.includes(user.role)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
