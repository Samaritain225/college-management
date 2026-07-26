import { useCallback } from "react"
import { useNavigate } from "react-router-dom"

/**
 * Sidebar order, used only to decide which way the page slides.
 *
 * A route missing from this map sorts to 0, which is the right default: detail
 * routes and unknown paths should not invent a direction of their own, they
 * should inherit the section they belong to.
 */
const ROUTE_ORDER: Record<string, number> = {
  "/": 0,
  "/teachers": 1,
  "/students": 2,
  "/classes": 3,
  "/expenses": 4,
  "/categories": 5,
  "/investors": 6,
  "/users": 7,
  "/settings": 8,
  "/profile": 9,
}

function orderOf(pathname: string): number {
  // Match on the first segment so /investors/:id sorts with /investors.
  const root = "/" + (pathname.split("/")[1] ?? "")
  return ROUTE_ORDER[root === "/" ? "/" : root] ?? 0
}

/**
 * `navigate`, wrapped in a view transition that slides in the direction of
 * travel through the sidebar.
 *
 * The direction classes go on `documentElement` because the CSS keyframes are
 * global; they are removed when the transition settles rather than on a timer,
 * so an interrupted navigation cannot leave the app stuck in "backward".
 */
export function useDirectionalNavigate() {
  const navigate = useNavigate()

  return useCallback(
    (to: string) => {
      if (!document.startViewTransition) {
        navigate(to)
        return
      }

      const direction = orderOf(to) >= orderOf(window.location.pathname) ? "forward" : "backward"
      document.documentElement.classList.add(direction)

      const transition = document.startViewTransition(() => {
        navigate(to)
      })

      transition.finished.finally(() => {
        document.documentElement.classList.remove("forward", "backward")
      })
    },
    [navigate]
  )
}
