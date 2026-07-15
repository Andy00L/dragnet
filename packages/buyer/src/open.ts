import { type Hex, type Result, buildReveal, err, targetListMatchesRoot } from "@dragnet/crypto";
import type { MarketClient } from "@dragnet/sdk";

/// Open an unclaimed bounty after its claim window, proving the canaries were
/// findable, so the buyer reclaims payout + bond. The target list is read back
/// from the chain, so the buyer only needs to have kept the secret canary keys.
export async function openBounty(
  market: MarketClient,
  bountyId: bigint,
  canaryKeys: bigint[],
): Promise<Result<Hex>> {
  const bounty = await market.getBounty(bountyId);
  const addresses = await market.fetchTargetList(bountyId);
  if (!addresses.ok) return addresses;

  // Guard against a list that does not match the committed root (the same check the
  // worker makes), so a corrupted event read fails clearly here instead of as an
  // opaque on-chain NotListed revert.
  if (!targetListMatchesRoot(addresses.value, bounty.targetRoot)) {
    return err(`bounty ${bountyId} target list does not hash to its on-chain root`);
  }

  const reveal = buildReveal(canaryKeys, addresses.value);
  if (!reveal.ok) return reveal;

  return market.openBounty(bountyId, reveal.value);
}
