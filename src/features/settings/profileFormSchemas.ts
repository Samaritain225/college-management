import { z } from "zod"
import { passwordMeetsPolicy, PASSWORD_POLICY_MESSAGE } from "@/lib/passwordPolicy"

export const profileFormSchema = z.object({
  fullName: z.string().trim().min(1, "Le nom est requis."),
  phone: z.string().trim().optional(),
})

export type ProfileFormValues = z.infer<typeof profileFormSchema>

// Was length->=8 only, which let a password through this form's own check
// that GoTrue's real policy (one lowercase, one uppercase, one digit, one
// special character — see src/lib/passwordPolicy.ts) would then reject
// server-side, surfacing as a confusing mismatch between "looks accepted"
// and "actually rejected". Now shares the same rule UsersPage validates
// admin-created passwords against, so both paths agree.
export const passwordChangeSchema = z
  .object({
    password: z
      .string()
      .min(1, "Le mot de passe est requis.")
      .refine(passwordMeetsPolicy, PASSWORD_POLICY_MESSAGE),
    confirmPassword: z.string().min(1, "Veuillez confirmer le mot de passe."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Les deux mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  })

export type PasswordChangeFormValues = z.infer<typeof passwordChangeSchema>
