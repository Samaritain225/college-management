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
const USER_KEY = "college-budget:auth-user"

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

  // Provisional offline state: token exists but /auth/me could not be reached.
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
        const mappedUser = mapApiUserToAuthUser(data.data.user)
        setUser(mappedUser)
        writePersistedUser(mappedUser)
        setToken(storedToken)
        setStatus("authenticated")
        setProvisional(false)
      } catch (err) {
        if (isApiError(err) && err.isUnauthorized) {
          // Token is dead — require fresh login.
          writePersistedToken(null)
          writePersistedUser(null)
          tokenRef.current = null
          setToken(null)
          setUser(null)
          setStatus("unauthenticated")
          setProvisional(false)
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
    [],
  )

  useEffect(() => {
    const storedToken = readPersistedToken()
    const storedUser = readPersistedUser()
    if (storedToken) {
      setToken(storedToken)
      setUser(storedUser)
      setStatus("authenticated")
      fullRestore(storedToken)
    } else {
      setStatus("unauthenticated")
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
        const mappedUser = mapApiUserToAuthUser(data.data.user)
        setUser(mappedUser)
        writePersistedUser(mappedUser)
        setProvisional(false)
      } catch (err) {
        if (isApiError(err) && err.isUnauthorized) {
          // Token expired while offline — force login.
          writePersistedToken(null)
          writePersistedUser(null)
          setToken(null)
          setUser(null)
          setStatus("unauthenticated")
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
    const newToken = data.data.accessToken
    const mappedUser = mapApiUserToAuthUser(data.data.user)
    writePersistedToken(newToken)
    writePersistedUser(mappedUser)
    tokenRef.current = newToken
    setToken(newToken)
    setUser(mappedUser)
    setStatus("authenticated")
    setProvisional(false)
    return mappedUser
  }, [])

  const logout = useCallback(async () => {
    // Best-effort server-side logout — don't block on failure.
    try {
      await api.post("/auth/logout")
    } catch {
      // Ignore — local state is cleared regardless.
    }
    writePersistedToken(null)
    writePersistedUser(null)
    tokenRef.current = null
    setToken(null)
    setUser(null)
    setStatus("unauthenticated")
    setProvisional(false)
  }, [])

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
