import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBot } from "../../src/telegram/bot";
import { registerHandlers } from "../../src/telegram/handlers";
import { registerAdminHandlers } from "../../src/telegram/adminHandlers";

const bot = getBot();
registerHandlers(bot);
registerAdminHandlers(bot);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const headerSecret = req.headers["x-telegram-bot-api-secret-token"];

  if (secret && headerSecret !== secret) {
    console.warn("Invalid webhook secret token");
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await bot.handleUpdate(req.body);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(200).json({ ok: false });
  }
}
