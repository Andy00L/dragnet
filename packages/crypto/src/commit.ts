import { encodeAbiParameters, isHex, keccak256 } from "viem";
import { type Hex, type Result, err, ok } from "./types";

// 0x + 20 bytes (address) and 0x + 32 bytes (bytes32 salt).
const ADDRESS_HEX_LENGTH = 42;
const BYTES32_HEX_LENGTH = 66;
// Largest value an ABI uint256 can hold.
const UINT256_MAX = (1n << 256n) - 1n;

/// Commit hash for the reveal, matching the contract's
/// `keccak256(abi.encode(keys, worker, salt))`. Binding the worker address stops a
/// mempool observer from replaying the reveal as their own. Returns a Result rather
/// than throwing (SKILL_GENERAL section 5): a malformed worker address, salt, or an
/// out-of-uint256 key would otherwise make encodeAbiParameters throw synchronously,
/// unlike every other exported function in this package.
export function commitHash(keys: bigint[], worker: Hex, salt: Hex): Result<Hex> {
  if (!isHex(worker) || worker.length !== ADDRESS_HEX_LENGTH) {
    return err("worker must be a 20-byte 0x-prefixed address");
  }
  if (!isHex(salt) || salt.length !== BYTES32_HEX_LENGTH) {
    return err("salt must be a 32-byte 0x-prefixed hex string");
  }
  for (const key of keys) {
    if (key < 0n || key > UINT256_MAX) {
      return err("every key must fit in a uint256");
    }
  }
  const encoded = encodeAbiParameters(
    [{ type: "uint256[]" }, { type: "address" }, { type: "bytes32" }],
    [keys, worker, salt],
  );
  return ok(keccak256(encoded));
}
