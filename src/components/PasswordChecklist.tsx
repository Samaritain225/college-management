import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { passwordChecks } from "@/lib/passwordPolicy"

/** Shown before submission, not just on rejection — the whole point is that
 *  the rule is known while typing, not discovered after a round trip against
 *  a masked field. */
export function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5">
      {passwordChecks(password).map((c) => (
        <li
          key={c.label}
          className={cn(
            "text-2xs flex items-center gap-1",
            c.met ? "text-positive" : "text-ink-soft"
          )}
        >
          {c.met ? <Check className="size-3 shrink-0" /> : <span className="size-3 shrink-0" />}
          {c.label}
        </li>
      ))}
    </ul>
  )
}
