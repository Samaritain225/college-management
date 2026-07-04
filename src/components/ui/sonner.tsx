import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-[var(--color-positive)]" />,
        info: <InfoIcon className="size-4 text-[var(--color-indigo-600)]" />,
        warning: <TriangleAlertIcon className="size-4 text-amber-500" />,
        error: <OctagonXIcon className="size-4 text-[var(--color-negative)]" />,
        loading: <Loader2Icon className="size-4 animate-spin text-[var(--color-ink-soft)]" />,
      }}
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:bg-[var(--color-paper)] group-[.toaster]:text-[var(--color-ink)] group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          title: "font-display font-semibold text-sm text-[var(--color-ink)]",
          description: "font-sans text-xs text-[var(--color-ink-soft)]",
          success: "group-[.toast]:!text-[var(--color-positive)] group-[.toast]:!border-[var(--color-positive)]",
          error: "group-[.toast]:!text-[var(--color-negative)] group-[.toast]:!border-[var(--color-negative)]",
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
