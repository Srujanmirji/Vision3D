#!/bin/sh
# Install Stable Fast 3D (Stability AI Community License) for Vision3D on an Apple Silicon Mac.
# Creates $VISION3D_SF3D_HOME (default ~/vision3d-sf3d) with its own Python 3.12 venv, the SF3D code,
# its compiled helpers, the model weights (~4 GB) and the u2net background-removal model. Safe to re-run.
#
# Before running: on huggingface.co, accept the licence at https://huggingface.co/stabilityai/stable-fast-3d
# with your account, then log in on this Mac (the script tells you how if you are not logged in).
set -eu

home=${VISION3D_SF3D_HOME:-"$HOME/vision3d-sf3d"}
sf3d_commit=ff21fc4

command -v brew >/dev/null || { echo "Homebrew not found; install it from https://brew.sh" >&2; exit 1; }
command -v git >/dev/null || { echo "git not found (install Xcode Command Line Tools: xcode-select --install)" >&2; exit 1; }
# SF3D pins numpy 1.26, which has no Python 3.13 build; its helpers need OpenMP and CMake.
brew list python@3.12 >/dev/null 2>&1 || brew install python@3.12
brew list libomp >/dev/null 2>&1 || brew install libomp
command -v cmake >/dev/null || brew install cmake
python=$(brew --prefix python@3.12)/bin/python3.12
omp=$(brew --prefix libomp)

mkdir -p "$home"
if [ ! -d "$home/stable-fast-3d/.git" ]; then
  git clone -q https://github.com/Stability-AI/stable-fast-3d.git "$home/stable-fast-3d"
fi
git -C "$home/stable-fast-3d" checkout -q "$sf3d_commit"

[ -x "$home/venv/bin/python" ] || "$python" -m venv "$home/venv"
pip="$home/venv/bin/python -m pip"
$pip install --quiet --upgrade pip setuptools wheel
$pip install --quiet torch torchvision
# gpytoolbox 0.2.0 (SF3D's pin) does not build on current macOS; the newer wheel has the same API.
$pip install --quiet --only-binary=:all: gpytoolbox
grep -v gpytoolbox "$home/stable-fast-3d/requirements.txt" >"$home/requirements.txt"
(
  cd "$home/stable-fast-3d"
  CPPFLAGS="-I$omp/include" CFLAGS="-I$omp/include" CXXFLAGS="-I$omp/include" \
    LDFLAGS="-L$omp/lib -Wl,-rpath,$omp/lib" \
    $pip install --quiet --no-build-isolation -r "$home/requirements.txt"
)

# Download both models now so jobs never do (they run offline).
if ! "$home/venv/bin/python" -c "from huggingface_hub import HfApi; HfApi().whoami()" >/dev/null 2>&1; then
  echo "Log in to Hugging Face first, then run this script again:" >&2
  echo "  $home/venv/bin/huggingface-cli login" >&2
  exit 1
fi
"$home/venv/bin/python" -c "
import rembg; rembg.new_session('u2net')
from huggingface_hub import hf_hub_download
for name in ('config.yaml', 'model.safetensors'):
    hf_hub_download('stabilityai/stable-fast-3d', name)
" || {
  echo "Could not download Stable Fast 3D. Accept its licence at https://huggingface.co/stabilityai/stable-fast-3d" >&2
  echo "with the account you logged in with, then run this script again." >&2
  exit 1
}

echo "Stable Fast 3D is installed in $home."
echo "Add this line to backend/.env, then restart the backend:"
echo "  LOCAL_SF3D_HOME=$home"
