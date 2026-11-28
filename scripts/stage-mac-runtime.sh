#!/bin/sh
# Make a launchd-readable backend snapshot outside macOS protected folders.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
umask 077
parent=${VISION3D_RUNTIME_PARENT:-"$HOME/Library/Application Support/Vision3D"}
mkdir -p "$parent"
runtime=$(mktemp -d "$parent/rehearsal.XXXXXX")
mkdir "$runtime/backend" "$runtime/scripts"
cp -R "$root/backend/app" "$root/backend/local_sf3d" "$root/backend/local_triposr" "$runtime/backend/"
cp "$root/backend/requirements.txt" "$runtime/backend/"
cp "$root/scripts/mac-common.sh" "$root/scripts/start-mac.sh" "$root/scripts/status-mac.sh" \
  "$root/scripts/stop-mac.sh" "$root/scripts/install-mac-autostart.sh" "$runtime/scripts/"
cp -R "$root/scripts/launchd" "$runtime/scripts/"
python3.13 -m venv "$runtime/.venv"
"$runtime/.venv/bin/python" -m pip install --disable-pip-version-check -r "$runtime/backend/requirements.txt" >&2
printf '%s\n' "$runtime"
