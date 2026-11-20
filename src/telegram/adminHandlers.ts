import { Telegraf, Markup } from "telegraf";
import { BotContext, isAdmin } from "./bot";
import { enqueueJob, processQueuedJobs } from "../services/jobs";
import {
  auditLog,
  getActivePromotions,
  getPendingInvoices,
  getPlatformStats,
  formatPromotionsList,
  formatPendingList,
} from "../services/admin";
import { setAutoPublish, isAutoPublishEnabled } from "../services/settings";

function adminKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📢 Publish", "admin_publish"),
      Markup.button.callback("🔄 Refresh", "admin_refresh"),
    ],
    [
      Markup.button.callback("🔎 Scan pairs", "admin_scanpairs"),
      Markup.button.callback("💳 Check payments", "admin_checkpayments"),
    ],
    [
      Markup.button.callback("🔥 Promotions", "admin_promotions"),
      Markup.button.callback("🧾 Pending", "admin_pending"),
    ],
    [
      Markup.button.callback("📊 Stats", "admin_stats"),
      Markup.button.callback("⚙️ Jobs", "admin_jobs"),
    ],
    [
      Markup.button.callback("⏸ Pause publish", "admin_pause"),
      Markup.button.callback("▶️ Resume publish", "admin_resume"),
    ],
  ]);
}

async function requireAdmin(ctx: BotContext): Promise<number | null> {
  if (!ctx.from || !isAdmin(ctx.from.id)) {
    await ctx.reply("Unauthorized.");
    return null;
  }
  return ctx.from.id;
}

