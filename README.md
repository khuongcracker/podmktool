# Podmktool

Web app for print-on-demand (POD) teams: generate product mockups and Facebook
content creatives from a product link or a pasted product description.

- **New Mockup** — read a product (store URL or pasted text) → infer theme,
  audience and real-world scale → generate 1–10 lifestyle mockups with different
  backgrounds and camera angles, with an automatic scale check. Download single
  images or a ZIP.
- **Content FB** — creatives and copy for Facebook posts based on the product.
- **Redesign** — locked in this release.
- **Admin** — create / lock / reset accounts, bulk import, login and AI-usage reports.

UI is English by default with a Vietnamese toggle. A Vietnamese user guide is in
`HUONG-DAN.md` / `huong-dan.html`.

## Stack

| Part | Tech |
|---|---|
| Frontend | React 18 + Vite (`src/`) |
| Backend | Node ≥ 22.5, Express, built-in `node:sqlite` (`server/`) |
| AI | Google Gemini (required), OpenAI (optional) — keys stay on the server |
| Storage | One SQLite file (accounts, sessions, usage). Generated images stay in the browser (IndexedDB) |

One process serves the built frontend, the `/api` routes, auth and the AI proxy.

## Run locally

```bash
npm install                      # also installs server deps (postinstall)
cp server/.env.example server/.env   # fill GEMINI_API_KEY
npm run build
node --env-file=server/.env server/index.js
# → http://localhost:8787
```

Create the first admin:

```bash
cd server
node --env-file=.env cli.js add <username> <password> admin
```

Frontend-only dev server with hot reload: `npm run dev` (Vite, port 5173).

## Deploy

See [`DEPLOY.md`](DEPLOY.md).

## Project layout

```
src/            React app (tabs, admin panel, i18n, AI provider calls via /api)
src/providers/  model list + Gemini / OpenAI request builders
server/         backend: auth, proxy, rate limit, usage DB, CLI — see server/README.md
nixpacks.toml   build config for Nixpacks-based hosts
```

## Notes

- `server/pricing.js` is intentionally empty. Fill in your API prices to get cost
  figures in the usage report; until then the report shows token counts only.
- Allowed models are whitelisted in `server/proxy.js` (`ALLOWED`) and listed in
  `src/providers/models.js` — add new models in both places.
- Current version: see `package.json` and `src/changelog.js` (shown in-app under
  "What's new").
