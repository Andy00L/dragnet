import { createPublicClient, createWalletClient, custom, http, toHex } from "viem";
import type { Account, Address, Hex } from "viem";
import { buildReveal, commitHash, err, ok, targetListMatchesRoot } from "@dragnet/crypto";
import type { Result } from "@dragnet/crypto";
import { scanRange } from "@dragnet/scanner";
import { BountyStatus, MarketClient } from "@dragnet/sdk";
import type { ClientMarketConfig } from "./client-config";
import { ensureChain } from "./post-onchain";
import type { Eip1193Provider } from "./post-onchain";

// Upper bound on an in-browser sweep. A worker walks the curve one point-addition
// per key; past this the browser is the wrong tool and the CLI scanner
// (packages/scanner) should run the sweep instead. Well above the ranges a buyer
// posts through the web form, which default to a few thousand keys.
export const MAX_BROWSER_SCAN_KEYS = 5_000_000n;

// Keys per synchronous slice. Each slice runs scanRange to completion, then the
// loop yields a frame so the net redraws and the tab stays responsive. Small
// enough to keep a slice short; large enough that per-slice setup stays cheap.
const SCAN_CHUNK = 2048n;

export interface RunTarget {
  lo: bigint;
  hi: bigint;
  m: number;
  // Published hash160 target list, already checked against the on-chain root.
  addresses: Hex[];
  payout: bigint;
}

export interface RunOutcome {
  committed: boolean;
  revealed: boolean;
  paid: boolean;
  found: number;
  required: number;
  commitTx?: Hex;
  revealTx?: Hex;
  payout: bigint;
  // Distinct on-chain reason when the reveal is rejected (for example
  // LengthMismatch for a short sweep). Absent on success.
  revertReason?: string;
}

// Retry budget so an incidental rate-limit (Monad testnet caps requests) recovers.
const readTransport = (rpcUrl: string) => http(rpcUrl, { retryCount: 6, retryDelay: 300 });

function readClient(config: ClientMarketConfig): MarketClient {
  const publicClient = createPublicClient({ chain: config.chain, transport: readTransport(config.rpcUrl) });
  return new MarketClient(config.marketAddress, publicClient, undefined, undefined, config.deployBlock);
}

function writeClient(provider: Eip1193Provider, worker: Address, config: ClientMarketConfig): MarketClient {
  const account: Account = { address: worker, type: "json-rpc" };
  const publicClient = createPublicClient({ chain: config.chain, transport: readTransport(config.rpcUrl) });
  const walletClient = createWalletClient({ chain: config.chain, transport: custom(provider), account });
  return new MarketClient(config.marketAddress, publicClient, walletClient, account, config.deployBlock);
}

// Yield to the browser between slices so the net animation and input stay live.
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

// Read the bounty and its published target list, verifying the list rebuilds to
// the on-chain root before any scan. A mismatched list would only waste the sweep
// and revert at reveal, so refuse it up front. getBounty is a raw read (throws),
// so it is wrapped; fetchTargetList already returns a Result.
export async function loadRunTarget(config: ClientMarketConfig, bountyId: bigint): Promise<Result<RunTarget>> {
  const market = readClient(config);
  try {
    const bounty = await market.getBounty(bountyId);
    if (bounty.status !== BountyStatus.Open) {
      return err(`bounty ${bountyId} is not open for sweeping`);
    }
    const addresses = await market.fetchTargetList(bountyId);
    if (!addresses.ok) {
      return addresses;
    }
    if (!targetListMatchesRoot(addresses.value, bounty.targetRoot)) {
      return err("the published target list does not match the on-chain root; refusing to sweep");
    }
    return ok({ lo: bounty.lo, hi: bounty.hi, m: bounty.m, addresses: addresses.value, payout: bounty.payout });
  } catch (caught) {
    return err(`could not read bounty ${bountyId}: ${caught instanceof Error ? caught.message : String(caught)}`);
  }
}

