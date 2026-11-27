#!/bin/sh
# Reproducible local setup for Vision3D. Safe to re-run: existing env files are kept.
# Needs Python 3.13 and Node.js 24 (Corepack provides the pinned pnpm).
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
python=${PYTHON:-python3.13}

command -v "$python" >/dev/null || { echo "Python 3.13 not found; set PYTHON=/path/to/python3.13" >&2; exit 1; }
command -v corepack >/dev/null || { echo "Corepack not found; install Node.js 24" >&2; exit 1; }

[ -x "$root/.venv/bin/python" ] || "$python" -m venv "$root/.venv"
"$root/.venv/bin/python" -m pip install --quiet --upgrade pip
"$root/.venv/bin/python" -m pip install --quiet -r "$root/backend/requirements-dev.txt"

(cd "$root/frontend" && corepack pnpm install --frozen-lockfile)

[ -f "$root/backend/.env" ] || cp "$root/backend/.env.example" "$root/backend/.env"
[ -f "$root/frontend/.env.local" ] || cp "$root/frontend/.env.example" "$root/frontend/.env.local"

echo "Setup complete. See DEPLOYMENT.md > Repeatable local setup to start both services."
