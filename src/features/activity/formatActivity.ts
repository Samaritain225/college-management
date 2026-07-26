import type { UserActivityLog } from "@/lib/queries"

export interface FormattedActivity {
  actor: string
  actionText: string
  subtitle: string
  amount: number | null
  /** Drives the icon and colour only. "contribution" and "income" are both
   *  inflows and render identically; they stay distinct because the copy above
   *  them differs and conflating them would invite the wrong wording. */
  type: "expense" | "contribution" | "income" | "info"
}

export function relativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return ""
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return "à l'instant"
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`
  if (diff < 604800) return `il y a ${Math.floor(diff / 86400)} j`
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
}

/**
 * Turns one activity_log row into display copy.
 *
 * `metadata` arrives already reshaped by the SQL side
 * (`normalize_activity_metadata`), which maps the DB's column names onto the
 * camelCase keys read below. Adding an action type means touching both.
 */
export function formatActivityItem(act: UserActivityLog): FormattedActivity {
  const meta = act.metadata || {}
  const actor = act.userName || "Utilisateur"

  switch (act.action) {
    case "EXPENSE_CREATE":
      return {
        actor,
        actionText: "a enregistré une dépense",
        subtitle: meta.description ? String(meta.description) : "",
        amount: meta.amount ? Number(meta.amount) : null,
        type: "expense",
      }
    case "CONTRIBUTION_CREATE":
      return {
        actor,
        actionText: "a enregistré un apport",
        subtitle: meta.investorName ? `Investisseur : ${meta.investorName}` : "",
        amount: meta.amount ? Number(meta.amount) : null,
        type: "contribution",
      }
    // Settling an expense that was already recorded — cash leaving, so it reads
    // as an outflow even though it is not new spending (dashboard_summary sums
    // `expenses.total_amount`, never payments, so nothing is double counted).
    // `metadata` here is the raw expense_payments row: the only human-readable
    // field on it is `note`, and naming which expense is settled would need a
    // join added to normalize_activity_metadata.
    case "EXPENSE_PAYMENT_CREATE":
      return {
        actor,
        actionText: "a enregistré un règlement",
        subtitle: meta.note ? String(meta.note) : "",
        amount: meta.amount ? Number(meta.amount) : null,
        type: "expense",
      }
    // Lump-sum revenue, mostly student fees. The raw row carries `label`, so
    // this one needs no server-side lookup.
    case "OTHER_INCOME_CREATE":
      return {
        actor,
        actionText: "a enregistré une recette",
        subtitle: meta.label ? String(meta.label) : "",
        amount: meta.amount ? Number(meta.amount) : null,
        type: "income",
      }
    case "EXPENSE_CATEGORY_CREATE":
      return {
        actor,
        actionText: "a créé une catégorie",
        subtitle: meta.name ? String(meta.name) : "",
        amount: null,
        type: "info",
      }
    case "INVESTOR_CREATE":
      return {
        actor,
        actionText: "a ajouté un investisseur",
        subtitle: meta.name ? String(meta.name) : "",
        amount: meta.agreedContribution ? Number(meta.agreedContribution) : null,
        type: "info",
      }
    case "INVESTOR_UPDATE":
      return {
        actor,
        actionText: "a modifié un investisseur",
        subtitle: meta.name ? String(meta.name) : "",
        amount: null,
        type: "info",
      }
    case "USER_CREATE":
      return {
        actor,
        actionText: "a créé un utilisateur",
        subtitle: meta.name
          ? `${meta.name} (${meta.email || ""})`
          : meta.email
            ? String(meta.email)
            : "",
        amount: null,
        type: "info",
      }
    case "USER_UPDATE":
      return {
        actor,
        actionText: "a mis à jour un utilisateur",
        subtitle: meta.name ? String(meta.name) : "",
        amount: null,
        type: "info",
      }
    case "USER_DEACTIVATE":
      return {
        actor,
        actionText: "a désactivé un compte",
        subtitle: meta.name ? String(meta.name) : "",
        amount: null,
        type: "info",
      }
    case "USER_REACTIVATE":
      return {
        actor,
        actionText: "a réactivé un compte",
        subtitle: meta.name ? String(meta.name) : "",
        amount: null,
        type: "info",
      }
    default:
      return {
        actor,
        actionText: `— ${act.action.replace(/_/g, " ")}`,
        subtitle: meta.name || meta.title || "",
        amount: meta.amount ? Number(meta.amount) : null,
        type: "info",
      }
  }
}