// Sweep [lo, hi] (optionally stopping short by skipFraction from the top, the
// demonstrable cheat) for the target keys, reusing scanRange over slices and
// yielding between them. Reports fractional progress and the running found count.
export async function sweepKeyspace(
  target: RunTarget,
  skipFraction: number,
  onProgress: (fraction: number, found: number) => void,
): Promise<Result<bigint[]>> {
  const total = target.hi - target.lo + 1n;
  if (total > MAX_BROWSER_SCAN_KEYS) {
    return err(`this range holds ${total} keys, too many to sweep in a browser; run the CLI scanner instead`);
  }
  if (skipFraction < 0 || skipFraction >= 1) {
    return err(`skipFraction must be in [0, 1), got ${skipFraction}`);
  }
  const lastKey = target.hi - (total * BigInt(Math.round(skipFraction * 1000))) / 1000n;
  const toScan = lastKey - target.lo + 1n;
  const toScanFloat = Number(toScan);

  const found: bigint[] = [];
  let sliceLo = target.lo;
  let scanned = 0n;
  while (sliceLo <= lastKey) {
    const sliceHi = sliceLo + SCAN_CHUNK - 1n > lastKey ? lastKey : sliceLo + SCAN_CHUNK - 1n;
    const slice = scanRange({ lo: sliceLo, hi: sliceHi, addresses: target.addresses });
    if (!slice.ok) {
      return slice;
    }
    for (const key of slice.value.foundKeys) {
      found.push(key);
    }
    scanned += sliceHi - sliceLo + 1n;
    onProgress(toScanFloat === 0 ? 1 : Number(scanned) / toScanFloat, found.length);
    sliceLo = sliceHi + 1n;
    await nextFrame();
  }
  return ok(found);
}

// Commit the found keys, wait for the next block, then reveal. Mirrors the proven
// runWorker flow (packages/scanner): payment settles only when every canary comes
// back, so a short sweep reverts on chain with a distinct reason and earns zero.
// Does not withdraw; the caller offers Withdraw as its own action.
export async function commitAndReveal(
  provider: Eip1193Provider,
  worker: Address,
  config: ClientMarketConfig,
  bountyId: bigint,
  foundKeys: bigint[],
  target: RunTarget,
  onStage: (stage: "committing" | "returning") => void,
): Promise<Result<RunOutcome>> {
  const chainReady = await ensureChain(provider, config);
  if (!chainReady.ok) {
    return chainReady;
  }
  const reveal = buildReveal(foundKeys, target.addresses);
  if (!reveal.ok) {
    return reveal;
  }
  const market = writeClient(provider, worker, config);
  const outcome: RunOutcome = {
    committed: false,
    revealed: false,
    paid: false,
    found: foundKeys.length,
    required: target.m,
    payout: target.payout,
  };

  // A random salt binds the commit; combined with the worker address in the hash,
  // it stops a mempool observer from replaying the reveal as their own.
  const saltBytes = new Uint8Array(32);
  crypto.getRandomValues(saltBytes);
  const salt = toHex(saltBytes);

  onStage("committing");
  const digest = commitHash(reveal.value.keys, worker, salt);
  const committed = await market.commit(bountyId, digest);
  if (!committed.ok) {
    return committed;
  }
  outcome.committed = true;
  outcome.commitTx = committed.value;

  const commitBlock = await market.getTransactionBlock(committed.value);
  const advanced = await market.waitForBlockAfter(commitBlock);
  if (!advanced.ok) {
    outcome.revertReason = advanced.error;
    return ok(outcome);
  }

  onStage("returning");
  const revealResult = await market.reveal(bountyId, reveal.value, salt);
  if (!revealResult.ok) {
    outcome.revertReason = revealResult.error;
    return ok(outcome);
  }
  outcome.revealed = true;
  outcome.revealTx = revealResult.value;

  const settled = await market.getBounty(bountyId);
  outcome.paid =
    settled.status === BountyStatus.Paid && settled.winner.toLowerCase() === worker.toLowerCase();
  return ok(outcome);
}

// Claim the payout owed to the worker after a paid reveal (a separate transaction,
// surfaced behind the Withdraw button).
export async function withdrawPayout(
  provider: Eip1193Provider,
  worker: Address,
  config: ClientMarketConfig,
): Promise<Result<Hex>> {
  const chainReady = await ensureChain(provider, config);
  if (!chainReady.ok) {
    return chainReady;
  }
  const market = writeClient(provider, worker, config);
  return market.withdraw();
}
