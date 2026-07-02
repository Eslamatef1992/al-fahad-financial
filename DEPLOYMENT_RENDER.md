# Deploying the backend on Render (recommended, since the CyberPanel server has no PostgreSQL/Node support)

The frontend stays on `alfahadgroup.online` via CyberPanel (plain static file upload —
see below). The backend + PostgreSQL database run on Render, a managed platform that
needs no server administration.

## 1. Push this project to GitHub

In a terminal, from inside the `al-fahad-financial` folder:

```bash
cd "al-fahad-financial"
git init
git add .
git commit -m "Initial commit"
```

Create a new **empty** repository on GitHub (no README/gitignore) — e.g. named
`al-fahad-financial` — then:

```bash
git remote add origin https://github.com/<your-username>/al-fahad-financial.git
git branch -M main
git push -u origin main
```

## 2. Deploy via Render Blueprint

The repo includes `render.yaml`, which defines both the API service and a managed
PostgreSQL database together.

1. Sign up / log in at [render.com](https://render.com) (GitHub login is easiest).
2. **New → Blueprint**, select the `al-fahad-financial` repo.
3. Render reads `render.yaml` and shows two resources to create: the
   `al-fahad-financial-db` database and the `al-fahad-financial-api` web service. Click **Apply**.
4. Render provisions the database, installs backend dependencies, and starts the API.
   `AUTO_MIGRATE=true` is set in the blueprint, so the app creates all tables and
   seeds the 7 companies + a super admin account automatically on first boot —
   **no shell access needed**.
5. Once deployed, note the API's URL, e.g. `https://al-fahad-financial-api.onrender.com`.
   Confirm it's alive: `https://al-fahad-financial-api.onrender.com/api/health` should
   return `{"status":"ok"}`.

Default seeded login: `admin@alfahadgroup.com` / `ChangeMe123!` — **change this immediately.**

### Free tier limitations (worth knowing)

- The free web service **spins down after inactivity** and takes ~30–60s to wake up
  on the next request. Fine for evaluation; upgrade to a paid instance for always-on use.
- The free web service has **no persistent disk** — anything saved to
  `backend/src/uploads` (vehicle documents) is lost on restart/redeploy. For real use,
  either upgrade to a paid instance with a persistent disk, or switch the upload
  storage to an object store (S3-compatible) — ask if you'd like this wired up.
- Render's free PostgreSQL plan has a limited retention window before it expires —
  check current Render pricing before relying on it long-term; upgrade to a paid
  database plan for production data.

## 3. Point the frontend at the live backend and upload it to CyberPanel

On your machine, inside `frontend/`:

```bash
echo "VITE_API_URL=https://al-fahad-financial-api.onrender.com/api" > .env
npm install
npm run build
```

Upload the contents of `frontend/dist/` to the `alfahadgroup.online` website's
document root in CyberPanel (Websites → Manage → File Manager, or FTP). Add the
`.htaccess` / rewrite rule from `DEPLOYMENT_CPANEL.md` section 3 if you want deep
links to survive a page refresh (CyberPanel uses OpenLiteSpeed — the same Apache-style
`.htaccess` rewrite generally works, but confirm via a test after upload).

## 4. Lock down CORS

Back in the Render dashboard, update the API service's `CLIENT_URL` environment
variable to your real frontend URL (`https://alfahadgroup.online`) if it isn't already
set correctly, then redeploy.
