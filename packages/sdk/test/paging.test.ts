import { describe, expect, test } from "bun:test";
import { pagedWindowsForward, pagedWindowsFromBothEnds } from "../src/paging";

function collect(low: bigint, high: bigint, window: bigint): Array<[bigint, bigint]> {
  return [...pagedWindowsFromBothEnds(low, high, window)].map(([from, to]) => [from, to]);
}

function collectForward(low: bigint, high: bigint, window: bigint): Array<[bigint, bigint]> {
  return [...pagedWindowsForward(low, high, window)].map(([from, to]) => [from, to]);
}

function sortByStart(windows: Array<[bigint, bigint]>): Array<[bigint, bigint]> {
  return windows.sort((left, right) => (left[0] < right[0] ? -1 : 1));
}

// The count of windows the caller queries before the one containing `target`, inclusive.
// Mirrors findEventBothEnds stopping at the first window that yields the unique event.
function windowsUntil(low: bigint, high: bigint, window: bigint, target: bigint): number {
  let queried = 0;
  for (const [from, to] of pagedWindowsFromBothEnds(low, high, window)) {
    queried++;
    if (target >= from && target <= to) {
      return queried;
    }
  }
  return queried; // not found: every window was scanned
}

describe("pagedWindowsFromBothEnds", () => {
  test("covers the whole range with no gaps and no overlaps", () => {
    const sorted = sortByStart(collect(0n, 999n, 100n));
    expect(sorted[0][0]).toBe(0n);
    expect(sorted[sorted.length - 1][1]).toBe(999n);
    for (let index = 1; index < sorted.length; index++) {
      // Each window starts exactly one block after the previous ends: contiguous, disjoint.
      expect(sorted[index][0]).toBe(sorted[index - 1][1] + 1n);
    }
  });

  test("alternates the low end then the high end", () => {
    const windows = collect(0n, 999n, 100n);
    expect(windows[0]).toEqual([0n, 99n]);
    expect(windows[1]).toEqual([900n, 999n]);
    expect(windows[2]).toEqual([100n, 199n]);
    expect(windows[3]).toEqual([800n, 899n]);
  });

  test("finds a low-end target in the first window", () => {
    // An old bounty near deployBlock resolves immediately, not after the full drift.
    expect(windowsUntil(0n, 100_000n, 100n, 50n)).toBe(1);
  });

  test("finds a high-end target within two windows", () => {
    // A fresh bounty near head resolves after one low-end miss and the first high-end hit.
    expect(windowsUntil(0n, 100_000n, 100n, 99_950n)).toBe(2);
  });

  test("a middle target is found near the middle of the scan, and the range is finite", () => {
    const total = collect(0n, 999n, 100n).length; // 1000 / 100 = 10 windows
    expect(total).toBe(10);
    const mid = windowsUntil(0n, 999n, 100n, 450n);
    expect(mid).toBeGreaterThan(4);
    expect(mid).toBeLessThanOrEqual(total);
  });

  test("handles a range narrower than one window", () => {
    expect(collect(10n, 40n, 100n)).toEqual([[10n, 40n]]);
  });

  test("handles an empty range", () => {
    expect(collect(100n, 0n, 100n)).toEqual([]);
  });

  test("an exact multiple of the window terminates without overlap", () => {
    expect(collect(0n, 199n, 100n)).toEqual([
      [0n, 99n],
      [100n, 199n],
    ]);
  });

  test("a non-zero low floor is honored (never scans below deployBlock)", () => {
    const windows = collect(1000n, 1250n, 100n);
    for (const [from] of windows) {
      expect(from).toBeGreaterThanOrEqual(1000n);
    }
    const sorted = sortByStart(windows);
    expect(sorted[0][0]).toBe(1000n);
    expect(sorted[sorted.length - 1][1]).toBe(1250n);
  });
});

describe("pagedWindowsForward", () => {
  test("covers the range in order, contiguous and disjoint, clamping the last window", () => {
    expect(collectForward(0n, 249n, 100n)).toEqual([
      [0n, 99n],
      [100n, 199n],
      [200n, 249n],
    ]);
  });

  test("an exact multiple of the window terminates without a trailing empty window", () => {
    expect(collectForward(0n, 199n, 100n)).toEqual([
      [0n, 99n],
      [100n, 199n],
    ]);
  });

  test("handles a range narrower than one window", () => {
    expect(collectForward(10n, 40n, 100n)).toEqual([[10n, 40n]]);
  });

  test("handles an empty range", () => {
    expect(collectForward(100n, 0n, 100n)).toEqual([]);
  });

  test("a non-zero low floor is honored", () => {
    expect(collectForward(1000n, 1250n, 100n)).toEqual([
      [1000n, 1099n],
      [1100n, 1199n],
      [1200n, 1250n],
    ]);
  });
});
