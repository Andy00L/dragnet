import { pointForKey, hash160ForKey } from "./secp256k1";
import { proofForIndex, treeForAddresses } from "./merkle";
import { type Hex, type Result, type RevealPayload, err, ok } from "./types";

/// Build the reveal payload for a set of found keys against the published target
/// list. Keys are sorted ascending (the contract requires strict ascending order,
/// which also enforces distinctness). Fails if any key's hash160 is not in the list
/// or maps to no valid point.
export function buildReveal(foundKeys: bigint[], addresses: Hex[]): Result<RevealPayload> {
  const sorted = [...new Set(foundKeys)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );

  const tree = treeForAddresses(addresses);
  if (!tree.ok) {
    return tree;
  }

  const lowerAddresses = addresses.map((address) => address.toLowerCase());
  const keys: bigint[] = [];
  const px: bigint[] = [];
  const py: bigint[] = [];
  const proofs: Hex[][] = [];

  for (const key of sorted) {
    const point = pointForKey(key);
    if (!point.ok) {
      return point;
    }
    const hashed = hash160ForKey(key);
    if (!hashed.ok) {
      return hashed;
    }
    const index = lowerAddresses.indexOf(hashed.value.toLowerCase());
    if (index === -1) {
      // Report the public hash160, never the secret private key it came from.
      return err(`a found key maps to ${hashed.value}, which is not in the target list`);
    }
    const proof = proofForIndex(tree.value, index);
    if (!proof.ok) {
      return proof;
    }
    keys.push(key);
    px.push(point.value.x);
    py.push(point.value.y);
    proofs.push(proof.value);
  }

  return ok({ keys, px, py, proofs });
}
