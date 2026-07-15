import { bytesToBigInt } from "viem";
import { N, hash160ForKey } from "./secp256k1.js";
import { type MerkleTree, treeForAddresses } from "./merkle.js";
import { type Hex, type Result, err, ok } from "./types.js";

/// Injectable source of random bytes so tests can be deterministic. Defaults to
/// the platform CSPRNG. Buyers MUST use the secure default in production: canary
/// keys are the whole security assumption.
export type RandomBytes = (length: number) => Uint8Array;

export const secureRandomBytes: RandomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

/// Uniform bigint in [0, bound) by rejection sampling. `bound` must be > 0.
function randomBelow(bound: bigint, rng: RandomBytes): bigint {
  const bitLength = bound.toString(2).length;
  const byteLength = Math.ceil(bitLength / 8);
  const excessBits = BigInt(byteLength * 8 - bitLength);
  for (;;) {
    const candidate = bytesToBigInt(rng(byteLength)) >> excessBits;
    if (candidate < bound) {
      return candidate;
    }
  }
}

function shuffle<T>(items: T[], rng: RandomBytes): T[] {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index--) {
    const swapIndex = Number(randomBelow(BigInt(index + 1), rng));
    const here = copy[index];
    const there = copy[swapIndex];
    if (here === undefined || there === undefined) {
      continue;
    }
    copy[index] = there;
    copy[swapIndex] = here;
  }
  return copy;
}

/// Generate `count` distinct private keys drawn uniformly from [lo, hi] inclusive.
/// Returns them sorted ascending. Fails if the range cannot hold that many keys.
export function generateCanaries(
  lo: bigint,
  hi: bigint,
  count: number,
  rng: RandomBytes = secureRandomBytes,
): Result<bigint[]> {
  if (lo < 1n) {
    // Private keys are [1, N-1]; key 0 has no valid public point. Matches the
    // contract's lo == 0 rejection in DragnetMarket.postBounty.
    return err(`lo must be at least 1, got ${lo}`);
  }
  if (hi >= N) {
    // Keys at or above the group order are invalid. Matches the contract's
    // hi >= N rejection in DragnetMarket.postBounty.
    return err(`hi must be below the secp256k1 group order N, got ${hi}`);
  }
  if (hi <= lo) {
    return err(`range invalid: hi (${hi}) must exceed lo (${lo})`);
  }
  if (count < 1) {
    return err(`count must be at least 1, got ${count}`);
  }
  const rangeSize = hi - lo + 1n;
  if (rangeSize < BigInt(count)) {
    return err(`range holds ${rangeSize} keys, cannot draw ${count} distinct canaries`);
  }
  const keys = new Set<bigint>();
  const maxAttempts = count * 64 + 1024;
  let attempts = 0;
  while (keys.size < count) {
    if (attempts++ > maxAttempts) {
      return err(`could not draw ${count} distinct canaries after ${maxAttempts} attempts`);
    }
    keys.add(lo + randomBelow(rangeSize, rng));
  }
  return ok([...keys].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)));
}

export interface TargetList {
  /// hash160 addresses in published (shuffled) order: canaries mixed with real targets.
  addresses: Hex[];
  tree: MerkleTree;
  /// hash160 of each canary, for the buyer's records (not published as canaries).
  canaryHash160s: Hex[];
}

/// Build the shuffled target list and its Merkle tree from canary keys plus any
/// real target addresses (already hash160). Shuffling makes canaries and real
/// targets indistinguishable in the published list.
///
/// Safety: `realTargets` are meant for exclusion, where the real key is NOT in
/// [lo, hi]. If a real target's key were inside the range, a full-coverage worker
/// would find m + 1 keys (the m canaries plus the target), so the reveal of exactly
/// m keys either reverts LengthMismatch or, if the worker drops a canary instead of
/// the indistinguishable target, publishes the real target's private key on-chain.
/// The contract cannot detect this (it never learns the target's key). Only mix in
/// real targets whose keys are outside the bounty range.
export function buildTargetList(
  canaryKeys: bigint[],
  realTargets: Hex[] = [],
  rng: RandomBytes = secureRandomBytes,
): Result<TargetList> {
  const canaryHash160s: Hex[] = [];
  for (const key of canaryKeys) {
    const hashed = hash160ForKey(key);
    if (!hashed.ok) {
      return hashed;
    }
    canaryHash160s.push(hashed.value);
  }
  const addresses = shuffle([...canaryHash160s, ...realTargets], rng);
  const tree = treeForAddresses(addresses);
  if (!tree.ok) {
    return tree;
  }
  return ok({ addresses, tree: tree.value, canaryHash160s });
}
