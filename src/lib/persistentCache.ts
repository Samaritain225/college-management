/**
 * First-paint cache for screens that always refetch anyway.
 *
 * sessionStorage, not localStorage, and the difference is deliberate on a
 * finance app: this holds the college's balances. Per-tab and dropped when the
 * browser closes means the figures never sit on disk between sessions, and one
 * account's numbers can never appear under another's on a shared machine.
 * It still survives a reload, which is the case worth optimising.
 *
 * Every consumer treats this as a placeholder and revalidates immediately — a
 * hit only decides what is painted for the first few hundred milliseconds, it
 * never decides what the user ends up looking at.
 */

const PREFIX = "wagnon:cache:"

/**
 * Anything older than this is ignored.
 *
 * Not a correctness mechanism — a stale entry would be corrected by the refetch
 * a moment later regardless. It exists so that opening the app after a long
 * gap, on a connection that then fails, cannot leave yesterday's balances on
 * screen looking current.
 */
const MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

interface Envelope<T> {
  t: number
  v: T
}

export function readCache<T>(key: string, maxAgeMs: number = MAX_AGE_MS): T | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Envelope<T>
    if (typeof parsed?.t !== "number") return null
    if (Date.now() - parsed.t > maxAgeMs) {
      sessionStorage.removeItem(PREFIX + key)
      return null
    }
    return parsed.v
  } catch {
    // Unavailable (private mode), quota, or a shape written by an older build.
    return null
  }
}

export function writeCache<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), v: value }))
  } catch {
    // Quota or unavailable — the cache is an optimisation, never load-bearing.
  }
}

/**
 * Drop every cached screen. Called on sign-out so the next person at this
 * machine cannot see the previous user's figures flash before their own load.
 */
export function clearAllCaches(): void {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(PREFIX)) sessionStorage.removeItem(key)
    }
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
