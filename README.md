# Base Trending Bot

Premium Base Network trending, token discovery & Telegram promotion platform.

## Stack
- Vercel serverless (Hobby-compatible: 2 crons)
- Telegraf Telegram bot
- Neon Postgres + Drizzle ORM
- viem on Base mainnet

## Deploy
1. Import this repo on Vercel
2. Set env vars from `.env.example`
3. `npx drizzle-kit push` then `npx tsx scripts/seed.ts`
4. Set `APP_BASE_URL` to the deployment URL
5. `npx tsx scripts/set-webhook.ts`

## Admin
Set `TELEGRAM_ADMIN_IDS` then use `/admin` in Telegram.

See `HOBBY.md` for cron and manual job details.
