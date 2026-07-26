/* eslint-disable react/only-export-components --
   A route table exports the router object alongside the lazy element wrappers.
   That is inherent to the file's job, and the only cost is Fast Refresh
   reloading this module wholesale — which is what you want when routes change. */
import { lazy, type ReactNode } from "react"
import { Navigate, Outlet, createBrowserRouter } from "react-router-dom"
import { AppShell } from "@/components/AppShell"
import { NotFoundView } from "@/components/NotFoundView"
import { RequireAuth, RequireRole, useAuth } from "@/lib/auth"

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

/** The signed-in user's own record, rendered by the same page as /users/:id. */
function OwnProfile() {
  const { user } = useAuth()
  return <UsersPage profileModeForceUserId={user!.id} />
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Dashboard />, handle: { label: "Tableau de bord" } },

      { path: "teachers", element: <TeachersPage />, handle: { label: "Enseignants" } },
      { path: "students", element: <StudentsPage />, handle: { label: "Élèves" } },
      { path: "classes", element: <ClassesPage />, handle: { label: "Classes" } },

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
          <RoleRoute roles={["admin", "super_admin"]}>
            <Outlet />
          </RoleRoute>
        ),
        children: [
          { index: true, element: <InvestorsPage /> },
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

      { path: "profile", element: <OwnProfile />, handle: { label: "Mon compte" } },
      { path: "settings", element: <SettingsPage />, handle: { label: "Paramètres" } },

      { path: "*", element: <NotFoundView /> },
    ],
  },
])
