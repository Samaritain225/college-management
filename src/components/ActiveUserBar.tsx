// ActiveUserBar — displays the authenticated user in the app header.
//
// The old "Acting as" user picker (with PIN dialogs and user switching) has
// been replaced by real authentication via src/lib/auth.tsx. This component
// now shows the currently logged-in user's name and role, and provides a
// single "Se déconnecter" action that calls auth.logout().

import { useAuth } from "@/lib/auth"
import { useTheme } from "@/lib/theme"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { LogOut, Bell, User, Sun, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function getRoleLabel(role: string): string {
  switch (role) {
    case "super_admin":
      return "Super Admin"
    case "admin":
      return "Administrateur"
    default:
      return "Investisseur"
  }
}

export function ActiveUserBar({ onNavigateToTab }: { onNavigateToTab?: (tab: any) => void }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()

  if (!user) return null

  return (
    <div className="flex items-center gap-1">
      {/* Notification bell */}
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9 rounded-full text-ink-soft hover:text-ink hover:bg-teal-100/50"
        title="Notifications"
      >
        <Bell className="size-4" />
      </Button>

      {/* Theme toggle — Moon in light mode, Sun in dark mode */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="relative h-9 w-9 rounded-full text-ink-soft hover:text-ink hover:bg-teal-100/50 transition-colors"
        title={theme === "light" ? "Passer en mode sombre" : "Passer en mode clair"}
        aria-label={theme === "light" ? "Passer en mode sombre" : "Passer en mode clair"}
      >
        {theme === "light" ? (
          <Moon className="size-4" />
        ) : (
          <Sun className="size-4" />
        )}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center rounded-full hover:bg-teal-100/50 p-0.5 transition-colors outline-hidden cursor-pointer">
            <Avatar className="h-9 w-9 border border-ink/10">
              <AvatarFallback className="bg-teal-100 text-teal-950 font-display font-medium text-sm">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-paper border border-ink/10 shadow-xs">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1.5">
              <div className="flex flex-col">
                <p className="text-sm font-display font-semibold leading-none text-ink">{user.name}</p>
                <p className="text-xs text-ink-soft mt-1 uppercase tracking-wider font-display font-semibold">
                  {getRoleLabel(user.role)}
                </p>
              </div>
              <p className="text-xs leading-none text-ink-soft/70 border-t border-ink/10 pt-1.5">{user.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-ink/10" />
          {onNavigateToTab && (
            <>
              <DropdownMenuItem
                onClick={() => onNavigateToTab("profile")}
                className="cursor-pointer text-ink hover:bg-teal-100/50 hover:text-teal-950"
              >
                <User className="mr-2 size-4" />
                <span className="font-display text-sm">Mon compte</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-ink/10" />
            </>
          )}
          <DropdownMenuItem
            onClick={logout}
            className="text-negative focus:bg-negative-bg focus:text-negative cursor-pointer"
          >
            <LogOut className="mr-2 size-4" />
            <span className="font-display text-sm">Se déconnecter</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
