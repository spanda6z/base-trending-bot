import type { VercelRequest, VercelResponse } from "@vercel/node";
import { expireOldInvoices } from "../../src/services/payment";
import { runPaymentScanner } from "../../src/services/paymentScanner";
import { processQueuedJobs } from "../../src/services/jobs";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (
    process.env.CRON_SECRET &&
    req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const started = Date.now();

  try {
    await expireOldInvoices();
    const report = await runPaymentScanner();
    const jobs = await processQueuedJobs(3);

    return res.status(200).json({
      ok: true,
      job: "payments",
      durationMs: Date.now() - started,
      ...report,
      jobs,
    });
  } catch (err: any) {
    console.error("[cron:payments]", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
