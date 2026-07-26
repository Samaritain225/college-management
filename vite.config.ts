import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Single source of truth for the version shown in Paramètres → À propos,
    // so it can't drift from package.json the way a hardcoded string does.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // SupabaseClient eagerly constructs a RealtimeClient and a StorageClient
      // even though this app uses neither — no supabase.channel() call exists,
      // and files go to Cloudflare R2 rather than Supabase Storage. Left alone,
      // realtime-js + its phoenix dependency + storage-js ship to every user on
      // connections where that actually costs seconds. These stubs keep the
      // exact bindings supabase-js imports and throw loudly if ever called.
      // See src/lib/supabase-stubs/ for how to undo this.
      '@supabase/realtime-js': path.resolve(__dirname, './src/lib/supabase-stubs/realtime.ts'),
      '@supabase/storage-js': path.resolve(__dirname, './src/lib/supabase-stubs/storage.ts'),
    },
  },
})
