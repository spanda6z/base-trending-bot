import { Telegraf, Context } from "telegraf";

export type BotContext = Context;

let bot: Telegraf<BotContext> | null = null;

export function getBot(): Telegraf<BotContext> {
  if (!bot) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
    bot = new Telegraf<BotContext>(token);
  }
  return bot;
}

export function isAdmin(telegramId: number): boolean {
  const raw = process.env.TELEGRAM_ADMIN_IDS || "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  return ids.includes(telegramId);
}
