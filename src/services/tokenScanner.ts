import { getAddress, isAddress, type Address } from "viem";
import { getPublicClient, ERC20_ABI } from "../lib/viem";

export interface TokenScanResult {
  valid: boolean;
  address: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: string;
  priceUsd?: string;
  liquidityUsd?: string;
  volume24h?: string;
  priceChange24h?: string;
  dex?: string;
  pairAddress?: string;
  error?: string;
  disclaimer: string;
}

const DISCLAIMER =
  "⚠️ Token data is for informational purposes only and does not guarantee safety, legitimacy, or investment value.";

export async function scanToken(rawAddress: string): Promise<TokenScanResult> {
  const disclaimer = DISCLAIMER;

  if (!isAddress(rawAddress)) {
    return {
      valid: false,
      address: rawAddress,
      error: "Invalid EVM address format.",
      disclaimer,
    };
  }

  const address = getAddress(rawAddress) as Address;
  const client = getPublicClient();

  try {
    const code = await client.getBytecode({ address });
    if (!code || code === "0x") {
      return {
        valid: false,
        address,
        error: "No contract found at this address on Base.",
        disclaimer,
      };
    }

    let name: string | undefined;
    let symbol: string | undefined;
    let decimals: number | undefined;
    let totalSupply: string | undefined;

    try {
      const [n, s, d, ts] = await Promise.all([
        client.readContract({ address, abi: ERC20_ABI, functionName: "name" }),
        client.readContract({ address, abi: ERC20_ABI, functionName: "symbol" }),
        client.readContract({ address, abi: ERC20_ABI, functionName: "decimals" }),
        client.readContract({ address, abi: ERC20_ABI, functionName: "totalSupply" }),
      ]);
      name = n as string;
      symbol = s as string;
      decimals = Number(d);
      totalSupply = (ts as bigint).toString();
    } catch {
      return {
        valid: false,
        address,
        error: "Address is not a standard ERC-20 token (missing metadata).",
        disclaimer,
      };
    }

    let priceUsd: string | undefined;
    let liquidityUsd: string | undefined;
    let volume24h: string | undefined;
    let priceChange24h: string | undefined;
    let dex: string | undefined;
    let pairAddress: string | undefined;

    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
      if (res.ok) {
        const data = await res.json();
        const pairs = data?.pairs as any[] | undefined;
        if (pairs && pairs.length > 0) {
          const basePairs = pairs
            .filter((p) => p.chainId === "base")
            .sort(
              (a, b) =>
                (parseFloat(b.liquidity?.usd || "0") || 0) -
                (parseFloat(a.liquidity?.usd || "0") || 0)
            );
          const best = basePairs[0] || pairs[0];
          if (best) {
            priceUsd = best.priceUsd;
            liquidityUsd = best.liquidity?.usd?.toString();
            volume24h = best.volume?.h24?.toString();
            priceChange24h = best.priceChange?.h24?.toString();
            dex = best.dexId;
            pairAddress = best.pairAddress;
          }
        }
      }
    } catch (e) {
      console.warn("DexScreener fetch failed:", e);
    }

    return {
      valid: true,
      address,
      name,
      symbol,
      decimals,
      totalSupply,
      priceUsd,
      liquidityUsd,
      volume24h,
      priceChange24h,
      dex,
      pairAddress,
      disclaimer,
    };
  } catch (err: any) {
    return {
      valid: false,
      address,
      error: err?.message || "Failed to scan token on Base.",
      disclaimer,
    };
  }
}

export function formatScanMessage(scan: TokenScanResult): string {
  if (!scan.valid) {
    return `❌ *Token Scan Failed*\n\n${scan.error}\n\n${scan.disclaimer}`;
  }

  const lines = [
    `✅ *TOKEN DETECTED*`,
    ``,
    `*Name:* ${scan.name || "Unknown"}`,
    `*Symbol:* $${scan.symbol || "???"}`,
    `*Network:* Base`,
    `*Contract:* \`${scan.address}\``,
  ];

  if (scan.priceUsd) lines.push(`*Price:* $${Number(scan.priceUsd).toPrecision(6)}`);
  if (scan.liquidityUsd)
    lines.push(`*Liquidity:* $${Number(scan.liquidityUsd).toLocaleString()}`);
  if (scan.volume24h)
    lines.push(`*24H Volume:* $${Number(scan.volume24h).toLocaleString()}`);
  if (scan.priceChange24h)
    lines.push(`*24H Change:* ${Number(scan.priceChange24h).toFixed(2)}%`);
  if (scan.dex) lines.push(`*DEX:* ${scan.dex}`);

  lines.push(``, scan.disclaimer);
  return lines.join("\n");
}
