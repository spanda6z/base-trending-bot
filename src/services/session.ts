import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { users, promotionSessions } from "../db/schema";

export async function ensureUser(
  telegramId: number,
  meta?: { username?: string; firstName?: string; lastName?: string }
) {
  const existing = await db.query.users.findFirst({
    where: eq(users.telegramId, telegramId),
  });
  if (existing) {
    if (meta) {
      await db
        .update(users)
        .set({
          username: meta.username ?? existing.username,
          firstName: meta.firstName ?? existing.firstName,
          lastName: meta.lastName ?? existing.lastName,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id));
    }
    return existing;
  }
  const [row] = await db
    .insert(users)
    .values({
      telegramId,
      username: meta?.username,
      firstName: meta?.firstName,
      lastName: meta?.lastName,
    })
    .returning();
  return row;
}

export async function getActiveSession(telegramId: number) {
  return db.query.promotionSessions.findFirst({
    where: and(
      eq(promotionSessions.telegramId, telegramId),
      eq(promotionSessions.status, "ACTIVE")
    ),
    orderBy: [desc(promotionSessions.createdAt)],
  });
}

export async function createSession(telegramId: number, userId: number) {
  // cancel any previous active
  await db
    .update(promotionSessions)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(
      and(
        eq(promotionSessions.telegramId, telegramId),
        eq(promotionSessions.status, "ACTIVE")
      )
    );

  const [row] = await db
    .insert(promotionSessions)
    .values({
      userId,
      telegramId,
      step: "MAIN_MENU",
      status: "ACTIVE",
    })
    .returning();
  return row;
}

export async function updateSession(
  sessionId: number,
  data: Partial<typeof promotionSessions.$inferInsert>
) {
  const [row] = await db
    .update(promotionSessions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(promotionSessions.id, sessionId))
    .returning();
  return row;
}

export async function cancelSession(sessionId: number) {
  return updateSession(sessionId, { status: "CANCELLED", step: "CANCELLED" });
}
