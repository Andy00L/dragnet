import { type Hex, type Result, buildReveal } from "@dragnet/crypto";
import type { MarketClient } from "@dragnet/sdk";

/// Open an unclaimed bounty after its claim window, proving the canaries were
/// findable, so the buyer reclaims payout + bond. The target list is read back
/// from the chain, so the buyer only needs to have kept the secret canary keys.
export async function openBounty(
  market: MarketClient,
  bountyId: bigint,
  canaryKeys: bigint[],
): Promise<Result<Hex>> {
  const addresses = await market.fetchTargetList(bountyId);
  if (!addresses.ok) return addresses;

  const reveal = buildReveal(canaryKeys, addresses.value);
  if (!reveal.ok) return reveal;

  return market.openBounty(bountyId, reveal.value);
}
