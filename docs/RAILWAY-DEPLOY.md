# RidgeKings — Railway Deploy Runbook

This is the **recommended** production deployment path. The older self-hosted-on-a-company-box flow lives in `DEPLOY.md` and is still supported.

## Architecture

```
employee browser
   │ HTTPS
   ▼
Cloudflare (edge — TLS termination, WAF, Access SSO via Entra)
   │ HTTPS, with Cf-Access-Jwt-Assertion header
   ▼
Railway-issued TLS endpoint (your-service.up.railway.app, CNAME'd to ridgekings.your-company.com)
   │
   ▼
RidgeKings container (Next.js 16 + better-sqlite3)
   │
   ▼
Railway Volume mounted at /data  →  app.db + WAL files + logs + backups
```

Two Railway services in the same project share one Volume:
1. **`web`** — the Next.js app (long-lived, healthchecked, takes traffic)
2. **`backup`** — a Railway cron service that runs `scripts/backup-db.mjs` nightly

## Prereqs

- Railway account (https://railway.com — Hobby tier $5/mo is enough for ~50 office users)
- Cloudflare Zero Trust set up with an Entra ID identity provider (see DEPLOY.md → Cloudflare Tunnel + Access for the Entra-side steps; the Tunnel step is **not** needed here, only the Access app + Entra IdP wiring)
- `railway` CLI installed locally if you want to deploy without GitHub auto-deploys: `npm i -g @railway/cli`

## One-time setup

### 1. Create the Railway project and link the repo

```bash
railway login
railway init   # creates the project
railway link   # links this local checkout to it
```

Alternatively, in the Railway dashboard: **New Project → Deploy from GitHub** and pick the RidgeKings repo. Auto-deploy on push to `main` is on by default.

### 2. Add a persistent volume to the `web` service

In the Railway dashboard for the `web` service:

- **Settings → Volumes → New Volume**
- Mount path: `/data`
- Size: 1 GB is plenty (SQLite + 14 days of backups + logs)

### 3. Set environment variables on the `web` service

| Var | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Railway sets this automatically; verify it's there |
| `DATABASE_URL` | `file:/data/app.db` | Points at the mounted volume |
| `LOG_DIR` | `/data/logs` | pino-roll writes daily rotating JSON logs here |
| `COOKIE_SECRET` | (random 32-byte hex) | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_USERNAME` | `Jacques` | Match the canonical Entra display name of whoever has admin powers |
| `STARTING_BALANCE` | `1000` | Optional override (default 1000) |
| `WEEKLY_STIPEND` | `200` | Optional override (default 200) |
| `CF_ACCESS_TEAM_DOMAIN` | `your-team.cloudflareaccess.com` | From Cloudflare Zero Trust dashboard |
| `CF_ACCESS_AUD` | (long string) | From Zero Trust → Access → Applications → your app → Overview |
| `APP_PUBLIC_URL` | `https://ridgekings.your-company.com` | Base URL for Teams deep-link buttons |
| `TEAMS_WEBHOOK_URL` | (optional) | Power Automate Workflow URL — see DEPLOY.md → Teams notifications |
| `TEAMS_NOTIFICATIONS_ENABLED` | `1` | Defaults off even when URL is set; flip to `1` to enable |

**Never set:** `DEV_BYPASS_CF_ACCESS` — `proxy.ts` returns 500 if it sees this in production.

### 4. Create the Cloudflare Access application

In Zero Trust → Access → Applications → **Add an application → Self-hosted**:

- **Application domain:** `ridgekings.your-company.com`
- **Identity providers:** the Entra ID IdP you wired up (see DEPLOY.md for the Entra steps if you haven't yet)
- **Policy:** allow emails matching `@your-company.com` (or a specific Entra group)
- After saving, the Overview tab shows an **Application Audience (AUD) Tag** — that's the value for `CF_ACCESS_AUD` above

### 5. Wire DNS

Railway gives the `web` service a hostname like `ridgekings-web-production.up.railway.app`. In the Railway dashboard for `web`:

- **Settings → Networking → Custom Domain → Add domain**
- Add `ridgekings.your-company.com` — Railway shows a CNAME target
- In your DNS provider (Cloudflare for the DNS too, presumably): add a **CNAME** from `ridgekings` → that Railway target, **proxied through Cloudflare** (the orange cloud). Cloudflare Access only works when traffic is proxied.

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

```bash
# From your laptop, with Cloudflare Access logged in (you'll be redirected to Entra on first hit):
curl -L https://ridgekings.your-company.com/api/health
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

- **COOKIE_SECRET** — change in Railway dashboard → redeploy. Active sessions sign out.
- **CF_ACCESS_AUD / CF_ACCESS_TEAM_DOMAIN** — change in Railway dashboard → redeploy. Requires matching change in Cloudflare Access.
- **Entra client secret** (lives in Cloudflare, not in the app) — rotate annually; see DEPLOY.md.

## Cost estimate

| | Cost |
|---|---|
| Railway `web` service (Hobby tier) | ~$5/mo |
| Railway `backup` cron service | minutes/mo, well under the included quota |
| Railway Volume (1 GB) | ~$0.25/mo |
| Cloudflare Zero Trust (≤ 50 seats) | $0 |
| Domain | ~$10/yr |
| **Total** | **~$6/mo** |

## Known limits of this setup

1. **Single replica.** SQLite is single-writer; you can't scale `web` horizontally. For ~50 users this is irrelevant; if usage 10x'd we'd move to Postgres first, scaling second.
2. **Volumes are bound to a service.** If you ever recreate the `web` service from scratch you must reattach the existing volume (Railway makes this easy — just don't accidentally delete it).
3. **Cold-start migration is in-band.** A bad migration blocks the container from starting. The previous deploy keeps serving until the new one is healthy, so users don't see downtime, but the new deploy stays "failed" until fixed.
4. **`Cf-Access-Jwt-Assertion` requires the Cloudflare proxy.** If anyone bypasses Cloudflare (e.g., directly hits the `*.up.railway.app` URL), the app returns 401 because no JWT is present. If you want to fully block that path, restrict the Railway service to only accept traffic via Cloudflare IPs (Railway settings → Networking → Restrict IPs, paste Cloudflare's IP ranges).
