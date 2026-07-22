import { useState, useEffect } from "react"
import { Dashboard } from "@/features/dashboard/Dashboard"
import { InvestorsPage } from "@/features/investors/InvestorsPage"
import { ExpensesPage } from "@/features/expenses/ExpensesPage"
import { UsersPage } from "@/features/users/UsersPage"
import { ActiveUserBar } from "@/components/ActiveUserBar"
import { AuthProvider, useAuth, RequireAuth, RequireRole } from "@/lib/auth"
import { initDb } from "@/db/client"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "@/components/AppSidebar"
import { SettingsPage } from "@/features/settings/SettingsPage"
import { SettingsProvider, useSettings } from "@/lib/settings"
import { Toaster } from "@/components/ui/sonner"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

type Tab = "dashboard" | "investors" | "expenses" | "categories" | "users" | "settings" | "profile" | "teachers" | "students" | "classes"

const tabLabels: Record<Tab, string> = {
  dashboard: "Tableau de bord",
  investors: "Investisseurs",
  expenses: "Dépenses",
  categories: "Catégories de dépenses",
  users: "Utilisateurs",
  settings: "Paramètres",
  profile: "Mon compte",
  teachers: "Enseignants",
  students: "Élèves",
  classes: "Classes",
}

const tabOrder: Record<Tab, number> = {
  dashboard: 0,
  teachers: 1,
  students: 2,
  classes: 3,
  expenses: 4,
  categories: 5,
  investors: 6,
  users: 7,
  settings: 8,
  profile: 9,
}

// ---------------------------------------------------------------------------
// Inner shell — rendered only when AuthProvider has resolved session state.
// Kept separate so useAuth() can be called inside AuthProvider's tree.
// ---------------------------------------------------------------------------

