import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { tokens, marketSnapshots, trendingScores, promotions } from "../db/schema";

export function calculateScore(metrics: {
  volume24h: number;
  liquidity: number;
  buys: number;
  sells: number;
  change1h: number;
  change24h: number;
}): number {
  const vol = Math.log10(Math.max(metrics.volume24h, 1) + 1);
  const liq = Math.log10(Math.max(metrics.liquidity, 1) + 1);
  const activity = Math.log10(Math.max(metrics.buys + metrics.sells, 1) + 1);
  const m1 = Math.max(-50, Math.min(50, metrics.change1h)) / 50;
  const m24 = Math.max(-50, Math.min(50, metrics.change24h)) / 50;

  return Number(
    (vol * 0.3 + liq * 0.25 + activity * 0.2 + m1 * 0.15 + m24 * 0.1).toFixed(6)
  );
}

export async function getOrganicTop(limit = 10) {
  const scores = await db
    .select()
    .from(trendingScores)
    .orderBy(desc(trendingScores.score))
    .limit(limit);

  const results = [];
  for (const s of scores) {
    const token = await db.query.tokens.findFirst({
      where: eq(tokens.address, s.tokenAddress),
    });
    results.push({ score: s, token });
  }
  return results;
}

export async function getActiveSponsored() {
  return db
    .select()
    .from(promotions)
    .where(eq(promotions.status, "ACTIVE"))
    .orderBy(desc(promotions.startsAt))
    .limit(20);
}

export function formatOrganicMessage(
  rows: Awaited<ReturnType<typeof getOrganicTop>>
): string {
  if (!rows.length) {
    return "*Base Trending — Organic*\n\nNo ranked tokens yet. Market data is warming up.";
  }
  const lines = rows.map((r, i) => {
    const sym = r.token?.symbol || "???";
    const name = r.token?.name || "Unknown";
    return `${i + 1}. $${sym} — ${name}\n   \`${r.score.tokenAddress.slice(0, 10)}…\` score ${r.score.score}`;
  });
  return `*Base Trending — Organic Top*\n\n${lines.join("\n\n")}`;
}

export function formatSponsoredMessage(
  promos: Awaited<ReturnType<typeof getActiveSponsored>>
): string {
  if (!promos.length) return "";
  const lines = promos.map((p, i) => {
    return `${i + 1}. *${p.packageCode}* SPONSORED\n   \`${p.tokenAddress}\`\n   until ${p.endsAt.toISOString()}`;
  });
  return `*Sponsored Placements*\n\n${lines.join("\n\n")}`;
}
