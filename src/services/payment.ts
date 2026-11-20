import { eq, and, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  parseEther,
  formatEther,
  type Address,
  type Hash,
  getAddress,
} from "viem";
import { db } from "../db";
import {
  invoices,
  payments,
  receipts,
  promotions,
  promotionSlots,
  promotionSessions,
} from "../db/schema";
import { env } from "../lib/config";
import {
  getPublicClient,
  USDC_ADDRESS,
  TREASURY_ADDRESS,
} from "../lib/viem";
import { usdCentsToUsdc, formatUsd } from "../lib/money";
import { notifyPaymentConfirmed, notifyAdmin } from "./notify";

export async function createInvoice(params: {
  sessionId: number;
  userId: number;
  amountUsdCents: number;
  currency: "ETH" | "USDC";
  ethPriceUsd?: string;
}) {
  const { sessionId, userId, amountUsdCents, currency } = params;

  let expectedAmount: string;
  if (currency === "USDC") {
    expectedAmount = usdCentsToUsdc(amountUsdCents).toString();
  } else {
    const price = params.ethPriceUsd || "3000";
    const usd = amountUsdCents / 100;
    const ethAmount = usd / parseFloat(price);
    expectedAmount = parseEther(ethAmount.toFixed(8)).toString();
  }

  const expiresAt = new Date(
    Date.now() + (env.INVOICE_EXPIRY_MINUTES || 30) * 60 * 1000
  );

  const invoiceId = `INV-${nanoid(12).toUpperCase()}`;

  const [invoice] = await db
    .insert(invoices)
    .values({
      invoiceId,
      sessionId,
      userId,
      amountUsdCents,
      currency,
      expectedAmount,
      treasuryAddress: TREASURY_ADDRESS,
      status: "AWAITING_PAYMENT",
      expiresAt,
    })
    .returning();

  return invoice;
}

export function formatInvoiceMessage(invoice: {
  invoiceId: string;
  currency: string;
  expectedAmount: string;
  amountUsdCents: number;
  expiresAt: Date;
}): string {
  const amountDisplay =
    invoice.currency === "ETH"
      ? `${formatEther(BigInt(invoice.expectedAmount))} ETH`
      : `${(Number(invoice.expectedAmount) / 1e6).toFixed(2)} USDC`;

  return (
    `🧾 *PAYMENT INVOICE*\n\n` +
    `*Invoice:* \`${invoice.invoiceId}\`\n` +
    `*Amount:* ${amountDisplay} (≈ ${formatUsd(invoice.amountUsdCents)})\n` +
    `*Network:* Base (Chain ID 8453)\n` +
    `*Treasury:* \`${TREASURY_ADDRESS}\`\n` +
    `*Currency:* ${invoice.currency}\n` +
    `*Expires:* ${invoice.expiresAt.toUTCString()}\n\n` +
    `Send the *exact* amount to the treasury address above.\n` +
    `Promotion activates automatically after on-chain confirmation.`
  );
}

