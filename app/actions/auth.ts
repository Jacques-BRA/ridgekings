"use server";

import { z } from "zod";
import { db } from "@/db";
import { users, transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { setCurrentUserId, clearCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { revalidatePath } from "next/cache";

const SelectOrCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
});

export async function selectOrCreateUser(formData: FormData): Promise<void> {
  const parsed = SelectOrCreateSchema.parse({ name: formData.get("name") });
  const existing = db.select().from(users).where(eq(users.name, parsed.name)).get();
  let userId: number;
  if (existing) {
    userId = existing.id;
  } else {
    const inserted = db
      .insert(users)
      .values({ name: parsed.name, balance: env.STARTING_BALANCE })
      .returning({ id: users.id })
      .get();
    userId = inserted.id;
    db.insert(transactions)
      .values({
        userId,
        betId: null,
        amount: env.STARTING_BALANCE,
        kind: "seed",
        note: "Initial seed balance",
      })
      .run();
  }
  await setCurrentUserId(userId);
  revalidatePath("/", "layout");
}

export async function logoutAction(): Promise<void> {
  await clearCurrentUser();
  revalidatePath("/", "layout");
}
