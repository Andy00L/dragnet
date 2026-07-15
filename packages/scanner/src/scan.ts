import { secp256k1 } from "@noble/curves/secp256k1";
import { ripemd160, sha256 } from "viem";
import { type Hex, type Result, err, ok } from "@dragnet/crypto";

export interface ScanParams {
  lo: bigint;
  hi: bigint;
  /// Target hash160 addresses to match against (canaries plus real targets).
  addresses: Hex[];
  /// Fraction of the range (from the top) to skip. 0 is an honest full scan; a
  /// cheat sets, say, 0.15 to skip 15% and likely miss a canary.
  skipFraction?: number;
  /// Explicit last key to scan (clamped to [lo, hi]); overrides skipFraction when
  /// set. Used to reproduce a cheat that provably stops before a known canary.
  scanTo?: bigint | undefined;
  onProgress?: (scanned: bigint, toScan: bigint, found: number) => void;
  progressEvery?: bigint | undefined;
}

export interface ScanResult {
  foundKeys: bigint[];
  scanned: bigint;
  skipped: bigint;
  total: bigint;
}

/// Scan [lo, hi - skipped] by walking the curve one point-addition per key and
/// matching hash160 of the compressed public key against the target set. This is
/// the exhaustive search the market pays for; there is no shortcut, which is the
/// whole point.
export function scanRange(params: ScanParams): Result<ScanResult> {
  const { lo, hi, addresses } = params;
  if (lo < 1n) return err(`scan lo must be at least 1, got ${lo}`);
  if (hi < lo) return err(`scan range invalid: hi ${hi} < lo ${lo}`);

  const total = hi - lo + 1n;
  const skipFraction = params.skipFraction ?? 0;
  if (skipFraction < 0 || skipFraction >= 1) {
    return err(`skipFraction must be in [0, 1), got ${skipFraction}`);
  }
  let lastKey: bigint;
  if (params.scanTo !== undefined) {
    lastKey = params.scanTo < lo ? lo - 1n : params.scanTo > hi ? hi : params.scanTo;
  } else {
    lastKey = hi - (total * BigInt(Math.round(skipFraction * 1000))) / 1000n;
  }
  const skipped = hi > lastKey ? hi - lastKey : 0n;

  const targetSet = new Set(addresses.map((address) => address.toLowerCase()));
  const generator = secp256k1.ProjectivePoint.BASE;
  let point = generator.multiply(lo);

  const foundKeys: bigint[] = [];
  const progressEvery = params.progressEvery ?? 100_000n;
  let scanned = 0n;

  for (let key = lo; key <= lastKey; key++) {
    const hash160 = ripemd160(sha256(point.toRawBytes(true))).toLowerCase();
    if (targetSet.has(hash160)) {
      foundKeys.push(key);
    }
    scanned++;
    if (params.onProgress !== undefined && scanned % progressEvery === 0n) {
      params.onProgress(scanned, lastKey - lo + 1n, foundKeys.length);
    }
    point = point.add(generator);
  }

  return ok({ foundKeys, scanned, skipped, total });
}
