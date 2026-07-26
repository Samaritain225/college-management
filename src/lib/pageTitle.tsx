/* eslint-disable react/only-export-components --
   The provider and its two hooks belong together; splitting them would put the
   context object in a third file that neither side reads directly. */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

/**
 * The trailing breadcrumb crumb, for pages whose title is data rather than a
 * route label — an investor's name, a user's name.
 *
 * Deliberately one-way. This replaces `onBreadcrumbChange` + `backTrigger`,
 * which was a channel in both directions: the page pushed its crumb up, and
 * the shell counted a number downward to tell the page to close its detail
 * view. Going "back" is now a `<Link>` to the parent route, so only the label
 * still needs to travel, and only upward.
 */
const PageTitleContext = createContext<{
  title: string | null
  setTitle: (t: string | null) => void
}>({ title: null, setTitle: () => {} })

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null)
  return (
    <PageTitleContext.Provider value={{ title, setTitle }}>{children}</PageTitleContext.Provider>
  )
}

export function usePageTitle() {
  return useContext(PageTitleContext).title
}

/**
 * Publish a trailing crumb for as long as this component is mounted.
 *
 * Clears on unmount so leaving a detail view cannot strand its name in the
 * header — which is what made the old `backTrigger` reset necessary.
 */
export function useSetPageTitle(title: string | null) {
  const { setTitle } = useContext(PageTitleContext)
  useEffect(() => {
    setTitle(title)
    return () => setTitle(null)
  }, [title, setTitle])
}
