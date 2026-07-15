import { type Address, type Chain, type PrivateKeyAccount, isAddress, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { type Result, err, ok } from "@dragnet/crypto";
import { type ChainKey, chainForKey } from "./chains";

export interface DragnetConfig {
  chainKey: ChainKey;
  chain: Chain;
  rpcUrl: string;
  marketAddress: Address;
  /// Present only when PRIVATE_KEY is set; required for write operations.
  account: PrivateKeyAccount | undefined;
}

type Env = Record<string, string | undefined>;

function parseChainKey(value: string | undefined): Result<ChainKey> {
  if (value === undefined || value === "testnet") return ok("testnet");
  if (value === "mainnet") return ok("mainnet");
  if (value === "local") return ok("local");
  return err(`DRAGNET_CHAIN must be testnet, mainnet, or local; got "${value}"`);
}

/// Resolve configuration from the environment. Read order for each value is
/// explicit env var, then chain default; nothing falls back silently to a wrong
/// network. Returns an error value rather than throwing (SKILL_GENERAL section 5).
export function loadConfig(env: Env = process.env): Result<DragnetConfig> {
  const chainKeyResult = parseChainKey(env.DRAGNET_CHAIN);
  if (!chainKeyResult.ok) return chainKeyResult;
  const chainKey = chainKeyResult.value;
  const chain = chainForKey(chainKey);

  const rpcUrl = env.DRAGNET_RPC_URL ?? chain.rpcUrls.default.http[0];
  if (rpcUrl === undefined || rpcUrl.length === 0) {
    return err("no RPC URL: set DRAGNET_RPC_URL");
  }

  const marketAddress = env.DRAGNET_MARKET;
  if (marketAddress === undefined || !isAddress(marketAddress)) {
    return err(`DRAGNET_MARKET must be a deployed contract address; got "${marketAddress ?? ""}"`);
  }

  let account: PrivateKeyAccount | undefined;
  const privateKey = env.PRIVATE_KEY;
  if (privateKey !== undefined && privateKey.length > 0) {
    if (!isHex(privateKey) || privateKey.length !== 66) {
      return err("PRIVATE_KEY must be a 32-byte 0x-prefixed hex string");
    }
    account = privateKeyToAccount(privateKey);
  }

  return ok({ chainKey, chain, rpcUrl, marketAddress, account });
}
