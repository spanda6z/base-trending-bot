import { Telegraf, Markup } from "telegraf";
import { BotContext } from "./bot";
import {
  mainMenuKeyboard,
  packageSelectKeyboard,
  durationKeyboard,
  confirmTokenKeyboard,
  skipCancelKeyboard,
  orderReviewKeyboard,
  currencyKeyboard,
  backToMenuKeyboard,
} from "./keyboards";
import { PACKAGE_LABELS, PACKAGE_PRICES } from "../lib/config";
import { formatUsd } from "../lib/money";
import {
  ensureUser,
  getActiveSession,
  createSession,
  updateSession,
  cancelSession,
} from "../services/session";
import { scanToken, formatScanMessage } from "../services/tokenScanner";
import { createInvoice, formatInvoiceMessage } from "../services/payment";
import { getOrganicTop, formatOrganicMessage } from "../services/trending";
import { TREASURY_ADDRESS } from "../lib/viem";

export function registerHandlers(bot: Telegraf<BotContext>) {
  bot.start(async (ctx) => {
    if (!ctx.from) return;
    await ensureUser(ctx.from.id, {
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
    });
    const name = ctx.from.first_name || "there";
    await ctx.reply(
      `🚀 *Welcome to Base Trending*\n\nPremium Base Network token discovery & promotion platform.\n\nHello ${name}! Use the buttons below.`,
      { parse_mode: "Markdown", ...mainMenuKeyboard() }
    );
  });

  bot.help(async (ctx) => {
    await ctx.reply(
      `*Base Trending Help*\n\n• 🚀 Buy Trending\n• 📊 Trending Now\n• 🆕 New Pairs\n• 🔍 Search Token\n• 💎 Promotions\n\nPayments: ETH or USDC on Base.\nPaid placements are marked SPONSORED.`,
      { parse_mode: "Markdown", ...backToMenuKeyboard() }
    );
  });

  bot.action("main_menu", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(`🚀 *Base Trending*\n\nChoose an option:`, {
      parse_mode: "Markdown",
      ...mainMenuKeyboard(),
    });
  });

  bot.action("buy_trending", async (ctx) => {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    const user = await ensureUser(ctx.from.id, {
      username: ctx.from.username,
      firstName: ctx.from.first_name,
    });
    await createSession(ctx.from.id, user.id);
    await ctx.editMessageText(
      `🚀 *BUY TRENDING*\n\nSelect a sponsored package:\n\n🥇 *TOP 1*\n🔥 *TOP 5*\n📈 *TOP 10*\n\nAll placements are clearly marked *SPONSORED*.`,
      { parse_mode: "Markdown", ...packageSelectKeyboard() }
    );
  });

  bot.action(/^pkg_(TOP1|TOP5|TOP10)$/, async (ctx) => {
    if (!ctx.from) return;
    const packageCode = ctx.match[1] as "TOP1" | "TOP5" | "TOP10";
    await ctx.answerCbQuery();
    const session = await getActiveSession(ctx.from.id);
    if (!session) {
      await ctx.editMessageText("Session expired. Start again.", {
        ...mainMenuKeyboard(),
      });
      return;
    }
    await updateSession(session.id, { packageCode, step: "SELECT_DURATION" });
    await ctx.editMessageText(
      `${PACKAGE_LABELS[packageCode]}\n\nSelect duration:`,
      { parse_mode: "Markdown", ...durationKeyboard(packageCode) }
    );
  });

  bot.action(/^dur_(TOP1|TOP5|TOP10)_(\d+)$/, async (ctx) => {
    if (!ctx.from) return;
    const packageCode = ctx.match[1] as "TOP1" | "TOP5" | "TOP10";
    const hours = Number(ctx.match[2]) as 3 | 6 | 12;
    const price = PACKAGE_PRICES[packageCode][hours];
    await ctx.answerCbQuery();
    const session = await getActiveSession(ctx.from.id);
    if (!session) {
      await ctx.editMessageText("Session expired.", { ...mainMenuKeyboard() });
      return;
    }
    await updateSession(session.id, {
      packageCode,
      durationHours: hours,
      priceUsdCents: price,
      step: "ENTER_CONTRACT",
    });
    await ctx.editMessageText(
      `✅ *${PACKAGE_LABELS[packageCode]}*\n⏱ ${hours} hours\n💰 ${formatUsd(price)}\n\nEnter your Base token contract address (0x...):`,
      { parse_mode: "Markdown" }
    );
  });

  bot.on("text", async (ctx) => {
    if (!ctx.from || !ctx.message || !("text" in ctx.message)) return;
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;

    const session = await getActiveSession(ctx.from.id);
    if (!session) return;

    if (session.step === "ENTER_CONTRACT") {
      const scan = await scanToken(text);
      const msg = formatScanMessage(scan);
      if (!scan.valid) {
        await ctx.reply(msg, { parse_mode: "Markdown" });
        return;
      }
      await updateSession(session.id, {
        tokenAddress: scan.address,
        tokenName: scan.name,
        tokenSymbol: scan.symbol,
        step: "TOKEN_SCAN_CONFIRM",
      });
      await ctx.reply(msg, {
        parse_mode: "Markdown",
        ...confirmTokenKeyboard(),
      });
      return;
    }

    if (session.step === "ENTER_TELEGRAM") {
      await updateSession(session.id, {
        telegramLink: text.startsWith("http") ? text : null,
        step: "ENTER_X",
      });
      await ctx.reply(`Enter X / Twitter link (or skip):`, {
        ...skipCancelKeyboard("skip_x"),
      });
      return;
    }

    if (session.step === "ENTER_X") {
      await updateSession(session.id, {
        xLink: text.startsWith("http") ? text : null,
        step: "ENTER_WEBSITE",
      });
      await ctx.reply(`Enter website (or skip):`, {
        ...skipCancelKeyboard("skip_website"),
      });
      return;
    }

    if (session.step === "ENTER_WEBSITE") {
      await updateSession(session.id, {
        websiteLink: text.startsWith("http") ? text : null,
        step: "ORDER_REVIEW",
      });
      await showOrderReview(ctx);
      return;
    }
  });

  bot.action("confirm_token", async (ctx) => {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    const session = await getActiveSession(ctx.from.id);
    if (!session || session.step !== "TOKEN_SCAN_CONFIRM") return;
    await updateSession(session.id, { step: "ENTER_TELEGRAM" });
    await ctx.editMessageText(`Enter Telegram group link (or skip):`, {
      ...skipCancelKeyboard("skip_telegram"),
    });
  });

  bot.action("skip_telegram", async (ctx) => {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    const session = await getActiveSession(ctx.from.id);
    if (!session) return;
    await updateSession(session.id, { telegramLink: null, step: "ENTER_X" });
    await ctx.editMessageText(`Enter X / Twitter link (or skip):`, {
      ...skipCancelKeyboard("skip_x"),
    });
  });

  bot.action("skip_x", async (ctx) => {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    const session = await getActiveSession(ctx.from.id);
    if (!session) return;
    await updateSession(session.id, { xLink: null, step: "ENTER_WEBSITE" });
    await ctx.editMessageText(`Enter website (or skip):`, {
      ...skipCancelKeyboard("skip_website"),
    });
  });

  bot.action("skip_website", async (ctx) => {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    const session = await getActiveSession(ctx.from.id);
    if (!session) return;
    await updateSession(session.id, { websiteLink: null, step: "ORDER_REVIEW" });
    await showOrderReview(ctx);
  });

  bot.action("confirm_pay", async (ctx) => {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    const session = await getActiveSession(ctx.from.id);
    if (!session || session.step !== "ORDER_REVIEW") return;
    await updateSession(session.id, { step: "SELECT_CURRENCY" });
    await ctx.editMessageText(
      `Select payment currency:\n\nTreasury: \`${TREASURY_ADDRESS}\``,
      { parse_mode: "Markdown", ...currencyKeyboard() }
    );
  });

  bot.action(/^pay_(ETH|USDC)$/, async (ctx) => {
    if (!ctx.from) return;
    const currency = ctx.match[1] as "ETH" | "USDC";
    await ctx.answerCbQuery();
    const session = await getActiveSession(ctx.from.id);
    if (!session || !session.priceUsdCents) {
      await ctx.reply("Session expired.");
      return;
    }
    const invoice = await createInvoice({
      sessionId: session.id,
      userId: session.userId,
      amountUsdCents: session.priceUsdCents,
      currency,
    });
    await updateSession(session.id, { step: "AWAITING_PAYMENT" });
    await ctx.editMessageText(formatInvoiceMessage(invoice), {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🔄 Check Status", `check_inv_${invoice.id}`)],
        [Markup.button.callback("❌ Cancel", "cancel_session")],
      ]),
    });
  });

  bot.action(/^check_inv_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery("Checking payments…");
    try {
      const { enqueueJob, processQueuedJobs } = await import("../services/jobs");
      await enqueueJob("CHECK_PAYMENTS", {}, { uniqueKey: "payments-user-check" });
      await processQueuedJobs(1);
      await ctx.reply(
        "Payment check requested. If your transfer is confirmed on Base, you will receive a confirmation message shortly."
      );
    } catch {
      await ctx.reply("Could not run check right now. An admin can run /checkpayments.");
    }
  });

  bot.action("trending_now", async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const top = await getOrganicTop(10);
      await ctx.editMessageText(formatOrganicMessage(top), {
        parse_mode: "Markdown",
        ...backToMenuKeyboard(),
      });
    } catch {
      await ctx.editMessageText("Trending data preparing…", {
        ...backToMenuKeyboard(),
      });
    }
  });

  bot.action("new_pairs", async (ctx) => {
    await ctx.answerCbQuery("Coming soon.");
  });

  bot.action("search_token", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("Send a Base token address (0x…) to scan:");
  });

  bot.action("my_promotions", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("Your promotions appear here after payment.");
  });

  bot.action("help", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `*Help*\n\nPromote with verified on-chain payments.\nOrganic rankings are never influenced by paid placements.`,
      { parse_mode: "Markdown", ...backToMenuKeyboard() }
    );
  });

  bot.action("cancel_session", async (ctx) => {
    if (!ctx.from) return;
    await ctx.answerCbQuery("Cancelled");
    const session = await getActiveSession(ctx.from.id);
    if (session) await cancelSession(session.id);
    await ctx.editMessageText("Order cancelled.", { ...mainMenuKeyboard() });
  });
}

async function showOrderReview(ctx: any) {
  const session = await getActiveSession(ctx.from.id);
  if (!session) return;
  const pkg = session.packageCode as "TOP1" | "TOP5" | "TOP10";
  const msg =
    `*PROMOTION ORDER REVIEW*\n\n` +
    `Token: ${session.tokenName || "—"}\n` +
    `Symbol: $${session.tokenSymbol || "—"}\n` +
    `Contract: \`${session.tokenAddress}\`\n` +
    `Package: ${PACKAGE_LABELS[pkg] || session.packageCode}\n` +
    `Duration: ${session.durationHours}h\n` +
    `Price: ${formatUsd(session.priceUsdCents || 0)}\n` +
    `Telegram: ${session.telegramLink || "Not provided"}\n` +
    `X: ${session.xLink || "Not provided"}\n` +
    `Website: ${session.websiteLink || "Not provided"}`;
  await ctx.reply(msg, {
    parse_mode: "Markdown",
    ...orderReviewKeyboard(),
  });
}
