# syntax=docker/dockerfile:1.7
# RidgeKings production image.
#   - Multi-stage so the final image excludes build toolchain.
#   - `better-sqlite3` is a native module, so we need python3/make/g++ at install time.
#   - The runtime image installs only the bits Next.js + the migrator need at runtime.

ARG NODE_VERSION=22.13.0

# ---------- deps ----------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# Install pnpm directly rather than going through corepack. Corepack 0.30+
# has signature-verification quirks (stale bundled keys; silently ignores
# the `packageManager` field when it lacks a SHA hash), and pnpm 11+
# blocks native install scripts by default — which breaks better-sqlite3.
# Pinning pnpm 9 via npm sidesteps all of that.
RUN npm install -g pnpm@9.15.9 \
  && pnpm install --frozen-lockfile --prod=false

# ---------- builder ----------
FROM deps AS builder
WORKDIR /app
COPY . .
# `next build`'s "Collecting page data" phase evaluates every server module,
# which means lib/env.ts runs and rejects missing required vars. These
# sentinel values satisfy the schema purely for the duration of the build.
# Railway provides the real values at container start, overriding these.
# Anything obviously-fake-looking is on purpose; if these ever leak into a
# running container something is very wrong.
ENV COOKIE_SECRET=build-only-placeholder-cookie-secret-do-not-use
ENV AUTH_SECRET=build-only-placeholder-auth-secret-do-not-use
# `:memory:` instead of a file path: next build's "Collecting page data"
# spawns ~14 parallel workers, each importing db/index.ts. With a file
# path they all race to create the file + set journal_mode=WAL and trip
# over each other (SQLITE_BUSY). :memory: gives every worker its own
# private isolated in-memory DB — no file, no lock, no contention.
ENV DATABASE_URL=:memory:
RUN pnpm build

# ---------- runner ----------
FROM node:${NODE_VERSION}-bookworm-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Bring over only what we need at runtime.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/db ./db
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts ./scripts

# Volume-mounted dirs (Railway mounts an attached volume here at runtime).
RUN mkdir -p /data

# This container runs as root deliberately. The runtime mounts a persistent
# volume at /data owned by root, and the migrate script + better-sqlite3
# need write access there. Dropping to a non-root user would require an
# entrypoint script that chowns the mount and re-execs (gosu/su-exec) —
# overkill for a single-tenant, auth-gated internal app behind Railway's
# container isolation.
EXPOSE 3000

# Healthcheck — Railway also probes /api/health via railway.json,
# this is a belt-and-suspenders check for non-Railway runs (e.g., `docker run`).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:${PORT:-3000}/api/health || exit 1

# Start: a small Node entrypoint that runs migrations, prints checkpoints,
# and exec-spawns `next start`. Doing this in Node (rather than sh -c)
# gives us reliable unbuffered stdout — sh's builtin echo was being
# silently lost in Railway's log capture, masking whatever was actually
# crashing during startup.
CMD ["node", "scripts/start.mjs"]
