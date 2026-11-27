# shellcheck shell=sh disable=SC2034
# Shared settings for the scripts/*-mac.sh helpers. Sourced, not run.
# Loads backend/.env (or $VISION3D_ENV_FILE), so any value below can be set there.

root=$(cd "$(dirname "$0")/.." && pwd)
env_file=${VISION3D_ENV_FILE:-"$root/backend/.env"}
if [ -f "$env_file" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
fi

port=${VISION3D_PORT:-8000}
state=${VISION3D_STATE_DIR:-"$HOME/Library/Application Support/Vision3D"}
logs=${VISION3D_LOG_DIR:-"$HOME/Library/Logs/Vision3D"}
label=${VISION3D_AGENT_LABEL:-com.vision3d.backend}
agent="$HOME/Library/LaunchAgents/$label.plist"

ok() { printf 'OK    %s\n' "$*"; }
warn() { printf 'WARN  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*" >&2; }

# alive FILE: the pid stored in FILE is a running process.
alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

agent_loaded() { launchctl print "gui/$(id -u)/$label" >/dev/null 2>&1; }

ready() { curl -fsS -m 10 "$1/health/ready" >/dev/null 2>&1; }
