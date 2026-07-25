import { Building, Info, UserCircle } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { CollegeIdentitySection } from "./CollegeIdentitySection"
import { ProfileSection } from "./ProfileSection"
import { AboutSection } from "./AboutSection"

// User management deliberately lives only at its own guarded route (reachable
// from the sidebar, admin-only). It used to be embedded here as a third tab,
// which re-exposed to every role a console the sidebar and route guard both
// hide — and whose every action the admin-users Edge Function rejects with 403.

export function SettingsPage() {
  const { user } = useAuth()
  const canManageCollege = user?.role === "admin" || user?.role === "super_admin"

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Paramètres</h1>
        <p className="text-sm text-ink-soft">
          {canManageCollege
            ? "Gérez l'identité du collège et votre compte"
            : "Consultez les informations du collège et gérez votre compte"}
        </p>
      </header>

      <Tabs defaultValue="identity" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="identity" className="flex items-center gap-2">
            <Building className="size-4 shrink-0" />
            <span className="truncate text-xs sm:text-sm">Collège</span>
          </TabsTrigger>
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <UserCircle className="size-4 shrink-0" />
            <span className="truncate text-xs sm:text-sm">Mon compte</span>
          </TabsTrigger>
          <TabsTrigger value="about" className="flex items-center gap-2">
            <Info className="size-4 shrink-0" />
            <span className="truncate text-xs sm:text-sm">À propos</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="identity">
          <CollegeIdentitySection canEdit={canManageCollege} />
        </TabsContent>

        <TabsContent value="profile">
          <ProfileSection />
        </TabsContent>

        <TabsContent value="about">
          <AboutSection />
        </TabsContent>
      </Tabs>
    </div>
  )
}
