import { headers } from "next/headers";
import { db, sqlite } from "@/db";
import { users, type User } from "@/db/schema";
import { eq } from "drizzle-orm";
import { env } from "./env";

const HEADER_EMAIL = "x-rk-user-email";
const HEADER_NAME = "x-rk-user-name";

export async function getCurrentUser(): Promise<User | null> {
  const h = await headers();
  const email = h.get(HEADER_EMAIL)?.trim().toLowerCase() ?? null;
  const rawName = (h.get(HEADER_NAME) ?? "").trim();
  const name = rawName || (email?.split("@")[0] ?? "user");
  if (!email) return null;
  return getOrCreateUser(email, name);
}

function getOrCreateUser(email: string, name: string): User {
  const byEmail = db.select().from(users).where(eq(users.email, email)).get();
  if (byEmail) return byEmail;

  // Legacy fallback: existing users created before the CF Access swap have no email yet.
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

export function cfAccessLogoutUrl(): string | null {
  if (!env.CF_ACCESS_TEAM_DOMAIN) return null;
  return `https://${env.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/logout`;
}
