import { type Hex, type Result, buildReveal, err, targetListMatchesRoot } from "@dragnet/crypto";
import { BountyStatus, type MarketClient } from "@dragnet/sdk";

/// Open an unclaimed bounty after its claim window, proving the canaries were
/// findable, so the buyer reclaims payout + bond. The target list is read back
/// from the chain, so the buyer only needs to have kept the secret canary keys.
export async function openBounty(
  market: MarketClient,
  bountyId: bigint,
  canaryKeys: bigint[],
): Promise<Result<Hex>> {
  const bounty = await market.getBounty(bountyId);
  if (!bounty.ok) return bounty;
  // getBounty returns a zeroed struct for an unknown id instead of reverting
  // (sourceRef: contracts/src/DragnetMarket.sol getBounty), and a status-None bounty
  // has no BountyPosted event, so without this guard fetchTargetList would page the
  // whole [deployBlock, head] range before failing. Non-open states fail here too,
  // saving the scan and the reveal build the contract would reject anyway.
  if (bounty.value.status === BountyStatus.None) return err(`bounty ${bountyId} does not exist`);
  if (bounty.value.status !== BountyStatus.Open) {
    return err(`bounty ${bountyId} is not open; only an open bounty can be reclaimed`);
  }
  const addresses = await market.fetchTargetList(bountyId);
  if (!addresses.ok) return addresses;

  // Guard against a list that does not match the committed root (the same check the
  // worker makes), so a corrupted event read fails clearly here instead of as an
  // opaque on-chain NotListed revert.
  if (!targetListMatchesRoot(addresses.value, bounty.value.targetRoot)) {
    return err(`bounty ${bountyId} target list does not hash to its on-chain root`);
  }

  const reveal = buildReveal(canaryKeys, addresses.value);
  if (!reveal.ok) return reveal;

  return market.openBounty(bountyId, reveal.value);
}
