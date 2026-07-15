import { secp256k1 } from "@noble/curves/secp256k1";
import { ripemd160, sha256 } from "viem";
import { type Hex, type Result, err, ok } from "./types";

/// Order of the secp256k1 base point. sourceRef: @noble/curves CURVE.n, equal to
/// the SEC 2 v2 value used in contracts/src/Secp256k1.sol.
export const N: bigint = secp256k1.CURVE.n;

export interface AffinePoint {
  x: bigint;
  y: bigint;
}

export function isValidKey(key: bigint): boolean {
  return key > 0n && key < N;
}

/// The public-key point key*G, or an error for out-of-range keys.
export function pointForKey(key: bigint): Result<AffinePoint> {
  if (!isValidKey(key)) {
    return err(`private key out of range [1, N): ${key}`);
  }
  const point = secp256k1.ProjectivePoint.BASE.multiply(key);
  const affine = point.toAffine();
  return ok({ x: affine.x, y: affine.y });
}

/// The 33-byte compressed public key for key*G.
export function compressedPubkey(key: bigint): Result<Uint8Array> {
  if (!isValidKey(key)) {
    return err(`private key out of range [1, N): ${key}`);
  }
  return ok(secp256k1.ProjectivePoint.BASE.multiply(key).toRawBytes(true));
}

/// Bitcoin hash160 of the compressed public key: RIPEMD160(SHA256(compressed)).
/// Matches contracts/src/Secp256k1.sol hash160Compressed exactly.
export function hash160ForKey(key: bigint): Result<Hex> {
  const compressed = compressedPubkey(key);
  if (!compressed.ok) {
    return compressed;
  }
  return ok(ripemd160(sha256(compressed.value)));
}
