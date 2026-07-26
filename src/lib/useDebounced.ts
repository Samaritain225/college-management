import { useEffect, useState } from "react"

/**
 * Trails `value` by `delay` ms.
 *
 * Used for search boxes that drive a server query: without it every keystroke
 * is a round trip, and the replies race — a slow response for "sal" can land
 * after the one for "salaire" and repopulate the table with the wrong rows.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])

  return debounced
}
