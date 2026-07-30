/* eslint-disable react/only-export-components --
   A route table exports the router object alongside the lazy element wrappers.
   That is inherent to the file's job, and the only cost is Fast Refresh
   reloading this module wholesale — which is what you want when routes change. */
import { lazy, type ReactNode } from "react"
import { Navigate, Outlet, createBrowserRouter } from "react-router-dom"
import { AppShell } from "@/components/AppShell"
import { NotFoundView } from "@/components/NotFoundView"
import { RequireAuth, RequireRole, useAuth } from "@/lib/auth"
import { SetPasswordPage } from "@/features/auth/SetPasswordPage"

// Route-level code splitting — each feature page ships its own chunk, loaded
// only when its route is first visited.
const Dashboard = lazy(() =>
  import("@/features/dashboard/Dashboard").then((m) => ({ default: m.Dashboard }))
)
const InvestorsPage = lazy(() =>
  import("@/features/investors/InvestorsPage").then((m) => ({ default: m.InvestorsPage }))
)
const ExpensesPage = lazy(() =>
  import("@/features/expenses/ExpensesPage").then((m) => ({ default: m.ExpensesPage }))
)
const UsersPage = lazy(() =>
  import("@/features/users/UsersPage").then((m) => ({ default: m.UsersPage }))
)
const SettingsPage = lazy(() =>
  import("@/features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage }))
)
const TeachersPage = lazy(() =>
  import("@/features/academic/TeachersPage").then((m) => ({ default: m.TeachersPage }))
)
const StudentsPage = lazy(() =>
  import("@/features/academic/StudentsPage").then((m) => ({ default: m.StudentsPage }))
)
const ClassesPage = lazy(() =>
  import("@/features/academic/ClassesPage").then((m) => ({ default: m.ClassesPage }))
)

/**
 * Role gate for a whole branch of the tree.
 *
 * Redirects rather than rendering nothing: the previous shell silently coerced
 * `users`/`investors` to the dashboard for non-admins, which was fine when
 * there was no URL. Now that there is one, leaving it pointing at a page the
 * user cannot see would be a lie in the address bar.
 */
function RoleRoute({ roles, children }: { roles: string[]; children: ReactNode }) {
  return (
    <RequireRole roles={roles} fallback={<Navigate to="/" replace />}>
      {children}
    </RequireRole>
  )
}

/**
 * Holds a signed-in user on the set-password screen until
 * `profiles.must_set_password` clears — a brand-new invited account, or one
 * whose password an admin just reset. Renders in place of the whole shell
 * (not a `<Navigate>`) so whatever deep link the person actually clicked
 * survives the detour and resumes once the gate lifts.
 */
function RequireOnboarded({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (user?.mustSetPassword) return <SetPasswordPage />
  return <>{children}</>
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <RequireAuth>
        <RequireOnboarded>
          <AppShell />
        </RequireOnboarded>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Dashboard />, handle: { label: "Tableau de bord" } },

      {
        path: "teachers",
        handle: { label: "Enseignants" },
        element: (
          <RoleRoute roles={["super_admin", "admin", "treasurer", "teacher"]}>
            <TeachersPage />
          </RoleRoute>
        ),
      },
      {
        path: "students",
        handle: { label: "Élèves" },
        element: (
          <RoleRoute roles={["super_admin", "admin", "treasurer", "teacher"]}>
            <StudentsPage />
          </RoleRoute>
        ),
      },
      {
        path: "classes",
        handle: { label: "Classes" },
        element: (
          <RoleRoute roles={["super_admin", "admin", "treasurer", "teacher"]}>
            <ClassesPage />
          </RoleRoute>
        ),
      },

      { path: "expenses", element: <ExpensesPage mode="expenses" />, handle: { label: "Dépenses" } },
      {
        path: "categories",
        element: <ExpensesPage mode="categories" />,
        handle: { label: "Catégories de dépenses" },
      },

      // List and detail are nested so the section label is declared once and
      // the detail route inherits it — the breadcrumb reads the deepest match
      // that carries a label, and the parent match supplies the link back.
      {
        path: "investors",
        handle: { label: "Investisseurs" },
        element: (
          <RoleRoute roles={["admin", "super_admin", "treasurer", "investor"]}>
            <Outlet />
          </RoleRoute>
        ),
        children: [
          { index: true, element: <InvestorsPage /> },
          { path: ":id/edit", element: <InvestorsPage /> },
          { path: ":id", element: <InvestorsPage /> },
        ],
      },
      {
        path: "users",
        handle: { label: "Utilisateurs" },
        element: (
          <RoleRoute roles={["admin", "super_admin"]}>
            <Outlet />
          </RoleRoute>
        ),
        children: [
          { index: true, element: <UsersPage /> },
          { path: ":id", element: <UsersPage /> },
        ],
      },

      // Old entry point, kept as a redirect so bookmarks/links don't 404 —
      // "Mon compte" now lives in Settings (ProfileSection), not UsersPage.
      { path: "profile", element: <Navigate to="/settings?tab=profile" replace /> },
      { path: "settings", element: <SettingsPage />, handle: { label: "Paramètres" } },

      // Stable redirectTo target for the invite/recovery email — exists only
      // so GoTrue has a fixed URL to send the token to. RequireOnboarded
      // (above) is what actually takes over from here while the gate is set.
      { path: "bienvenue", element: <Navigate to="/" replace /> },

      { path: "*", element: <NotFoundView /> },
    ],
  },
])
