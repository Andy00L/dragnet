import {
  type Hex,
  type RandomBytes,
  type Result,
  addressesToBytes,
  buildTargetList,
  err,
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
  /// Only mix in targets whose keys are OUTSIDE [lo, hi]: this is the exclusion
  /// use. An in-range real target is unsafe (see buildTargetList safety note in
  /// packages/crypto/src/canary.ts).
  realTargets?: Hex[];
  rng?: RandomBytes;
  /// Called with the secret canary keys and their root BEFORE the bounty is escrowed
  /// on chain, so the caller can persist them first. The keys are the only way to
  /// later open or refund the bounty, so losing them locks the escrow permanently; if
  /// this throws, the post is aborted before any funds move. Optional.
  persistCanaries?: (draft: { canaryKeys: bigint[]; targetRoot: Hex }) => void;
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

  // Persist the secret keys before escrowing: if the process dies after the on-chain
  // post confirms but before the keys are saved, the buyer could never open or refund
  // the bounty. A persistence failure here aborts the post before any funds move.
  if (options.persistCanaries !== undefined) {
    try {
      options.persistCanaries({ canaryKeys: canaries.value, targetRoot: list.value.tree.root });
    } catch (caught) {
      return err(
        `failed to persist canary keys before posting, aborted: ${caught instanceof Error ? caught.message : String(caught)}`,
      );
    }
  }

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
