# RidgeKings — Self-host Deploy Runbook

> **The recommended deployment is Railway — see [`RAILWAY-DEPLOY.md`](./RAILWAY-DEPLOY.md).**
> This document covers the alternate "self-host on a company Linux or Windows server" path, which is still fully supported.

The app is a Next.js process plus a SQLite file. The in-process scheduler (`lib/scheduler.ts`) means it must run as a single long-lived process — **do not deploy to serverless platforms** (Vercel/Lambda) without first moving the cron jobs out to an external trigger.

## Prereqs on the box

- Node.js 22+ (LTS)
- pnpm 9+ (`npm i -g pnpm`)
- A process supervisor (systemd on Linux, NSSM or Windows Service on Windows)
- Caddy 2+ in front for HTTPS (see `infra/Caddyfile.sample`)

## Environment variables

Create `/etc/ridgekings/env` (Linux) or set Windows env vars for the service account:

| Var | Required | Notes |
|-----|----------|-------|
| `COOKIE_SECRET` | **yes** | At least 32 random bytes hex. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DATABASE_URL` | no | Defaults to `file:./data/app.db`. Use absolute path in prod, e.g. `file:/var/lib/ridgekings/app.db` |
| `ADMIN_USERNAME` | no | Defaults to `admin`. Match the canonical Entra display name of whoever has admin powers. |
| `STARTING_BALANCE` | no | Defaults to 1000 |
| `WEEKLY_STIPEND` | no | Defaults to 200 |
| `NODE_ENV` | yes | Set to `production` |
| `PORT` | no | Defaults to 3000 |
| `LOG_DIR` | no | Defaults to `./logs`. Use absolute path in prod, e.g. `/var/log/ridgekings` |
| `AUTH_SECRET` | **yes** | At least 16 chars. Generate: `openssl rand -base64 33`. Signs Auth.js session cookies. |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | **yes** | Application (client) ID from Entra app registration |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | **yes** | Client secret **Value** (not the Secret ID GUID) |
| `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID` | **yes** | Directory (tenant) ID from Entra app registration |
| `APP_PUBLIC_URL` | no | e.g. `https://ridgekings.your-company.com`. Base URL for Teams deep-link buttons |
| `TEAMS_WEBHOOK_URL` | no | Power Automate Workflow URL. No-op when unset. |
| `TEAMS_NOTIFICATIONS_ENABLED` | no | Set to `1` to enable. Off by default. |
| `DEV_BYPASS_AUTH` | no | **Never set in production** — the proxy returns 500 if it sees `1` while `NODE_ENV=production`. Used locally to skip the Entra sign-in. |
| `DEV_BYPASS_EMAIL` | no | Dev only. Email to inject when bypass is active. Defaults to `dev@local.test`. |
| `DEV_BYPASS_NAME` | no | Dev only. Display name when bypass is active. Defaults to `Local Dev`. |

## Build and run

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm exec drizzle-kit migrate          # applies any new migrations
node .next/standalone/server.js        # or: pnpm start
```

## Database migrations

Migrations live in `db/migrations/` and are generated from `db/schema.ts`.

```bash
# After changing db/schema.ts in development:
pnpm db:generate     # creates a new migration file
git commit db/migrations

