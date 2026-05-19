import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().default("file:./data/app.db"),
  ADMIN_USERNAME: z.string().min(1).default("admin"),
  STARTING_BALANCE: z.coerce.number().int().nonnegative().default(1000),
  WEEKLY_STIPEND: z.coerce.number().int().nonnegative().default(200),
  COOKIE_SECRET: z.string().min(16, "COOKIE_SECRET must be at least 16 chars"),

  // Cloudflare Access — required in production, optional in dev (use DEV_BYPASS_CF_ACCESS=1)
  CF_ACCESS_TEAM_DOMAIN: z.string().optional(),
  CF_ACCESS_AUD: z.string().optional(),

  // Local-dev escape hatch. Set to "1" to skip JWT verification and treat every request
  // as a hard-coded user. Refused at runtime when NODE_ENV=production.
  DEV_BYPASS_CF_ACCESS: z.string().optional(),
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
