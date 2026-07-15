import { bytesToHex, concat, hexToBytes } from "viem";
import { type Hex, type Result, err, ok } from "./types.js";

const HASH160_BYTES = 20;

/// Concatenate hash160 addresses into the `targetList` bytes carried by the
/// BountyPosted event, so any client can reconstruct the list from the chain.
export function addressesToBytes(addresses: Hex[]): Hex {
  if (addresses.length === 0) {
    return "0x";
  }
  return concat(addresses);
}

/// Parse the emitted `targetList` bytes back into hash160 addresses.
export function bytesToAddresses(data: Hex): Result<Hex[]> {
  const bytes = hexToBytes(data);
  if (bytes.length % HASH160_BYTES !== 0) {
    return err(`target list length ${bytes.length} is not a multiple of ${HASH160_BYTES}`);
  }
  const addresses: Hex[] = [];
  for (let offset = 0; offset < bytes.length; offset += HASH160_BYTES) {
    addresses.push(bytesToHex(bytes.slice(offset, offset + HASH160_BYTES)));
  }
  return ok(addresses);
}
