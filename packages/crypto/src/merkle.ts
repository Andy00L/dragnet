import { concat, keccak256 } from "viem";
import { type Hex, type Result, err, ok } from "./types.js";

/// Sorted-pair keccak256 Merkle tree that matches contracts/src/MerkleProof.sol.
/// A leaf for a 20-byte hash160 is keccak256(hash160), i.e. keccak256 of the raw
/// bytes, which equals the contract's keccak256(abi.encodePacked(bytes20)).
///
/// Second-preimage note: a leaf hashes 20 bytes while an internal node hashes 64
/// bytes, so a node can never be presented as a leaf. Keep this length separation.
/// If a double-hashed leaf is ever adopted, the contract, this file, and every
/// CrossCheck fixture must change together or parity breaks silently.
export function leafForHash160(hash160: Hex): Hex {
  return keccak256(hash160);
}

/// Order-independent hash of a node pair, matching the contract's
/// `a <= b ? keccak(a||b) : keccak(b||a)`. All nodes are 32-byte hashes, so a
/// lowercase-hex string compare is the same as the contract's uint256 compare.
function hashPair(a: Hex, b: Hex): Hex {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left <= right
    ? keccak256(concat([a, b]))
    : keccak256(concat([b, a]));
}

export interface MerkleTree {
  root: Hex;
  layers: Hex[][]; // layers[0] = leaves, last layer = [root]
}

/// Build a tree from ordered leaves. An unpaired node at an odd layer is promoted
/// to the next layer unchanged (the common sorted-pair convention).
export function buildTree(leaves: Hex[]): Result<MerkleTree> {
  if (leaves.length === 0) {
    return err("cannot build a Merkle tree with zero leaves");
  }
  const layers: Hex[][] = [leaves.slice()];
  let current: Hex[] = leaves.slice();
  while (current.length > 1) {
    const next: Hex[] = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index];
      const right = current[index + 1];
      if (left === undefined) {
        continue; // unreachable given the loop bound; keeps the type checker honest
      }
      if (right === undefined) {
        next.push(left); // odd node promoted unchanged
        continue;
      }
      next.push(hashPair(left, right));
    }
    layers.push(next);
    current = next;
  }
  const root = layers[layers.length - 1]?.[0];
  if (root === undefined) {
    return err("Merkle tree has no root");
  }
  return ok({ root, layers });
}

/// Build the sorted-pair tree over hash160 addresses, hashing each to its leaf
/// (keccak256 of the 20-byte value). Shared by the buyer, which publishes the
/// resulting root, and by any client that must rebuild the published list to check
/// it against the on-chain root. Keeps the leaf-encoding step in exactly one place.
export function treeForAddresses(addresses: Hex[]): Result<MerkleTree> {
  return buildTree(addresses.map(leafForHash160));
}

/// True iff the published hash160 list rebuilds to `expectedRoot`. A worker calls
/// this before trusting a target list read back from a BountyPosted event: only the
/// on-chain root is authoritative (see DragnetMarket.postBounty NatSpec), and the
/// contract does not check the emitted list against the root at post time. An empty
/// or mismatched list returns false.
export function targetListMatchesRoot(addresses: Hex[], expectedRoot: Hex): boolean {
  const tree = treeForAddresses(addresses);
  if (!tree.ok) {
    return false;
  }
  return tree.value.root.toLowerCase() === expectedRoot.toLowerCase();
}

/// The proof (sibling hashes bottom-up) for the leaf at `index`.
export function proofForIndex(tree: MerkleTree, index: number): Result<Hex[]> {
  const leaves = tree.layers[0];
  if (leaves === undefined || index < 0 || index >= leaves.length) {
    return err(`leaf index out of range: ${index}`);
  }
  const proof: Hex[] = [];
  let position = index;
  for (let level = 0; level < tree.layers.length - 1; level++) {
    const layer = tree.layers[level];
    if (layer === undefined) {
      continue;
    }
    const isRightNode = position % 2 === 1;
    const siblingIndex = isRightNode ? position - 1 : position + 1;
    const sibling = layer[siblingIndex];
    if (sibling !== undefined) {
      proof.push(sibling);
    }
    // No sibling means this node was promoted; nothing is added at this level.
    position = Math.floor(position / 2);
  }
  return ok(proof);
}

/// Mirror of the contract's verify, for self-checks in tests and clients.
export function verifyProof(proof: Hex[], root: Hex, leaf: Hex): boolean {
  let computed = leaf;
  for (const sibling of proof) {
    computed = hashPair(computed, sibling);
  }
  return computed.toLowerCase() === root.toLowerCase();
}
