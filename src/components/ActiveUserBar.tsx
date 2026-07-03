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
import { LogOut, ChevronDown } from "lucide-react"

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

export function ActiveUserBar() {
  const { user, logout } = useAuth()

  if (!user) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/80 transition-colors text-left outline-hidden">
          <Avatar className="h-8 w-8 border border-border">
            <AvatarFallback className="bg-primary/10 text-primary font-medium text-xs">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden sm:flex flex-col">
            <span className="text-xs font-semibold text-foreground leading-none">
              {user.name}
            </span>
            <span className="text-4xs text-muted-foreground mt-0.5 leading-none uppercase tracking-wider font-semibold">
              {getRoleLabel(user.role)}
            </span>
          </div>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none text-foreground">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={logout}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Se déconnecter</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
