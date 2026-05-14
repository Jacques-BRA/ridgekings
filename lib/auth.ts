import crypto from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { eq } from "drizzle-orm";

const COOKIE_NAME = "rk_uid";

function sign(value: string): string {
  const h = crypto.createHmac("sha256", env.COOKIE_SECRET).update(value).digest("hex");
  return `${value}.${h}`;
}

function verify(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac("sha256", env.COOKIE_SECRET).update(value).digest("hex");
  const sigBuf = Buffer.from(sig, "hex");
  const expBuf = Buffer.from(expected, "hex");
  const ok = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  return ok ? value : null;
}

export async function setCurrentUserId(userId: number): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, sign(String(userId)), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearCurrentUser(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const idStr = verify(raw);
  if (!idStr) return null;
  const id = Number(idStr);
  if (!Number.isFinite(id)) return null;
  const row = db.select().from(users).where(eq(users.id, id)).get();
  return row ?? null;
}

export function isAdmin(user: User | null): boolean {
  if (!user) return false;
  return user.name.toLowerCase() === env.ADMIN_USERNAME.toLowerCase();
}
