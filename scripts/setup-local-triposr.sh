#!/bin/sh
# Install local TripoSR (MIT) for Vision3D on an Apple Silicon Mac (also works on Linux, CPU only).
# Creates $VISION3D_TRIPOSR_HOME (default ~/vision3d-triposr) with its own venv, the TripoSR code,
# and the model weights (~1.7 GB) plus the u2net background-removal model (~170 MB). Safe to re-run.
set -eu

repo=$(cd "$(dirname "$0")/.." && pwd)
home=${VISION3D_TRIPOSR_HOME:-"$HOME/vision3d-triposr"}
python=${PYTHON:-python3.13}
triposr_commit=107cefd

command -v "$python" >/dev/null || { echo "Python 3.13 not found; set PYTHON=/path/to/python3.13" >&2; exit 1; }
command -v git >/dev/null || { echo "git not found (install Xcode Command Line Tools: xcode-select --install)" >&2; exit 1; }

mkdir -p "$home"
if [ ! -d "$home/TripoSR/.git" ]; then
  git clone -q https://github.com/VAST-AI-Research/TripoSR.git "$home/TripoSR"
fi
git -C "$home/TripoSR" checkout -q "$triposr_commit"

[ -x "$home/venv/bin/python" ] || "$python" -m venv "$home/venv"
"$home/venv/bin/python" -m pip install --quiet --upgrade pip
"$home/venv/bin/python" -m pip install --quiet -r "$repo/backend/local_triposr/requirements.txt"
"$home/venv/bin/python" -m pip install --quiet --no-build-isolation \
  "git+https://github.com/tatsy/torchmcubes.git@a9ac95aa329957ba646e7bb057f825f5dfa77f38"

# Download both models now so the first generation does not.
"$home/venv/bin/python" -c "
import rembg; rembg.new_session('u2net')
from huggingface_hub import hf_hub_download
for name in ('config.yaml', 'model.ckpt'):
    hf_hub_download('stabilityai/TripoSR', name)
print('models ready')"

echo "Local TripoSR ready. Start the backend with: LOCAL_TRIPOSR_HOME=$home"
