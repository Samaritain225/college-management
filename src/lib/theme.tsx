// theme.tsx — light/dark theme management.
//
// Persists the user's preference to localStorage under the key "theme".
// Applies/removes the "dark" class on <html> so Tailwind's `dark:` variant
// and our @custom-variant dark(:is(.dark *)) both respond correctly.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

type Theme = "light" | "dark"

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === "dark") {
    root.classList.add("dark")
  } else {
    root.classList.remove("dark")
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("theme") as Theme | null
    if (stored === "dark" || stored === "light") return stored
    // Respect OS preference if no stored value
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  })

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem("theme", theme)
  }, [theme])

  function toggleTheme() {
    const flip = () => setTheme((prev) => (prev === "light" ? "dark" : "light"))

    // A flip with no transition at all reads as a glitch, not a choice — but
    // this is a quick-check tool on weak connections, so the crossfade is the
    // browser's native View Transition rather than a hand-rolled animation:
    // no extra JS on the critical path, no per-element transition classes to
    // maintain, and it's automatically skipped by browsers that don't support
    // it (Safari/Firefox as of writing just flip instantly, same as before).
    const supportsViewTransitions = "startViewTransition" in document
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (supportsViewTransitions && !prefersReducedMotion) {
      // Scopes the crossfade CSS (`.theme-transition::view-transition-*` in
      // index.css) to just this transition — the root view-transition is
      // otherwise deliberately disabled so page navigation only animates
      // `main-content`, not the whole document.
      const root = document.documentElement
      root.classList.add("theme-transition")
      const transition = document.startViewTransition(flip)
      transition.finished.finally(() => root.classList.remove("theme-transition"))
    } else {
      flip()
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>")
  return ctx
}
