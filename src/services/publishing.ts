import { eq, and, lt } from "drizzle-orm";
import { createHash } from "crypto";
import { db } from "../db";
import { promotions, publishedPosts, promotionSlots } from "../db/schema";
import { getBot } from "../telegram/bot";
import {
  getOrganicTop,
  getActiveSponsored,
  formatOrganicMessage,
  formatSponsoredMessage,
} from "./trending";

function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

export async function publishTrendingToChannel(): Promise<{
  organic: boolean;
  sponsored: boolean;
  error?: string;
}> {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!channelId) {
    return { organic: false, sponsored: false, error: "TELEGRAM_CHANNEL_ID not set" };
  }

  const bot = getBot();
  let organic = false;
  let sponsored = false;

  try {
    const top = await getOrganicTop(10);
    const organicMsg = formatOrganicMessage(top);
    const oHash = contentHash(organicMsg);

    const recent = await db.query.publishedPosts.findFirst({
      where: and(
        eq(publishedPosts.channelId, channelId),
        eq(publishedPosts.postType, "organic"),
        eq(publishedPosts.contentHash, oHash)
      ),
    });

    if (!recent) {
      const sent = await bot.telegram.sendMessage(channelId, organicMsg, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
      await db.insert(publishedPosts).values({
        channelId,
        messageId: sent.message_id,
        postType: "organic",
        contentHash: oHash,
      });
      organic = true;
    }
  } catch (err: any) {
    console.error("[publish] organic failed", err);
  }

  try {
    const promos = await getActiveSponsored();
    if (promos.length) {
      const sponsoredMsg = formatSponsoredMessage(promos);
      if (sponsoredMsg) {
        const sHash = contentHash(sponsoredMsg);
        const recentS = await db.query.publishedPosts.findFirst({
          where: and(
            eq(publishedPosts.channelId, channelId),
            eq(publishedPosts.postType, "sponsored"),
            eq(publishedPosts.contentHash, sHash)
          ),
        });
        if (!recentS) {
          const sent = await bot.telegram.sendMessage(channelId, sponsoredMsg, {
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          });
          await db.insert(publishedPosts).values({
            channelId,
            messageId: sent.message_id,
            postType: "sponsored",
            contentHash: sHash,
          });
          sponsored = true;
        }
      }
    }
  } catch (err: any) {
    console.error("[publish] sponsored failed", err);
  }

  return { organic, sponsored };
}

export async function expirePromotions(): Promise<number> {
  const now = new Date();
  const expired = await db
    .select()
    .from(promotions)
    .where(and(eq(promotions.status, "ACTIVE"), lt(promotions.endsAt, now)))
    .limit(50);

  let count = 0;
  for (const p of expired) {
    await db
      .update(promotions)
      .set({ status: "EXPIRED", updatedAt: now })
      .where(eq(promotions.id, p.id));

    const slot = await db.query.promotionSlots.findFirst({
      where: eq(promotionSlots.packageCode, p.packageCode),
    });
    if (slot && slot.currentActive > 0) {
      await db
        .update(promotionSlots)
        .set({
          currentActive: slot.currentActive - 1,
          updatedAt: now,
        })
        .where(eq(promotionSlots.packageCode, p.packageCode));
    }
    count++;
  }
  return count;
}
