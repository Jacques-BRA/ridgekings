import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["lib/**/*.test.ts", "tests/unit/**/*.test.ts"],
    passWithNoTests: true,
    env: {
      COOKIE_SECRET: "test-cookie-secret-32-bytes-long-xxxxxx",
      CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
      CF_ACCESS_AUD: "test-aud",
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
