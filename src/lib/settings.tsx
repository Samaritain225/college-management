// College identity settings — backed by Postgres (colleges table), not
// localStorage. It used to be pure localStorage, which meant renaming the
// college on one laptop changed nothing for anyone else and clearing site
// data reset it. localStorage is now only a *display cache*: it lets the
// login screen (rendered before any session exists) show the last-known
// name/logo instantly instead of blank, but every write goes to Postgres and
// every authenticated load refreshes the cache from there.

import React, { createContext, useCallback, useContext, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { COLLEGE_ID } from "@/lib/queries"
import { publicUrl } from "@/lib/uploads"

export interface CollegeSettings {
  collegeName: string
  /** R2 object key, or null if no logo set. Needed by the settings UI to
   *  delete the previous object when a new one is uploaded. */
  collegeLogoKey: string | null
  /** Resolved public URL for collegeLogoKey — what every consumer other than
   *  the settings form itself should render. */
  collegeLogo: string | null
  collegeAddress: string
  collegePhone: string
  academicYear: string
}

interface UpdatableFields {
  collegeName: string
  collegeLogoKey: string | null
  collegeAddress: string
  collegePhone: string
  academicYear: string
}

interface SettingsContextType extends CollegeSettings {
  loading: boolean
  updateSettings: (patch: Partial<UpdatableFields>) => Promise<void>
}

const CACHE_KEY = "college_settings_cache"

const defaultSettings: CollegeSettings = {
  collegeName: "WAGNON",
  collegeLogoKey: null,
  collegeLogo: null,
  collegeAddress: "",
  collegePhone: "",
  academicYear: "",
}

function readCache(): CollegeSettings {
  try {
    const stored = localStorage.getItem(CACHE_KEY)
    if (stored) return { ...defaultSettings, ...JSON.parse(stored) }
  } catch {
    // Storage unavailable or corrupt — fall through to defaults.
  }
  return defaultSettings
}

function writeCache(settings: CollegeSettings) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings))
  } catch {
    // Non-fatal: worst case the next load doesn't have a warm cache.
  }
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<CollegeSettings>(readCache)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    // colleges_select requires `authenticated` — with no session yet (e.g. on
    // the login screen) this resolves as anon and returns nothing, which is
    // fine: the cache from the last successful load keeps rendering.
    const { data, error } = await supabase
      .from("colleges")
      .select("name, logo_key, address, phone, academic_year")
      .eq("id", COLLEGE_ID)
      .maybeSingle()

    if (error || !data) {
      setLoading(false)
      return
    }

    const next: CollegeSettings = {
      collegeName: data.name,
      collegeLogoKey: data.logo_key,
      collegeLogo: publicUrl(data.logo_key),
      collegeAddress: data.address ?? "",
      collegePhone: data.phone ?? "",
      academicYear: data.academic_year ?? "",
    }
    setSettings(next)
    writeCache(next)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()

    // Re-fetch on sign-in: SettingsProvider mounts before AuthProvider knows
    // whether anyone is signed in, so the first attempt above may have run
    // with no session yet (e.g. a returning user whose session takes a
    // moment to restore).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") refresh()
    })
    return () => subscription.unsubscribe()
  }, [refresh])

  const updateSettings = useCallback(
    async (patch: Partial<UpdatableFields>) => {
      const dbPatch: Record<string, unknown> = {}
      if (patch.collegeName !== undefined) dbPatch.name = patch.collegeName
      if (patch.collegeLogoKey !== undefined) dbPatch.logo_key = patch.collegeLogoKey
      if (patch.collegeAddress !== undefined) dbPatch.address = patch.collegeAddress
      if (patch.collegePhone !== undefined) dbPatch.phone = patch.collegePhone
      if (patch.academicYear !== undefined) dbPatch.academic_year = patch.academicYear

      const { error } = await supabase.from("colleges").update(dbPatch).eq("id", COLLEGE_ID)
      if (error) throw error

      await refresh()
    },
    [refresh]
  )

  return (
    <SettingsContext.Provider value={{ ...settings, loading, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider")
  }
  return context
}
