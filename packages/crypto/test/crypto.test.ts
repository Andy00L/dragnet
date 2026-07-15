import { describe, expect, test } from "bun:test";
import {
  type Hex,
  type RandomBytes,
  buildReveal,
  buildTargetList,
  buildTree,
  bytesToAddresses,
  addressesToBytes,
  commitHash,
  generateCanaries,
  hash160ForKey,
  leafForHash160,
  pointForKey,
  proofForIndex,
  targetListMatchesRoot,
  verifyProof,
} from "../src/index.js";

// Deterministic byte source for reproducible tests (LCG). Never use in production.
function seededRandomBytes(seed: number): RandomBytes {
  let state = BigInt(seed) & ((1n << 64n) - 1n);
  return (length: number): Uint8Array => {
    const out = new Uint8Array(length);
    for (let index = 0; index < length; index++) {
      state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
      out[index] = Number((state >> 33n) & 0xffn);
    }
    return out;
  };
}

const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;
const TWO_GX = 0xc6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5n;

describe("secp256k1 parity with the contract", () => {
  test("hash160 of key 1 matches the known Bitcoin puzzle-1 vector", () => {
    const hashed = hash160ForKey(1n);
    expect(hashed.ok).toBe(true);
    if (hashed.ok) {
      expect(hashed.value).toBe("0x751e76e8199196d454941c45d1b3a323f1433bd6");
    }
  });

  test("point for key 1 is the generator G", () => {
    const point = pointForKey(1n);
    expect(point.ok).toBe(true);
    if (point.ok) {
      expect(point.value.x).toBe(GX);
      expect(point.value.y).toBe(GY);
    }
  });

  test("point for key 2 has the known x-coordinate of 2G", () => {
    const point = pointForKey(2n);
    expect(point.ok).toBe(true);
    if (point.ok) {
      expect(point.value.x).toBe(TWO_GX);
    }
  });

  test("out-of-range keys are rejected", () => {
    expect(pointForKey(0n).ok).toBe(false);
    expect(hash160ForKey(0n).ok).toBe(false);
  });
});

describe("merkle tree matches the sorted-pair contract verifier", () => {
  for (const size of [1, 2, 3, 4, 5, 8, 9]) {
    test(`build and prove every leaf for size ${size}`, () => {
      const leaves: Hex[] = [];
      for (let index = 0; index < size; index++) {
        leaves.push(leafForHash160(hash160ForKeyOrThrow(BigInt(index + 1))));
      }
      const tree = buildTree(leaves);
      expect(tree.ok).toBe(true);
      if (!tree.ok) return;
      for (let index = 0; index < size; index++) {
        const proof = proofForIndex(tree.value, index);
        expect(proof.ok).toBe(true);
        const leaf = leaves[index];
        if (proof.ok && leaf !== undefined) {
          expect(verifyProof(proof.value, tree.value.root, leaf)).toBe(true);
        }
      }
    });
  }
});

describe("canary generation", () => {
  test("draws distinct in-range keys, sorted ascending, reproducibly", () => {
    const first = generateCanaries(1000n, 2000n, 10, seededRandomBytes(42));
    const second = generateCanaries(1000n, 2000n, 10, seededRandomBytes(42));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value).toEqual(second.value);
    expect(first.value.length).toBe(10);
    expect(new Set(first.value).size).toBe(10); // distinct
    for (let index = 0; index < first.value.length; index++) {
      const key = first.value[index];
      if (key === undefined) continue;
      expect(key >= 1000n && key <= 2000n).toBe(true);
      if (index > 0) {
        const previous = first.value[index - 1];
        if (previous !== undefined) expect(key > previous).toBe(true);
      }
    }
  });

  test("fails when the range cannot hold the requested count", () => {
    const result = generateCanaries(1n, 5n, 10, seededRandomBytes(1));
    expect(result.ok).toBe(false);
  });
});

