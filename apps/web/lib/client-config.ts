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
  return { marketAddress: address, chain, rpcUrl };
}
