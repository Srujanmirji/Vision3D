# Vision3D demo deployment checklist

28 November 2026, IST. Run this with the intended commit, one Mac backend and the public Vercel canonical origin. Keep the current verified deployment active while rehearsing a candidate.

## Before the demo

- [ ] Run backend lint, strict types and pytest. Run frontend lint, types, tests and the production build. Check the production browser workflow against an isolated API.
- [ ] Confirm the Mac is on mains power, has space in the private data directory, and has local SF3D and TripoSR weights cached. Keep one worker and one model process in memory.
- [ ] Confirm the configured Cloudflare upstream is the active URL. Prefer a named hostname on a Cloudflare-managed domain. With a Quick Tunnel, prepare to update the Vercel production environment and redeploy if the connector changes hostname.
- [ ] Confirm localhost readiness and public HTTPS reachability. Check inference separately. Run one genuine photo job after any cold start and confirm the expected provider before opening the demo.
- [ ] From desktop, generate and download a genuine model. Test the QR on Safari and ARCore Chrome over separate networks. Complete [the physical device checklist](AR_DEVICE_TESTING.md).
- [ ] Verify one public expiration, revocation, and cookie-free asset check with a disposable session. Keep bearer links out of reports and screenshots shared publicly.

## Start, stop and recover

From the repository root, choose one of the following start methods.

```sh
# Foreground mode for rehearsal. Keep this Terminal open.
sh scripts/start-mac.sh

# In a second Terminal
sh scripts/status-mac.sh
curl -fsS https://vision3d-sigma.vercel.app/api/health/live
curl -fsS https://vision3d-sigma.vercel.app/api/health/ready
curl -fsS https://vision3d-sigma.vercel.app/api/health/inference

# Graceful stop
sh scripts/stop-mac.sh
```

For login and crash supervision use `sh scripts/install-mac-autostart.sh`. To restart a supervised installation, run `sh scripts/stop-mac.sh` followed by `sh scripts/install-mac-autostart.sh`. For a foreground restart, follow the stop command with `sh scripts/start-mac.sh`. Use `VISION3D_ENV_FILE=/path/to/operator.env` consistently on start, status, stop and launchd installation if the environment is outside `backend/.env`.

The temporary rehearsal starts under `com.vision3d.demo-rehearsal`. Use `launchctl remove com.vision3d.demo-rehearsal` before switching to the permanent login agent or foreground mode. Check `launchctl list com.vision3d.demo-rehearsal` and `~/Library/Logs/Vision3D/supervisor.log` for its state while it is running.

If the backend stops, the supervisor restarts it independently of the tunnel connector. Wait for readiness then submit a fresh photo for any job reported as interrupted. Completed models, shares within expiry, and history remain in the private data directory. Logs are in `~/Library/Logs/Vision3D/`. If the Quick Tunnel changes hostname, set `VISION3D_BACKEND_ORIGIN` to the latest status output and redeploy the intended Vercel build, then rerun the health and QR probes. A named tunnel restart keeps its hostname.

## Release and rollback

- [ ] Stage and test the intended release before touching the public alias or its backend.
- [ ] Keep the previous Vercel deployment, its compatible backend code and a consistent private backup.
- [ ] Roll back if health stays unavailable, a known fixture does not generate, a guest share no longer renders, or either verified mobile runtime regresses.
- [ ] After restoring the previous deployment and backend, recheck public readiness, inference, download and the guest share. A frontend rollback still needs a reachable upstream.
