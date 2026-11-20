import { db } from "../src/db";
import { promotionSlots, systemSettings } from "../src/db/schema";

async function main() {
  const slots = [
    { packageCode: "TOP1", maxSlots: 1, currentActive: 0, label: "Top 1 Sponsored" },
    { packageCode: "TOP5", maxSlots: 5, currentActive: 0, label: "Top 5 Sponsored" },
    { packageCode: "TOP10", maxSlots: 10, currentActive: 0, label: "Top 10 Sponsored" },
  ];

  for (const s of slots) {
    await db
      .insert(promotionSlots)
      .values(s)
      .onConflictDoUpdate({
        target: promotionSlots.packageCode,
        set: { maxSlots: s.maxSlots, label: s.label, updatedAt: new Date() },
      });
  }

  await db
    .insert(systemSettings)
    .values({
      key: "auto_publish_enabled",
      value: { enabled: true },
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  console.log("Seed complete");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
