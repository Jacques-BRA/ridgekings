# RidgeKings — Deploy Runbook

This document covers deploying RidgeKings to a long-lived server (Linux or Windows). The app is a Next.js process plus a SQLite file. The in-process scheduler (`lib/scheduler.ts`) means it must run as a single long-lived process — **do not deploy to serverless platforms** (Vercel/Lambda) without first moving the cron jobs out to an external trigger.

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
| `ADMIN_USERNAME` | no | Defaults to `admin`. Once SSO is wired this should match the canonical Entra display name |
| `STARTING_BALANCE` | no | Defaults to 1000 |
| `WEEKLY_STIPEND` | no | Defaults to 200 |
| `NODE_ENV` | yes | Set to `production` |
| `PORT` | no | Defaults to 3000 |
| `LOG_DIR` | no | Defaults to `./logs`. Use absolute path in prod, e.g. `/var/log/ridgekings` |

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

Caddy fetches Let's Encrypt certs automatically. If the box is behind your office firewall and you don't want to open port 80/443, use Cloudflare Tunnel instead.

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
