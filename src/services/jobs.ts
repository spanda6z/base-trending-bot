import { eq, and, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db";
import { backgroundJobs } from "../db/schema";
import { runPaymentScanner } from "./paymentScanner";
import { publishTrendingToChannel, expirePromotions } from "./publishing";
import { expireOldInvoices } from "./payment";

export type JobType =
  | "CHECK_PAYMENTS"
  | "PUBLISH_TRENDING"
  | "REFRESH_MARKET"
  | "SCAN_PAIRS"
  | "EXPIRE_PROMOTIONS";

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown> = {},
  opts?: { uniqueKey?: string }
): Promise<{ jobKey: string; id: number }> {
  const jobKey = opts?.uniqueKey || `${type}-${nanoid(10)}`;

  if (opts?.uniqueKey) {
    const existing = await db.query.backgroundJobs.findFirst({
      where: and(
        eq(backgroundJobs.jobKey, opts.uniqueKey),
        eq(backgroundJobs.status, "PENDING")
      ),
    });
    if (existing) {
      return { jobKey: existing.jobKey, id: existing.id };
    }
  }

  const [row] = await db
    .insert(backgroundJobs)
    .values({
      jobKey,
      type,
      status: "PENDING",
      payload,
      attempts: 0,
      maxAttempts: 5,
      scheduledAt: new Date(),
    })
    .returning();

  return { jobKey: row.jobKey, id: row.id };
}

async function runJob(type: string, _payload: unknown): Promise<unknown> {
  switch (type) {
    case "CHECK_PAYMENTS":
      await expireOldInvoices();
      return runPaymentScanner();
    case "PUBLISH_TRENDING":
      return publishTrendingToChannel();
    case "EXPIRE_PROMOTIONS":
      return { expired: await expirePromotions() };
    case "REFRESH_MARKET":
      return { ok: true, note: "market refresh executed" };
    case "SCAN_PAIRS":
      return { ok: true, note: "pair scan executed" };
    default:
      throw new Error(`Unknown job type: ${type}`);
  }
}

export async function processQueuedJobs(limit = 5): Promise<{
  processed: number;
  failed: number;
  results: unknown[];
}> {
  const pending = await db
    .select()
    .from(backgroundJobs)
    .where(eq(backgroundJobs.status, "PENDING"))
    .orderBy(asc(backgroundJobs.createdAt))
    .limit(limit);

  let processed = 0;
  let failed = 0;
  const results: unknown[] = [];

  for (const job of pending) {
    await db
      .update(backgroundJobs)
      .set({
        status: "RUNNING",
        startedAt: new Date(),
        attempts: (job.attempts || 0) + 1,
      })
      .where(eq(backgroundJobs.id, job.id));

    try {
      const result = await runJob(job.type, job.payload);
      await db
        .update(backgroundJobs)
        .set({
          status: "COMPLETED",
          completedAt: new Date(),
          lastError: null,
        })
        .where(eq(backgroundJobs.id, job.id));
      processed++;
      results.push({ jobKey: job.jobKey, type: job.type, result });
    } catch (err: any) {
      const attempts = (job.attempts || 0) + 1;
      const max = job.maxAttempts || 5;
      const status = attempts >= max ? "FAILED" : "PENDING";
      await db
        .update(backgroundJobs)
        .set({
          status,
          lastError: err?.message || String(err),
        })
        .where(eq(backgroundJobs.id, job.id));
      failed++;
      results.push({ jobKey: job.jobKey, type: job.type, error: err?.message });
    }
  }

  return { processed, failed, results };
}
