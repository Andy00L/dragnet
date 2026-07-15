import { createPublicClient, createWalletClient, custom, http, isHex, parseEther, toHex } from "viem";
import type { Account, Address, Hex } from "viem";
import { addressesToBytes, buildTargetList, err, generateCanaries, ok } from "@dragnet/crypto";
import type { Result } from "@dragnet/crypto";
import { MarketClient } from "@dragnet/sdk";
import type { ClientMarketConfig } from "./client-config";

// EIP-1193 provider shape (same as WalletProvider). The post flow never logs or
// transmits the canary private keys: they are used only to derive the public
// hash160 target list and root, then handed back to the buyer as a local file.
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface PostFormInput {
  lo: bigint;
  hi: bigint;
  m: number;
  payout: string;
  bond: string;
  claimWindowSeconds: bigint;
  openWindowSeconds: bigint;
}

export interface PreparedPost {
  lo: bigint;
  hi: bigint;
  m: number;
  targetRoot: Hex;
  payout: bigint;
  bond: bigint;
  claimWindow: bigint;
  openWindow: bigint;
  targetList: Hex;
  // SECRET: the buyer's canary private keys, kept in memory only.
  canaries: bigint[];
}

// Generate canaries and build the target list plus its root for a post. Uses the
// platform CSPRNG (the @dragnet/crypto default). All secret material stays inside
// the returned object; nothing here writes to storage, logs, or the network.
export function preparePost(input: PostFormInput): Result<PreparedPost> {
  const canaries = generateCanaries(input.lo, input.hi, input.m);
  if (!canaries.ok) {
    return canaries;
  }
  const list = buildTargetList(canaries.value);
  if (!list.ok) {
    return list;
  }
  let payout: bigint;
  let bond: bigint;
  try {
    payout = parseEther(input.payout);
    bond = parseEther(input.bond);
  } catch {
    return err("payout and bond must be valid MON amounts");
  }
  return ok({
    lo: input.lo,
    hi: input.hi,
    m: input.m,
    targetRoot: list.value.tree.root,
    payout,
    bond,
    claimWindow: input.claimWindowSeconds,
    openWindow: input.openWindowSeconds,
    targetList: addressesToBytes(list.value.addresses),
    canaries: canaries.value,
  });
}

function chainIdOf(value: unknown): number | null {
  if (typeof value === "string" && isHex(value)) {
    return Number.parseInt(value, 16);
  }
  if (typeof value === "number") {
    return value;
  }
  return null;
}

// Make sure the injected wallet is on the configured chain, requesting a switch if not.
export async function ensureChain(provider: Eip1193Provider, config: ClientMarketConfig): Promise<Result<true>> {
  try {
    const current = chainIdOf(await provider.request({ method: "eth_chainId" }));
    if (current === config.chain.id) {
      return ok(true);
    }
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: toHex(config.chain.id) }],
    });
    return ok(true);
  } catch {
    return err(`switch your wallet to ${config.chain.name} (chain ${config.chain.id})`);
  }
}

// Post the prepared bounty from the injected wallet, escrowing payout + bond. The
// bounty id comes back from the on-chain BountyPosted event (via MarketClient).
export async function postOnChain(
  provider: Eip1193Provider,
  buyer: Address,
  config: ClientMarketConfig,
  prepared: PreparedPost,
): Promise<Result<{ bountyId: bigint; txHash: Hex }>> {
  const chainReady = await ensureChain(provider, config);
  if (!chainReady.ok) {
    return chainReady;
  }
  const account: Account = { address: buyer, type: "json-rpc" };
  const publicClient = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
  const walletClient = createWalletClient({ chain: config.chain, transport: custom(provider), account });
  const market = new MarketClient(config.marketAddress, publicClient, walletClient, account);
  return market.postBounty({
    lo: prepared.lo,
    hi: prepared.hi,
    m: prepared.m,
    targetRoot: prepared.targetRoot,
    payout: prepared.payout,
    bond: prepared.bond,
    claimWindow: prepared.claimWindow,
    openWindow: prepared.openWindow,
    targetList: prepared.targetList,
  });
}

// Serialize the buyer's canary keys for a local download. Never called with any
// path that transmits the result; the caller turns this into a Blob download.
export function canaryKeysFile(bountyId: bigint, rangeLabel: string, m: number, targetRoot: Hex, canaries: bigint[]): string {
  return JSON.stringify(
    {
      bountyId: bountyId.toString(),
      range: rangeLabel,
      m,
      targetRoot,
      canaries: canaries.map((key) => toHex(key, { size: 32 })),
      warning:
        "SECRET. These canary private keys prove your bounty. Store them securely and never share them. You need them to refund the bounty after it expires.",
    },
    null,
    2,
  );
}
