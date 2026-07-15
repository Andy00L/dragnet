import { createPublicClient, http, isAddress } from "viem";
import type { Address, Chain } from "viem";
import { BountyStatus, MarketClient, chainForKey } from "@dragnet/sdk";
import type { ChainKey } from "@dragnet/sdk";
import { formatMon, formatRange, truncateHex } from "./format";
import { SAMPLE_ROWS, sampleDetailFor } from "./records";
import type { BountyDetail, DataSource, LedgerRow } from "./records";
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
  return { address, chain, rpcUrl };
}

function clientFor(env: MarketEnv): MarketClient {
  const publicClient = createPublicClient({ chain: env.chain, transport: http(env.rpcUrl) });
  return new MarketClient(env.address, publicClient);
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
  const client = clientFor(env);
  const count = await client.bountyCount();
  const total = Number(count);
  const first = Math.max(1, total - LEDGER_LIMIT + 1);
  if (total > LEDGER_LIMIT) {
    console.warn(
      `[getLedger] market holds ${total} bounties; showing the newest ${LEDGER_LIMIT}`,
    );
  }
  const rows: LedgerRow[] = [];
  for (let id = total; id >= first; id--) {
    const bounty = await client.getBounty(BigInt(id));
    const row = rowFromChain(BigInt(id), bounty);
    if (row !== null) {
      rows.push(row);
    }
  }
  return { rows, source: "chain" };
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
  const client = clientFor(env);
  const count = await client.bountyCount();
  if (numericId < 1n || numericId > count) {
    return null;
  }
  const bounty = await client.getBounty(numericId);
  const status = STATUS_NAME[bounty.status];
  if (status === undefined) {
    return null;
  }
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
    workers: [],
  };
  return { detail, source: "chain" };
}

// Re-exported so route files import the view types from one place.
export type { BountyDetail, LedgerRow, DataSource };
