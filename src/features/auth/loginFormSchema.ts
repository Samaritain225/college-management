import { z } from "zod"

export const loginFormSchema = z.object({
  email: z.string().trim().min(1, "L'email est requis.").email("Adresse email invalide."),
  // No password-policy check here on purpose — this is signing in with an
  // existing password, not setting one, so "required" is the only rule
  // that applies. The real check is GoTrue accepting the credentials.
  password: z.string().min(1, "Le mot de passe est requis."),
})

export type LoginFormValues = z.infer<typeof loginFormSchema>
