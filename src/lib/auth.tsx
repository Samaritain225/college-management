// Authentication context for the college-budget app, backed by Supabase Auth.
//
// Session persistence and refresh are handled entirely by the Supabase
// client (localStorage + autoRefreshToken) — no manual token/refresh
// plumbing needed here, unlike the old AdonisJS-backed version.
//
// A signed-in user's app-level identity (name, primary role, every role
// they hold) isn't in the JWT — it's derived from `profiles` and
// `user_roles` after sign-in. That fetch needs the network; we cache the
// last-known result in localStorage so a returning user with no
// connectivity still sees the app shell (provisional) instead of a login
// screen, consistent with the ~70% connectivity reality this app is built
// for. The cached copy is refreshed in the background whenever possible.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { LoginPage } from "@/features/auth/LoginPage"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string
  name: string
  email: string
  /** Highest-priority role, for the many existing role === "x" checks. */
  role: string
  /** Every role this user holds (a person can be both investor and teacher). */
  roles: string[]
  isActive: boolean
}

export type AuthStatus = "checking" | "authenticated" | "unauthenticated"

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  status: AuthStatus
  /** Last login error message. Cleared on next login attempt. */
  error: string | null
  login: (email: string, password: string, captchaToken?: string) => Promise<AuthUser>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Roles are many-to-many; UI written for a single role checks the highest
// one held. super_admin/admin/treasurer can manage finance; investor/teacher
// are read-only in their respective areas.
const ROLE_PRIORITY = ["super_admin", "admin", "treasurer", "investor", "teacher"]

function pickPrimaryRole(roleIds: string[]): string {
  for (const r of ROLE_PRIORITY) {
    if (roleIds.includes(r)) return r
  }
  return roleIds[0] ?? "investor"
}

async function fetchAuthUser(supabaseUser: SupabaseUser): Promise<AuthUser> {
  const [{ data: profile }, { data: roleRows, error: rolesError }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", supabaseUser.id).maybeSingle(),
    supabase.from("user_roles").select("role_id").eq("user_id", supabaseUser.id),
  ])

  if (rolesError) throw rolesError

  const roleIds = (roleRows ?? []).map((r) => r.role_id)

  return {
    id: supabaseUser.id,
    name: profile?.full_name || supabaseUser.email || "Utilisateur",
    email: supabaseUser.email ?? "",
    role: pickPrimaryRole(roleIds),
    roles: roleIds,
    // A banned/deactivated user cannot obtain a session at all (GoTrue
    // rejects the sign-in), so reaching this point already implies active.
    isActive: true,
  }
}

// ---------------------------------------------------------------------------
// Cached-user storage (provisional offline state only — session tokens
// themselves live in Supabase's own localStorage keys, not here)
// ---------------------------------------------------------------------------

const USER_CACHE_KEY = "college-budget:auth-user"

function readCachedUser(): AuthUser | null {
  try {
    const val = localStorage.getItem(USER_CACHE_KEY)
    return val ? JSON.parse(val) : null
  } catch {
    return null
  }
}

function writeCachedUser(user: AuthUser | null): void {
  try {
    if (user) {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(USER_CACHE_KEY)
    }
  } catch {
    // Storage unavailable
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>("checking")
  const [error, setError] = useState<string | null>(null)

  // Guards against setting state after unmount, and against a stale
  // background refresh clobbering a newer sign-in.
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    async function restore() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        setStatus("unauthenticated")
        return
      }

      // Render immediately from cache (if any) so a returning user never
      // sees a login flash while we validate/refresh in the background.
      const cached = readCachedUser()
      if (cached && cached.id === session.user.id) {
        setUser(cached)
        setStatus("authenticated")
      }

      try {
        const authUser = await fetchAuthUser(session.user)
        if (!mountedRef.current) return
        writeCachedUser(authUser)
        setUser(authUser)
        setStatus("authenticated")
      } catch {
        // Network or query failure. If we had nothing cached, this session
        // can't be resolved into a usable identity — fall back to login
        // rather than rendering a shell with no name/role. If we did have
        // a cached identity, keep it (provisional offline mode).
        if (!cached) {
          setStatus("unauthenticated")
        }
      }
    }

    restore()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        writeCachedUser(null)
        setUser(null)
        setStatus("unauthenticated")
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const login = useCallback(async (email: string, password: string, captchaToken?: string) => {
    setError(null)
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    })

    if (signInError || !data.user) {
      const message = signInError?.message ?? "Erreur de connexion."
      setError(message)
      throw signInError ?? new Error(message)
    }

    const authUser = await fetchAuthUser(data.user)
    writeCachedUser(authUser)
    setUser(authUser)
    setStatus("authenticated")
    return authUser
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    writeCachedUser(null)
    setUser(null)
    setStatus("unauthenticated")
  }, [])

  const loading = status === "checking"

  return (
    <AuthContext.Provider value={{ user, loading, status, error, login, logout }}>
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
