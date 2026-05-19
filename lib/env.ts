import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().default("file:./data/app.db"),
  ADMIN_USERNAME: z.string().min(1).default("admin"),
  STARTING_BALANCE: z.coerce.number().int().nonnegative().default(1000),
  WEEKLY_STIPEND: z.coerce.number().int().nonnegative().default(200),
  COOKIE_SECRET: z.string().min(16, "COOKIE_SECRET must be at least 16 chars"),

  // Auth.js / next-auth v5 — required in production, optional in dev (use DEV_BYPASS_AUTH=1).
  // AUTH_SECRET signs session cookies. Generate with: openssl rand -base64 33
  AUTH_SECRET: z.string().min(16).optional(),
  AUTH_MICROSOFT_ENTRA_ID_ID: z.string().optional(),
  AUTH_MICROSOFT_ENTRA_ID_SECRET: z.string().optional(),
  AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: z.string().optional(),

  // Local-dev escape hatch. Set to "1" to bypass Auth.js and treat every request
  // as a hard-coded user. Refused at runtime when NODE_ENV=production.
  DEV_BYPASS_AUTH: z.string().optional(),
  DEV_BYPASS_EMAIL: z.string().email().optional(),
  DEV_BYPASS_NAME: z.string().optional(),

  // Teams notifications — when unset the notify helpers no-op.
  TEAMS_WEBHOOK_URL: z.string().url().optional(),
  TEAMS_NOTIFICATIONS_ENABLED: z.string().optional(),

  // Public URL for deep-link buttons in Teams cards.
  APP_PUBLIC_URL: z.string().url().optional(),
});

export const env = EnvSchema.parse(process.env);
export type Env = z.infer<typeof EnvSchema>;
