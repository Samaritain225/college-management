import { z } from "zod"

// "none" is the sentinel for "not linked to a login account" — a real
// choice, not an empty state, so it's a valid value rather than something
// `min(1)` needs to reject.
export const NO_LINKED_ACCOUNT = "none"

export const investorFormSchema = z.object({
  name: z.string().trim().min(1, "Le nom complet est requis."),
  phone: z.string().trim().optional(),
  contribution: z
    .string()
    .min(1, "La contribution convenue est requise.")
    .refine((v) => {
      const n = Number(v.replace(/\D/g, ""))
      return Number.isFinite(n) && n > 0
    }, "La contribution doit être un montant positif."),
  userId: z.string().min(1),
})

export type InvestorFormValues = z.infer<typeof investorFormSchema>
