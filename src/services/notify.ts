import { getBot } from "../telegram/bot";
import { formatUsd } from "../lib/money";

export async function notifyPaymentConfirmed(params: {
  telegramId: number;
  tokenName?: string | null;
  tokenSymbol?: string | null;
  packageCode?: string | null;
  durationHours?: number | null;
  amountUsdCents?: number | null;
  receiptId?: string | null;
  txHash?: string | null;
}) {
  const bot = getBot();
  const {
    telegramId,
    tokenName,
    tokenSymbol,
    packageCode,
    durationHours,
    amountUsdCents,
    receiptId,
    txHash,
  } = params;

  const txLink = txHash ? `https://basescan.org/tx/${txHash}` : "—";

  const text =
    `PAYMENT CONFIRMED ✅\n\n` +
    `🚀 YOUR TOKEN IS NOW TRENDING!\n\n` +
    `Token: ${tokenName || "—"}\n` +
    `Symbol: $${tokenSymbol || "—"}\n` +
    `Network: BASE\n` +
    `Package: ${packageCode || "—"}\n` +
    `Duration: ${durationHours || "—"} HOURS\n` +
    `Amount Paid: ${amountUsdCents != null ? formatUsd(amountUsdCents) : "—"}\n` +
    `Status: ACTIVE\n` +
    `Receipt: ${receiptId || "—"}\n` +
    `Transaction: ${txLink}\n\n` +
    `Your token is now active in the selected sponsored trending package.`;

  try {
    await bot.telegram.sendMessage(telegramId, text, {
      disable_web_page_preview: true,
    } as any);
  } catch (err) {
    console.error("[notify] failed to message user", telegramId, err);
  }
}

export async function notifyAdmin(message: string) {
  const ids = (process.env.TELEGRAM_ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!ids.length) return;

  const bot = getBot();
  for (const id of ids) {
    try {
      await bot.telegram.sendMessage(Number(id), message);
    } catch (err) {
      console.error("[notify] admin message failed", id, err);
    }
  }
}
