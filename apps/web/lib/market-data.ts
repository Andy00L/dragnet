import { createPublicClient, http, isAddress } from "viem";
import type { Address, Chain, PublicClient } from "viem";
import { BountyStatus, MarketClient, chainForKey } from "@dragnet/sdk";
import type { ChainKey } from "@dragnet/sdk";
import { formatMon, formatRange, truncateHex } from "./format";
import { SAMPLE_ROWS, sampleDetailFor } from "./records";
import type { BountyDetail, DataSource, LedgerRow, WorkerLogEntry } from "./records";
import { palette } from "./tokens";
import type { StatusName } from "./tokens";

// Server-only data access. When a market address is configured (env), the ledger
// and detail read live from the chain via @dragnet/sdk; otherwise the built-in
// demo records are returned so the deployed site is never blank. The source is
// carried through to the UI and shown honestly.

// Most recent bounties fetched for the ledger. Kept bounded so a large market does
// not stall the page; the drop is logged rather than hidden.
const LEDGER_LIMIT = 40;

const STATUS_NAME: Record<number, StatusName> = {
  [BountyStatus.Open]: "Open",
  [BountyStatus.Paid]: "Paid",
  [BountyStatus.Refunded]: "Refunded",
  [BountyStatus.Slashed]: "Slashed",
};

interface MarketEnv {
  address: Address;
  chain: Chain;
  rpcUrl: string;
  // Floor for event pagination; public RPCs cap eth_getLogs to a 100-block range.
  deployBlock: bigint;
}

function parseDeployBlock(): bigint {
  const raw = process.env.DRAGNET_DEPLOY_BLOCK ?? process.env.NEXT_PUBLIC_DRAGNET_DEPLOY_BLOCK;
  if (raw === undefined || raw.length === 0) {
    return 0n;
  }
  try {
    const parsed = BigInt(raw);
    return parsed < 0n ? 0n : parsed;
  } catch {
    return 0n;
  }
}

function resolveEnv(): MarketEnv | null {
  const address = process.env.DRAGNET_MARKET ?? process.env.NEXT_PUBLIC_DRAGNET_MARKET;
  if (address === undefined || !isAddress(address)) {
    return null;
  }
  const chainKeyRaw = process.env.DRAGNET_CHAIN ?? process.env.NEXT_PUBLIC_DRAGNET_CHAIN ?? "testnet";
  const chainKey: ChainKey =
    chainKeyRaw === "mainnet" ? "mainnet" : chainKeyRaw === "local" ? "local" : "testnet";
  const chain = chainForKey(chainKey);
  const rpcUrl =
    process.env.DRAGNET_RPC_URL ??
    process.env.NEXT_PUBLIC_DRAGNET_RPC_URL ??
    chain.rpcUrls.default.http[0] ??
    "";
  return { address, chain, rpcUrl, deployBlock: parseDeployBlock() };
}

function publicClientFor(env: MarketEnv): PublicClient {
  // Retry budget so an incidental rate-limit (Monad testnet caps requests) recovers.
  return createPublicClient({ chain: env.chain, transport: http(env.rpcUrl, { retryCount: 6, retryDelay: 300 }) });
}

function clientFor(env: MarketEnv, publicClient: PublicClient): MarketClient {
  return new MarketClient(env.address, publicClient, undefined, undefined, env.deployBlock);
}

function rowFromChain(id: bigint, bounty: {
  status: number;
  m: number;
  lo: bigint;
  hi: bigint;
  payout: bigint;
  bond: bigint;
}): LedgerRow | null {
  const status = STATUS_NAME[bounty.status];
  if (status === undefined) {
    return null; // status None: an unused slot, not a real record.
  }
  const paid = status === "Paid";
  const rangeLabel = formatRange(bounty.lo, bounty.hi);
  return {
    id: id.toString(),
    lo: bounty.lo,
    hi: bounty.hi,
    rangeLabel,
    rangeFull: rangeLabel,
    m: bounty.m,
    payout: formatMon(bounty.payout),
    bond: formatMon(bounty.bond),
    status,
    coverage: paid ? 100 : 0,
    returnedLabel: paid ? `${bounty.m}/${bounty.m}` : `0/${bounty.m}`,
  };
}

export interface LedgerResult {
  rows: LedgerRow[];
  source: DataSource;
}

export async function getLedger(): Promise<LedgerResult> {
  const env = resolveEnv();
  if (env === null) {
    return { rows: SAMPLE_ROWS, source: "sample" };
  }
  const client = clientFor(env, publicClientFor(env));
  const count = await client.bountyCount();
  if (!count.ok) {
    // Surface an essential-read failure to the route's error boundary intentionally,
    // instead of a raw unhandled rejection from deep in the SDK.
    throw new Error(`could not read the market: ${count.error}`);
  }
  const total = Number(count.value);
  const first = Math.max(1, total - LEDGER_LIMIT + 1);
  if (total > LEDGER_LIMIT) {
    console.warn(
      `[getLedger] market holds ${total} bounties; showing the newest ${LEDGER_LIMIT}`,
    );
  }
  const rows: LedgerRow[] = [];
  for (let id = total; id >= first; id--) {
    const bounty = await client.getBounty(BigInt(id));
    if (!bounty.ok) {
      // One unreadable row should not blank the whole ledger; skip it and note why.
      console.warn(`[getLedger] skipping bounty ${id}: ${bounty.error}`);
      continue;
    }
    const row = rowFromChain(BigInt(id), bounty.value);
    if (row !== null) {
      rows.push(row);
    }
  }
  return { rows, source: "chain" };
}

