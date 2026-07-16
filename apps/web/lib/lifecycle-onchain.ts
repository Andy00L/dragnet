import type { Address, Hex } from "viem";
import { buildReveal, err, ok, targetListMatchesRoot } from "@dragnet/crypto";
import type { Result } from "@dragnet/crypto";
import type { ClientMarketConfig } from "./client-config";
import { ensureChain } from "./post-onchain";
import type { Eip1193Provider } from "./post-onchain";
import { readClient, writeClient } from "./run-onchain";

// The bounty-lifecycle actions the connected wallet can take after a sweep: a buyer
// reclaiming an unclaimed bounty (open), a committer taking an abandoned one (slash),
// and reading a standing claimable balance. Write helpers mirror run-onchain.ts:
// switch the wallet to the configured chain, then let MarketClient simulate so a
// revert surfaces its distinct custom-error name.

// Buyer opens an unclaimed bounty after its claim window, reclaiming payout + bond by
// re-proving the canaries were findable. Needs the buyer's saved canary keys; the
// target list is read back from the chain and checked against the committed root.
export async function openBountyOnChain(
  provider: Eip1193Provider,
  buyer: Address,
  config: ClientMarketConfig,
  bountyId: bigint,
  canaryKeys: bigint[],
): Promise<Result<Hex>> {
  const chainReady = await ensureChain(provider, config);
  if (!chainReady.ok) {
    return chainReady;
  }
  const market = writeClient(provider, buyer, config);
  const bounty = await market.getBounty(bountyId);
  if (!bounty.ok) {
    return bounty;
  }
  const addresses = await market.fetchTargetList(bountyId);
  if (!addresses.ok) {
    return addresses;
  }
  if (!targetListMatchesRoot(addresses.value, bounty.value.targetRoot)) {
    return err("the published target list does not match the on-chain root");
  }
  const reveal = buildReveal(canaryKeys, addresses.value);
  if (!reveal.ok) {
    return reveal;
  }
  return market.openBounty(bountyId, reveal.value);
}

// A committer slashes a buyer who never opened by the open deadline, taking payout +
// bond. The contract gates the committer and the deadline; the client only sends it.
export async function slashBountyOnChain(
  provider: Eip1193Provider,
  committer: Address,
  config: ClientMarketConfig,
  bountyId: bigint,
): Promise<Result<Hex>> {
  const chainReady = await ensureChain(provider, config);
  if (!chainReady.ok) {
    return chainReady;
  }
  const market = writeClient(provider, committer, config);
  return market.slash(bountyId);
}

// The connected wallet's standing claimable balance (credited but not yet withdrawn).
export async function readClaimable(config: ClientMarketConfig, account: Address): Promise<Result<bigint>> {
  const market = readClient(config);
  return market.pendingWithdrawals(account);
}

// Upper bound on canary keys in an uploaded file, matching the contract's MAX_M cap
// on m (sourceRef: contracts/src/DragnetMarket.sol MAX_M = 256). Rejecting an
// oversized array up front stops a corrupted or hostile file from driving thousands
// of synchronous secp256k1 multiplications in buildReveal and freezing the tab.
const MAX_CANARY_KEYS = 256;

// Parse an uploaded canary-keys file (the JSON the buyer downloaded when posting) into
// the private keys, so the buyer can open the bounty. Accepts the 0x-hex keys the web
// download writes and plain decimal keys the CLI writes. Rejects a mismatched bounty.
export function parseCanaryKeysFile(text: string, bountyId: bigint): Result<bigint[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return err("that file is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    return err("that file is not a canary-keys record");
  }
  const record = parsed as { bountyId?: unknown; canaries?: unknown; canaryKeys?: unknown };
  const rawKeys = record.canaries ?? record.canaryKeys;
  if (!Array.isArray(rawKeys) || rawKeys.length === 0) {
    return err("that file has no canary keys");
  }
  if (rawKeys.length > MAX_CANARY_KEYS) {
    return err(`that file has ${rawKeys.length} keys, more than the maximum of ${MAX_CANARY_KEYS}`);
  }
  if (typeof record.bountyId === "string" && record.bountyId !== bountyId.toString()) {
    return err(`those keys are for bounty ${record.bountyId}, not bounty ${bountyId}`);
  }
  const keys: bigint[] = [];
  for (const entry of rawKeys) {
    if (typeof entry !== "string" || (!/^0x[0-9a-fA-F]+$/.test(entry) && !/^\d+$/.test(entry))) {
      return err("a canary key in that file is malformed");
    }
    keys.push(BigInt(entry));
  }
  return ok(keys);
}
