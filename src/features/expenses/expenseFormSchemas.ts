import { z } from "zod"
import type { PaymentMethod } from "@/lib/queries"

// Sentinel Select value that reveals the inline "create a new category"
// fields — not a real category id, so it must never reach addExpense.
export const NEW_CATEGORY_SENTINEL = "new-category-placeholder"

const PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "mobile_money", "bank_transfer", "other"]

export const expenseFormSchema = z
  .object({
    categoryId: z.string().min(1, "Veuillez choisir ou créer une catégorie."),
    newCategoryName: z.string().trim().optional(),
    newCategoryDesc: z.string().trim().optional(),
    // Kept as the formatted display string ("150 000") rather than
    // transformed to a number here — `handleExpenseSubmit` strips the
    // spaces itself, same as before the migration.
    amount: z
      .string()
      .refine((v) => {
        const n = Number(v.replace(/\D/g, ""))
        return Number.isFinite(n) && n > 0
      }, "Veuillez saisir un montant valide supérieur à 0 F CFA."),
    spentAt: z.date({ error: "Veuillez saisir une date valide." }),
    payee: z.string().trim().min(1, "Veuillez indiquer qui a reçu le paiement."),
    paymentMethod: z
      .string()
      .min(1, "Veuillez choisir le moyen de paiement.")
      .refine(
        (v): v is PaymentMethod => (PAYMENT_METHODS as readonly string[]).includes(v),
        "Moyen de paiement invalide."
      ),
    description: z
      .string()
      .trim()
      .min(1, "Veuillez décrire le motif de cette dépense.")
      .max(255, "Le motif ne doit pas dépasser 255 caractères."),
  })
  .superRefine((values, ctx) => {
    // The "new category" fields only exist while the sentinel is selected —
    // same error slot as "no category chosen" (under the Select), since
    // from the user's perspective both mean "you haven't picked a category
    // yet."
    if (values.categoryId === NEW_CATEGORY_SENTINEL && !values.newCategoryName?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "Veuillez saisir le nom de la nouvelle catégorie.",
      })
    }
  })

// `paymentMethod` narrows from `string` to `PaymentMethod` through the
// refine above, so the schema's input and output types differ — input is
// what `defaultValues`/`register` deal with (still a plain string before
// validation), output is what `handleSubmit`'s callback receives.
export type ExpenseFormValues = z.input<typeof expenseFormSchema>
export type ExpenseFormOutput = z.output<typeof expenseFormSchema>

export const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Le nom de la catégorie est obligatoire.")
    .max(255, "Le nom ne doit pas dépasser 255 caractères."),
  description: z.string().trim().optional(),
})

export type CategoryFormValues = z.infer<typeof categoryFormSchema>