describe("end-to-end: build a bounty and a valid reveal", () => {
  test("worker who finds all canaries builds a reveal that verifies", () => {
    const rng = seededRandomBytes(7);
    const canaries = generateCanaries(1n, 100_000n, 5, rng);
    expect(canaries.ok).toBe(true);
    if (!canaries.ok) return;

    const realTarget = hash160ForKeyOrThrow(123_456_789n); // a stand-in real target
    const list = buildTargetList(canaries.value, [realTarget], rng);
    expect(list.ok).toBe(true);
    if (!list.ok) return;

    // The list mixes 5 canaries and 1 real target.
    expect(list.value.addresses.length).toBe(6);

    // The worker found exactly the canary keys.
    const reveal = buildReveal(canaries.value, list.value.addresses);
    expect(reveal.ok).toBe(true);
    if (!reveal.ok) return;

    expect(reveal.value.keys.length).toBe(5);
    // Ascending.
    for (let index = 1; index < reveal.value.keys.length; index++) {
      const key = reveal.value.keys[index];
      const previous = reveal.value.keys[index - 1];
      if (key !== undefined && previous !== undefined) expect(key > previous).toBe(true);
    }
    // Every proof verifies against the published root.
    for (let index = 0; index < reveal.value.keys.length; index++) {
      const key = reveal.value.keys[index];
      const proof = reveal.value.proofs[index];
      if (key === undefined || proof === undefined) continue;
      const leaf = leafForHash160(hash160ForKeyOrThrow(key));
      expect(verifyProof(proof, list.value.tree.root, leaf)).toBe(true);
    }
  });

  test("buildReveal rejects a key that is not in the list", () => {
    const list: Hex[] = [hash160ForKeyOrThrow(1n)];
    const reveal = buildReveal([2n], list);
    expect(reveal.ok).toBe(false);
  });
});

describe("target list root verification", () => {
  test("accepts the published list and rejects a tampered or empty one", () => {
    const rng = seededRandomBytes(11);
    const canaries = generateCanaries(1n, 100_000n, 4, rng);
    expect(canaries.ok).toBe(true);
    if (!canaries.ok) return;
    const list = buildTargetList(canaries.value, [], rng);
    expect(list.ok).toBe(true);
    if (!list.ok) return;

    // The published list rebuilds to the published root.
    expect(targetListMatchesRoot(list.value.addresses, list.value.tree.root)).toBe(true);

    // Swapping any single address breaks the match.
    const tampered = [...list.value.addresses];
    tampered[0] = hash160ForKeyOrThrow(999_999n);
    expect(targetListMatchesRoot(tampered, list.value.tree.root)).toBe(false);

    // An empty list never matches a nonzero root.
    expect(targetListMatchesRoot([], list.value.tree.root)).toBe(false);
  });
});

describe("commit hash and target-list encoding", () => {
  test("commit hash is deterministic and address-bound", () => {
    const worker: Hex = "0x000000000000000000000000000000000000dEaD";
    const salt: Hex = `0x${"11".repeat(32)}`;
    const first = commitHash([1n, 2n], worker, salt);
    const second = commitHash([1n, 2n], worker, salt);
    expect(first).toBe(second);
    const other = commitHash([1n, 2n], "0x000000000000000000000000000000000000bEEF", salt);
    expect(first).not.toBe(other);
  });

  test("target list bytes round-trip", () => {
    const addresses = [hash160ForKeyOrThrow(1n), hash160ForKeyOrThrow(2n), hash160ForKeyOrThrow(3n)];
    const encoded = addressesToBytes(addresses);
    const decoded = bytesToAddresses(encoded);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.map((address) => address.toLowerCase())).toEqual(
        addresses.map((address) => address.toLowerCase()),
      );
    }
  });
});

/// Test-only helper: hash160 for a key, asserting success (keys are known-valid).
function hash160ForKeyOrThrow(key: bigint): Hex {
  const hashed = hash160ForKey(key);
  if (!hashed.ok) {
    throw new Error(`test fixture key ${key} is invalid: ${hashed.error}`);
  }
  return hashed.value;
}
