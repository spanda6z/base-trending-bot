import { eq } from "drizzle-orm";
import { db } from "../db";
import { systemSettings } from "../db/schema";

const AUTO_PUBLISH_KEY = "auto_publish_enabled";

export async function isAutoPublishEnabled(): Promise<boolean> {
  const row = await db.query.systemSettings.findFirst({
    where: eq(systemSettings.key, AUTO_PUBLISH_KEY),
  });
  if (!row) return true;
  return (row.value as any)?.enabled !== false;
}

export async function setAutoPublish(enabled: boolean): Promise<void> {
  await db
    .insert(systemSettings)
    .values({
      key: AUTO_PUBLISH_KEY,
      value: { enabled },
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: { enabled }, updatedAt: new Date() },
    });
}
