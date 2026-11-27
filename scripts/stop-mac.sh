#!/bin/sh
# Stop Vision3D on this Mac: the auto-start agent (until the next login) and the backend and tunnel.
set -eu
# shellcheck source=scripts/mac-common.sh
. "$(dirname "$0")/mac-common.sh"

if agent_loaded; then
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  ok "Auto-start agent stopped. It starts again at the next login (remove it: sh scripts/install-mac-autostart.sh uninstall)."
fi

if alive "$state/supervisor.pid"; then
  pid=$(cat "$state/supervisor.pid")
  kill "$pid"
  i=0
  while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 60 ]; do sleep 0.5; i=$((i + 1)); done
fi
# Leftovers from a start script that was killed outright.
for name in tunnel backend supervisor; do
  if alive "$state/$name.pid"; then kill -9 "$(cat "$state/$name.pid")" 2>/dev/null || true; fi
  rm -f "$state/$name.pid"
done
rm -f "$state/tunnel-url"
ok "Vision3D is stopped."
