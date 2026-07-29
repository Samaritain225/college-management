import { Suspense } from "react"
import { Link, Outlet, useLocation, useMatches } from "react-router-dom"
import { ActiveUserBar } from "@/components/ActiveUserBar"
import { useAuth } from "@/lib/auth"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "@/components/AppSidebar"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { useSettings } from "@/lib/settings"
import { Separator } from "@/components/ui/separator"
import { PageTitleProvider, usePageTitle } from "@/lib/pageTitle"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export function PageFallback() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8 animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-48 bg-ink/10 rounded-sm" />
        <div className="h-4 w-64 bg-ink/10 rounded-sm" />
      </div>
      <div className="h-64 bg-ink/10 rounded-xl" />
    </div>
  )
}

/** Route `handle` shape — the section label shown in the breadcrumb. */
export interface RouteHandle {
  label?: string
}

function Header() {
  const { collegeName } = useSettings()
  const matches = useMatches()
  const detailTitle = usePageTitle()

  // Deepest route that declares a label wins — a detail route inherits its
  // section's crumb without having to restate it.
  const labelled = [...matches]
    .reverse()
    .find((m) => (m.handle as RouteHandle | undefined)?.label)
  const sectionLabel = (labelled?.handle as RouteHandle | undefined)?.label
  // The labelled match is the section route itself (`/investors`), so its
  // pathname is exactly where the crumb should link back to.
  const sectionPath = labelled?.pathname

  return (
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
                <BreadcrumbLink asChild className="cursor-pointer text-xs">
                  <Link to="/">{collegeName}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>

              {sectionLabel && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {detailTitle ? (
                      // Only a link when there is something deeper to come back
                      // from. This is what `backTrigger` used to do by hand.
                      <BreadcrumbLink
                        asChild
                        className="cursor-pointer text-xs truncate max-w-[120px] sm:max-w-none"
                      >
                        <Link to={sectionPath ?? "/"}>{sectionLabel}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage className="text-xs font-semibold truncate max-w-[120px] sm:max-w-none">
                        {sectionLabel}
                      </BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </>
              )}

              {detailTitle && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="text-xs font-semibold">{detailTitle}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex items-center gap-4">
          <ActiveUserBar />
        </div>
      </div>
    </header>
  )
}

/**
 * The persistent chrome: sidebar, header, and a slot for the active route.
 *
 * Rendered inside `RequireAuth`, so `user` is always resolved by the time this
 * mounts.
 */
export function AppShell() {
  const { user } = useAuth()
  const location = useLocation()

  return (
    <TooltipProvider>
      <PageTitleProvider>
        <SidebarProvider
          // `h-svh overflow-hidden` on this wrapper (from the vendored
          // shadcn primitive, `sidebar.tsx`) clips everything below one
          // viewport's height on screen — the app's own scroll areas handle
          // scrolling instead. Printing inherited that clip: a print-only
          // report taller than one screen was cut off and squeezed to fit,
          // which is why it came out tiny. Print needs the opposite —
          // natural height, nothing clipped, so the browser can paginate
          // across as many physical pages as the content actually needs.
          className="print:h-auto print:overflow-visible print:w-auto"
          style={
            {
              // 12rem — nudged back up from 10.625rem (15% narrower than the
              // 12.5rem this was tuned to before) because "Tableau de bord"
              // was clipping to "Tableau de ...".
              "--sidebar-width": "12rem",
              "--header-height": "3.5rem",
            } as React.CSSProperties
          }
        >
          {/* Chrome a page never wants on paper. A page that renders its own
              print-only view (e.g. ExpensesPage's report) hides the rest of
              itself with `print:hidden` too — this is the shell's half of
              that contract. */}
          <div className="print:hidden">
            <AppSidebar variant="inset" userRole={user?.role} />
          </div>
          <SidebarInset className="border-0 bg-paper md:peer-data-[variant=inset]:m-0 md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:border-0 md:peer-data-[variant=inset]:shadow-none">
            <div className="print:hidden">
              <Header />
            </div>
            <main className="flex-1 overflow-y-auto print:overflow-visible mx-2 mb-2 sm:mx-4 sm:mb-4 md:mx-6 md:mb-6 print:m-0 border border-ink/10 print:border-0 bg-paper rounded-lg sm:rounded-xl shadow-xs print:shadow-none">
              <div className="h-full">
                {/* Keyed by path so a crash on one screen does not persist its
                    error state onto the next one you navigate to. */}
                <ErrorBoundary key={location.pathname}>
                  <Suspense fallback={<PageFallback />}>
                    <Outlet />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </PageTitleProvider>
    </TooltipProvider>
  )
}
