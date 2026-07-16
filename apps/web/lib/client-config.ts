import { isAddress } from "viem";
import type { Address, Chain } from "viem";
import { chainForKey } from "@dragnet/sdk";
import type { ChainKey } from "@dragnet/sdk";

// Market configuration visible to the browser, read from NEXT_PUBLIC_* env at
// build time (Next inlines these). Returns null when no market address is set,
// which keeps the post flow and the field log in demo mode. Direct property
// access is required so Next can statically replace the values.
export interface ClientMarketConfig {
  marketAddress: Address;
  chain: Chain;
  rpcUrl: string;
  // Floor for event pagination; public RPCs cap eth_getLogs to a 100-block range.
  deployBlock: bigint;
}

// See market-data.ts: a deploy block of 0 (env unset or malformed) forces client-side
// event scans (fetchTargetList) to page back toward genesis, slow on a live network.
// Warn once in the browser console rather than defaulting silently.
let deployBlockWarned = false;
function warnDeployBlockOnce(reason: string): void {
  if (deployBlockWarned) {
    return;
  }
  deployBlockWarned = true;
  console.warn(
    `[client-config] ${reason}; defaulting to block 0. Set NEXT_PUBLIC_DRAGNET_DEPLOY_BLOCK to the market's deployment block so event scans stay bounded.`,
  );
}

function parseDeployBlock(): bigint {
  const raw = process.env.NEXT_PUBLIC_DRAGNET_DEPLOY_BLOCK;
  if (raw === undefined || raw.length === 0) {
    warnDeployBlockOnce("NEXT_PUBLIC_DRAGNET_DEPLOY_BLOCK is not set");
    return 0n;
  }
  try {
    const parsed = BigInt(raw);
    if (parsed < 0n) {
      warnDeployBlockOnce(`NEXT_PUBLIC_DRAGNET_DEPLOY_BLOCK is negative (${raw})`);
      return 0n;
    }
    return parsed;
  } catch {
    warnDeployBlockOnce(`NEXT_PUBLIC_DRAGNET_DEPLOY_BLOCK is not a valid integer (${raw})`);
    return 0n;
  }
}

export function clientMarketConfig(): ClientMarketConfig | null {
  const address = process.env.NEXT_PUBLIC_DRAGNET_MARKET;
  if (address === undefined || !isAddress(address)) {
    return null;
  }
  const chainKeyRaw = process.env.NEXT_PUBLIC_DRAGNET_CHAIN ?? "testnet";
  const chainKey: ChainKey =
    chainKeyRaw === "mainnet" ? "mainnet" : chainKeyRaw === "local" ? "local" : "testnet";
  const chain = chainForKey(chainKey);
  const rpcUrl =
    process.env.NEXT_PUBLIC_DRAGNET_RPC_URL ?? chain.rpcUrls.default.http[0] ?? "";
  return { marketAddress: address, chain, rpcUrl, deployBlock: parseDeployBlock() };
}
