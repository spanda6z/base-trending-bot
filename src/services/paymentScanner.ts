import { eq, inArray } from "drizzle-orm";
import { type Address, type Hash, getAddress, parseAbiItem } from "viem";
import { db } from "../db";
import { invoices, payments, systemSettings } from "../db/schema";
import { env } from "../lib/config";
import { getPublicClient, TREASURY_ADDRESS, USDC_ADDRESS } from "../lib/viem";
import { activatePromotion } from "./payment";

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

const CURSOR_KEY = "payment_scanner_last_block";
const MAX_BLOCKS_PER_RUN = 80;
const LOOKBACK_BLOCKS = 30;

interface PendingInvoice {
  id: number;
  invoiceId: string;
  currency: string;
  expectedAmount: string;
  status: string;
}

interface MatchResult {
  invoiceId: number;
  txHash: Hash;
  amount: string;
  from: string;
  currency: "ETH" | "USDC";
  blockNumber: number;
}

async function getLastScannedBlock(): Promise<bigint> {
  const row = await db.query.systemSettings.findFirst({
    where: eq(systemSettings.key, CURSOR_KEY),
  });
  if (row?.value && typeof (row.value as any).block === "number") {
    return BigInt((row.value as any).block);
  }
  const client = getPublicClient();
  const tip = await client.getBlockNumber();
  return tip > 50n ? tip - 50n : 0n;
}

async function setLastScannedBlock(block: bigint) {
  await db
    .insert(systemSettings)
    .values({ key: CURSOR_KEY, value: { block: Number(block) }, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: { block: Number(block) }, updatedAt: new Date() },
    });
}

async function getPendingInvoices(): Promise<PendingInvoice[]> {
  return db
    .select({
      id: invoices.id,
      invoiceId: invoices.invoiceId,
      currency: invoices.currency,
      expectedAmount: invoices.expectedAmount,
      status: invoices.status,
    })
    .from(invoices)
    .where(inArray(invoices.status, ["AWAITING_PAYMENT", "CONFIRMING"]))
    .limit(50);
}

async function scanEthTransfers(
  fromBlock: bigint,
  toBlock: bigint,
  pending: PendingInvoice[]
): Promise<MatchResult[]> {
  const ethInvoices = pending.filter((i) => i.currency === "ETH");
  if (!ethInvoices.length) return [];
  const client = getPublicClient();
  const matches: MatchResult[] = [];

  for (let b = fromBlock; b <= toBlock; b++) {
    try {
      const block = await client.getBlock({ blockNumber: b, includeTransactions: true });
      if (!block.transactions) continue;
      for (const tx of block.transactions) {
        if (typeof tx === "string" || !tx.to || tx.value === 0n) continue;
        if (getAddress(tx.to) !== getAddress(TREASURY_ADDRESS)) continue;
        for (const inv of ethInvoices) {
          if (tx.value >= BigInt(inv.expectedAmount)) {
            matches.push({
              invoiceId: inv.id,
              txHash: tx.hash,
              amount: tx.value.toString(),
              from: tx.from,
              currency: "ETH",
              blockNumber: Number(b),
            });
            break;
          }
        }
      }
    } catch (err) {
      console.warn(`[scanner] block ${b}`, err);
    }
  }
  return matches;
}

async function scanUsdcTransfers(
  fromBlock: bigint,
  toBlock: bigint,
  pending: PendingInvoice[]
): Promise<MatchResult[]> {
  const usdcInvoices = pending.filter((i) => i.currency === "USDC");
  if (!usdcInvoices.length) return [];
  const client = getPublicClient();
  const matches: MatchResult[] = [];
  try {
    const logs = await client.getLogs({
      address: USDC_ADDRESS,
      event: TRANSFER_EVENT,
      args: { to: TREASURY_ADDRESS as Address },
      fromBlock,
      toBlock,
    });
    for (const log of logs) {
      const args = (log as any).args as { from?: Address; value?: bigint };
      if (!args?.value || !args.from) continue;
      for (const inv of usdcInvoices) {
        if (args.value >= BigInt(inv.expectedAmount)) {
          matches.push({
            invoiceId: inv.id,
            txHash: log.transactionHash as Hash,
            amount: args.value.toString(),
            from: args.from,
            currency: "USDC",
            blockNumber: Number(log.blockNumber),
          });
          break;
        }
      }
    }
  } catch (err) {
    console.warn("[scanner] USDC logs", err);
  }
  return matches;
}

