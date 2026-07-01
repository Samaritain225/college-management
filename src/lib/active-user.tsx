import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { Investor } from "@/db/queries"

// Stand-in for real auth (coming later): the app asks "who are you" once,
// remembers the choice locally, and stamps every expense/contribution
// with this id as recorded_by. Nothing can be logged without it.

interface ActiveUserContextValue {
  activeUser: Investor | null
  setActiveUser: (user: Investor | null) => void
}

const ActiveUserContext = createContext<ActiveUserContextValue | null>(null)

const STORAGE_KEY = "college-budget:active-user-id"

export function ActiveUserProvider({
  investors,
  children,
}: {
  investors: Investor[]
  children: ReactNode
}) {
  const [activeUserId, setActiveUserId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY)
  )

  useEffect(() => {
    if (activeUserId) localStorage.setItem(STORAGE_KEY, activeUserId)
    else localStorage.removeItem(STORAGE_KEY)
  }, [activeUserId])

  const activeUser = investors.find((i) => i.id === activeUserId) ?? null

  return (
    <ActiveUserContext.Provider
      value={{
        activeUser,
        setActiveUser: (user) => setActiveUserId(user?.id ?? null),
      }}
    >
      {children}
    </ActiveUserContext.Provider>
  )
}

export function useActiveUser() {
  const ctx = useContext(ActiveUserContext)
  if (!ctx) throw new Error("useActiveUser must be used inside ActiveUserProvider")
  return ctx
}
