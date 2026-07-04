// ActiveUserBar — displays the authenticated user in the app header.
//
// The old "Acting as" user picker (with PIN dialogs and user switching) has
// been replaced by real authentication via src/lib/auth.tsx. This component
// now shows the currently logged-in user's name and role, and provides a
// single "Se déconnecter" action that calls auth.logout().

import { useAuth } from "@/lib/auth"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { LogOut, Bell, User } from "lucide-react"
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

  if (!user) return null

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="relative h-10 w-10 rounded-full text-muted-foreground hover:text-foreground"
        title="Notifications"
      >
        <Bell className="size-5" />
      </Button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center rounded-full hover:bg-muted/80 p-0.5 transition-colors outline-hidden cursor-pointer">
          <Avatar className="h-10 w-10 border border-border">
            <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1.5">
            <div className="flex flex-col">
              <p className="text-sm font-semibold leading-none text-foreground">{user.name}</p>
              <p className="text-2xs text-muted-foreground/80 mt-1 uppercase tracking-wider font-semibold">
                {getRoleLabel(user.role)}
              </p>
            </div>
            <p className="text-xs leading-none text-muted-foreground/60 border-t border-border/40 pt-1.5">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {onNavigateToTab && (
          <>
            <DropdownMenuItem
              onClick={() => onNavigateToTab("profile")}
              className="cursor-pointer"
            >
              <User className="mr-2 h-4 w-4" />
              <span>Mon compte</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onClick={logout}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Se déconnecter</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </div>
  )
}
