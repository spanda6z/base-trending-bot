import { eq, desc, count } from "drizzle-orm";
import { db } from "../db";
import {
  adminAuditLogs,
  promotions,
  invoices,
  receipts,
  users,
} from "../db/schema";
import { formatUsd } from "../lib/money";

export async function auditLog(
  actorTelegramId: number,
  action: string,
  targetType?: string,
  targetId?: string,
  metadata?: Record<string, unknown>
) {
  await db.insert(adminAuditLogs).values({
    actorTelegramId,
    action,
    targetType,
    targetId,
    metadata: metadata || {},
  });
}

export async function getActivePromotions(limit = 20) {
  return db
    .select()
    .from(promotions)
    .where(eq(promotions.status, "ACTIVE"))
    .orderBy(desc(promotions.startsAt))
    .limit(limit);
}

export async function getPendingInvoices(limit = 20) {
  return db
    .select()
    .from(invoices)
    .where(eq(invoices.status, "AWAITING_PAYMENT"))
    .orderBy(desc(invoices.createdAt))
    .limit(limit);
}

export async function getPlatformStats() {
  const [userCount] = await db.select({ c: count() }).from(users);
  const [activePromos] = await db
    .select({ c: count() })
    .from(promotions)
    .where(eq(promotions.status, "ACTIVE"));
  const [pendingInv] = await db
    .select({ c: count() })
    .from(invoices)
    .where(eq(invoices.status, "AWAITING_PAYMENT"));
  const [paidInv] = await db
    .select({ c: count() })
    .from(invoices)
    .where(eq(invoices.status, "PAID"));
  const [receiptCount] = await db.select({ c: count() }).from(receipts);

  const paidRows = await db
    .select({ amountUsdCents: invoices.amountUsdCents })
    .from(invoices)
    .where(eq(invoices.status, "PAID"));
  const revenueCents = paidRows.reduce((s, r) => s + (r.amountUsdCents || 0), 0);

  return {
    users: userCount?.c ?? 0,
    activePromotions: activePromos?.c ?? 0,
    pendingInvoices: pendingInv?.c ?? 0,
    paidInvoices: paidInv?.c ?? 0,
    receipts: receiptCount?.c ?? 0,
    revenueUsd: formatUsd(revenueCents),
  };
}

export function formatPromotionsList(
  rows: Awaited<ReturnType<typeof getActivePromotions>>
): string {
  if (!rows.length) return "No active promotions.";
  return rows
    .map(
      (p, i) =>
        `${i + 1}. ${p.packageCode} | \`${p.tokenAddress.slice(0, 10)}…\`\n` +
        `   until ${p.endsAt.toISOString()} | ${p.status}`
    )
    .join("\n");
}

export function formatPendingList(
  rows: Awaited<ReturnType<typeof getPendingInvoices>>
): string {
  if (!rows.length) return "No pending invoices.";
  return rows
    .map(
      (inv, i) =>
        `${i + 1}. ${inv.invoiceId} | ${inv.currency} | ${formatUsd(inv.amountUsdCents)}\n` +
        `   expires ${inv.expiresAt.toISOString()}`
    )
    .join("\n");
}
