import {
  type Hex,
  type RandomBytes,
  type Result,
  addressesToBytes,
  buildTargetList,
  generateCanaries,
  ok,
  secureRandomBytes,
} from "@dragnet/crypto";
import type { MarketClient } from "@dragnet/sdk";

export interface PostOptions {
  lo: bigint;
  hi: bigint;
  m: number;
  payout: bigint;
  bond: bigint;
  claimWindow: bigint;
  openWindow: bigint;
  /// hash160 of any real targets to mix in (e.g. the puzzle address). Optional.
  realTargets?: Hex[];
  rng?: RandomBytes;
}

export interface PostResult {
  bountyId: bigint;
  txHash: Hex;
  targetRoot: Hex;
  addresses: Hex[];
  /// SECRET: the canary private keys. The buyer must keep these to open the bounty
  /// later, and must never publish them.
  canaryKeys: bigint[];
}

/// Generate canaries, build the shuffled target list, and post the bounty. Returns
/// the secret canary keys so the caller can persist them for a later open.
export async function postBounty(
  market: MarketClient,
  options: PostOptions,
): Promise<Result<PostResult>> {
  const rng = options.rng ?? secureRandomBytes;

  const canaries = generateCanaries(options.lo, options.hi, options.m, rng);
  if (!canaries.ok) return canaries;

  const list = buildTargetList(canaries.value, options.realTargets ?? [], rng);
  if (!list.ok) return list;

  const posted = await market.postBounty({
    lo: options.lo,
    hi: options.hi,
    m: options.m,
    targetRoot: list.value.tree.root,
    payout: options.payout,
    bond: options.bond,
    claimWindow: options.claimWindow,
    openWindow: options.openWindow,
    targetList: addressesToBytes(list.value.addresses),
  });
  if (!posted.ok) return posted;

  return ok({
    bountyId: posted.value.bountyId,
    txHash: posted.value.txHash,
    targetRoot: list.value.tree.root,
    addresses: list.value.addresses,
    canaryKeys: canaries.value,
  });
}
