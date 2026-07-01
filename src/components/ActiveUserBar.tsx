import React, { useState } from "react"
import { useActiveUser } from "@/lib/active-user"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { verifyInvestorPin, type Investor } from "@/db/queries"
import { ShieldCheck, X, LogOut, ChevronDown, User } from "lucide-react"

interface ActiveUserBarProps {
  investors: Investor[]
  onLogout?: () => void
}

export function ActiveUserBar({ investors, onLogout }: ActiveUserBarProps) {
  const { activeUser, setActiveUser } = useActiveUser()
  const [pendingUser, setPendingUser] = useState<Investor | null>(null)
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  const handleSelectUser = (user: Investor) => {
    if (user.id === activeUser?.id) return

    if (user.pin_hash) {
      setPendingUser(user)
      setPin("")
      setError(null)
    } else {
      setActiveUser(user)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingUser) return

    setVerifying(true)
    setError(null)

    try {
      const match = await verifyInvestorPin(pendingUser.id, pin)
      if (match) {
        setActiveUser(pendingUser)
        setPendingUser(null)
      } else {
        setError("Code PIN incorrect.")
      }
    } catch (err) {
      console.error("PIN verification error:", err)
      setError("Une erreur est survenue lors de la vérification.")
    } finally {
      setVerifying(false)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase()
  }

  return (
    <div className="flex items-center gap-2">
      {activeUser ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/80 transition-colors text-left outline-hidden">
              <Avatar className="h-8 w-8 border border-border">
                <AvatarFallback className="bg-primary/10 text-primary font-medium text-xs">
                  {getInitials(activeUser.name)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:flex flex-col">
                <span className="text-xs font-semibold text-foreground leading-none">
                  {activeUser.name}
                </span>
                <span className="text-4xs text-muted-foreground mt-0.5 leading-none uppercase tracking-wider font-semibold">
                  {activeUser.role === "admin" ? "Administrateur" : "Investisseur"}
                </span>
              </div>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none text-foreground">{activeUser.name}</p>
                <p className="text-xs leading-none text-muted-foreground">{activeUser.email || "Pas d'adresse email"}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
              Changer de session
            </DropdownMenuLabel>
            {investors
              .filter((i) => i.id !== activeUser.id)
              .map((user) => (
                <DropdownMenuItem key={user.id} onClick={() => handleSelectUser(user)}>
                  <User className="mr-2 h-4 w-4" />
                  <span className="truncate">{user.name}</span>
                  <span className="ml-auto text-4xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground uppercase">
                    {user.role === "admin" ? "Admin" : "Lecteur"}
                  </span>
                </DropdownMenuItem>
              ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onLogout}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Se déconnecter</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <User className="size-4" />
              <span>Choisir session</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Sélectionner un utilisateur</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {investors.map((user) => (
              <DropdownMenuItem key={user.id} onClick={() => handleSelectUser(user)}>
                <span className="truncate">{user.name}</span>
                <span className="ml-auto text-4xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground uppercase">
                  {user.role === "admin" ? "Admin" : "Lecteur"}
                </span>
              </DropdownMenuItem>
            ))}
            {onLogout && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-destructive cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Se déconnecter</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* PIN Authentication Dialog Overlay */}
      {pendingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <ShieldCheck className="size-5 text-primary" />
                <span>Authentification requise</span>
              </div>
              <button
                onClick={() => setPendingUser(null)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleVerify} className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Saisissez le code PIN pour accéder à la session de{" "}
                <span className="font-semibold text-foreground">{pendingUser.name}</span>.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="pin-entry" className="text-xs">
                  Code PIN de sécurité
                </Label>
                <Input
                  id="pin-entry"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  className="text-center tracking-widest text-lg font-mono h-10"
                  autoFocus
                />
              </div>

              {error && <p className="text-xs text-destructive text-center font-medium">{error}</p>}

              <div className="flex gap-3 justify-end pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPendingUser(null)}
                >
                  Annuler
                </Button>
                <Button type="submit" size="sm" disabled={pin.length !== 4 || verifying}>
                  {verifying ? "Vérification..." : "Déverrouiller"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
