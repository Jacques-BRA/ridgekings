#!/usr/bin/env node
// Container entrypoint. Replaces the previous `sh -c "migrate && next start"`
// which lost stdout from sh builtins (echo) due to buffering quirks under
// PID-1 sh-with-piped-stdout. Doing everything in Node gives us reliable
// logging end-to-end.

import { spawn, execFileSync } from "node:child_process";

const port = process.env.PORT ?? "3000";
const host = process.env.HOSTNAME ?? "0.0.0.0";

console.log(`[startup] node ${process.version}, cwd=${process.cwd()}, port=${port}`);
console.log("[startup] running migrations...");
try {
  execFileSync(process.execPath, ["scripts/migrate.mjs"], { stdio: "inherit" });
} catch (err) {
  console.error("[startup] migrate failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
console.log(`[startup] migrations OK, launching Next.js on ${host}:${port}`);

const next = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-H", host, "-p", port],
  { stdio: "inherit" },
);

next.on("error", (err) => {
  console.error("[startup] failed to spawn next:", err.message);
  process.exit(1);
});
next.on("exit", (code, signal) => {
  console.log(`[startup] next exited code=${code} signal=${signal}`);
  process.exit(code ?? 1);
});

// Forward signals to the child so graceful shutdown works.
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`[startup] received ${sig}, forwarding to next`);
    next.kill(sig);
  });
}