// A worker's latest observed state for one bounty, collapsed from its events. A
// commit is the entry point; a Paid or Slashed event is terminal and overrides it.
type WorkerState = "committed" | "paid" | "slashed";

interface WorkerRecord {
  worker: Address;
  state: WorkerState;
  // For "paid": the payout received. For "slashed": the bond forfeited. Else 0.
  amount: bigint;
}

function fieldEntryFor(record: WorkerRecord, m: number): WorkerLogEntry {
  const full = record.worker;
  const addr = truncateHex(record.worker, 4, 4);
  if (record.state === "paid") {
    // Payment only settles when every canary was returned, so coverage is m/m.
    return {
      addr,
      full,
      paid: true,
      word: "",
      wordColor: palette.ink,
      sub: "",
      subColor: palette.muted,
      covLabel: `${m}/${m}`,
      amount: `${formatMon(record.amount)} MON`,
      amountColor: palette.ink,
    };
  }
  if (record.state === "slashed") {
    return {
      addr,
      full,
      paid: false,
      word: "Slashed",
      wordColor: palette.error,
      sub: "bond forfeited",
      subColor: palette.muted,
      covLabel: "-",
      amount: `${formatMon(record.amount)} MON`,
      amountColor: palette.faint,
    };
  }
  // Committed but not yet revealed: the return count is not on chain until reveal.
  return {
    addr,
    full,
    paid: false,
    word: "Committed",
    wordColor: palette.accent,
    sub: "return pending",
    subColor: palette.pending,
    covLabel: "-",
    amount: "-",
    amountColor: palette.faint,
  };
}

// Build the field log for one bounty from its Committed, Paid, and Slashed events
// (fetched and paginated by the SDK). Best-effort: an RPC failure yields an empty
// log rather than failing the page, and the reason is logged (never any secret).
// Workers appear in the order they first commit, with the terminal state folded in.
async function buildFieldLog(client: MarketClient, bountyId: bigint, m: number): Promise<WorkerLogEntry[]> {
  // Best-effort: an RPC failure yields an empty log rather than failing the page (the
  // field log is supplementary to the bounty itself), and the reason is logged.
  const eventsResult = await client.fetchFieldEvents(bountyId);
  if (!eventsResult.ok) {
    console.warn(`[buildFieldLog] could not read events for bounty ${bountyId}: ${eventsResult.error}`);
    return [];
  }
  const events = eventsResult.value;

  // Map preserves first-insertion order, so a worker keeps its commit position
  // while a later Paid/Slashed overwrites its state in place.
  const byWorker = new Map<string, WorkerRecord>();
  for (const event of events) {
    const key = event.worker.toLowerCase();
    if (event.kind === "committed") {
      if (!byWorker.has(key)) {
        byWorker.set(key, { worker: event.worker, state: "committed", amount: 0n });
      }
      continue;
    }
    byWorker.set(key, { worker: event.worker, state: event.kind, amount: event.amount });
  }

  return Array.from(byWorker.values(), (record) => fieldEntryFor(record, m));
}

export interface DetailResult {
  detail: BountyDetail;
  source: DataSource;
}

export async function getBountyDetail(id: string): Promise<DetailResult | null> {
  const env = resolveEnv();
  if (env === null) {
    return { detail: sampleDetailFor(id), source: "sample" };
  }
  let numericId: bigint;
  try {
    numericId = BigInt(id);
  } catch {
    return null;
  }
  const publicClient = publicClientFor(env);
  const client = clientFor(env, publicClient);
  const count = await client.bountyCount();
  if (!count.ok) {
    throw new Error(`could not read the market: ${count.error}`);
  }
  if (numericId < 1n || numericId > count.value) {
    return null;
  }
  const bountyResult = await client.getBounty(numericId);
  if (!bountyResult.ok) {
    throw new Error(`could not read bounty ${id}: ${bountyResult.error}`);
  }
  const bounty = bountyResult.value;
  const status = STATUS_NAME[bounty.status];
  if (status === undefined) {
    return null;
  }
  const workers = await buildFieldLog(client, numericId, bounty.m);
  const nowSec = Math.floor(Date.now() / 1000);
  const claimRemaining = status === "Open" ? Math.max(0, Number(bounty.claimDeadline) - nowSec) : null;
  const paid = status === "Paid";
  const detail: BountyDetail = {
    id: numericId.toString(),
    lo: bounty.lo,
    hi: bounty.hi,
    rangeLabel: formatRange(bounty.lo, bounty.hi),
    m: bounty.m,
    status,
    coverage: paid ? 100 : 0,
    bestReturn: paid ? `${bounty.m}/${bounty.m}` : `0/${bounty.m}`,
    targetRoot: bounty.targetRoot,
    escrow: formatMon(bounty.payout + bounty.bond),
    payout: formatMon(bounty.payout),
    bond: formatMon(bounty.bond),
    buyer: bounty.buyer,
    buyerShort: truncateHex(bounty.buyer, 10, 4),
    claimRemainingSec: claimRemaining,
    settledBlock: null,
    workers,
  };
  return { detail, source: "chain" };
}

// Re-exported so route files import the view types from one place.
export type { BountyDetail, LedgerRow, DataSource };
