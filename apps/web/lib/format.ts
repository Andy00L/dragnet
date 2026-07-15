import { formatUnits } from "viem";
import type { Hex } from "viem";

// MON has 18 decimals (chains.ts nativeCurrency). Amounts render to 3 decimals,
// tabular, everywhere they appear.
const MON_DECIMALS = 18;

export function formatMon(wei: bigint): string {
  return Number(formatUnits(wei, MON_DECIMALS)).toFixed(3);
}

// Truncate a hex string (address, root, tx hash) to lead+tail with an ellipsis,
// keeping the 0x prefix. Used for every on-chain identifier shown in the UI.
export function truncateHex(value: string, lead = 6, tail = 4): string {
  if (value.length <= 2 + lead + tail) {
    return value;
  }
  return `${value.slice(0, 2 + lead)}…${value.slice(-tail)}`;
}

// Group digits for a decimal keyspace magnitude ("8,000"). Ranges above the safe
// integer boundary are shown as hex by the caller, so Number() is safe here.
export function groupDigits(value: bigint | number): string {
  return Number(value).toLocaleString("en-US");
}

// Render a keyspace bound: small ranges as grouped decimals, large ones as
// truncated hex so a 256-bit bound stays legible.
const DECIMAL_CEILING = 100_000_000n;

export function formatBound(value: bigint): string {
  if (value < DECIMAL_CEILING) {
    return groupDigits(value);
  }
  const hex = `0x${value.toString(16)}` as Hex;
  return truncateHex(hex, 6, 4);
}

// The [lo, hi] range label, matching the ledger and detail screens.
export function formatRange(lo: bigint, hi: bigint): string {
  return `[${formatBound(lo)}, ${formatBound(hi)}]`;
}
