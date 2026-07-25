import React, { createContext, useContext, useState, useEffect } from "react"

export interface CollegeSettings {
  collegeName: string
  collegeLogo: string | null // Base64 data URL
  collegeAddress: string
  collegePhone: string
  academicYear: string
}

interface SettingsContextType extends CollegeSettings {
  updateSettings: (settings: Partial<CollegeSettings>) => void
}

const defaultSettings: CollegeSettings = {
  collegeName: "WAGNON",
  collegeLogo: null,
  collegeAddress: "",
  collegePhone: "",
  academicYear: "2025 - 2026",
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<CollegeSettings>(() => {
    try {
      const stored = localStorage.getItem("college_settings")
      if (stored) {
        return { ...defaultSettings, ...JSON.parse(stored) }
      }
    } catch (e) {
      console.error("Failed to load settings:", e)
    }
    return defaultSettings
  })

  useEffect(() => {
    try {
      localStorage.setItem("college_settings", JSON.stringify(settings))
    } catch (e) {
      console.error("Failed to save settings:", e)
    }
    // Light/dark mode is owned exclusively by ThemeProvider (src/lib/theme.tsx).
    // This provider must never touch the `.dark` class — doing so previously
    // caused every settings save to silently revert the user's chosen theme.
  }, [settings])

  const updateSettings = (newSettings: Partial<CollegeSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }))
  }

  return (
    <SettingsContext.Provider value={{ ...settings, updateSettings }}>
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
