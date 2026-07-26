// Build-time stub for @supabase/realtime-js, aliased in vite.config.ts.
//
// This app never opens a realtime channel — verified by grep: there is no
// `supabase.channel(...)` or `supabase.realtime` call anywhere in src. But
// SupabaseClient constructs a RealtimeClient eagerly in its constructor, so
// the real package (plus its @supabase/phoenix dependency) shipped to every
// user regardless: ~150KB of source that only ever sat idle.
//
// The surface below is exactly what SupabaseClient touches — constructor,
// channel, getChannels, removeChannel, removeAllChannels and setAuth (which
// it calls on every auth state change). Nothing else is referenced, and
// `RealtimeClient` is the only binding supabase-js imports from this package.
//
// If realtime is ever genuinely needed, delete this file and the two alias
// entries in vite.config.ts — nothing else has to change.

export class RealtimeClient {
  constructor(_url?: string, _options?: unknown) {}

  /** Loud on purpose: silently returning a dead channel would be far worse
   *  than an error naming the cause. */
  channel(): never {
    throw new Error(
      "Supabase Realtime is stubbed out of this bundle. Remove the alias in " +
        "vite.config.ts (and delete src/lib/supabase-stubs/) to use it."
    )
  }

  getChannels(): unknown[] {
    return []
  }

  async removeChannel(): Promise<"ok"> {
    return "ok"
  }

  async removeAllChannels(): Promise<"ok"[]> {
    return []
  }

  /** Called by SupabaseClient on every auth state change. Must not throw. */
  setAuth(_token?: string | null): void {}

  connect(): void {}
  disconnect(): void {}
}
