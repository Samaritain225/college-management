import * as React from "react"
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

type Tab = "dashboard" | "investors" | "expenses" | "categories" | "users" | "settings" | "profile" | "teachers" | "students" | "classes"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  currentTab: Tab
  onTabChange: (tab: Tab) => void
  /** The authenticated user's role — controls which nav items are visible. */
  userRole: string | undefined
}

export function AppSidebar({ currentTab, onTabChange, userRole, ...props }: AppSidebarProps) {
  const { collegeName, collegeLogo } = useSettings()

  const canManageUsers = userRole === "admin" || userRole === "super_admin"

  const academicItems = [
    { id: "teachers" as Tab, title: "Enseignants", icon: GraduationCap },
    { id: "students" as Tab, title: "Élèves", icon: BookOpen },
    { id: "classes" as Tab, title: "Classes", icon: School },
  ]

  const financeItems = [
    { id: "expenses" as Tab, title: "Dépenses", icon: Receipt },
    { id: "categories" as Tab, title: "Catégories", icon: FolderTree },
    ...(canManageUsers
      ? [{ id: "investors" as Tab, title: "Investisseurs", icon: Users }]
      : []),
  ]

  const systemItems = [
    ...(canManageUsers
      ? [{ id: "users" as Tab, title: "Utilisateurs", icon: UserCog }]
      : []),
    { id: "settings" as Tab, title: "Paramètres", icon: Settings },
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
        {/* Top Ungrouped Item: Tableau de bord */}
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Tableau de bord"
                  isActive={currentTab === "dashboard"}
                  onClick={() => onTabChange("dashboard")}
                  className={`w-full justify-start gap-3 transition-colors ${
                    currentTab === "dashboard"
                      ? "bg-teal-100 text-teal-950 font-display font-semibold"
                      : "text-ink-soft hover:bg-teal-100/50 hover:text-teal-950"
                  }`}
                >
                  <LayoutDashboard className="size-4 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden font-display">Tableau de bord</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Group 1: Académique */}
        <SidebarGroup className="p-0 space-y-1">
          <SidebarGroupLabel className="text-xs font-display font-semibold text-ink-soft/70 uppercase tracking-wider px-2 group-data-[collapsible=icon]:hidden">
            Académique
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {academicItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={currentTab === item.id}
                    onClick={() => onTabChange(item.id)}
                    className={`w-full justify-start gap-3 transition-colors ${
                      currentTab === item.id
                        ? "bg-teal-100 text-teal-950 font-display font-semibold"
                        : "text-ink-soft hover:bg-teal-100/50 hover:text-teal-950"
                    }`}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden font-display">{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Group 2: Finances */}
        <SidebarGroup className="p-0 space-y-1">
          <SidebarGroupLabel className="text-xs font-display font-semibold text-ink-soft/70 uppercase tracking-wider px-2 group-data-[collapsible=icon]:hidden">
            Finances
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {financeItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={currentTab === item.id}
                    onClick={() => onTabChange(item.id)}
                    className={`w-full justify-start gap-3 transition-colors ${
                      currentTab === item.id
                        ? "bg-teal-100 text-teal-950 font-display font-semibold"
                        : "text-ink-soft hover:bg-teal-100/50 hover:text-teal-950"
                    }`}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden font-display">{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Group 3: Système */}
        <SidebarGroup className="p-0 space-y-1 mt-auto">
          <SidebarGroupLabel className="text-xs font-display font-semibold text-ink-soft/70 uppercase tracking-wider px-2 group-data-[collapsible=icon]:hidden">
            Système
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {systemItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={currentTab === item.id}
                    onClick={() => onTabChange(item.id)}
                    className={`w-full justify-start gap-3 transition-colors ${
                      currentTab === item.id
                        ? "bg-teal-100 text-teal-950 font-display font-semibold"
                        : "text-ink-soft hover:bg-teal-100/50 hover:text-teal-950"
                    }`}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden font-display">{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
