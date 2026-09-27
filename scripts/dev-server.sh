#!/usr/bin/env bash
# Restart a local wrangler dev server on 127.0.0.1:8787 in the background.
#   scripts/dev-server.sh [--fresh]   (--fresh wipes the local D1 state)
set -euo pipefail
cd "$(dirname "$0")/.."
PIDFILE=.wrangler/dev.pid
mkdir -p .wrangler
if [[ -f "$PIDFILE" ]]; then
  kill -- "-$(cat "$PIDFILE")" 2>/dev/null || kill "$(cat "$PIDFILE")" 2>/dev/null || true
  rm -f "$PIDFILE"
  sleep 1
fi
if [[ "${1:-}" == "--fresh" ]]; then rm -rf .wrangler/state; fi
LOG="${TMPDIR:-/tmp}/nexadib-dev.log"
setsid npx wrangler dev --port 8787 --ip 127.0.0.1 --local >"$LOG" 2>&1 < /dev/null &
echo $! >"$PIDFILE"
for _ in $(seq 1 60); do
  if curl -s -o /dev/null http://127.0.0.1:8787/; then echo "dev server up (log: $LOG)"; exit 0; fi
  sleep 1
done
echo "dev server failed to start; see $LOG" >&2
exit 1
