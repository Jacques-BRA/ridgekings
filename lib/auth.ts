import { db, sqlite } from "@/db";
import { users, type User } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth as nextAuth } from "@/auth";
import { env } from "./env";

function isDevBypass(): boolean {
  return env.NODE_ENV !== "production" && env.DEV_BYPASS_AUTH === "1";
}

export async function getCurrentUser(): Promise<User | null> {
  if (isDevBypass()) {
    const email = (env.DEV_BYPASS_EMAIL ?? "dev@local.test").toLowerCase();
    const name = env.DEV_BYPASS_NAME ?? "Local Dev";
    return getOrCreateUser(email, name);
  }

  const session = await nextAuth();
  const rawEmail = session?.user?.email ?? null;
  if (!rawEmail) return null;
  const email = rawEmail.toLowerCase();
  const rawName = session?.user?.name?.trim() ?? "";
  const name = rawName || email.split("@")[0] || "user";
  return getOrCreateUser(email, name);
}

function getOrCreateUser(email: string, name: string): User {
  const byEmail = db.select().from(users).where(eq(users.email, email)).get();
  if (byEmail) return byEmail;

  // Legacy fallback: existing users created before the SSO swap have no email yet.
  // Match by name so they keep their balance, then write the email forward.
  const byName = db.select().from(users).where(eq(users.name, name)).get();
  if (byName) {
    db.update(users).set({ email }).where(eq(users.id, byName.id)).run();
    return db.select().from(users).where(eq(users.id, byName.id)).get()!;
  }

  const tx = sqlite.transaction(() => {
    db.insert(users).values({ email, name, balance: env.STARTING_BALANCE }).run();
    return db.select().from(users).where(eq(users.email, email)).get()!;
  });
  return tx();
}

export function isAdmin(user: User | null): boolean {
  if (!user) return false;
  return user.name.toLowerCase() === env.ADMIN_USERNAME.toLowerCase();
}
