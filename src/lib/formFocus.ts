import type { FieldErrors, FieldValues } from "react-hook-form"

/**
 * react-hook-form's own `shouldFocusError` only calls `.focus()` — it
 * doesn't scroll, so a field below the fold in a dialog that scrolls
 * internally on a phone (`max-h-[90svh] overflow-y-auto` — see AGENTS.md)
 * can end up invalid with nothing on screen to say so. Ignoring the
 * built-in behavior in favor of this: focus via `setFocus` (which respects
 * the field order passed in, top to bottom as they appear in the form),
 * then scroll whatever just became the active element into view.
 */
export function focusFirstInvalidField<T extends FieldValues>(
  errors: FieldErrors<T>,
  order: (keyof T)[],
  setFocus: (name: keyof T) => void
) {
  const firstKey = order.find((key) => errors[key])
  if (!firstKey) return
  setFocus(firstKey)
  requestAnimationFrame(() => {
    document.activeElement?.scrollIntoView({ behavior: "smooth", block: "center" })
  })
}
