# Vercel Hobby compatibility

## Crons (2 only — Hobby safe)
- `/api/cron/maintenance` — hourly (`0 * * * *`): expire invoices/promos, drain job queue, optional auto-publish
- `/api/cron/payments` — every 2 hours (`0 */2 * * *`): payment scanner + job drain

## Admin (set TELEGRAM_ADMIN_IDS)
Commands: `/admin` `/publish` `/refresh` `/scanpairs` `/checkpayments` `/promotions` `/pending` `/stats` `/pause` `/resume`

Dashboard buttons on `/admin` mirror the same actions.
All actions are audit-logged. Long work is enqueued in `background_jobs` then processed in a bounded way.

## Essential automation kept
- Payment verification (scheduled + `/checkpayments` + user Check Status)
- Promotion activation + receipts + notifications
- Promotion expiry
- Publish (manual or hourly when not paused)
