import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_CHANNEL_ID: z.string().optional(),
  TELEGRAM_ADMIN_IDS: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  BASE_RPC_URL: z.string().optional(),
  BASE_CHAIN_ID: z.coerce.number().default(8453),
  BASE_TREASURY_ADDRESS: z
    .string()
    .default("0x1Dad4D6B65dA80CEB7c6937B264132eDD21Dd39E"),
  BASE_USDC_ADDRESS: z
    .string()
    .default("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
  INVOICE_EXPIRY_MINUTES: z.coerce.number().default(30),
  PROMOTION_PAYMENT_CONFIRMATIONS: z.coerce.number().default(3),
  APP_BASE_URL: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  NODE_ENV: z.string().default("development"),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.warn("[config] env parse warnings", parsed.error.flatten());
    return envSchema.parse({
      ...process.env,
      BASE_CHAIN_ID: process.env.BASE_CHAIN_ID || "8453",
    });
  }
  return parsed.data;
}

export const env = loadEnv();

export const PACKAGE_LABELS = {
  TOP1: "🥇 TOP 1 SPONSORED",
  TOP5: "🔥 TOP 5 SPONSORED",
  TOP10: "📈 TOP 10 SPONSORED",
} as const;

/** Prices in USD cents */
export const PACKAGE_PRICES = {
  TOP1: { 3: 9900, 6: 14900, 12: 24900 },
  TOP5: { 3: 4900, 6: 7900, 12: 12900 },
  TOP10: { 3: 2900, 6: 4900, 12: 7900 },
} as const;

export type PackageCode = keyof typeof PACKAGE_PRICES;
