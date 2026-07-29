// Small, dependency-free field validation shared by the app's create/edit
// forms. Each validator is a plain function (value) => string | undefined —
// undefined means valid. No schema library: these forms are small and
// fixed-shape, and a library would mean re-deriving every field's French
// error copy from a schema rather than just writing it once, here.

export type FieldValidator<T> = (value: T) => string | undefined

export function required(message: string): FieldValidator<string> {
  return (v) => (v.trim() ? undefined : message)
}

export function maxLength(n: number, message: string): FieldValidator<string> {
  return (v) => (v.trim().length > n ? message : undefined)
}

/** Deliberately permissive — this rejects only what has no chance of being a
 *  real address (no @, no dot after it). Actual deliverability can only be
 *  proven by GoTrue accepting the account, and that error already surfaces
 *  through the normal submit-catch path. */
export function email(message: string): FieldValidator<string> {
  return (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? undefined : message)
}

export function positiveAmount(message: string): FieldValidator<number> {
  return (v) => (Number.isFinite(v) && v > 0 ? undefined : message)
}

/** Runs a field's validators in order, stopping at the first failure — one
 *  message at a time is what the existing fieldErrors UI in this app shows,
 *  so returning more here would just be discarded by every caller. */
export function firstError<T>(value: T, validators: FieldValidator<T>[]): string | undefined {
  for (const v of validators) {
    const err = v(value)
    if (err) return err
  }
  return undefined
}

export function validateFileType(
  file: File,
  allowedTypes: readonly string[],
  message: string
): string | undefined {
  return allowedTypes.includes(file.type) ? undefined : message
}

export function validateFileSize(file: File, maxBytes: number, message: string): string | undefined {
  return file.size > maxBytes ? message : undefined
}