export async function verifyPayment(
  invoiceDbId: number,
  txHash: Hash
): Promise<{ success: boolean; reason?: string }> {
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceDbId),
  });
  if (!invoice) return { success: false, reason: "Invoice not found" };
  if (invoice.status === "PAID")
    return { success: false, reason: "Already paid" };
  if (invoice.status === "EXPIRED")
    return { success: false, reason: "Invoice expired" };

  const existing = await db.query.payments.findFirst({
    where: eq(payments.txHash, txHash),
  });
  if (existing) return { success: false, reason: "Transaction already used" };

  const client = getPublicClient();
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  if (!receipt || receipt.status !== "success") {
    return { success: false, reason: "Transaction failed or not found" };
  }

  const confirmations = await client.getBlockNumber().then(
    (bn) => Number(bn - receipt.blockNumber)
  );

  let matched = false;
  let amount = "0";
  let fromAddress: string | undefined;

  if (invoice.currency === "ETH") {
    const tx = await client.getTransaction({ hash: txHash });
    if (
      tx.to &&
      getAddress(tx.to) === getAddress(TREASURY_ADDRESS) &&
      tx.value >= BigInt(invoice.expectedAmount)
    ) {
      matched = true;
      amount = tx.value.toString();
      fromAddress = tx.from;
    }
  } else {
    const logs = await client.getLogs({
      address: USDC_ADDRESS,
      event: {
        type: "event",
        name: "Transfer",
        inputs: [
          { name: "from", type: "address", indexed: true },
          { name: "to", type: "address", indexed: true },
          { name: "value", type: "uint256", indexed: false },
        ],
      },
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    for (const log of logs) {
      const to = (log as any).args?.to as Address;
      const value = (log as any).args?.value as bigint;
      const from = (log as any).args?.from as Address;
      if (
        to &&
        getAddress(to) === getAddress(TREASURY_ADDRESS) &&
        value >= BigInt(invoice.expectedAmount)
      ) {
        matched = true;
        amount = value.toString();
        fromAddress = from;
        break;
      }
    }
  }

  if (!matched) {
    return { success: false, reason: "Payment amount or recipient mismatch" };
  }

  const required = env.PROMOTION_PAYMENT_CONFIRMATIONS || 3;
  const status = confirmations >= required ? "PAID" : "CONFIRMING";

  await db.insert(payments).values({
    invoiceId: invoice.id,
    txHash,
    fromAddress,
    amount,
    currency: invoice.currency,
    blockNumber: Number(receipt.blockNumber),
    confirmations,
    confirmedAt: status === "PAID" ? new Date() : null,
  });

  await db
    .update(invoices)
    .set({
      status,
      paymentTxHash: txHash,
      paidAt: status === "PAID" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoice.id));

  if (status === "PAID") {
    await activatePromotion(invoice.id);
  }

  return { success: true };
}

export async function activatePromotion(invoiceDbId: number) {
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceDbId),
  });
  if (!invoice || invoice.status !== "PAID") return;

  const existingPromo = await db.query.promotions.findFirst({
    where: eq(promotions.invoiceId, invoiceDbId),
  });
  if (existingPromo) return existingPromo;

  const session = await db.query.promotionSessions.findFirst({
    where: eq(promotionSessions.id, invoice.sessionId),
  });
  if (!session) return;

  const durationHours = session.durationHours || 6;
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + durationHours * 60 * 60 * 1000);

  const packageCode = session.packageCode || "TOP10";
  const slot = await db.query.promotionSlots.findFirst({
    where: eq(promotionSlots.packageCode, packageCode),
  });

  const receiptId = `RCPT-${nanoid(12).toUpperCase()}`;
  const [receipt] = await db
    .insert(receipts)
    .values({
      receiptId,
      invoiceId: invoice.id,
      userId: invoice.userId,
      telegramId: session.telegramId,
      tokenName: session.tokenName,
      tokenSymbol: session.tokenSymbol,
      tokenAddress: session.tokenAddress,
      packageCode: session.packageCode,
      durationHours,
      amountUsdCents: invoice.amountUsdCents,
      paymentCurrency: invoice.currency,
      paymentAmount: invoice.expectedAmount,
      txHash: invoice.paymentTxHash,
      treasuryAddress: invoice.treasuryAddress,
      promotionStartsAt: startsAt,
      promotionEndsAt: endsAt,
      snapshot: { session, invoice },
    })
    .returning();

  const [promo] = await db
    .insert(promotions)
    .values({
      sessionId: session.id,
      invoiceId: invoice.id,
      receiptId: receipt.id,
      userId: invoice.userId,
      tokenAddress: session.tokenAddress!,
      packageCode,
      durationHours,
      startsAt,
      endsAt,
      status: "ACTIVE",
      telegramLink: session.telegramLink,
      xLink: session.xLink,
      websiteLink: session.websiteLink,
    })
    .returning();

  if (slot) {
    await db
      .update(promotionSlots)
      .set({
        currentActive: slot.currentActive + 1,
        updatedAt: new Date(),
      })
      .where(eq(promotionSlots.packageCode, packageCode));
  }

  await db
    .update(promotionSessions)
    .set({ status: "COMPLETED", step: "COMPLETED", updatedAt: new Date() })
    .where(eq(promotionSessions.id, session.id));

  try {
    await notifyPaymentConfirmed({
      telegramId: session.telegramId,
      tokenName: session.tokenName,
      tokenSymbol: session.tokenSymbol,
      packageCode: session.packageCode,
      durationHours,
      amountUsdCents: invoice.amountUsdCents,
      receiptId: receipt.receiptId,
      txHash: invoice.paymentTxHash,
    });
    await notifyAdmin(
      `✅ Promotion activated\nToken: ${session.tokenName} ($${session.tokenSymbol})\nPackage: ${packageCode}\nUser: ${session.telegramId}\nTx: ${invoice.paymentTxHash}`
    );
  } catch (e) {
    console.error("[activate] notify failed", e);
  }

  return { promo, receipt };
}

export async function expireOldInvoices() {
  const now = new Date();
  await db
    .update(invoices)
    .set({ status: "EXPIRED", updatedAt: now })
    .where(
      and(
        eq(invoices.status, "AWAITING_PAYMENT"),
        lt(invoices.expiresAt, now)
      )
    );
}
