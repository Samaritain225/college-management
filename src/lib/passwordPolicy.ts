// Mirrors the hosted project's actual GoTrue policy — confirmed 2026-07-28
// from the literal rejection text ("Password should contain at least one
// character of each: ..."), not derived from supabase/config.toml, whose
// `minimum_password_length` only governs the local Docker stack (never
// successfully started here — see AGENTS.md) and doesn't state a character-
// class rule at all. If the Dashboard policy changes, this drifts from it
// silently — there is no endpoint that reports the policy back to the
// client, so the only way to keep this honest is to update it by hand
// against the next real rejection.
export const PASSWORD_SPECIAL_CHARS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~"

export interface PasswordCheck {
  label: string
  met: boolean
}

export function passwordChecks(pw: string): PasswordCheck[] {
  return [
    { label: "Une lettre minuscule", met: /[a-z]/.test(pw) },
    { label: "Une lettre majuscule", met: /[A-Z]/.test(pw) },
    { label: "Un chiffre", met: /[0-9]/.test(pw) },
    { label: "Un caractère spécial (!@#...)", met: [...pw].some((c) => PASSWORD_SPECIAL_CHARS.includes(c)) },
  ]
}

export function passwordMeetsPolicy(pw: string): boolean {
  return passwordChecks(pw).every((c) => c.met)
}

export const PASSWORD_POLICY_MESSAGE =
  "Le mot de passe doit contenir au moins une minuscule, une majuscule, un chiffre et un caractère spécial."
