# RidgeKings — Railway Deploy Runbook

This is the **recommended** production deployment path. The older self-hosted-on-a-company-box flow lives in `DEPLOY.md` and is still supported.

## Architecture

```
employee browser
   │ HTTPS
   ▼
Railway TLS endpoint (your-service.up.railway.app, CNAME'd to ridgekings.your-company.com)
   │
   ▼
RidgeKings container (Next.js 16 + better-sqlite3)
   ├─ proxy.ts (Auth.js middleware) → bounces unauthenticated visitors to Microsoft Entra ID SSO
   ├─ /api/auth/...     → Auth.js OIDC callback + signout handlers
   └─ Railway Volume mounted at /data → app.db + WAL files + logs + backups
```

Two Railway services in the same project share one Volume:
1. **`web`** — the Next.js app (long-lived, healthchecked, takes traffic)
2. **`backup`** — a Railway cron service that runs `scripts/backup-db.mjs` nightly

## Prereqs

- Railway account (https://railway.com — Hobby tier $5/mo is enough for ~50 office users)
- A Microsoft Entra ID app registration (Tenant ID, Client ID, Client Secret value)
- `railway` CLI installed locally if you want to deploy without GitHub auto-deploys: `npm i -g @railway/cli`

## One-time setup

### 1. Microsoft Entra ID app registration

If you haven't already:

1. **Entra admin center → Applications → App registrations → New registration**
2. Name: `RidgeKings`
3. **Supported account types:** "Accounts in this organizational directory only (single tenant)"
4. **Redirect URI:** for now leave blank — we'll add it after Railway gives us the domain (step 4)
5. Click **Register**. Copy the **Application (client) ID** and **Directory (tenant) ID** from the Overview tab.
6. **Certificates & secrets → Client secrets → New client secret** → name it, set expiry (12 months max).
7. **Copy the Value immediately** — it disappears after you leave the page. This is the value you paste into Railway, NOT the Secret ID GUID.
8. **API permissions → Add a permission → Microsoft Graph → Delegated permissions → User.Read** → Grant admin consent.

### 2. Create the Railway project and link the repo

```bash
railway login
railway init   # creates the project
railway link   # links this local checkout to it
```

Alternatively, in the Railway dashboard: **New Project → Deploy from GitHub** and pick the RidgeKings repo. Auto-deploy on push to `main` is on by default.

### 3. Add a persistent volume to the `web` service

In the Railway dashboard for the `web` service:

- **Settings → Volumes → New Volume**
- Mount path: `/data`
- Size: 1 GB is plenty (SQLite + 14 days of backups + logs)

### 4. Set environment variables on the `web` service

| Var | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Railway sets this automatically; verify it's there |
| `DATABASE_URL` | `file:/data/app.db` | Points at the mounted volume |
| `LOG_DIR` | `/data/logs` | pino-roll writes daily rotating JSON logs here |
| `COOKIE_SECRET` | (random 32-byte hex) | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `AUTH_SECRET` | (random 33-byte base64) | Generate: `openssl rand -base64 33`. Signs Auth.js session cookies. |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | client ID | From Entra app registration → Overview |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | client secret **Value** | From Entra app registration → Certificates & secrets (the Value, not the Secret ID) |
| `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID` | tenant ID | From Entra app registration → Overview |
| `ADMIN_USERNAME` | `Jacques` | Match the canonical Entra display name of whoever has admin powers |
| `STARTING_BALANCE` | `1000` | Optional override (default 1000) |
| `WEEKLY_STIPEND` | `200` | Optional override (default 200) |
| `APP_PUBLIC_URL` | `https://ridgekings.your-company.com` | Base URL for Teams deep-link buttons |
| `TEAMS_WEBHOOK_URL` | (optional) | Power Automate Workflow URL — see DEPLOY.md → Teams notifications |
| `TEAMS_NOTIFICATIONS_ENABLED` | `1` | Defaults off even when URL is set; flip to `1` to enable |

**Never set:** `DEV_BYPASS_AUTH` — `proxy.ts` returns 500 if it sees this in production.

### 5. Wire DNS and the Entra redirect URI

Railway gives the `web` service a hostname like `ridgekings-web-production.up.railway.app`. In the Railway dashboard for `web`:

- **Settings → Networking → Custom Domain → Add domain**
- Add `ridgekings.your-company.com` — Railway shows a CNAME target
- In your DNS provider: add a **CNAME** from `ridgekings` → that Railway target

Then back in Entra:

- **App registration → Authentication → Add a platform → Web**
- **Redirect URI:** `https://ridgekings.your-company.com/api/auth/callback/microsoft-entra-id`
- Save

### 6. Add the backup cron service

In the same Railway project:

- **New Service → Empty Service → name it `backup`**
- **Settings → Source → Connect Repo** to the same RidgeKings repo
- **Settings → Volumes → Mount existing volume** → pick the same volume as `web` (mount at `/data`)
- **Settings → Deploy → Start Command:** `node scripts/backup-db.mjs`
- **Settings → Cron Schedule:** `0 3 * * *` (3 AM UTC daily — tweak to your timezone)
- **Environment Variables:**
  - `DATABASE_URL=file:/data/app.db`
  - `BACKUP_DIR=/data/backups`
  - `BACKUP_RETAIN_DAYS=14`

## First deploy

```bash
git push origin main      # Railway auto-deploys
# or
railway up                # manual deploy from local
```

The build runs Dockerfile, the start command runs `scripts/migrate.mjs` to apply any pending migrations, then `next start` takes traffic. Railway probes `/api/health` and only routes traffic once it returns 200.

## Verifying the deploy

Open `https://ridgekings.your-company.com` in a browser. You'll be redirected to Microsoft to sign in via your Entra tenant. After auth you land back on the app. Verify the health endpoint is reachable (the `/api/health` path is matcher-excluded from auth):

```bash
curl https://ridgekings.your-company.com/api/health
# Expected: {"status":"ok","db":"ok","durationMs":1,"uptimeSec":42}
```

## Day-2 operations

### Watching logs

Railway dashboard → service → **Deployments → latest → View Logs**. Or via CLI:

```bash
railway logs --service web
railway logs --service backup
```

App logs come through as structured JSON (pino). To grep on a specific user:

```bash
railway logs --service web --filter '"email":"user@your-company.com"'
```

### Forcing a restart

```bash
railway redeploy --service web
```

### Restoring from a backup

The `backup` service writes timestamped files into `/data/backups/`. To restore:

1. **Stop the `web` service** (Railway dashboard → Stop). Never restore over a live DB.
2. SSH into the volume via `railway shell --service backup` (the `backup` service shares the same volume mount).
3. `cp /data/backups/app-YYYY-MM-DDTHH-MM-SS.db /data/app.db`
4. **Start the `web` service.**

### Rolling back a deploy

Railway dashboard → **Deployments** → pick a previous deploy → **Redeploy**.

### Adding a new database migration

```bash
# Locally:
# 1. Edit db/schema.ts
pnpm db:generate         # creates a new file under db/migrations/
git commit db/migrations db/schema.ts
git push origin main     # Railway auto-deploys
# On deploy, scripts/migrate.mjs picks up the new file before `next start`.
```

If a migration fails, the container exits non-zero, Railway keeps the previous deploy running. Fix the migration locally and push again.

### Rotating secrets

- **COOKIE_SECRET, AUTH_SECRET** — change in Railway dashboard → redeploy. Active sessions sign out.
- **AUTH_MICROSOFT_ENTRA_ID_SECRET** — set a calendar reminder for ~11 months from creation; expires at 12 months and auth dies when it does. Rotation: create new client secret in Entra → paste Value into Railway → redeploy → delete old in Entra.

## Cost estimate

| | Cost |
|---|---|
| Railway `web` service (Hobby tier) | ~$5/mo |
| Railway `backup` cron service | minutes/mo, well under the included quota |
| Railway Volume (1 GB) | ~$0.25/mo |
| Domain | ~$10/yr |
| **Total** | **~$6/mo** |

## Known limits of this setup

1. **Single replica.** SQLite is single-writer; you can't scale `web` horizontally. For ~50 users this is irrelevant; if usage 10x'd we'd move to Postgres first, scaling second.
2. **Volumes are bound to a service.** If you ever recreate the `web` service from scratch you must reattach the existing volume (Railway makes this easy — just don't accidentally delete it).
3. **Cold-start migration is in-band.** A bad migration blocks the container from starting. The previous deploy keeps serving until the new one is healthy, so users don't see downtime, but the new deploy stays "failed" until fixed.
4. **No edge protection in front of the app.** Anyone on the internet can reach `ridgekings.your-company.com` — but they immediately get bounced to Microsoft SSO if they're not signed in. There's no WAF / rate-limit / geo-blocking at the edge. The app's own rate limiter handles abuse at the request level. If you ever want edge protection, you can add Cloudflare in front later without changing app code (just CNAME to Cloudflare and proxy through to Railway).
