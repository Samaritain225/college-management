import { z } from "zod"
import { passwordMeetsPolicy, PASSWORD_POLICY_MESSAGE } from "@/lib/passwordPolicy"

// No password field — the account is created without one and the person
// sets their own via the invitation email (see admin-users' sendInviteEmail).
export const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Le nom est requis.")
    .max(255, "Le nom ne doit pas dépasser 255 caractères."),
  email: z.string().trim().min(1, "L'email est requis.").email("Adresse email invalide."),
  phone: z.string().trim().optional(),
  roleId: z.string().min(1, "Le rôle est requis."),
})

export type CreateUserFormValues = z.infer<typeof createUserSchema>

export const editUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Le nom est requis.")
    .max(255, "Le nom ne doit pas dépasser 255 caractères."),
  email: z.string().trim().min(1, "L'email est requis.").email("Adresse email invalide."),
  phone: z.string().trim().optional(),
  roleId: z.string().min(1, "Le rôle est requis."),
  // Optional on edit — an empty value means "don't change the password",
  // so it only has to satisfy the policy when the admin actually typed one.
  password: z
    .string()
    .optional()
    .refine((v) => !v || passwordMeetsPolicy(v), PASSWORD_POLICY_MESSAGE),
})

export type EditUserFormValues = z.infer<typeof editUserSchema>