export function registerAdminHandlers(bot: Telegraf<BotContext>) {
  bot.command("admin", async (ctx) => {
    const id = await requireAdmin(ctx);
    if (id == null) return;
    await auditLog(id, "ADMIN_OPEN_DASHBOARD");
    const auto = await isAutoPublishEnabled();
    await ctx.reply(
      `*Admin Dashboard*\n\nAuto-publish: *${auto ? "ON" : "PAUSED"}*\n\nUse buttons or commands.`,
      { parse_mode: "Markdown", ...adminKeyboard() }
    );
  });

  bot.command("publish", async (ctx) => {
    const id = await requireAdmin(ctx);
    if (id == null) return;
    const job = await enqueueJob("PUBLISH_TRENDING", {}, { uniqueKey: "publish-manual" });
    await auditLog(id, "ENQUEUE_PUBLISH", "job", job.jobKey);
    await processQueuedJobs(2);
    await ctx.reply(`📢 Publish done.\n\`${job.jobKey}\``, { parse_mode: "Markdown" });
  });

  bot.command("refresh", async (ctx) => {
    const id = await requireAdmin(ctx);
    if (id == null) return;
    const job = await enqueueJob("REFRESH_MARKET", {}, { uniqueKey: "refresh-manual" });
    await auditLog(id, "ENQUEUE_REFRESH", "job", job.jobKey);
    await processQueuedJobs(2);
    await ctx.reply(`🔄 Refresh queued.\n\`${job.jobKey}\``, { parse_mode: "Markdown" });
  });

  bot.command("scanpairs", async (ctx) => {
    const id = await requireAdmin(ctx);
    if (id == null) return;
    const job = await enqueueJob("SCAN_PAIRS", {}, { uniqueKey: "scanpairs-manual" });
    await auditLog(id, "ENQUEUE_SCAN_PAIRS", "job", job.jobKey);
    await processQueuedJobs(2);
    await ctx.reply(`🔎 Scan queued.\n\`${job.jobKey}\``, { parse_mode: "Markdown" });
  });

  bot.command("checkpayments", async (ctx) => {
    const id = await requireAdmin(ctx);
    if (id == null) return;
    const job = await enqueueJob("CHECK_PAYMENTS", {}, { uniqueKey: "payments-manual" });
    await auditLog(id, "ENQUEUE_CHECK_PAYMENTS", "job", job.jobKey);
    const result = await processQueuedJobs(2);
    await ctx.reply(
      `💳 Payment check done.\n\`${job.jobKey}\`\n${JSON.stringify(result.results?.[0] || {}).slice(0, 800)}`,
      { parse_mode: "Markdown" }
    );
  });

  bot.command("promotions", async (ctx) => {
    const id = await requireAdmin(ctx);
    if (id == null) return;
    await auditLog(id, "VIEW_PROMOTIONS");
    const rows = await getActivePromotions();
    await ctx.reply(`*Active promotions (${rows.length})*\n\n${formatPromotionsList(rows)}`, {
      parse_mode: "Markdown",
    });
  });

  bot.command("pending", async (ctx) => {
    const id = await requireAdmin(ctx);
    if (id == null) return;
    await auditLog(id, "VIEW_PENDING");
    const rows = await getPendingInvoices();
    await ctx.reply(`*Pending invoices (${rows.length})*\n\n${formatPendingList(rows)}`, {
      parse_mode: "Markdown",
    });
  });

  bot.command("stats", async (ctx) => {
    const id = await requireAdmin(ctx);
    if (id == null) return;
    await auditLog(id, "VIEW_STATS");
    const s = await getPlatformStats();
    await ctx.reply(
      `*Platform stats*\n\nUsers: ${s.users}\nActive promotions: ${s.activePromotions}\nPending invoices: ${s.pendingInvoices}\nPaid invoices: ${s.paidInvoices}\nReceipts: ${s.receipts}\nRevenue: ${s.revenueUsd}`,
      { parse_mode: "Markdown" }
    );
  });

  bot.command("pause", async (ctx) => {
    const id = await requireAdmin(ctx);
    if (id == null) return;
    await setAutoPublish(false);
    await auditLog(id, "PAUSE_AUTO_PUBLISH");
    await ctx.reply("⏸ Automatic publishing *paused*.", { parse_mode: "Markdown" });
  });

  bot.command("resume", async (ctx) => {
    const id = await requireAdmin(ctx);
    if (id == null) return;
    await setAutoPublish(true);
    await auditLog(id, "RESUME_AUTO_PUBLISH");
    await ctx.reply("▶️ Automatic publishing *resumed*.", { parse_mode: "Markdown" });
  });

  async function runAdminAction(ctx: BotContext, cmd: string) {
    if (!ctx.from || !isAdmin(ctx.from.id)) {
      await ctx.reply("Unauthorized.");
      return;
    }
    const id = ctx.from.id;
    if (cmd === "publish") {
      const job = await enqueueJob("PUBLISH_TRENDING", {}, { uniqueKey: "publish-manual" });
      await auditLog(id, "ENQUEUE_PUBLISH", "job", job.jobKey);
      await processQueuedJobs(2);
      await ctx.reply(`📢 Publish done.\n\`${job.jobKey}\``, { parse_mode: "Markdown" });
    } else if (cmd === "refresh") {
      const job = await enqueueJob("REFRESH_MARKET", {}, { uniqueKey: "refresh-manual" });
      await auditLog(id, "ENQUEUE_REFRESH", "job", job.jobKey);
      await processQueuedJobs(2);
      await ctx.reply(`🔄 Refresh queued.\n\`${job.jobKey}\``, { parse_mode: "Markdown" });
    } else if (cmd === "scanpairs") {
      const job = await enqueueJob("SCAN_PAIRS", {}, { uniqueKey: "scanpairs-manual" });
      await auditLog(id, "ENQUEUE_SCAN_PAIRS", "job", job.jobKey);
      await processQueuedJobs(2);
      await ctx.reply(`🔎 Scan queued.\n\`${job.jobKey}\``, { parse_mode: "Markdown" });
    } else if (cmd === "checkpayments") {
      const job = await enqueueJob("CHECK_PAYMENTS", {}, { uniqueKey: "payments-manual" });
      await auditLog(id, "ENQUEUE_CHECK_PAYMENTS", "job", job.jobKey);
      const result = await processQueuedJobs(2);
      await ctx.reply(
        `💳 Payments checked.\n\`${job.jobKey}\`\n${JSON.stringify(result.results?.[0] || {}).slice(0, 600)}`,
        { parse_mode: "Markdown" }
      );
    } else if (cmd === "promotions") {
      await auditLog(id, "VIEW_PROMOTIONS");
      const rows = await getActivePromotions();
      await ctx.reply(`*Active (${rows.length})*\n\n${formatPromotionsList(rows)}`, {
        parse_mode: "Markdown",
      });
    } else if (cmd === "pending") {
      await auditLog(id, "VIEW_PENDING");
      const rows = await getPendingInvoices();
      await ctx.reply(`*Pending (${rows.length})*\n\n${formatPendingList(rows)}`, {
        parse_mode: "Markdown",
      });
    } else if (cmd === "stats") {
      await auditLog(id, "VIEW_STATS");
      const s = await getPlatformStats();
      await ctx.reply(
        `*Stats*\nUsers: ${s.users}\nActive promos: ${s.activePromotions}\nPending: ${s.pendingInvoices}\nPaid: ${s.paidInvoices}\nRevenue: ${s.revenueUsd}`,
        { parse_mode: "Markdown" }
      );
    } else if (cmd === "pause") {
      await setAutoPublish(false);
      await auditLog(id, "PAUSE_AUTO_PUBLISH");
      await ctx.reply("⏸ Auto-publish paused.");
    } else if (cmd === "resume") {
      await setAutoPublish(true);
      await auditLog(id, "RESUME_AUTO_PUBLISH");
      await ctx.reply("▶️ Auto-publish resumed.");
    }
  }

  const map: Record<string, string> = {
    admin_publish: "publish",
    admin_refresh: "refresh",
    admin_scanpairs: "scanpairs",
    admin_checkpayments: "checkpayments",
    admin_promotions: "promotions",
    admin_pending: "pending",
    admin_stats: "stats",
    admin_pause: "pause",
    admin_resume: "resume",
  };

  for (const [action, cmd] of Object.entries(map)) {
    bot.action(action, async (ctx) => {
      await ctx.answerCbQuery();
      await runAdminAction(ctx, cmd);
    });
  }

  bot.action("admin_jobs", async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !isAdmin(ctx.from.id)) return;
    const result = await processQueuedJobs(5);
    await auditLog(ctx.from.id, "PROCESS_JOBS", "jobs", undefined, result as any);
    await ctx.reply(`⚙️ Processed: ${result.processed}, failed: ${result.failed}`);
  });
}
