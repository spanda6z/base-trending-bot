const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const base = process.env.APP_BASE_URL;

if (!token || !secret || !base) {
  console.error("Need TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, APP_BASE_URL");
  process.exit(1);
}

const url = `${base.replace(/\/$/, "")}/api/telegram/webhook`;

async function main() {
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret,
      drop_pending_updates: true,
      allowed_updates: ["message", "callback_query"],
    }),
  });
  const data = await res.json();
  console.log(data);
}

main();
