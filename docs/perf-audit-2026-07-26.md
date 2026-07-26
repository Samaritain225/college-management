# Performance audit — 2026-07-26

Measured, not estimated. Every number below came from a probe run against the
live project; where something is a projection rather than a measurement it says
so explicitly.

## Test conditions

The dev machine already routes through Cloudflare's **Abidjan** PoP
(`cf-ray: ...-ABJ`), so these are the real target network conditions rather
than a proxy for them. Measured bandwidth **~600–1080 KB/s (5–9 Mbps)** —
office broadband. Users on mobile will be several times worse, so treat every
latency figure here as a **floor**.

Probes used the anon key, which Postgres rejects with `42501` (permission
denied). That reaches the database and its role check but does **not** execute
the query or serialize rows. With an empty database the gap is small; with real
data, ten *concurrent* real queries could contend server-side in a way this
method cannot see. That is a second reason seed data matters.

## Measurements

| Probe | Result |
|---|---|
| DNS / TCP / TLS handshake (cold) | 45 / 90 / 180 ms |
| One PostgREST round-trip reaching Postgres | 200–400 ms (median ~260) |
| 3 parallel requests, one HTTP/2 connection | 200–270 ms wall |
| 10 parallel requests, one HTTP/2 connection | 260–515 ms wall |
| 3 sequential requests | 770–1780 ms wall |
| Auth endpoint round-trip | 200–420 ms |
| Critical JS+CSS blocking first paint | 655 KB raw / ~181 KB gzipped |

Database at time of audit: **effectively empty** — 0 investors, 0
contributions, 1 expense, 1 category, 1 profile.

## The headline finding

`Promise.all` already makes the "~10 round-trips" nearly free. Ten multiplexed
requests cost the same wall-clock as three; the extra seven are inside
measurement noise. Removing one *sequential* step saves ~260 ms.

> A sequential await costs **5–10× more** than an extra parallel request.

So the previous plan's item 1 — "reduce ~10 round-trips to 3" — optimizes the
axis that costs almost nothing. Best case it saves ~50 ms.

It is not wrong, it is **mistimed**. Simulating realistic volume server-side
(2000 expenses ≈ 2 years, via `generate_series`, without writing to the real
tables):

- one `listExpenses()` JSON response: **733 KB**
- the dashboard fetches expenses **4×** → **2.9 MB raw** (~480 KB gzipped) per load
- the server-side aggregate equivalent: **12 bytes**

At 600 KB/s that is ~0.8 s; on real mobile, ~5 s. Item 1 is a **scaling time
bomb, not a current bottleneck**.

## What actually costs time today

1. **~181 KB gzipped of JS before anything renders**, and the Supabase
   **Realtime client is bundled although never used** — `RealtimeClient`,
   `phx_join` and `heartbeat` all confirmed present in the 291 KB vendor chunk.
2. **Sequential gates.** `AuthProvider` starts at `status: "checking"`, so
   `RequireAuth` paints a spinner *first*, then reads the cache inside an async
   `useEffect`. The cache exists but arrives after first paint.
3. **A hidden dependent query.** `listUserActivities()` fires a second,
   sequential query to resolve investor names — worth ~260 ms, more than
   deduplicating all ten parallel calls combined.
4. **The dashboard cache dies on reload.** `dashboardCache` is module-scope, so
   it survives tab-switching but is `null` after every refresh.

## Recommended order

1. Remove the sequential gates (cheap, measured, no new dependencies).
2. Seed realistic data + commit the benchmark script (unblocks everything else).
3. Persist the cache across reloads.
4. Collapse the dashboard into one aggregate RPC, once there is data to prove it.

Drop Realtime from the bundle whenever convenient — it is free.

## The fusion worth aiming at

Three changes compose better than any one alone, because each removes a
different term:

1. First paint reads everything synchronously from localStorage — auth user,
   settings, and last dashboard payload. No spinner, no skeleton.
2. Revalidation is a single RPC behind the already-painted UI: one sequential
   step, ~260 ms, invisible because the screen is already full. Payload stays
   flat as data grows.
3. TanStack Query with a localStorage persister is the mechanism that makes
   this systematic per-page instead of hand-rolled `dashboardCache` globals.

Net: perceived load becomes *bundle time only*, and data freshness leaves the
critical path entirely.
