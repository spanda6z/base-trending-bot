import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
    username: varchar("username", { length: 255 }),
    firstName: varchar("first_name", { length: 255 }),
    lastName: varchar("last_name", { length: 255 }),
    isBlocked: boolean("is_blocked").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("users_telegram_id_idx").on(t.telegramId)]
);

export const tokens = pgTable("tokens", {
  id: serial("id").primaryKey(),
  address: varchar("address", { length: 42 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  symbol: varchar("symbol", { length: 64 }),
  decimals: integer("decimals"),
  totalSupply: text("total_supply"),
  isVerified: boolean("is_verified").default(false).notNull(),
  isSpam: boolean("is_spam").default(false).notNull(),
  flags: jsonb("flags").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const promotionSessions = pgTable("promotion_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  step: varchar("step", { length: 64 }).notNull().default("MAIN_MENU"),
  status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
  packageCode: varchar("package_code", { length: 16 }),
  durationHours: integer("duration_hours"),
  priceUsdCents: integer("price_usd_cents"),
  tokenAddress: varchar("token_address", { length: 42 }),
  tokenName: varchar("token_name", { length: 255 }),
  tokenSymbol: varchar("token_symbol", { length: 64 }),
  telegramLink: text("telegram_link"),
  xLink: text("x_link"),
  websiteLink: text("website_link"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceId: varchar("invoice_id", { length: 64 }).notNull().unique(),
  sessionId: integer("session_id").notNull(),
  userId: integer("user_id").notNull(),
  amountUsdCents: integer("amount_usd_cents").notNull(),
  currency: varchar("currency", { length: 8 }).notNull(),
  expectedAmount: text("expected_amount").notNull(),
  treasuryAddress: varchar("treasury_address", { length: 42 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("AWAITING_PAYMENT"),
  paymentTxHash: varchar("payment_tx_hash", { length: 66 }),
  expiresAt: timestamp("expires_at").notNull(),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id").notNull(),
    txHash: varchar("tx_hash", { length: 66 }).notNull().unique(),
    fromAddress: varchar("from_address", { length: 42 }),
    amount: text("amount").notNull(),
    currency: varchar("currency", { length: 8 }).notNull(),
    blockNumber: integer("block_number"),
    confirmations: integer("confirmations").default(0),
    confirmedAt: timestamp("confirmed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("payments_tx_hash_uidx").on(t.txHash)]
);

export const receipts = pgTable("receipts", {
  id: serial("id").primaryKey(),
  receiptId: varchar("receipt_id", { length: 64 }).notNull().unique(),
  invoiceId: integer("invoice_id").notNull(),
  userId: integer("user_id").notNull(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  tokenName: varchar("token_name", { length: 255 }),
  tokenSymbol: varchar("token_symbol", { length: 64 }),
  tokenAddress: varchar("token_address", { length: 42 }),
  packageCode: varchar("package_code", { length: 16 }),
  durationHours: integer("duration_hours"),
  amountUsdCents: integer("amount_usd_cents"),
  paymentCurrency: varchar("payment_currency", { length: 8 }),
  paymentAmount: text("payment_amount"),
  txHash: varchar("tx_hash", { length: 66 }),
  treasuryAddress: varchar("treasury_address", { length: 42 }),
  promotionStartsAt: timestamp("promotion_starts_at"),
  promotionEndsAt: timestamp("promotion_ends_at"),
  snapshot: jsonb("snapshot"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const promotions = pgTable("promotions", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  invoiceId: integer("invoice_id").notNull(),
  receiptId: integer("receipt_id"),
  userId: integer("user_id").notNull(),
  tokenAddress: varchar("token_address", { length: 42 }).notNull(),
  packageCode: varchar("package_code", { length: 16 }).notNull(),
  durationHours: integer("duration_hours").notNull(),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
  telegramLink: text("telegram_link"),
  xLink: text("x_link"),
  websiteLink: text("website_link"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const promotionSlots = pgTable("promotion_slots", {
  id: serial("id").primaryKey(),
  packageCode: varchar("package_code", { length: 16 }).notNull().unique(),
  maxSlots: integer("max_slots").notNull(),
  currentActive: integer("current_active").notNull().default(0),
  label: varchar("label", { length: 128 }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const publishedPosts = pgTable("published_posts", {
  id: serial("id").primaryKey(),
  channelId: varchar("channel_id", { length: 64 }).notNull(),
  messageId: integer("message_id").notNull(),
  postType: varchar("post_type", { length: 32 }).notNull(),
  contentHash: varchar("content_hash", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const backgroundJobs = pgTable("background_jobs", {
  id: serial("id").primaryKey(),
  jobKey: varchar("job_key", { length: 128 }).notNull().unique(),
  type: varchar("type", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("PENDING"),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(5),
  lastError: text("last_error"),
  scheduledAt: timestamp("scheduled_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: serial("id").primaryKey(),
  actorTelegramId: bigint("actor_telegram_id", { mode: "number" }).notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  targetType: varchar("target_type", { length: 64 }),
  targetId: varchar("target_id", { length: 128 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const marketSnapshots = pgTable("market_snapshots", {
  id: serial("id").primaryKey(),
  tokenAddress: varchar("token_address", { length: 42 }).notNull(),
  priceUsd: text("price_usd"),
  liquidityUsd: text("liquidity_usd"),
  volume24h: text("volume_24h"),
  change1h: text("change_1h"),
  change24h: text("change_24h"),
  buys: integer("buys"),
  sells: integer("sells"),
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
});

export const trendingScores = pgTable("trending_scores", {
  id: serial("id").primaryKey(),
  tokenAddress: varchar("token_address", { length: 42 }).notNull().unique(),
  score: text("score").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tokensRelations = relations(tokens, ({ many }) => ({
  marketSnapshots: many(marketSnapshots),
  scores: many(trendingScores),
}));
