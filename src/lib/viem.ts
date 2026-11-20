import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
} from "viem";
import { base } from "viem/chains";
import { env } from "./config";

export const TREASURY_ADDRESS = (env.BASE_TREASURY_ADDRESS ||
  "0x1Dad4D6B65dA80CEB7c6937B264132eDD21Dd39E") as Address;

export const USDC_ADDRESS = (env.BASE_USDC_ADDRESS ||
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as Address;

export const ERC20_ABI = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

let client: PublicClient | null = null;

export function getPublicClient(): PublicClient {
  if (!client) {
    client = createPublicClient({
      chain: base,
      transport: http(env.BASE_RPC_URL || "https://mainnet.base.org"),
    });
  }
  return client;
}
