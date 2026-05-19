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
RUN pnpm build

# ---------- runner ----------
FROM node:${NODE_VERSION}-bookworm-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates wget \
  && rm -rf /var/lib/apt/lists/* \
  && useradd -r -u 1001 -m -d /home/app -s /usr/sbin/nologin app

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Bring over only what we need at runtime.
COPY --chown=app:app --from=builder /app/.next ./.next
COPY --chown=app:app --from=builder /app/node_modules ./node_modules
COPY --chown=app:app --from=builder /app/public ./public
COPY --chown=app:app --from=builder /app/db ./db
COPY --chown=app:app --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --chown=app:app --from=builder /app/package.json ./package.json
COPY --chown=app:app --from=builder /app/scripts ./scripts

# Volume-mounted dirs (Railway mounts an attached volume here at runtime).
RUN mkdir -p /data && chown -R app:app /data

USER app
EXPOSE 3000

# Healthcheck — Railway also probes /api/health via railway.json,
# this is a belt-and-suspenders check for non-Railway runs (e.g., `docker run`).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:${PORT:-3000}/api/health || exit 1

# Start: apply pending migrations, then serve.
CMD ["sh", "-c", "node scripts/migrate.mjs && node node_modules/next/dist/bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
