import { useState } from "react"
import { Dashboard } from "@/features/dashboard/Dashboard"
import { InvestorsPage } from "@/features/investors/InvestorsPage"
import { ExpensesPage } from "@/features/expenses/ExpensesPage"
import { UsersPage } from "@/features/users/UsersPage"
import { ActiveUserBar } from "@/components/ActiveUserBar"
import { AuthProvider, useAuth } from "@/lib/auth"
import { initDb } from "@/db/client"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "@/components/AppSidebar"
import { SettingsPage } from "@/features/settings/SettingsPage"
import { SettingsProvider } from "@/lib/settings"
import { LoginPage } from "@/features/auth/LoginPage"
import { useEffect } from "react"

type Tab = "dashboard" | "investors" | "expenses" | "users" | "settings"

const tabLabels: Record<Tab, string> = {
  dashboard: "Tableau de bord",
  investors: "Investisseurs",
  expenses: "Dépenses",
  users: "Utilisateurs & Permissions",
  settings: "Paramètres",
}

// ---------------------------------------------------------------------------
// Inner shell — rendered only when AuthProvider has resolved session state.
// Kept separate so useAuth() can be called inside AuthProvider's tree.
// ---------------------------------------------------------------------------

function AppShell() {
  const { user, loading } = useAuth()
  const [tab, setTab] = useState<Tab>("dashboard")
  const [refreshKey, setRefreshKey] = useState(0)
  const [dbReady, setDbReady] = useState(false)

  useEffect(() => {
    initDb()
      .then(() => setDbReady(true))
      .catch((err) => {
        console.error("Failed to initialise local database:", err)
        setDbReady(true) // Non-fatal — app still usable without local DB
      })
  }, [])

  // Still restoring session from localStorage + /auth/me
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground bg-background font-sans">
        Chargement…
      </div>
    )
  }

  // No valid session — show login screen
  if (!user) {
    return <LoginPage />
  }

  // Redirect to a safe tab if user navigated to users tab but lost admin role
  const canManageUsers = user.role === "admin" || user.role === "super_admin"
  const effectiveTab: Tab =
    tab === "users" && !canManageUsers ? "dashboard" : tab

  function bump() {
    setRefreshKey((k) => k + 1)
  }

  return (
    <TooltipProvider>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "16rem",
            "--header-height": "3.5rem",
          } as React.CSSProperties
        }
      >
        <AppSidebar
          variant="inset"
          currentTab={effectiveTab}
          onTabChange={setTab}
          userRole={user.role}
        />
        <SidebarInset className="border-l border-border md:border-l-0">
          <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border bg-card px-4 md:px-6 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
            <div className="flex w-full items-center gap-2">
              <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
              <Separator
                orientation="vertical"
                className="mx-2 data-[orientation=vertical]:h-4 bg-border"
              />
              <h1 className="font-sans text-sm font-semibold text-foreground">
                {tabLabels[effectiveTab]}
              </h1>
              <div className="ml-auto flex items-center gap-4">
                <ActiveUserBar />
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto">
            {!dbReady ? null : (
              <>
                {effectiveTab === "dashboard" && <Dashboard refreshKey={refreshKey} />}
                {effectiveTab === "investors" && <InvestorsPage onChange={bump} />}
                {effectiveTab === "expenses" && <ExpensesPage onChange={bump} />}
                {effectiveTab === "users" && canManageUsers && <UsersPage />}
                {effectiveTab === "settings" && <SettingsPage />}
              </>
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Root — providers wrap everything
// ---------------------------------------------------------------------------

function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </SettingsProvider>
  )
}

export default App
