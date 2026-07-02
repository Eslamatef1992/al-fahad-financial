# Deploying to cPanel

This guide covers deploying the backend as a cPanel "Node.js App" and the frontend
as a static site, both under your cPanel hosting account.

## 0. Before you start: confirm PostgreSQL is available

This system is built for **PostgreSQL**. Many shared cPanel hosting plans only
ship with **MySQL/MariaDB** by default — PostgreSQL is a separate cPanel plugin
that your host must have installed.

- Check **cPanel → Databases** for a "PostgreSQL Databases" icon. If it's there, you're set.
- If it's not there, ask your host to enable it, or point `DB_HOST` in the backend
  `.env` at an external managed Postgres instance instead (e.g. a small VPS, or a
  managed Postgres provider). The application code doesn't need to run on the same
  box as the database — only the `DB_HOST`/`DB_PORT` values need to reach it.

## 1. Suggested domain layout

- `app.yourdomain.com` (or a subfolder) → the React frontend (static build)
- `api.yourdomain.com` → the Node.js backend (cPanel Node.js App)

Using a separate subdomain for the API avoids needing a reverse proxy config —
the frontend simply calls `https://api.yourdomain.com/api/...`.

## 2. Backend: cPanel Node.js App

1. In cPanel, go to **Setup Node.js App** → **Create Application**.
   - Node.js version: 18.x or newer
   - Application mode: Production
   - Application root: e.g. `alfahad-backend` (uploaded under your home directory, *not* `public_html`)
   - Application URL: `api.yourdomain.com`
   - Application startup file: `src/server.js`
2. Upload the contents of the `backend/` folder to the application root
   (via Git, File Manager upload + extract, or SFTP). Do **not** upload `node_modules`.
3. In the Node.js App screen, open **Environment Variables** and set:
   ```
   NODE_ENV=production
   PORT=<the port cPanel assigns — leave as configured>
   DB_HOST=<your PostgreSQL host>
   DB_PORT=5432
   DB_NAME=alfahad_financial
   DB_USER=<db user>
   DB_PASSWORD=<db password>
   JWT_SECRET=<generate a long random string>
   JWT_EXPIRES_IN=8h
   CLIENT_URL=https://app.yourdomain.com
   ```
4. Click **Run NPM Install** in the cPanel Node.js App screen.
5. Open the app's terminal (via the "Enter to virtual environment" command cPanel
   shows you, or SSH in and `source` it), then run once:
   ```bash
   npm run db:sync
   npm run db:seed
   ```
   This creates all tables and seeds the 7 companies + a super admin login.
6. Restart the app from the cPanel Node.js App screen. Visit
   `https://api.yourdomain.com/api/health` — you should see `{"status":"ok"}`.

## 3. Frontend: static build

The frontend is a static single-page app after building — it does not need Node.js
running in production.

1. Locally (or in a cPanel terminal with Node available), inside `frontend/`:
   ```bash
   echo "VITE_API_URL=https://api.yourdomain.com/api" > .env
   npm install
   npm run build
   ```
2. Upload the contents of `frontend/dist/` to the document root for
   `app.yourdomain.com` (e.g. `public_html/app` if it's an addon domain/subdomain
   pointed there).
3. Since this is a single-page app with client-side routing, add this
   `.htaccess` file in that same directory so refreshing a deep link
   (e.g. `/vouchers/123`) doesn't 404:
   ```apache
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteBase /
     RewriteRule ^index\.html$ - [L]
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule . /index.html [L]
   </IfModule>
   ```

## 4. SSL

Enable **AutoSSL** (cPanel → Security → SSL/TLS Status) for both
`app.yourdomain.com` and `api.yourdomain.com` so the browser will allow the
frontend to call the API (mixed content / CORS over HTTPS).

## 5. After go-live checklist

- [ ] Log in with the seeded admin account and change its password immediately
      (or delete it and create a named account per real user instead)
- [ ] Confirm `CLIENT_URL` in the backend env matches your real frontend domain (CORS)
- [ ] Confirm each of the 7 companies appears correctly and assign real users to
      the companies they should access (Companies page, super admin only)
- [ ] Take a database backup schedule — cPanel → Backup, or `pg_dump` on a cron job
- [ ] Rebuild and re-upload the frontend (`npm run build`) any time you pull backend/
      frontend code changes — cPanel does not auto-build the frontend for you
