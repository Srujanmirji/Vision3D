#!/bin/sh
# Run the Vision3D backend and its Cloudflare tunnel on this Mac, in the foreground.
# Ctrl-C stops both. The launchd agent (scripts/install-mac-autostart.sh) runs this same script.
# Logs: ~/Library/Logs/Vision3D/{backend,tunnel}.log, with share and capture tokens redacted.
set -eu
# shellcheck source=scripts/mac-common.sh
. "$(dirname "$0")/mac-common.sh"

ready_timeout=${VISION3D_READY_TIMEOUT:-300}
restart_delay=${VISION3D_RESTART_DELAY:-5}
case "$ready_timeout:$restart_delay" in
  *[!0-9:]*|0:*|*:0) fail "Readiness and retry limits must be positive integers."; exit 1 ;;
esac
if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  printf '%s\n' "${VISION3D_TUNNEL_URL:-}" | grep -Eq '^https://[[:alnum:]][[:alnum:].-]+\.[[:alpha:]]{2,}/?$' ||
    { fail "Set VISION3D_TUNNEL_URL to the named tunnel's public HTTPS origin."; exit 1; }
fi
python="$root/.venv/bin/python"

[ -f "$env_file" ] || { fail "$env_file is missing. Run: sh scripts/setup.sh"; exit 1; }
[ -x "$python" ] || { fail "$python is missing. Run: sh scripts/setup.sh"; exit 1; }
command -v cloudflared >/dev/null || { fail "cloudflared not found. Run: brew install cloudflared"; exit 1; }
if alive "$state/supervisor.pid"; then
  fail "Vision3D is already running (pid $(cat "$state/supervisor.pid")). Stop it with: sh scripts/stop-mac.sh"
  exit 1
fi
if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
  fail "Port $port is already in use by another program. Stop it, or set VISION3D_PORT in backend/.env."
  exit 1
fi

mkdir -p "$state" "$logs"
echo $$ >"$state/supervisor.pid"
echo "$port" >"$state/port"
rm -f "$state/tunnel-url"

# Keep the Mac awake on mains power for as long as this script runs (no effect on battery).
caffeinate -s -w $$ &
backend_job=
tunnel_job=

redact() {
  sed -E -l \
    -e 's#/(share|ar|captures)/[^/[:space:]?"]+#/\1/[redacted]#g' \
    -e 's#(token|key)=[^&[:space:]"]+#\1=[redacted]#g'
}

# start NAME CMD...: run CMD in the background, pid in $state/NAME.pid, redacted output appended to $logs/NAME.log.
start() {
  name=$1
  shift
  rm -f "$state/$name.pid"
  printf '\n=== %s start %s ===\n' "$name" "$(date '+%Y-%m-%d %H:%M:%S')" >>"$logs/$name.log"
  # shellcheck disable=SC2016
  { sh -c 'echo $$ >"$0"; exec "$@"' "$state/$name.pid" "$@" 2>&1 | redact >>"$logs/$name.log"; } &
  job=$!
  i=0
  while [ ! -s "$state/$name.pid" ] && [ "$i" -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
  [ -s "$state/$name.pid" ]
}

# halt NAME: TERM the process, then KILL it if it is still running after 20 s.
# shellcheck disable=SC2329 # called from traps
halt() {
  alive "$state/$1.pid" || return 0
  pid=$(cat "$state/$1.pid")
  kill "$pid" 2>/dev/null || return 0
  i=0
  while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 40 ]; do sleep 0.5; i=$((i + 1)); done
  kill -9 "$pid" 2>/dev/null || true
}

# shellcheck disable=SC2329 # called from traps
stop_all() {
  trap - INT TERM EXIT
  halt tunnel
  halt backend
  for j in $tunnel_job $backend_job; do wait "$j" 2>/dev/null || true; done
  rm -f "$state/supervisor.pid" "$state/backend.pid" "$state/tunnel.pid" "$state/tunnel-url"
  echo "Vision3D stopped."
}
trap 'stop_all; exit 130' INT
trap 'stop_all; exit 143' TERM
trap stop_all EXIT

launch_backend() {
  echo "Starting Vision3D backend on 127.0.0.1:$port..."
  start backend /usr/bin/env -u CLOUDFLARE_TUNNEL_TOKEN -u TUNNEL_TOKEN \
    "$python" -m uvicorn app.main:app --host 127.0.0.1 --port "$port" \
    --workers 1 --no-proxy-headers --no-access-log --timeout-graceful-shutdown 15 || return 1
  backend_job=$job

  waited=0
  until ready "http://127.0.0.1:$port"; do
    if ! alive "$state/backend.pid" || [ "$waited" -ge "$ready_timeout" ]; then
      fail "Backend startup failed. See $logs/backend.log."
      halt backend
      return 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
  ok "Backend ready on http://127.0.0.1:$port"
}

launch_tunnel() {
  offset=$(wc -c 2>/dev/null <"$logs/tunnel.log" || echo 0)
  if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
    TUNNEL_TOKEN=$CLOUDFLARE_TUNNEL_TOKEN
    export TUNNEL_TOKEN
    start tunnel cloudflared tunnel --no-autoupdate run || return 1
    tunnel_job=$job
    url=${VISION3D_TUNNEL_URL%/}
  else
    start tunnel cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$port" || return 1
    tunnel_job=$job
    url=
    waited=0
    while [ -z "$url" ]; do
      if ! alive "$state/tunnel.pid" || [ "$waited" -ge 60 ]; then
        fail "No Quick Tunnel URL. See $logs/tunnel.log."
        halt tunnel
        return 1
      fi
      sleep 1
      waited=$((waited + 1))
      url=$(tail -c +"$((offset + 1))" "$logs/tunnel.log" | grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' | head -n 1 || true)
    done
  fi

  printf '%s\n' "$url" >"$state/tunnel-url"
  if ready "$url"; then
    ok "Tunnel ready: $url"
  else
    warn "Waiting for the tunnel route. Check using sh scripts/status-mac.sh."
  fi
  previous=$(cat "$state/last-tunnel-url" 2>/dev/null || true)
  printf '%s\n' "$url" >"$state/last-tunnel-url"
  if [ "$url" != "$previous" ]; then
    echo "New backend URL: $url"
    echo "If Vercel is using another upstream, update VISION3D_BACKEND_ORIGIN and redeploy."
    [ -t 1 ] || osascript -e "display notification \"Backend URL changed. See the Vision3D status script.\" with title \"Vision3D\"" >/dev/null 2>&1 || true
  fi
}

cd "$root/backend"
launch_backend || exit 1
launch_tunnel || warn "Tunnel startup failed. Retrying in ${restart_delay}s."
echo "Running. Press Ctrl-C to stop (or run: sh scripts/stop-mac.sh)."

while :; do
  sleep "$restart_delay" &
  wait $! || true
  if ! alive "$state/backend.pid"; then
    warn "Backend stopped. Restarting it while keeping the connector running."
    launch_backend || continue
  fi
  if ! alive "$state/tunnel.pid"; then
    warn "Connector stopped. Reconnecting."
    launch_tunnel || continue
  fi
done