# On the prod box during deploy, BEFORE starting the new app version:
pnpm exec drizzle-kit migrate
```

If a migration fails mid-deploy, the app will refuse to start. Restore from the most recent backup (see below), fix the migration, re-deploy.

## Backups

`scripts/backup-db.mjs` uses better-sqlite3's online `backup()` API and is safe to run while the app is live. It writes to `$BACKUP_DIR/app-YYYY-MM-DDTHH-MM-SS.db` and prunes anything older than `BACKUP_RETAIN_DAYS` (default 14).

### Linux (cron)

```cron
0 3 * * * cd /opt/ridgekings && BACKUP_DIR=/var/backups/ridgekings node scripts/backup-db.mjs >> /var/log/ridgekings/backup.log 2>&1
```

### Windows (Task Scheduler)

```powershell
$action  = New-ScheduledTaskAction -Execute 'node' -Argument 'C:\ridgekings\scripts\backup-db.mjs' -WorkingDirectory 'C:\ridgekings'
$trigger = New-ScheduledTaskTrigger -Daily -At 3am
Register-ScheduledTask -TaskName 'RidgeKings DB Backup' -Action $action -Trigger $trigger -RunLevel Highest
```

### Restoring

```bash
# Stop the app first — never restore over a live DB
sudo systemctl stop ridgekings
cp /var/backups/ridgekings/app-2026-05-14T03-00-00.db /var/lib/ridgekings/app.db
sudo systemctl start ridgekings
```

## Reverse proxy + TLS

Caddy is the simplest path. See `infra/Caddyfile.sample` for the full config. Minimum:

```caddy
ridgekings.your-company.com {
    reverse_proxy localhost:3000
}
```

Caddy fetches Let's Encrypt certs automatically.

## Authentication (Microsoft Entra ID)

Auth.js (next-auth v5) handles the OIDC flow against your Entra tenant. One-time setup:

1. **Entra admin center → App registrations → New registration**
   - Name: `RidgeKings`
   - Account types: "Accounts in this organizational directory only (single tenant)"
   - Skip the redirect URI for now
2. **Overview tab** — copy the **Application (client) ID** and **Directory (tenant) ID**.
3. **Certificates & secrets → Client secrets → New client secret** (12 months max). **Copy the Value immediately** — it disappears after you leave the page.
4. **API permissions → Add a permission → Microsoft Graph → Delegated → User.Read** → Grant admin consent.
5. **Authentication → Add a platform → Web** → Redirect URI: `https://ridgekings.your-company.com/api/auth/callback/microsoft-entra-id` → Save.
6. Drop the four values into `/etc/ridgekings/env`:
   ```
   AUTH_SECRET=<openssl rand -base64 33>
   AUTH_MICROSOFT_ENTRA_ID_ID=<client ID>
   AUTH_MICROSOFT_ENTRA_ID_SECRET=<secret VALUE, not the GUID Secret ID>
   AUTH_MICROSOFT_ENTRA_ID_TENANT_ID=<tenant ID>
   ```

Set a calendar reminder to rotate the client secret before its 12-month expiry — auth dies the moment it expires.

### Local dev without Entra

Set `DEV_BYPASS_AUTH=1` in `.env.local` plus optional `DEV_BYPASS_EMAIL` and `DEV_BYPASS_NAME`. The proxy skips the redirect-to-signin and injects the dev identity on every request. Refused in production by the proxy at runtime.

## Health checks

`GET /api/health` returns `{status: "ok"}` (200) when the DB is reachable, or `{status: "degraded"}` (503) on failure. Wire this to your uptime monitor.

## Logs

Structured JSON logs land in `$LOG_DIR/app-YYYY-MM-DD.log` (daily rotation, 14-day retention). To debug a specific user or bet:

```bash
grep '"userId":42' /var/log/ridgekings/app-*.log | tail -50
grep '"betId":123' /var/log/ridgekings/app-*.log | tail -50
```

## Rate limits

Per-user rate limits on mutating server actions are configured in `lib/rate-limit.ts`. Defaults: 60 requests/minute per user across all mutations. If legit users hit the cap, raise the constant and re-deploy.

## Deploy checklist

1. `git pull` (or copy build artifacts)
2. `pnpm install --frozen-lockfile`
3. Verify `$COOKIE_SECRET` is set
4. `pnpm exec drizzle-kit migrate`
5. `pnpm build`
6. Restart the service supervisor (`systemctl restart ridgekings` / `nssm restart ridgekings`)
7. Confirm `curl https://ridgekings.your-company.com/api/health` returns 200
8. Tail the logs for ~60 sec to catch any startup errors