async function settleMatch(match: MatchResult) {
  const existingTx = await db.query.payments.findFirst({
    where: eq(payments.txHash, match.txHash),
  });
  if (existingTx) return { settled: false, reason: "tx_already_used" };

  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, match.invoiceId),
  });
  if (!invoice || invoice.status === "PAID" || invoice.status === "EXPIRED") {
    return { settled: false, reason: "invoice_not_payable" };
  }

  const client = getPublicClient();
  const tip = await client.getBlockNumber();
  const confirmations = Number(tip) - match.blockNumber;
  const required = env.PROMOTION_PAYMENT_CONFIRMATIONS || 3;

  await db.insert(payments).values({
    invoiceId: invoice.id,
    txHash: match.txHash,
    fromAddress: match.from,
    amount: match.amount,
    currency: match.currency,
    blockNumber: match.blockNumber,
    confirmations,
    confirmedAt: confirmations >= required ? new Date() : null,
  });

  const newStatus = confirmations >= required ? "PAID" : "CONFIRMING";
  await db
    .update(invoices)
    .set({
      status: newStatus,
      paymentTxHash: match.txHash,
      paidAt: newStatus === "PAID" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoice.id));

  if (newStatus === "PAID") await activatePromotion(invoice.id);
  return { settled: true };
}

async function finalizeConfirming(): Promise<number> {
  const confirming = await db
    .select()
    .from(invoices)
    .where(eq(invoices.status, "CONFIRMING"))
    .limit(20);
  if (!confirming.length) return 0;

  const client = getPublicClient();
  const tip = await client.getBlockNumber();
  const required = env.PROMOTION_PAYMENT_CONFIRMATIONS || 3;
  let finalized = 0;

  for (const inv of confirming) {
    if (!inv.paymentTxHash) continue;
    const payment = await db.query.payments.findFirst({
      where: eq(payments.txHash, inv.paymentTxHash),
    });
    if (!payment?.blockNumber) continue;
    const confs = Number(tip) - payment.blockNumber;
    if (confs < required) continue;

    await db
      .update(payments)
      .set({ confirmations: confs, confirmedAt: new Date() })
      .where(eq(payments.id, payment.id));
    await db
      .update(invoices)
      .set({ status: "PAID", paidAt: new Date(), updatedAt: new Date() })
      .where(eq(invoices.id, inv.id));
    await activatePromotion(inv.id);
    finalized++;
  }
  return finalized;
}

export interface ScanReport {
  fromBlock: number;
  toBlock: number;
  pendingInvoices: number;
  ethMatches: number;
  usdcMatches: number;
  settled: number;
  finalized: number;
  errors: string[];
}

export async function runPaymentScanner(): Promise<ScanReport> {
  const report: ScanReport = {
    fromBlock: 0,
    toBlock: 0,
    pendingInvoices: 0,
    ethMatches: 0,
    usdcMatches: 0,
    settled: 0,
    finalized: 0,
    errors: [],
  };

  try {
    const client = getPublicClient();
    const tip = await client.getBlockNumber();
    let fromBlock = await getLastScannedBlock();
    if (fromBlock > BigInt(LOOKBACK_BLOCKS)) fromBlock -= BigInt(LOOKBACK_BLOCKS);
    let toBlock = tip;
    if (toBlock - fromBlock > BigInt(MAX_BLOCKS_PER_RUN)) {
      toBlock = fromBlock + BigInt(MAX_BLOCKS_PER_RUN);
    }

    report.fromBlock = Number(fromBlock);
    report.toBlock = Number(toBlock);

    if (toBlock <= fromBlock) {
      report.finalized = await finalizeConfirming();
      return report;
    }

    const pending = await getPendingInvoices();
    report.pendingInvoices = pending.length;

    if (!pending.length) {
      await setLastScannedBlock(toBlock);
      report.finalized = await finalizeConfirming();
      return report;
    }

    const [ethMatches, usdcMatches] = await Promise.all([
      scanEthTransfers(fromBlock, toBlock, pending),
      scanUsdcTransfers(fromBlock, toBlock, pending),
    ]);
    report.ethMatches = ethMatches.length;
    report.usdcMatches = usdcMatches.length;

    const seen = new Set<string>();
    for (const match of [...ethMatches, ...usdcMatches]) {
      if (seen.has(match.txHash)) continue;
      seen.add(match.txHash);
      try {
        const r = await settleMatch(match);
        if (r.settled) report.settled++;
      } catch (err: any) {
        report.errors.push(`settle ${match.txHash}: ${err.message}`);
      }
    }

    await setLastScannedBlock(toBlock);
    report.finalized = await finalizeConfirming();
  } catch (err: any) {
    report.errors.push(err.message || String(err));
  }
  return report;
}
