import * as React from "react"
import { useLocation } from "react-router-dom"
import {
  LayoutDashboard,
  Users,
  Receipt,
  Settings,
  GraduationCap,
  BookOpen,
  School,
  UserCog,
  FolderTree,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useSettings } from "@/lib/settings"
import { useDirectionalNavigate } from "@/lib/useDirectionalNavigate"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  /** The authenticated user's role — controls which nav items are visible. */
  userRole: string | undefined
}

interface NavEntry {
  to: string
  title: string
  icon: React.ComponentType<{ className?: string }>
}

/**
 * One sidebar row.
 *
 * Navigates through `useDirectionalNavigate` rather than a plain `<Link>` so
 * the slide keeps its direction of travel; a Link would still route correctly
 * but every transition would animate the same way.
 */
function NavItem({ to, title, icon: Icon }: NavEntry) {
  const { pathname } = useLocation()
  const navigate = useDirectionalNavigate()

  // Prefix match so /investors/:id keeps the Investisseurs row lit. "/" would
  // prefix-match everything, so it is compared exactly.
  const isActive = to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/")

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={title}
        isActive={isActive}
        onClick={() => navigate(to)}
        className={`w-full justify-start gap-3 transition-colors ${
          isActive
            ? "bg-teal-100 text-teal-950 font-display font-semibold"
            : "text-ink-soft hover:bg-teal-100/50 hover:text-teal-950"
        }`}
      >
        <Icon className="size-4 shrink-0" />
        <span className="group-data-[collapsible=icon]:hidden font-display">{title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function NavGroup({
  label,
  items,
  className,
}: {
  label: string
  items: NavEntry[]
  className?: string
}) {
  if (items.length === 0) return null
  return (
    <SidebarGroup className={`p-0 space-y-1 ${className ?? ""}`}>
      <SidebarGroupLabel className="text-xs font-display font-semibold text-ink-soft/70 uppercase tracking-wider px-2 group-data-[collapsible=icon]:hidden">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function AppSidebar({ userRole, ...props }: AppSidebarProps) {
  const { collegeName, collegeLogo } = useSettings()

  const canManageUsers = userRole === "admin" || userRole === "super_admin"

  const academicItems: NavEntry[] = [
    { to: "/teachers", title: "Enseignants", icon: GraduationCap },
    { to: "/students", title: "Élèves", icon: BookOpen },
    { to: "/classes", title: "Classes", icon: School },
  ]

  const financeItems: NavEntry[] = [
    { to: "/expenses", title: "Dépenses", icon: Receipt },
    { to: "/categories", title: "Catégories", icon: FolderTree },
    ...(canManageUsers ? [{ to: "/investors", title: "Investisseurs", icon: Users }] : []),
  ]

  const systemItems: NavEntry[] = [
    ...(canManageUsers ? [{ to: "/users", title: "Utilisateurs", icon: UserCog }] : []),
    { to: "/settings", title: "Paramètres", icon: Settings },
  ]

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="border-b border-ink/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-950 text-white font-display font-medium text-sm overflow-hidden shrink-0">
            {collegeLogo ? (
              <img src={collegeLogo} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              collegeName.charAt(0).toUpperCase()
            )}
          </div>
          <span className="font-display font-semibold text-ink truncate group-data-[collapsible=icon]:hidden">
            {collegeName}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-3 space-y-4">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <NavItem to="/" title="Tableau de bord" icon={LayoutDashboard} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <NavGroup label="Académique" items={academicItems} />
        <NavGroup label="Finances" items={financeItems} />
        <NavGroup label="Système" items={systemItems} className="mt-auto" />
      </SidebarContent>
    </Sidebar>
  )
}
