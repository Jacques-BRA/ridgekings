# RidgeKings

> Where Productivity Goes To Die

RidgeKings is a parody-of-DraftKings office betting app — a self-hosted, dark-mode-only spoof
of a sportsbook for friendly office wagers.

## Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui
- SQLite (better-sqlite3) + Drizzle ORM
- Zod for validation
- Vitest for tests
- SWR for client-side data fetching

## Getting Started

```bash
pnpm install
cp .env.example .env.local
# edit .env.local and set COOKIE_SECRET to 32+ random chars
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `pnpm dev` — start the dev server
- `pnpm build` — production build
- `pnpm start` — start the production server
- `pnpm test` — run unit tests with Vitest
- `pnpm test:watch` — Vitest watch mode
- `pnpm db:generate` — generate Drizzle migrations
- `pnpm db:push` — push schema to the dev database
- `pnpm db:migrate` — apply migrations

## Project Layout

```
app/        Next.js App Router routes
components/ React components (shadcn/ui lives in components/ui)
db/         Drizzle schema + better-sqlite3 client
lib/        Shared utilities (env, helpers)
data/       SQLite database files (gitignored)
docs/       Specs and implementation plans
```
