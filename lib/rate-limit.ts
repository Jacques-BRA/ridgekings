const BUCKET_CAPACITY = 60;
const REFILL_PER_SECOND = 1;
const PRUNE_AFTER_MS = 10 * 60_000;

type Bucket = { tokens: number; lastRefill: number };
const buckets = new Map<string, Bucket>();

let lastPrune = Date.now();

function pruneIfStale(now: number): void {
  if (now - lastPrune < PRUNE_AFTER_MS) return;
  for (const [k, b] of buckets) {
    if (now - b.lastRefill > PRUNE_AFTER_MS) buckets.delete(k);
  }
  lastPrune = now;
}

export function checkRateLimit(key: string): void {
  const now = Date.now();
  pruneIfStale(now);
  const existing = buckets.get(key);
  const lastRefill = existing?.lastRefill ?? now;
  const elapsedSec = (now - lastRefill) / 1000;
  const refilled = Math.min(BUCKET_CAPACITY, (existing?.tokens ?? BUCKET_CAPACITY) + elapsedSec * REFILL_PER_SECOND);
  if (refilled < 1) {
    buckets.set(key, { tokens: refilled, lastRefill: now });
    throw new Error("Slow down — too many actions in a short period. Try again in a minute.");
  }
  buckets.set(key, { tokens: refilled - 1, lastRefill: now });
}

export function _resetRateLimitsForTests(): void {
  buckets.clear();
  lastPrune = Date.now();
}
