#!/usr/bin/env bash
# Repeatable performance baseline for Wagnon Budget.
#
# Why this exists: the 2026-07-26 audit was run as ad-hoc curl and its numbers
# overturned the roadmap — "reduce round-trips" turned out to be worth ~50ms
# while a single sequential await costs ~260ms. Findings that surprising need to
# be re-runnable, or the next person re-derives them (or, worse, trusts a stale
# summary of them).
#
# Usage:
#   ./scripts/bench.sh              # network + bundle baseline
#   ./scripts/bench.sh --build      # rebuild first, then measure
#
# Reads VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY from .env.
#
# On the anon key: PostgREST answers these probes with 42501 (permission
# denied). That is a real, complete round-trip *through Postgres* — the role
# check happens inside the database — so it is a valid latency probe. What it
# does NOT include is query execution and row serialization. Payload sizes are
# therefore measured separately in SQL; see docs/perf-audit-2026-07-26.md.

set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "no .env found" >&2; exit 1; }
set -a; . ./.env; set +a
: "${VITE_SUPABASE_URL:?missing in .env}"
: "${VITE_SUPABASE_PUBLISHABLE_KEY:?missing in .env}"

H="apikey: ${VITE_SUPABASE_PUBLISHABLE_KEY}"
B="${VITE_SUPABASE_URL}/rest/v1"
Q="select=id&limit=1"
RUNS=5

hr() { printf '%s\n' "----------------------------------------------------------"; }
med() { sort -n | awk '{a[NR]=$1} END {printf "%.3f", (NR%2 ? a[(NR+1)/2] : (a[NR/2]+a[NR/2+1])/2)}'; }

echo
echo "Wagnon Budget — performance baseline   $(date '+%Y-%m-%d %H:%M')"
hr

# --- Where are we measuring from? -----------------------------------------
POP=$(curl -sS -D - -o /dev/null "${VITE_SUPABASE_URL}/rest/v1/" 2>/dev/null \
      | awk -F'-' '/^cf-ray:/ {gsub(/\r/,"",$NF); print $NF}')
echo "Cloudflare PoP        : ${POP:-unknown}   <- these numbers are only"
echo "                        meaningful for this location"

# --- Throughput ------------------------------------------------------------
SPEED=$(curl -sS -o /dev/null -w '%{speed_download}' \
        https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.js 2>/dev/null || echo 0)
awk -v s="$SPEED" 'BEGIN{printf "Downstream            : %.2f Mbps (%.0f KB/s)\n", s*8/1000000, s/1024}'
hr

# --- A. One round-trip -----------------------------------------------------
for _ in $(seq $RUNS); do
  curl -sS -o /dev/null -w '%{time_total}\n' -H "$H" "$B/expenses?$Q"
done > /tmp/_bench_single
echo "A. single round-trip  : $(med < /tmp/_bench_single)s  (median of $RUNS)"

# --- B. Parallel vs sequential --------------------------------------------
# The headline finding lives here. HTTP/2 multiplexes these over ONE
# connection, so N parallel requests cost roughly what 1 costs; N sequential
# ones cost N x latency. Optimise dependency depth, not request count.
TABLES=(expenses contributions investors expense_categories activity_log \
        profiles other_income expense_payments colleges user_roles)

par() {
  local n=$1 i
  local -a urls=()
  for ((i = 0; i < n; i++)); do
    urls+=("$B/${TABLES[$i]}?$Q")
  done
  # One -o for all of them is fine here because every body is discarded; -w
  # prints once per transfer, so the max across lines is the wall time.
  curl -sS --http2 --parallel --parallel-max "$n" -o /dev/null \
       -w '%{time_total}\n' -H "$H" "${urls[@]}" | sort -n | tail -1
}

# Guard: if the URL list ever collapses again, the numbers become a silent lie.
[ "$(par 3 >/dev/null 2>&1; curl -sS --http2 --parallel --parallel-max 3 \
     -o /dev/null -w '%{time_total}\n' -H "$H" \
     "$B/${TABLES[0]}?$Q" "$B/${TABLES[1]}?$Q" "$B/${TABLES[2]}?$Q" | wc -l | tr -d ' ')" = "3" ] \
  || { echo "bench: parallel probe is not issuing N requests — aborting" >&2; exit 1; }
echo "B. 3  parallel (wall) : $(par 3)s"
echo "   10 parallel (wall) : $(par 10)s   <- ~same as 3: multiplexing is free"

S=$( { start=$(date +%s.%N)
       for t in expenses contributions investors; do
         curl -sS -o /dev/null -H "$H" "$B/$t?$Q"
       done
       end=$(date +%s.%N); echo "$end - $start" | bc; } )
printf "   3  sequential      : %.3fs   <- each await costs a full RTT\n" "$S"

# --- C. Auth gate ----------------------------------------------------------
for _ in $(seq 3); do
  curl -sS -o /dev/null -w '%{time_total}\n' -H "$H" "${VITE_SUPABASE_URL}/auth/v1/user"
done > /tmp/_bench_auth
echo "C. auth round-trip    : $(med < /tmp/_bench_auth)s  (blocks first paint)"
hr

# --- D. Bundle -------------------------------------------------------------
if [ "${1:-}" = "--build" ]; then npm run build >/dev/null 2>&1; fi
if [ -d dist/assets ]; then
  echo "D. critical bundle (blocks first paint)"
  for f in dist/assets/index-*.js dist/assets/index-*.css; do
    [ -f "$f" ] || continue
    printf "     %-34s %7.1f KB raw  %6.1f KB gzip\n" \
      "$(basename "$f")" \
      "$(wc -c <"$f" | awk '{print $1/1024}')" \
      "$(gzip -c "$f" | wc -c | awk '{print $1/1024}')"
  done
  printf "   vendor + fonts + images shipped: %s\n" "$(du -sh dist | cut -f1)"
else
  echo "D. no dist/ — run with --build"
fi
hr
echo "Payload per dashboard load is measured in SQL, not here:"
echo "  2.76 MB as of 2026-07-26 (expenses fetched 4x = 2.63 MB of it)."
echo "  See docs/perf-audit-2026-07-26.md."
echo
