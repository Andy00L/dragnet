import { encodeAbiParameters, keccak256 } from "viem";
import type { Hex } from "./types.js";

/// Commit hash for the reveal, matching the contract's
/// `keccak256(abi.encode(keys, worker, salt))`. Binding the worker address stops a
/// mempool observer from replaying the reveal as their own.
export function commitHash(keys: bigint[], worker: Hex, salt: Hex): Hex {
  const encoded = encodeAbiParameters(
    [{ type: "uint256[]" }, { type: "address" }, { type: "bytes32" }],
    [keys, worker, salt],
  );
  return keccak256(encoded);
}
