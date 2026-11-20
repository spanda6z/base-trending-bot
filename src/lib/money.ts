/** All USD amounts stored as integer cents. On-chain amounts as bigint strings. */

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function usdCentsToUsdc(cents: number): bigint {
  // USDC has 6 decimals: $1.00 = 1_000_000
  return BigInt(cents) * 10_000n;
}

export function usdcToUsdCents(usdc: bigint): number {
  return Number(usdc / 10_000n);
}

export function parseUsdToCents(usd: string | number): number {
  const n = typeof usd === "string" ? parseFloat(usd) : usd;
  return Math.round(n * 100);
}
