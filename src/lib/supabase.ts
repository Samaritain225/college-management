import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — set them in .env.local"
  )
}

export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // An invite/recovery link delivers its token as a URL hash fragment —
    // this is what tells supabase-js to consume it into a session on load.
    // Left false, every invite link would silently drop the token and land
    // on the login screen with no error anywhere.
    detectSessionInUrl: true,
  },
})
