# Running Vision3D on your Mac

This guide is for running the Vision3D backend on your own Apple Silicon Mac (for example an M1 MacBook Air). After a one-time setup it starts by itself when you log in, restarts if it crashes, and keeps the Mac awake while plugged in.

The website itself is hosted on Vercel. Your Mac does the 3D generation and is reached through a Cloudflare tunnel.

All commands are typed in **Terminal** (Applications > Utilities > Terminal), from the Vision3D folder.

## One-time setup

1. **Put the folder in your home folder**, for example `/Users/you/Vision3D`. Don't use Downloads, Desktop or Documents: macOS blocks auto-start programs from reading those folders.
2. Install the tools: [Node.js 24 LTS](https://nodejs.org) (the macOS installer), [Homebrew](https://brew.sh), then:
   ```sh
   brew install python@3.13 cloudflared
   ```
3. Set up Vision3D and the local 3D model. The model download is about 3 GB and the step takes a while:
   ```sh
   cd ~/Vision3D
   sh scripts/setup.sh
   sh scripts/setup-local-triposr.sh
   ```
4. Open `backend/.env` in a text editor and set:
   ```sh
   LOCAL_TRIPOSR_HOME=~/vision3d-triposr
   PUBLIC_APP_URL=https://your-site.vercel.app
   VISION3D_DATA_DIR=~/vision3d-data
   ```
5. Check that it starts (see below), then turn on auto-start.

## Start and stop by hand

```sh
sh scripts/start-mac.sh     # starts the backend and the tunnel, then prints the public URL
```

Wait for these lines:

```
OK    Backend ready on http://127.0.0.1:8000
OK    Tunnel ready: https://something-random.trycloudflare.com
```

Press **Ctrl-C** in that window to stop. From another window you can also run:

```sh
sh scripts/stop-mac.sh      # stops it (and the auto-start agent, until the next login)
sh scripts/status-mac.sh    # shows whether it is running and the current public URL
```

## Auto-start on and off

```sh
sh scripts/install-mac-autostart.sh             # on: starts now, at every login, and after a crash
sh scripts/install-mac-autostart.sh uninstall   # off: stops it and removes auto-start
```

When auto-start is on, there is no Terminal window. Use `sh scripts/status-mac.sh` to see the public URL. You also get a macOS notification whenever the URL changes.

Auto-start begins when you **log in**. After a restart or a power cut, someone has to log in before Vision3D starts.

## Keeping the Mac awake

- While Vision3D runs on mains power, the Mac does not sleep, even when the screen turns off. On battery it sleeps normally, so keep it plugged in.
- **Keep the lid open.** A MacBook sleeps when its lid is closed, whatever is running.
- **Clamshell mode** (lid closed) only works while the Mac is plugged into power *and* connected to an external display, keyboard or mouse.
- Optional: System Settings > Battery > Options > turn on *Prevent automatic sleeping on power adapter when the display is off*.

## The tunnel URL changed

The free Quick Tunnel gets a **new random address every time Vision3D starts**: after a restart, a login, a crash or a network drop. The website must then be pointed at the new address, or it shows the backend as unavailable.

The start script prints the new address and says when it is new. To update the website:

1. Get the address: `sh scripts/status-mac.sh` (the line `VISION3D_BACKEND_ORIGIN must be: https://...`).
2. In [Vercel](https://vercel.com), open the project > **Settings** > **Environment Variables**. Edit `VISION3D_BACKEND_ORIGIN` (Production) to the new address, with no slash at the end. Save.
3. Go to **Deployments**, open the latest production deployment, and choose **⋯ > Redeploy**. The change only takes effect after a redeploy.
4. When the deployment is ready, open the website and check that it no longer says the backend is unavailable.

With the Vercel CLI (`npm i -g vercel`, then `vercel login` and `vercel link` in `frontend/`), the same steps are:

```sh
cd frontend
vercel env rm VISION3D_BACKEND_ORIGIN production --yes
printf '%s' "https://NEW-ADDRESS.trycloudflare.com" | vercel env add VISION3D_BACKEND_ORIGIN production
vercel deploy --prod --yes
```

### Stable address (recommended)

A **named Cloudflare tunnel** keeps the same address forever, so Vercel only has to be set once. It is free, but it needs a domain that uses Cloudflare for its DNS.

1. In the Cloudflare dashboard, open **Zero Trust > Networks > Tunnels > Create a tunnel**. Choose **Cloudflared** and give it a name.
2. Copy the tunnel token from the install command it shows (the long text after `--token`). Don't run that command: Vision3D runs cloudflared itself.
3. Add a **public hostname**, for example `api.yourdomain.com`, with service **HTTP** and URL `localhost:8000`.
4. Add to `backend/.env`:
   ```sh
   CLOUDFLARE_TUNNEL_TOKEN=the-token-you-copied
   VISION3D_TUNNEL_URL=https://api.yourdomain.com
   ```
5. Set `VISION3D_BACKEND_ORIGIN` in Vercel to `https://api.yourdomain.com` and redeploy, one last time.
6. Restart Vision3D (`sh scripts/stop-mac.sh`, then `sh scripts/install-mac-autostart.sh`).

Keep the token secret: anyone who has it can serve traffic for that hostname.

## Troubleshooting

`sh scripts/status-mac.sh` is the first thing to run. Logs are in `~/Library/Logs/Vision3D/`:

| File | Contents |
|---|---|
| `agent.log` | What the start script printed when run by auto-start |
| `backend.log` | The Vision3D backend |
| `tunnel.log` | The Cloudflare tunnel |

Share links and capture tokens are removed from these logs.

**Backend not ready**
- `No generation provider is configured`: `LOCAL_TRIPOSR_HOME` in `backend/.env` is missing or wrong. Re-run `sh scripts/setup-local-triposr.sh` and check the path.
- `The backend stopped while starting`: read the lines printed below it, or the end of `backend.log`. If it names `setup-local-triposr.sh`, the model install is incomplete: run it again.
- `Port 8000 is already in use`: another copy is running. Run `sh scripts/stop-mac.sh`, or close the other Terminal window.
- `is missing. Run: sh scripts/setup.sh`: run the one-time setup again.

**Tunnel problems**
- `No tunnel address after 60s`: check the internet connection, then look at `tunnel.log`. If you have a file `~/.cloudflared/config.yml`, a Quick Tunnel can fail. Rename that file, or use a named tunnel.
- `The tunnel is up but ... does not answer yet`: the new address can take a minute or two to work. Run `sh scripts/status-mac.sh` again shortly.
- The website says the backend is unavailable, but status is all `OK`: the URL changed. See [The tunnel URL changed](#the-tunnel-url-changed).

**Auto-start**
- `macOS does not let auto-start programs read Downloads...`: move the folder (step 1 of the setup), run `sh scripts/setup.sh` again in the new place, then turn auto-start on.
- It keeps restarting: `agent.log` shows the reason each time. Auto-start retries at most every 30 seconds. Fix the cause, or turn auto-start off while you investigate.
