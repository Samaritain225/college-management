import { RouterProvider } from "react-router-dom"
import { ThemeProvider } from "@/lib/theme"
import { AuthProvider } from "@/lib/auth"
import { SettingsProvider } from "@/lib/settings"
import { Toaster } from "@/components/ui/sonner"
import { router } from "@/routes"

// The shell, the route table and the individual screens all live elsewhere —
// this file is just the provider stack, in the order they depend on each other:
// theme paints before anything, settings supplies college branding to the login
// screen (which renders before a session exists), and auth gates the rest.
// RequireAuth sits inside the route tree rather than here, so the router owns
// the whole tree and `useNavigate` is available everywhere below it.
function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <AuthProvider>
          <RouterProvider router={router} />
          <Toaster />
        </AuthProvider>
      </SettingsProvider>
    </ThemeProvider>
  )
}

export default App
