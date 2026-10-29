# Deploy

Podmktool runs as **one Node service** with **one SQLite file**. Any host that
runs Node ≥ 22.5 and gives you a persistent disk works (Railway, Render, Fly.io,
a VPS, Docker…).

## Requirements

- Node **≥ 22.5** (needs the built-in `node:sqlite`).
- A **persistent volume / disk** for the database. Without it, accounts and logs
  are wiped on every redeploy.
- HTTPS in front of the app (set `SECURE_COOKIE=1`).

## Build & start

```bash
npm ci                     # postinstall installs server deps
npm run build              # builds the frontend into dist/
node server/index.js       # serves dist/ + /api on $PORT (default 8787)
```

`nixpacks.toml` already describes these steps, so Nixpacks-based hosts
(e.g. Railway) build it with no extra config.

## Environment variables

| Variable | Example | Required |
|---|---|---|
| `GEMINI_API_KEY` | your Gemini key | ✅ |
| `DB_PATH` | `/data/app.db` (path on the persistent volume) | ✅ |
| `SECURE_COOKIE` | `1` when served over HTTPS | ✅ in production |
| `PORT` | usually set by the host | — |
| `OPENAI_API_KEY` | your OpenAI key | optional |
| `SESSION_IDLE_MIN` | `480` — idle minutes before a session expires | optional |
| `ADMIN_USER` / `ADMIN_PASS` | creates the first admin on boot if it does not exist | optional |
| `APP_ENV` | `production` / `local` — label shown in the UI | optional |
| `APP_COMMIT` / `APP_BRANCH` | build info shown at `/api/health` | optional |
| `UPSTREAM_TIMEOUT_MS`, `MAX_INFLIGHT_IMAGE`, `PAGE_TIMEOUT_MS` | AI / scraping limits | optional |
| `LOGIN_MAX_PER_USER`, `LOGIN_MAX_PER_IP`, `LOGIN_WINDOW_MS` | login rate limit | optional |

Never commit `.env` — set keys in your host's secret/variables settings.

## First admin

Either set `ADMIN_USER` + `ADMIN_PASS`, deploy, log in, then remove both
variables (the account is already stored in the database), or run inside the
container:

```bash
node server/cli.js add <username> <password> admin
```

After that, manage users from the **Admin** page in the app.

## Health check

`GET /api/health` returns the running version, environment and commit.

## Pitfalls already hit

- **`index.html` must not be cached** (the server already sends `no-cache`).
  Otherwise users keep old JavaScript after a deploy and see a blank screen.
- **Avoid class / id names containing `ads`** — ad blockers hide those elements.
- **Windows Git Bash** rewrites values like `/data/app.db` into Windows paths when
  passed to CLI tools. Use `MSYS_NO_PATHCONV=1` and check the value afterwards.
