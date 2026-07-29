// Verified against the shadcn Select registry pattern on 2026-07-29.
import { Calendar } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { Period } from "@/lib/period"

export function PeriodFilter({
  value,
  onChange,
  className,
  ariaLabel = "Période d’analyse",
}: {
  value: Period
  onChange: (period: Period) => void
  className?: string
  ariaLabel?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Period)}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          "h-8 min-w-[180px] bg-paper border-ink/15 text-xs text-ink font-display font-semibold max-md:!h-11",
          className
        )}
      >
        <Calendar className="size-3.5 mr-1.5 text-ink-soft shrink-0" aria-hidden="true" />
        <SelectValue placeholder="Période" />
      </SelectTrigger>
      <SelectContent className="bg-paper border-ink/10">
        <SelectGroup>
          <SelectItem value="all">Toutes les périodes</SelectItem>
          <SelectItem value="this_month">Ce mois-ci</SelectItem>
          <SelectItem value="this_quarter">Ce trimestre</SelectItem>
          <SelectItem value="this_year">Cette année ({new Date().getFullYear()})</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
