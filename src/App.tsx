import { useEffect, useState } from "react"
import { Dashboard } from "@/features/dashboard/Dashboard"
import { InvestorsPage } from "@/features/investors/InvestorsPage"
import { ExpensesPage } from "@/features/expenses/ExpensesPage"
import { UsersPage } from "@/features/users/UsersPage"
import { ActiveUserBar } from "@/components/ActiveUserBar"
import { ActiveUserProvider } from "@/lib/active-user"
import { initDb } from "@/db/client"
import { listInvestors, type Investor } from "@/db/queries"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "@/components/AppSidebar"

import { SettingsPage } from "@/features/settings/SettingsPage"
import { SettingsProvider } from "@/lib/settings"
import { LoginPage } from "@/features/auth/LoginPage"

type Tab = "dashboard" | "investors" | "expenses" | "users" | "settings"

const tabLabels: Record<Tab, string> = {
  dashboard: "Tableau de bord",
  investors: "Investisseurs",
  expenses: "Dépenses",
  users: "Utilisateurs",
  settings: "Paramètres",
}

function App() {
  const [ready, setReady] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [investors, setInvestors] = useState<Investor[]>([])
  const [tab, setTab] = useState<Tab>("dashboard")
  const [refreshKey, setRefreshKey] = useState(0)

  async function refreshInvestors() {
    setInvestors(await listInvestors())
  }

  useEffect(() => {
    initDb()
      .then(refreshInvestors)
      .then(() => setReady(true))
      .catch((err) => {
        console.error("Failed to initialise database:", err)
        // Still show the app so the user sees something instead of
        // an infinite loading screen.
        setReady(true)
      })
  }, [])

  function bump() {
    setRefreshKey((k) => k + 1)
    refreshInvestors()
  }

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground bg-background font-sans">
        Chargement…
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <SettingsProvider>
        <LoginPage onLogin={() => setIsLoggedIn(true)} />
      </SettingsProvider>
    )
  }

  return (
    <SettingsProvider>
      <ActiveUserProvider investors={investors}>
        <TooltipProvider>
          <SidebarProvider
            style={
              {
                "--sidebar-width": "16rem",
                "--header-height": "3.5rem",
              } as React.CSSProperties
            }
          >
            <AppSidebar variant="inset" currentTab={tab} onTabChange={setTab} />
            <SidebarInset className="border-l border-border md:border-l-0">
              <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border bg-card px-4 md:px-6 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
                <div className="flex w-full items-center gap-2">
                  <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
                  <Separator
                    orientation="vertical"
                    className="mx-2 data-[orientation=vertical]:h-4 bg-border"
                  />
                  <h1 className="font-sans text-sm font-semibold text-foreground">
                    {tabLabels[tab]}
                  </h1>
                  <div className="ml-auto flex items-center gap-4">
                    <ActiveUserBar investors={investors} onLogout={() => setIsLoggedIn(false)} />
                  </div>
                </div>
              </header>
              <main className="flex-1 overflow-y-auto">
                {tab === "dashboard" && <Dashboard refreshKey={refreshKey} />}
                {tab === "investors" && <InvestorsPage onChange={bump} />}
                {tab === "expenses" && <ExpensesPage onChange={bump} />}
                {tab === "users" && <UsersPage />}
                {tab === "settings" && <SettingsPage />}
              </main>
            </SidebarInset>
          </SidebarProvider>
        </TooltipProvider>
      </ActiveUserProvider>
    </SettingsProvider>
  )
}

export default App
