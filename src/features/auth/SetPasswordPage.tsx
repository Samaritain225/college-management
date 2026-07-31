// Forced first-password screen — rendered in place of AppShell (see
// RequireOnboarded in routes.tsx) whenever the signed-in user's
// `mustSetPassword` flag is still set: a brand-new invited account, or one
// whose password an admin just reset on their behalf.
import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordChecklist } from "@/components/PasswordChecklist"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"
import { focusFirstInvalidField } from "@/lib/formFocus"
import { useSettings } from "@/lib/settings"
import {
  passwordChangeSchema,
  type PasswordChangeFormValues,
} from "@/features/settings/profileFormSchemas"
import { Lock } from "lucide-react"

export function SetPasswordPage() {
  const { collegeName, collegeLogo } = useSettings()
  const { user, refreshUser, logout } = useAuth()
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<PasswordChangeFormValues>({
    resolver: zodResolver(passwordChangeSchema),
    mode: "onTouched",
    defaultValues: { password: "", confirmPassword: "" },
  })
  const passwordValue = form.watch("password")

  const handleSubmit = form.handleSubmit(
    async (values) => {
      setSubmitting(true)
      try {
        // GoTrue's own same-password enforcement isn't guaranteed across
        // versions, and this is the one place where "the admin-set password
        // must not survive" is a hard requirement, not a nicety — so it's
        // checked explicitly rather than assumed. Attempting to sign in with
        // the *new* value while still on the temporary-password session: if
        // it succeeds, the new value is identical to the current password
        // (a wrong-password attempt fails instead, which is the expected,
        // desired outcome here).
        if (user?.email) {
          const { error: probeErr } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: values.password,
          })
          if (!probeErr) {
            toast.error("Le nouveau mot de passe doit être différent de celui qui vous a été fourni.")
            return
          }
        }

        const { error: updateErr } = await supabase.auth.updateUser({ password: values.password })
        if (updateErr) throw updateErr

        // Clears the gate for auth.uid() only — see the migration's
        // security-definer function. Must run after the password update
        // succeeds, not before: a failed updateUser should leave the gate up.
        const { error: rpcErr } = await supabase.rpc("complete_password_setup")
        if (rpcErr) throw rpcErr

        await refreshUser()
        toast.success("Mot de passe défini. Bienvenue !")
      } catch (err) {
        console.error("Failed to set initial password:", err)
        toast.error(err instanceof Error ? err.message : "Impossible de définir le mot de passe.")
      } finally {
        setSubmitting(false)
      }
    },
    (errors) => focusFirstInvalidField(errors, ["password", "confirmPassword"], form.setFocus)
  )

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-paper px-6 font-sans">
      <div className="mx-auto w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-950 text-white font-display font-semibold text-lg overflow-hidden shadow-xs">
            {collegeLogo ? (
              <img src={collegeLogo} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              collegeName.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <h2 className="text-xl font-display font-bold tracking-tight text-ink">
              Bienvenue{user?.name ? `, ${user.name}` : ""}
            </h2>
            <p className="text-xs text-ink-soft mt-1">
              Choisissez votre mot de passe pour accéder à {collegeName}
            </p>
          </div>
        </div>

        <Card className="border border-ink/10 bg-paper shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-display font-semibold flex items-center gap-2 text-ink">
              <Lock className="size-4 text-ink-soft" />
              Nouveau mot de passe
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* noValidate — native `required` blocks React's `onSubmit` before
                it ever fires. See AGENTS.md. */}
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="sp-password" className="text-xs font-display font-medium text-ink">
                  Mot de passe
                </Label>
                <Input
                  id="sp-password"
                  type="password"
                  {...form.register("password")}
                  autoComplete="new-password"
                  aria-invalid={!!form.formState.errors.password}
                  className="border-ink/15 bg-paper text-ink text-sm"
                  required
                  disabled={submitting}
                />
                {form.formState.errors.password && (
                  <p className="text-xs text-negative font-medium">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sp-confirm" className="text-xs font-display font-medium text-ink">
                  Confirmer le mot de passe
                </Label>
                <Input
                  id="sp-confirm"
                  type="password"
                  {...form.register("confirmPassword")}
                  autoComplete="new-password"
                  aria-invalid={!!form.formState.errors.confirmPassword}
                  className="border-ink/15 bg-paper text-ink text-sm"
                  required
                  disabled={submitting}
                />
                {form.formState.errors.confirmPassword && (
                  <p className="text-xs text-negative font-medium">
                    {form.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <PasswordChecklist password={passwordValue} />

              <Button type="submit" className="w-full mt-2 font-display" disabled={submitting}>
                {submitting ? "Enregistrement…" : "Définir mon mot de passe"}
              </Button>

              <button
                type="button"
                onClick={() => logout()}
                className="w-full text-center text-xs text-ink-soft hover:text-ink underline underline-offset-2"
              >
                Se déconnecter
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
