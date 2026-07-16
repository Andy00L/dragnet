/// Ordered block windows covering [low, high] scanned from BOTH ends toward the middle,
/// one window per end per step, each at most `window` blocks wide. Pure and deterministic
/// in (low, high, window): the sequence never depends on what a window contains, so a
/// caller can stop early the moment a window yields a hit. Windows never overlap and
/// together cover the whole range, so a target anywhere in [low, high] falls in exactly
/// one window. Used to locate a bounty's unique BountyPosted event whether it sits near
/// the low end (an old bounty the head has drifted past) or the high end (a fresh post),
/// without the pathological full-range scan a single direction would pay for the opposite
/// case. sourceRef: public-RPC 100-block getLogs cap (Monad testnet).
/// Ordered block windows covering [low, high] scanned forward, each at most `window`
/// blocks wide. The forward-only counterpart of pagedWindowsFromBothEnds, for scans
/// that must visit every window regardless of where a hit lands (collecting all events
/// in a span), so callers share one clamp instead of hand-rolling the cursor.
export function* pagedWindowsForward(
  low: bigint,
  high: bigint,
  window: bigint,
): Generator<readonly [bigint, bigint]> {
  while (low <= high) {
    const windowEnd = low + window - 1n > high ? high : low + window - 1n;
    yield [low, windowEnd];
    low = windowEnd + 1n;
  }
}

export function* pagedWindowsFromBothEnds(
  low: bigint,
  high: bigint,
  window: bigint,
): Generator<readonly [bigint, bigint]> {
  while (low <= high) {
    // Forward window from the low cursor.
    const forwardTo = low + window - 1n > high ? high : low + window - 1n;
    yield [low, forwardTo];
    low = forwardTo + 1n;
    if (low > high) {
      return;
    }
    // Backward window from the high cursor, its floor clamped to the low cursor so the
    // two ends never rescan the same block and the range always shrinks.
    const backwardFrom = high - window + 1n < low ? low : high - window + 1n;
    yield [backwardFrom, high];
    high = backwardFrom - 1n;
  }
}
