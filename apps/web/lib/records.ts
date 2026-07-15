import type { StatusName } from "./tokens";
import { palette } from "./tokens";

// View models shared by the ledger and the bounty detail. Coverage and the
// returned k/m are live only where a worker has actually run; on-chain the
// contract stores just the status, so chain rows derive a coverage of 0 (open) or
// full (paid). The sample records below carry the richer demo values.
export interface LedgerRow {
  id: string;
  lo: bigint;
  hi: bigint;
  rangeLabel: string;
  rangeFull: string;
  m: number;
  payout: string;
  bond: string;
  status: StatusName;
  coverage: number;
  returnedLabel: string;
}

export interface WorkerLogEntry {
  addr: string;
  full: string;
  paid: boolean;
  word: string;
  wordColor: string;
  sub: string;
  subColor: string;
  covLabel: string;
  amount: string;
  amountColor: string;
}

export interface BountyDetail {
  id: string;
  lo: bigint;
  hi: bigint;
  rangeLabel: string;
  m: number;
  status: StatusName;
  coverage: number;
  bestReturn: string;
  targetRoot: string;
  escrow: string;
  payout: string;
  bond: string;
  buyer: string;
  buyerShort: string;
  claimRemainingSec: number | null;
  settledBlock: number | null;
  workers: WorkerLogEntry[];
}

// The source of a screen's data: a live chain read, or the built-in demo ledger
// shown when no market address is configured yet. Surfaced honestly in the UI.
export type DataSource = "chain" | "sample";

// The demo ledger, lifted verbatim from the approved Market export so the deployed
// site is alive before a contract address is set. Real magnitudes across states.
export const SAMPLE_ROWS: LedgerRow[] = [
  { id: "42", lo: 1n, hi: 8000n, rangeLabel: "[1, 8000]", rangeFull: "[1, 8000]", m: 5, payout: "5.000", bond: "2.000", status: "Open", coverage: 58, returnedLabel: "4/5" },
  {
    id: "41",
    lo: 0x4000000000000000n,
    hi: 0x7fffffffffffffffn,
    rangeLabel: "[0x4000…, 0x7fff…]",
    rangeFull: "[0x4000000000000000, 0x7fffffffffffffff]",
    m: 20,
    payout: "12.500",
    bond: "5.000",
    status: "Paid",
    coverage: 100,
    returnedLabel: "20/20",
  },
  {
    id: "40",
    lo: 0x0800000000n,
    hi: 0x0fffffffffn,
    rangeLabel: "[0x0800…, 0x0fff…]",
    rangeFull: "[0x0800000000, 0x0fffffffff]",
    m: 12,
    payout: "8.000",
    bond: "3.500",
    status: "Open",
    coverage: 31,
    returnedLabel: "3/12",
  },
  { id: "39", lo: 1000000n, hi: 2000000n, rangeLabel: "[1000000, 2000000]", rangeFull: "[1000000, 2000000]", m: 8, payout: "3.000", bond: "1.000", status: "Open", coverage: 12, returnedLabel: "1/8" },
  { id: "37", lo: 1n, hi: 500000n, rangeLabel: "[1, 500000]", rangeFull: "[1, 500000]", m: 5, payout: "4.000", bond: "2.000", status: "Refunded", coverage: 100, returnedLabel: "5/5" },
  { id: "36", lo: 1n, hi: 250000n, rangeLabel: "[1, 250000]", rangeFull: "[1, 250000]", m: 6, payout: "2.500", bond: "1.000", status: "Open", coverage: 66, returnedLabel: "4/6" },
  { id: "33", lo: 1n, hi: 8000n, rangeLabel: "[1, 8000]", rangeFull: "[1, 8000]", m: 10, payout: "6.000", bond: "3.000", status: "Slashed", coverage: 74, returnedLabel: "7/10" },
];

// The demo field log for bounty 42, from the Bounty Detail export.
const SAMPLE_WORKERS_42: WorkerLogEntry[] = [
  {
    addr: "0x7099…79C8",
    full: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    paid: true,
    word: "",
    wordColor: palette.ink,
    sub: "",
    subColor: palette.muted,
    covLabel: "5/5",
    amount: "5.000 MON",
    amountColor: palette.ink,
  },
  {
    addr: "0x3C44…93BC",
    full: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    paid: false,
    word: "Returned 4/5",
    wordColor: palette.ink,
    sub: "earned zero · LengthMismatch",
    subColor: palette.muted,
    covLabel: "4/5",
    amount: "0.000 MON",
    amountColor: palette.faint,
  },
  {
    addr: "0x90F7…b96C",
    full: "0x90F79bf6EB2c4f870365E785982E1f101E93b96C",
    paid: false,
    word: "Committed",
    wordColor: palette.accent,
    sub: "return pending",
    subColor: palette.pending,
    covLabel: "5/5",
    amount: "-",
    amountColor: palette.faint,
  },
];

const DETAIL_42: BountyDetail = {
  id: "42",
  lo: 1n,
  hi: 8000n,
  rangeLabel: "[1, 8000]",
  m: 5,
  status: "Open",
  coverage: 58,
  bestReturn: "5/5",
  targetRoot: "0x7ce7f9a1c04dd1f6b3a8fc5b6e2d9a41c88e07d24b1f9a3c65e80b7241a6fd4d",
  escrow: "7.000",
  payout: "5.000",
  bond: "2.000",
  buyer: "0x8a3f19c4b2E71Fb0d0a49cD6E38a0d4E3D42c19d",
  buyerShort: "0x8a3f19c4b2…c19d",
  claimRemainingSec: 2 * 3600 + 14 * 60 + 31,
  settledBlock: null,
  workers: SAMPLE_WORKERS_42,
};

const SAMPLE_DETAILS: Record<string, BountyDetail> = {
  "42": DETAIL_42,
};

// Build a plausible detail for any sample ledger row without a bespoke entry, so
// a click from the demo ledger always lands on a coherent record.
export function sampleDetailFor(id: string): BountyDetail {
  const known = SAMPLE_DETAILS[id];
  if (known !== undefined) {
    return known;
  }
  const row = SAMPLE_ROWS.find((candidate) => candidate.id === id);
  if (row === undefined) {
    return DETAIL_42;
  }
  const payoutNum = Number(row.payout);
  const bondNum = Number(row.bond);
  const settled = row.status !== "Open";
  return {
    id: row.id,
    lo: row.lo,
    hi: row.hi,
    rangeLabel: row.rangeLabel,
    m: row.m,
    status: row.status,
    coverage: row.coverage,
    bestReturn: row.returnedLabel,
    targetRoot: "0x7ce7f9a1c04dd1f6b3a8fc5b6e2d9a41c88e07d24b1f9a3c65e80b7241a6fd4d",
    escrow: (payoutNum + bondNum).toFixed(3),
    payout: row.payout,
    bond: row.bond,
    buyer: "0x8a3f19c4b2E71Fb0d0a49cD6E38a0d4E3D42c19d",
    buyerShort: "0x8a3f19c4b2…c19d",
    claimRemainingSec: settled ? null : 3 * 3600,
    settledBlock: settled ? 4182905 : null,
    workers: [],
  };
}
