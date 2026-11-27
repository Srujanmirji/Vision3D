#!/bin/sh
# Run the Vision3D backend and its Cloudflare tunnel on this Mac, in the foreground.
# Ctrl-C stops both. The launchd agent (scripts/install-mac-autostart.sh) runs this same script.
# Logs: ~/Library/Logs/Vision3D/{backend,tunnel}.log, with share and capture tokens redacted.
set -eu
# shellcheck source=scripts/mac-common.sh
. "$(dirname "$0")/mac-common.sh"

ready_timeout=${VISION3D_READY_TIMEOUT:-300}
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
  while [ ! -s "$state/$name.pid" ]; do sleep 0.1; done
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

echo "Starting Vision3D backend on 127.0.0.1:$port (this can take a minute)..."
cd "$root/backend"
start backend "$python" -m uvicorn app.main:app --host 127.0.0.1 --port "$port" \
  --workers 1 --no-proxy-headers --no-access-log
backend_job=$job

waited=0
until ready "http://127.0.0.1:$port"; do
  if ! alive "$state/backend.pid"; then
    fail "The backend stopped while starting. Last lines of $logs/backend.log:"
    tail -n 15 "$logs/backend.log" >&2
    exit 1
  fi
  if [ $waited -ge "$ready_timeout" ]; then
    fail "The backend is not ready after ${ready_timeout}s: $(curl -sS -m 5 "http://127.0.0.1:$port/health/ready" 2>&1)"
    exit 1
  fi
  sleep 2
  waited=$((waited + 2))
done
ok "Backend ready on http://127.0.0.1:$port"

offset=$(wc -c 2>/dev/null <"$logs/tunnel.log" || echo 0)
if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  [ -n "${VISION3D_TUNNEL_URL:-}" ] || { fail "Set VISION3D_TUNNEL_URL to the named tunnel's https:// address."; exit 1; }
  # cloudflared reads the token from the environment, so it never appears in ps or the logs.
  TUNNEL_TOKEN=$CLOUDFLARE_TUNNEL_TOKEN
  export TUNNEL_TOKEN
  start tunnel cloudflared tunnel --no-autoupdate run
  url=${VISION3D_TUNNEL_URL%/}
else
  start tunnel cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$port"
  url=
  waited=0
  while [ -z "$url" ]; do
    alive "$state/tunnel.pid" || { fail "cloudflared stopped. See $logs/tunnel.log"; exit 1; }
    [ $waited -lt 60 ] || { fail "No tunnel address after 60s. Check the internet connection and $logs/tunnel.log"; exit 1; }
    sleep 1
    waited=$((waited + 1))
    url=$(tail -c +"$((offset + 1))" "$logs/tunnel.log" | grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' | head -n 1 || true)
  done
fi
tunnel_job=$job
echo "$url" >"$state/tunnel-url"

waited=0
until ready "$url"; do
  if [ $waited -ge 90 ]; then
    warn "The tunnel is up but $url/health/ready does not answer yet. It usually does within a few minutes."
    break
  fi
  sleep 3
  waited=$((waited + 3))
done
[ $waited -ge 90 ] || ok "Tunnel ready: $url"

previous=$(cat "$state/last-tunnel-url" 2>/dev/null || true)
echo "$url" >"$state/last-tunnel-url"
echo
echo "Public backend URL: $url"
if [ "$url" != "$previous" ]; then
  echo "This URL is NEW. Point Vercel at it (see CLIENT_MAC_GUIDE.md > The tunnel URL changed):"
  echo "  1. Vercel > project > Settings > Environment Variables > VISION3D_BACKEND_ORIGIN = $url"
  echo "  2. Vercel > Deployments > latest production deployment > Redeploy"
  [ -t 1 ] || osascript -e "display notification \"New backend URL: $url. Update VISION3D_BACKEND_ORIGIN in Vercel and redeploy.\" with title \"Vision3D\"" >/dev/null 2>&1 || true
else
  echo "Same URL as last time; Vercel needs no change."
fi
echo "Running. Press Ctrl-C to stop (or run: sh scripts/stop-mac.sh)."

while alive "$state/backend.pid" && alive "$state/tunnel.pid"; do
  sleep 5 &
  wait $! || true
done
if alive "$state/backend.pid"; then fail "cloudflared stopped unexpectedly. See $logs/tunnel.log"; else fail "The backend stopped unexpectedly. See $logs/backend.log"; fi
exit 1
