#!/bin/sh
# Show whether Vision3D is running on this Mac and reachable through its tunnel. Exits 1 if not.
set -u
# shellcheck source=scripts/mac-common.sh
. "$(dirname "$0")/mac-common.sh"

status=0
if agent_loaded; then
  ok "Auto-start is on and loaded ($agent)"
elif [ -f "$agent" ]; then
  warn "Auto-start is installed but not loaded now (it loads at the next login)"
else
  echo "INFO  Auto-start is off"
fi

if alive "$state/supervisor.pid"; then ok "Start script running (pid $(cat "$state/supervisor.pid"))"; else fail "Vision3D is not running"; status=1; fi

run_port=$(cat "$state/port" 2>/dev/null || echo "$port")
if ready "http://127.0.0.1:$run_port"; then
  ok "Backend ready on http://127.0.0.1:$run_port"
else
  fail "Backend not ready on http://127.0.0.1:$run_port (see $logs/backend.log)"
  status=1
fi

url=$(cat "$state/tunnel-url" 2>/dev/null || true)
if [ -z "$url" ]; then
  fail "No tunnel URL yet (see $logs/tunnel.log)"
  status=1
elif ready "$url"; then
  ok "Tunnel ready: $url"
else
  fail "Tunnel not answering: $url (see $logs/tunnel.log)"
  status=1
fi
[ -z "$url" ] || echo "Vercel's VISION3D_BACKEND_ORIGIN must be: $url"
exit $status
