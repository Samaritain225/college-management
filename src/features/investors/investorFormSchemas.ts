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

// Create-only: membershipFee pairs with a one-time adhésion contribution
// written at creation time (see addInvestor in queries.ts). Not part of the
// shared investorFormSchema/editForm — editing it later wouldn't retroactively
// adjust that contribution, the same reason editing target_contribution
// never rewrites cotisation history.
export const investorCreateFormSchema = investorFormSchema.extend({
  membershipFee: z
    .string()
    .min(1, "Le droit d'adhésion est requis.")
    .refine((v) => {
      const n = Number(v.replace(/\D/g, ""))
      return Number.isFinite(n) && n > 0
    }, "Le droit d'adhésion doit être un montant positif."),
})

export type InvestorCreateFormValues = z.infer<typeof investorCreateFormSchema>

export const CONTRIBUTION_METHODS = [
  "Virement bancaire",
  "Espèces",
  "Mobile Money",
  "Chèque",
] as const

export const contributionFormSchema = z.object({
  type: z.enum(["adhesion", "cotisation"]),
  amount: z
    .string()
    .min(1, "Le montant est requis.")
    .refine((v) => {
      const n = Number(v.replace(/\D/g, ""))
      return Number.isFinite(n) && n > 0
    }, "Le montant doit être un montant positif."),
  paidAt: z.date({ error: "Veuillez saisir une date valide." }),
  method: z.string().optional(),
  note: z.string().trim().optional(),
})

export type ContributionFormValues = z.infer<typeof contributionFormSchema>
