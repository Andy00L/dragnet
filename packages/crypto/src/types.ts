import type { Hex } from "viem";

export type { Hex };

/// Errors as values (SKILL_GENERAL section 5): fallible functions return this
/// instead of throwing, and callers branch on `ok`.
export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/// A reveal payload: the arguments the market's reveal/open functions expect, in
/// the order the contract verifies them (keys strictly ascending).
export interface RevealPayload {
  keys: bigint[];
  px: bigint[];
  py: bigint[];
  proofs: Hex[][];
}