function AppShell() {
  const { user } = useAuth()
  const { collegeName } = useSettings()
  const [tab, setTab] = useState<Tab>("dashboard")
  const [refreshKey, setRefreshKey] = useState(0)
  const [dbReady, setDbReady] = useState(false)

  // Breadcrumbs states
  const [subBreadcrumbs, setSubBreadcrumbs] = useState<string[]>([])
  const [backTrigger, setBackTrigger] = useState(0)

  // Cross-tab routing sub-view state
  const [selectedUserIdForTab, setSelectedUserIdForTab] = useState<string | null>(null)

  useEffect(() => {
    initDb()
      .then(() => setDbReady(true))
      .catch((err) => {
        console.error("Failed to initialise local database:", err)
        setDbReady(true) // Non-fatal — app still usable without local DB
      })
  }, [])

  // Reset sub-breadcrumbs when base tab changes
  useEffect(() => {
    setSubBreadcrumbs([])
  }, [tab])

  // Safe to assert user is not null here since RequireAuth wraps this component
  const currentUser = user!
  const canManageUsers = currentUser.role === "admin" || currentUser.role === "super_admin"
  const effectiveTab: Tab =
    (tab === "users" || tab === "investors") && !canManageUsers ? "dashboard" : tab

  function bump() {
    setRefreshKey((k) => k + 1)
  }

  function transitionToTab(newTab: Tab) {
    if (!document.startViewTransition) {
      setTab(newTab)
      return
    }

    const currentTabVal = tab
    const oldIndex = tabOrder[currentTabVal] ?? 0
    const newIndex = tabOrder[newTab] ?? 0
    const direction = newIndex >= oldIndex ? "forward" : "backward"

    document.documentElement.classList.add(direction)

    const transition = document.startViewTransition(() => {
      setTab(newTab)
    })

    transition.finished.finally(() => {
      document.documentElement.classList.remove("forward", "backward")
    })
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
          onTabChange={transitionToTab}
          userRole={currentUser.role}
        />
        <SidebarInset className="border-0 bg-background md:peer-data-[variant=inset]:m-0 md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:border-0 md:peer-data-[variant=inset]:shadow-none">
          <header className="flex h-12 shrink-0 items-center bg-transparent px-6 transition-all">
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-1.5">
                <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
                <Separator
                  orientation="vertical"
                  className="mx-2 data-[orientation=vertical]:h-4 bg-border"
                />
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink
                        className="cursor-pointer text-xs"
                        onClick={() => {
                          transitionToTab("dashboard")
                          setSubBreadcrumbs([])
                        }}
                      >
                        {collegeName}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbLink
                        className={`${
                          subBreadcrumbs.length > 0 ? "cursor-pointer" : "pointer-events-none text-foreground font-semibold"
                        } text-xs`}
                        onClick={() => {
                          if (subBreadcrumbs.length > 0) {
                            setSubBreadcrumbs([])
                            setBackTrigger((prev) => prev + 1)
                          }
                        }}
                      >
                        {tabLabels[effectiveTab]}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    {subBreadcrumbs.map((sub, i) => (
                      <span key={i} className="flex items-center gap-1.5 sm:gap-2.5">
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                          <BreadcrumbPage className="text-xs font-semibold">{sub}</BreadcrumbPage>
                        </BreadcrumbItem>
                      </span>
                    ))}
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
              <div className="flex items-center gap-4">
                <ActiveUserBar onNavigateToTab={transitionToTab} />
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto mx-6 mb-6 border border-border bg-card rounded-xl shadow-xs">
            <div className="h-full">
              {effectiveTab === "dashboard" && (
                <Dashboard
                  refreshKey={refreshKey}
                  dbReady={dbReady}
                  onNavigateToTab={(tabName, subId) => {
                    if (subId) {
                      setSelectedUserIdForTab(subId)
                    }
                    transitionToTab(tabName)
                  }}
                />
              )}
              {effectiveTab === "investors" && (
                <RequireRole roles={["admin", "super_admin"]}>
                  <InvestorsPage onChange={bump} dbReady={dbReady} />
                </RequireRole>
              )}
              {effectiveTab === "expenses" && (
                <ExpensesPage
                  mode="expenses"
                  onChange={bump}
                  dbReady={dbReady}
                  onNavigateToTab={transitionToTab}
                />
              )}
              {effectiveTab === "categories" && (
                <ExpensesPage
                  mode="categories"
                  onChange={bump}
                  dbReady={dbReady}
                  onNavigateToTab={transitionToTab}
                />
              )}
              {effectiveTab === "users" && (
                <RequireRole roles={["admin", "super_admin"]}>
                  <UsersPage
                    onBreadcrumbChange={setSubBreadcrumbs}
                    backTrigger={backTrigger}
                    initialSelectedUserId={selectedUserIdForTab}
                    onClearInitialSelectedUserId={() => setSelectedUserIdForTab(null)}
                  />
                </RequireRole>
              )}
              {effectiveTab === "settings" && <SettingsPage />}
              {effectiveTab === "profile" && (
                <UsersPage
                  profileModeForceUserId={currentUser.id}
                  onBreadcrumbChange={setSubBreadcrumbs}
                  backTrigger={backTrigger}
                />
              )}
              {effectiveTab === "teachers" && <TeachersPage />}
              {effectiveTab === "students" && <StudentsPage />}
              {effectiveTab === "classes" && <ClassesPage />}
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}

function TeachersPage() {
  const [search, setSearch] = useState("")
  const teachers = [
    { name: "M. Jean Dupuis", subject: "Mathématiques", gender: "Homme", email: "j.dupuis@college.edu", status: "Actif" },
    { name: "Mme. Sophie Martin", subject: "Physique-Chimie", gender: "Femme", email: "s.martin@college.edu", status: "Actif" },
    { name: "M. Paul Koffi", subject: "Français", gender: "Homme", email: "p.koffi@college.edu", status: "Actif" },
    { name: "Mme. Amélie N'guessan", subject: "SVT", gender: "Femme", email: "a.nguessan@college.edu", status: "Actif" },
    { name: "M. David Traoré", subject: "Histoire-Géo", gender: "Homme", email: "d.traore@college.edu", status: "Actif" },
    { name: "Mme. Fatou Diallo", subject: "Anglais", gender: "Femme", email: "f.diallo@college.edu", status: "Inactif" },
  ]
  const filtered = teachers.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Corps Enseignant</h2>
          <p className="text-xs text-muted-foreground">Liste des enseignants et leurs spécialités.</p>
        </div>
        <Input
          placeholder="Rechercher un enseignant..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-8.5 rounded-md border-border/40 text-xs"
        />
      </div>
      <div className="rounded-md border border-border/40 bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border/40">
              <TableHead className="text-2xs font-bold">Nom</TableHead>
              <TableHead className="text-2xs font-bold">Matière</TableHead>
              <TableHead className="text-2xs font-bold">Genre</TableHead>
              <TableHead className="text-2xs font-bold">Email</TableHead>
              <TableHead className="text-2xs font-bold text-right">Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t, i) => (
              <TableRow key={i} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                <TableCell className="text-xs font-semibold">{t.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{t.subject}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{t.gender}</TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono">{t.email}</TableCell>
                <TableCell className="text-xs text-right">
                  <Badge variant={t.status === "Actif" ? "positive" : "negative"}>{t.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function StudentsPage() {
  const [search, setSearch] = useState("")
  const students = [
    { name: "Kouassi Marc", class: "Terminale S", gender: "Garçon", parent: "M. Kouassi", id: "EL-092" },
    { name: "Diallo Mariam", class: "1ère ES", gender: "Fille", parent: "Mme. Diallo", id: "EL-103" },
    { name: "Kone Adama", class: "2nde A", gender: "Garçon", parent: "M. Kone", id: "EL-142" },
    { name: "N'guessan Marie", class: "3ème A", gender: "Fille", parent: "M. N'guessan", id: "EL-188" },
    { name: "Traoré Ibrahim", class: "4ème B", gender: "Garçon", parent: "Mme. Traoré", id: "EL-203" },
    { name: "Bamba Alima", class: "5ème A", gender: "Fille", parent: "M. Bamba", id: "EL-245" },
  ]
  const filtered = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.class.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Registre des Élèves</h2>
          <p className="text-xs text-muted-foreground">Liste des élèves inscrits dans l'établissement.</p>
        </div>
        <Input
          placeholder="Rechercher un élève..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-8.5 rounded-md border-border/40 text-xs"
        />
      </div>
      <div className="rounded-md border border-border/40 bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border/40">
              <TableHead className="text-2xs font-bold">Matricule</TableHead>
              <TableHead className="text-2xs font-bold">Nom</TableHead>
              <TableHead className="text-2xs font-bold">Classe</TableHead>
              <TableHead className="text-2xs font-bold">Genre</TableHead>
              <TableHead className="text-2xs font-bold text-right">Parent / Tuteur</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s, i) => (
              <TableRow key={i} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                <TableCell className="text-xs font-mono font-bold">{s.id}</TableCell>
                <TableCell className="text-xs font-semibold">{s.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.class}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.gender}</TableCell>
                <TableCell className="text-xs text-right text-muted-foreground">{s.parent}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function ClassesPage() {
  const [search, setSearch] = useState("")
  const classes = [
    { name: "Terminale S", count: 35, headTeacher: "M. Jean Dupuis", level: "Lycée" },
    { name: "1ère ES", count: 32, headTeacher: "Mme. Sophie Martin", level: "Lycée" },
    { name: "2nde A", count: 38, headTeacher: "M. Paul Koffi", level: "Lycée" },
    { name: "3ème A", count: 42, headTeacher: "Mme. Amélie N'guessan", level: "Collège" },
    { name: "4ème B", count: 40, headTeacher: "M. David Traoré", level: "Collège" },
  ]
  const filtered = classes.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.headTeacher.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Gestion des Classes</h2>
          <p className="text-xs text-muted-foreground">Liste des classes et professeurs principaux.</p>
        </div>
        <Input
          placeholder="Rechercher une classe..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-8.5 rounded-md border-border/40 text-xs"
        />
      </div>
      <div className="rounded-md border border-border/40 bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border/40">
              <TableHead className="text-2xs font-bold">Nom de la classe</TableHead>
              <TableHead className="text-2xs font-bold">Niveau</TableHead>
              <TableHead className="text-2xs font-bold">Professeur Principal</TableHead>
              <TableHead className="text-2xs font-bold text-right">Effectif</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c, i) => (
              <TableRow key={i} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                <TableCell className="text-xs font-semibold">{c.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.level}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.headTeacher}</TableCell>
                <TableCell className="text-xs text-right font-mono font-semibold">{c.count} élèves</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root — providers wrap everything
// ---------------------------------------------------------------------------

function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <RequireAuth>
          <AppShell />
        </RequireAuth>
        <Toaster />
      </AuthProvider>
    </SettingsProvider>
  )
}

export default App
