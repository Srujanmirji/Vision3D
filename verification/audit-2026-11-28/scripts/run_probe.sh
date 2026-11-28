cd "/Users/srujanmirji/Downloads/Vision3D/.claude/worktrees/client-mac-autorun-f89c07/backend"
env -i HOME="$HOME" PATH="$PATH" VISION3D_DATA_DIR="SCRATCH/probe-data" LOCAL_TRIPOSR_HOME="$HOME/vision3d-triposr" PUBLIC_APP_URL=https://example.test SHARE_TTL_SECONDS=3 ../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8100 --no-access-log >"SCRATCH/probe-server.log" 2>&1 &
pid=$!
for i in $(seq 1 60); do ../.venv/bin/python -c "import httpx;httpx.get('http://127.0.0.1:8100/health/ready').raise_for_status()" 2>/dev/null && break; sleep 1; done
../.venv/bin/python "SCRATCH/security_probe.py" "SCRATCH/in/electronics.jpg" "SCRATCH/security-results.json"
kill $pid
