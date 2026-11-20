import type { VercelRequest, VercelResponse } from "@vercel/node";
import { expireOldInvoices } from "../../src/services/payment";
import { expirePromotions, publishTrendingToChannel } from "../../src/services/publishing";
import { processQueuedJobs } from "../../src/services/jobs";
import { isAutoPublishEnabled } from "../../src/services/settings";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (
    process.env.CRON_SECRET &&
    req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const started = Date.now();
  const results: Record<string, unknown> = {};

  try {
    await expireOldInvoices();
    results.invoicesExpired = true;
    results.promotionsExpired = await expirePromotions();
    results.jobs = await processQueuedJobs(5);

    if (await isAutoPublishEnabled()) {
      results.publish = await publishTrendingToChannel();
    } else {
      results.publish = { skipped: true, reason: "auto_publish_paused" };
    }

    return res.status(200).json({
      ok: true,
      job: "maintenance",
      durationMs: Date.now() - started,
      ...results,
    });
  } catch (err: any) {
    console.error("[cron:maintenance]", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
