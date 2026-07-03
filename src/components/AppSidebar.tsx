import * as React from "react"
import { LayoutDashboard, Users, Receipt, Settings, Shield } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useSettings } from "@/lib/settings"
import type { UserRole } from "@/lib/auth"

type Tab = "dashboard" | "investors" | "expenses" | "users" | "settings"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  currentTab: Tab
  onTabChange: (tab: Tab) => void
  /** The authenticated user's role — controls which nav items are visible. */
  userRole: UserRole | undefined
}

export function AppSidebar({ currentTab, onTabChange, userRole, ...props }: AppSidebarProps) {
  const { collegeName, collegeLogo } = useSettings()

  const canManageUsers = userRole === "admin" || userRole === "super_admin"

  const mainItems = [
    { id: "dashboard" as Tab, title: "Tableau de bord", icon: LayoutDashboard },
    { id: "investors" as Tab, title: "Investisseurs", icon: Users },
    { id: "expenses" as Tab, title: "Dépenses", icon: Receipt },
    ...(canManageUsers
      ? [{ id: "users" as Tab, title: "Utilisateurs", icon: Shield }]
      : []),
  ]

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="border-b border-sidebar-border/50 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-medium text-sm overflow-hidden shrink-0">
            {collegeLogo ? (
              <img src={collegeLogo} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              collegeName.charAt(0).toUpperCase()
            )}
          </div>
          <span className="font-semibold text-foreground truncate group-data-[collapsible=icon]:hidden">
            {collegeName}
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-3 py-4 flex flex-col justify-between">
        <SidebarMenu className="gap-1.5">
          {mainItems.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                tooltip={item.title}
                isActive={currentTab === item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full justify-start gap-3 transition-colors ${
                  currentTab === item.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className="h-4.5 w-4.5 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>

        <SidebarMenu className="gap-1.5 mt-auto">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Paramètres"
              isActive={currentTab === "settings"}
              onClick={() => onTabChange("settings")}
              className={`w-full justify-start gap-3 transition-colors ${
                currentTab === "settings"
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Settings className="h-4.5 w-4.5 shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden">Paramètres</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  )
}
