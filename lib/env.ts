import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().default("file:./data/app.db"),
  ADMIN_USERNAME: z.string().min(1).default("admin"),
  STARTING_BALANCE: z.coerce.number().int().nonnegative().default(1000),
  WEEKLY_STIPEND: z.coerce.number().int().nonnegative().default(200),
  COOKIE_SECRET: z.string().min(16, "COOKIE_SECRET must be at least 16 chars"),
});

export const env = EnvSchema.parse(process.env);
export type Env = z.infer<typeof EnvSchema>;
