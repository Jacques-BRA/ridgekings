import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: process.env.DATABASE_URL?.replace(/^file:/, "") ?? "./data/app.db" },
  verbose: true,
  strict: true,
});
