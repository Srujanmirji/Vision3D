#!/bin/sh
# Turn Vision3D auto-start on (default) or off for this macOS user.
#   sh scripts/install-mac-autostart.sh            # start now, at every login, and after a crash
#   sh scripts/install-mac-autostart.sh uninstall  # stop it and remove auto-start
set -eu
# shellcheck source=scripts/mac-common.sh
. "$(dirname "$0")/mac-common.sh"
domain="gui/$(id -u)"

case "${1:-install}" in
install)
  # macOS privacy protection blocks background agents from these folders.
  case "$root/" in
  "$HOME/Downloads/"* | "$HOME/Desktop/"* | "$HOME/Documents/"*)
    fail "Vision3D is in $root. macOS does not let auto-start programs read Downloads, Desktop or Documents."
    fail "Move the folder to your home folder (for example $HOME/Vision3D), run sh scripts/setup.sh there, then run this again."
    exit 1
    ;;
  esac
  [ -f "$env_file" ] || { fail "$env_file is missing. Run: sh scripts/setup.sh"; exit 1; }
  [ -x "$root/.venv/bin/python" ] || { fail "Python environment missing. Run: sh scripts/setup.sh"; exit 1; }
  command -v cloudflared >/dev/null || { fail "cloudflared not found. Run: brew install cloudflared"; exit 1; }
  if alive "$state/supervisor.pid" && ! agent_loaded; then
    fail "Vision3D is already running in a Terminal window. Stop it (Ctrl-C there, or sh scripts/stop-mac.sh), then run this again."
    exit 1
  fi

  mkdir -p "$logs" "$(dirname "$agent")"
  if agent_loaded; then launchctl bootout "$domain/$label" 2>/dev/null || true; fi
  sed -e "s|__LABEL__|$label|g" -e "s|__ROOT__|$root|g" -e "s|__LOGS__|$logs|g" \
    "$root/scripts/launchd/vision3d.plist" >"$agent"
  plutil -lint "$agent" >/dev/null
  launchctl bootstrap "$domain" "$agent"
  ok "Auto-start is on. Vision3D is starting now and will start at every login."
  echo "In a minute or two, check it and get the public URL with: sh scripts/status-mac.sh"
  ;;
uninstall)
  if agent_loaded; then launchctl bootout "$domain/$label" 2>/dev/null || true; fi
  rm -f "$agent"
  ok "Auto-start is off and Vision3D is stopped. Start it by hand with: sh scripts/start-mac.sh"
  ;;
*)
  echo "Usage: sh scripts/install-mac-autostart.sh [install|uninstall]" >&2
  exit 2
  ;;
esac
