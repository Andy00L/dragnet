import type { Address } from "viem";
import { type Hex, buildReveal, commitHash, targetListMatchesRoot } from "@dragnet/crypto";
import { BountyStatus, type MarketClient } from "@dragnet/sdk";
import { scanRange } from "./scan";

export interface WorkerOptions {
  bountyId: bigint;
  salt: Hex;
  /// Fraction of the range to skip. Honest workers pass 0; the cheat passes > 0.
  skipFraction?: number;
  /// Explicit last key to scan; overrides skipFraction. Deterministic cheat knob.
  scanTo?: bigint | undefined;
  /// Send the reveal even when coverage is short (found < m), so it reverts on
  /// chain with LengthMismatch. Off by default (a short reveal cannot be paid, so a
  /// real worker skips it to save gas); the demo and its e2e set it to show the
  /// on-chain rejection.
  revealEvenIfShort?: boolean;
  log?: (message: string) => void;
  progressEvery?: bigint | undefined;
}

export interface WorkerOutcome {
  found: number;
  required: number;
  committed: boolean;
  revealed: boolean;
  paid: boolean;
  revertReason?: string;
  revealTx?: Hex;
  withdrawTx?: Hex;
}

/// Run one worker end to end: read the bounty, scan the range, then commit and
/// reveal. A worker with full coverage is paid; a cheat's reveal reverts on-chain
/// with a distinct reason and it earns nothing.
export async function runWorker(
  market: MarketClient,
  workerAddress: Address,
  options: WorkerOptions,
): Promise<WorkerOutcome> {
  const log = options.log ?? ((message: string) => console.log(`[runWorker] ${message}`));
  const say = (message: string): void => log(`[runWorker] ${message}`);

  const bounty = await market.getBounty(options.bountyId);
  const outcome: WorkerOutcome = {
    found: 0,
    required: bounty.m,
    committed: false,
    revealed: false,
    paid: false,
  };

  if (bounty.status !== BountyStatus.Open) {
    say(`bounty ${options.bountyId} is not open (status ${bounty.status}); nothing to do`);
    return outcome;
  }

  const addresses = await market.fetchTargetList(options.bountyId);
  if (!addresses.ok) {
    say(`could not load target list: ${addresses.error}`);
    return outcome;
  }

  // The emitted list is only a convenience; the on-chain targetRoot is what the
  // contract checks. Refuse to scan a list that does not rebuild to that root, so a
  // mismatched or malicious bounty costs nothing instead of a full wasted scan that
  // would only revert NotListed at reveal time.
  if (!targetListMatchesRoot(addresses.value, bounty.targetRoot)) {
    outcome.revertReason = "TargetListMismatch";
    say("published target list does not hash to the on-chain root; refusing to scan");
    return outcome;
  }

  const skipFraction = options.skipFraction ?? 0;
  say(
    `scanning [${bounty.lo}, ${bounty.hi}] for ${bounty.m} canaries` +
      (skipFraction > 0 ? ` (CHEAT: skipping ${Math.round(skipFraction * 100)}% of the range)` : ""),
  );

  const scan = scanRange({
    lo: bounty.lo,
    hi: bounty.hi,
    addresses: addresses.value,
    skipFraction,
    scanTo: options.scanTo,
    progressEvery: options.progressEvery,
    onProgress: (scanned, toScan, found) =>
      say(`  scanned ${scanned}/${toScan}, found ${found}`),
  });
  if (!scan.ok) {
    say(`scan failed: ${scan.error}`);
    return outcome;
  }
  outcome.found = scan.value.foundKeys.length;
  say(`scan done: found ${scan.value.foundKeys.length}/${bounty.m} canaries`);

  const reveal = buildReveal(scan.value.foundKeys, addresses.value);
  if (!reveal.ok) {
    say(`could not build reveal: ${reveal.error}`);
    return outcome;
  }

  const digest = commitHash(reveal.value.keys, workerAddress, options.salt);
  const committed = await market.commit(options.bountyId, digest);
  if (!committed.ok) {
    say(`commit failed: ${committed.error}`);
    return outcome;
  }
  outcome.committed = true;

  // A short reveal (found < m) can never be paid: the contract requires exactly m
  // keys. Skip it by default to save a doomed transaction; the commit stands, so
  // slash remains available after openDeadline if the buyer never opens.
  if (outcome.found < outcome.required && options.revealEvenIfShort !== true) {
    say(
      `coverage incomplete (${outcome.found}/${outcome.required}); not revealing. ` +
        "Commit stands; slash is available after openDeadline if the buyer never opens.",
    );
    return outcome;
  }

  say("committed; waiting for the next block before revealing");

  const commitBlock = await market.getTransactionBlock(committed.value);
  const advanced = await market.waitForBlockAfter(commitBlock);
  if (!advanced.ok) {
    say(`gave up waiting to reveal: ${advanced.error}`);
    return outcome;
  }

  const revealResult = await market.reveal(options.bountyId, reveal.value, options.salt);
  if (!revealResult.ok) {
    outcome.revertReason = revealResult.error;
    say(`reveal rejected on-chain: ${revealResult.error}. Earned zero.`);
    return outcome;
  }
  outcome.revealed = true;
  outcome.revealTx = revealResult.value;

  const settled = await market.getBounty(options.bountyId);
  outcome.paid =
    settled.status === BountyStatus.Paid &&
    settled.winner.toLowerCase() === workerAddress.toLowerCase();

  if (outcome.paid) {
    say("coverage proven; withdrawing payout");
    const withdrawn = await market.withdraw();
    if (withdrawn.ok) {
      outcome.withdrawTx = withdrawn.value;
    } else {
      say(`withdraw failed: ${withdrawn.error}`);
    }
  } else {
    say("reveal landed but another worker was paid first");
  }

  return outcome;
}
