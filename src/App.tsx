import { useState, useEffect, lazy, Suspense } from "react"
import { ThemeProvider } from "@/lib/theme"
import { ActiveUserBar } from "@/components/ActiveUserBar"
import { AuthProvider, useAuth, RequireAuth, RequireRole } from "@/lib/auth"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "@/components/AppSidebar"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { NotFoundView } from "@/components/NotFoundView"
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

// Route-level code splitting — each feature page ships its own chunk, loaded
// only when its tab is first visited.
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

function PageFallback() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8 animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-48 bg-ink/10 rounded" />
        <div className="h-4 w-64 bg-ink/10 rounded" />
      </div>
      <div className="h-64 bg-ink/10 rounded-xl" />
    </div>
  )
}

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

// Runtime membership check for the "unrecognized tab" fallback below — the
// `Tab` union covers this statically, but state can outlive the code that
// produced it, so this guards against silently rendering nothing.
const KNOWN_TABS = new Set<string>(Object.keys(tabLabels))

// Session-only (not localStorage): a reload/return-to-tab restores where the
// user was, but a genuinely new browser session still opens on the
// dashboard — there's no router/URL sync, so this is the tab position's only
// memory.
const LAST_TAB_KEY = "wagnon:lastTab"

function readLastTab(): Tab {
  try {
    const stored = sessionStorage.getItem(LAST_TAB_KEY)
    if (stored && KNOWN_TABS.has(stored)) return stored as Tab
  } catch {
    // sessionStorage unavailable (private browsing, etc.) — fall through
  }
  return "dashboard"
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
  const [tab, setTab] = useState<Tab>(readLastTab)
  const [refreshKey, setRefreshKey] = useState(0)
  // Local libSQL init is gone (Phase 0 cleanup); kept as a prop on feature
  // pages so their loading-gate signature didn't need to change.
  const dbReady = true

  // Breadcrumbs states
  const [subBreadcrumbs, setSubBreadcrumbs] = useState<string[]>([])
  const [backTrigger, setBackTrigger] = useState(0)

  // Cross-tab routing sub-view state
  const [selectedUserIdForTab, setSelectedUserIdForTab] = useState<string | null>(null)

  // Reset sub-breadcrumbs when base tab changes
  useEffect(() => {
    setSubBreadcrumbs([])
  }, [tab])

  // Remember the active tab so a reload returns here instead of the dashboard.
  useEffect(() => {
    try {
      sessionStorage.setItem(LAST_TAB_KEY, tab)
    } catch {
      // sessionStorage unavailable — losing tab memory is a non-issue
    }
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
            "--sidebar-width": "14rem",
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
        <SidebarInset className="border-0 bg-paper md:peer-data-[variant=inset]:m-0 md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:border-0 md:peer-data-[variant=inset]:shadow-none">
          <header className="flex h-12 shrink-0 items-center bg-transparent px-3 sm:px-6 transition-all">
            <div className="flex w-full items-center justify-between min-w-0">
              <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 flex-1">
                <SidebarTrigger className="-ml-1 shrink-0 text-ink-soft hover:text-ink" />
                <Separator
                  orientation="vertical"
                  className="mx-1 sm:mx-2 data-[orientation=vertical]:h-4 bg-ink/10"
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
                          subBreadcrumbs.length > 0 ? "cursor-pointer" : "pointer-events-none text-ink font-semibold"
                        } text-xs truncate max-w-[120px] sm:max-w-none`}
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
          <main className="flex-1 overflow-y-auto mx-2 mb-2 sm:mx-4 sm:mb-4 md:mx-6 md:mb-6 border border-ink/10 bg-paper rounded-lg sm:rounded-xl shadow-xs">
            <div className="h-full">
            <ErrorBoundary key={effectiveTab}>
            <Suspense fallback={<PageFallback />}>
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
                  <InvestorsPage
                    onChange={bump}
                    dbReady={dbReady}
                    onBreadcrumbChange={setSubBreadcrumbs}
                    backTrigger={backTrigger}
                  />
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
              {!KNOWN_TABS.has(effectiveTab) && (
                <NotFoundView onGoHome={() => transitionToTab("dashboard")} />
              )}
            </Suspense>
            </ErrorBoundary>
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
          <h2 className="text-lg font-display font-bold text-ink">Corps Enseignant</h2>
          <p className="text-xs text-ink-soft">Liste des enseignants et leurs spécialités.</p>
        </div>
        <Input
          placeholder="Rechercher un enseignant..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-9 rounded-md border-ink/15 text-xs bg-paper text-ink"
        />
      </div>
      <div className="rounded-md border border-ink/10 bg-paper overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-ink/10">
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Nom</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Matière</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Genre</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Email</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft text-right">Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t, i) => (
              <TableRow key={i} className="border-b border-ink/10 last:border-0 hover:bg-teal-100/30">
                <TableCell className="text-xs font-display font-semibold text-ink">{t.name}</TableCell>
                <TableCell className="text-xs text-ink-soft">{t.subject}</TableCell>
                <TableCell className="text-xs text-ink-soft">{t.gender}</TableCell>
                <TableCell className="text-xs text-ink-soft font-sans">{t.email}</TableCell>
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
          <h2 className="text-lg font-display font-bold text-ink">Registre des Élèves</h2>
          <p className="text-xs text-ink-soft">Liste des élèves inscrits dans l'établissement.</p>
        </div>
        <Input
          placeholder="Rechercher un élève..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-9 rounded-md border-ink/15 text-xs bg-paper text-ink"
        />
      </div>
      <div className="rounded-md border border-ink/10 bg-paper overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-ink/10">
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Matricule</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Nom</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Classe</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Genre</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft text-right">Parent / Tuteur</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s, i) => (
              <TableRow key={i} className="border-b border-ink/10 last:border-0 hover:bg-teal-100/30">
                <TableCell className="text-xs font-sans font-bold text-ink">{s.id}</TableCell>
                <TableCell className="text-xs font-display font-semibold text-ink">{s.name}</TableCell>
                <TableCell className="text-xs text-ink-soft">{s.class}</TableCell>
                <TableCell className="text-xs text-ink-soft">{s.gender}</TableCell>
                <TableCell className="text-xs text-right text-ink-soft">{s.parent}</TableCell>
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
          <h2 className="text-lg font-display font-bold text-ink">Gestion des Classes</h2>
          <p className="text-xs text-ink-soft">Liste des classes et professeurs principaux.</p>
        </div>
        <Input
          placeholder="Rechercher une classe..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-9 rounded-md border-ink/15 text-xs bg-paper text-ink"
        />
      </div>
      <div className="rounded-md border border-ink/10 bg-paper overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-ink/10">
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Nom de la classe</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Niveau</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft">Professeur Principal</TableHead>
              <TableHead className="text-xs font-display font-semibold text-ink-soft text-right">Effectif</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c, i) => (
              <TableRow key={i} className="border-b border-ink/10 last:border-0 hover:bg-teal-100/30">
                <TableCell className="text-xs font-display font-semibold text-ink">{c.name}</TableCell>
                <TableCell className="text-xs text-ink-soft">{c.level}</TableCell>
                <TableCell className="text-xs text-ink-soft">{c.headTeacher}</TableCell>
                <TableCell className="text-xs text-right font-sans font-semibold text-ink">{c.count} élèves</TableCell>
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
    <ThemeProvider>
      <SettingsProvider>
        <AuthProvider>
          <RequireAuth>
            <AppShell />
          </RequireAuth>
          <Toaster />
        </AuthProvider>
      </SettingsProvider>
    </ThemeProvider>
  )
}

export default App
