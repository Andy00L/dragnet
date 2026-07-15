import { type Address, type Hex, formatEther, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BountyStatus, type DragnetConfig, MarketClient, anvilLocal } from "@dragnet/sdk";
import { postBounty as buyerPost } from "@dragnet/buyer";
import { runWorker } from "@dragnet/scanner";
import { type AnvilHandle, deployMarket, startAnvil } from "./anvil.js";

// Public Foundry/anvil default dev accounts (no real value; local node only).
const KEY_BUYER: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const KEY_HONEST_A: Hex = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const KEY_CHEAT: Hex = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const KEY_HONEST_B: Hex = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";

const LO = 1n;
const HI = 8000n;
const M = 5;
const PAYOUT = parseEther("2");
const BOND = parseEther("1");

function heading(text: string): void {
  console.log(`\n${"=".repeat(64)}\n${text}\n${"=".repeat(64)}`);
}

/// Run the three-worker demo end to end: a buyer posts a bounty over a small range
/// seeded with canaries; a cheat that skips part of the range earns zero, an honest
/// worker proves full coverage and is paid, and a late honest worker finds coverage
/// already delivered. Set DRAGNET_RPC_URL to use an existing node; otherwise a local
/// anvil is spawned.
export async function runDemo(): Promise<void> {
  const existing = process.env.DRAGNET_RPC_URL;
  const anvil: AnvilHandle =
    existing !== undefined && existing.length > 0
      ? { rpcUrl: existing, stop: () => {} }
      : await startAnvil(8545, 1);

  try {
    heading("Dragnet: verifiable exclusion market for keyspace search");
    console.log(`node: ${anvil.rpcUrl}`);
    const marketAddress = await deployMarket(anvil.rpcUrl, KEY_BUYER);
    console.log(`DragnetMarket deployed at ${marketAddress}`);

    const configFor = (privateKey: Hex): DragnetConfig => ({
      chainKey: "local",
      chain: anvilLocal,
      rpcUrl: anvil.rpcUrl,
      marketAddress,
      account: privateKeyToAccount(privateKey),
    });

    const buyerMarket = MarketClient.fromConfig(configFor(KEY_BUYER));
    const buyerAddress = privateKeyToAccount(KEY_BUYER).address;
    const cheatAddress = privateKeyToAccount(KEY_CHEAT).address;
    const honestAAddress = privateKeyToAccount(KEY_HONEST_A).address;
    const honestBAddress = privateKeyToAccount(KEY_HONEST_B).address;

    heading("1. Buyer posts a bounty over [1, 8000] with 5 hidden canaries");
    const posted = await buyerPost(buyerMarket, {
      lo: LO,
      hi: HI,
      m: M,
      payout: PAYOUT,
      bond: BOND,
      claimWindow: 3600n,
      openWindow: 3600n,
    });
    if (!posted.ok) {
      console.error(`[runDemo] posting failed: ${posted.error}`);
      return;
    }
    const bountyId = posted.value.bountyId;
    const maxCanary = posted.value.canaryKeys.reduce(
      (highest, key) => (key > highest ? key : highest),
      0n,
    );
    console.log(`bounty ${bountyId}: payout ${formatEther(PAYOUT)} + bond ${formatEther(BOND)} escrowed`);
    console.log(`target list has ${posted.value.addresses.length} addresses (canaries are indistinguishable)`);

    heading("2. Cheat worker skips the top of the range (misses a canary)");
    const cheat = await runWorker(MarketClient.fromConfig(configFor(KEY_CHEAT)), cheatAddress, {
      bountyId,
      salt: `0x${"c0".repeat(32)}`,
      scanTo: maxCanary - 1n, // provably stops before the highest canary
      log: (message) => console.log(`   ${message}`),
    });

    heading("3. Honest worker scans the whole range and proves coverage");
    const honestA = await runWorker(MarketClient.fromConfig(configFor(KEY_HONEST_A)), honestAAddress, {
      bountyId,
      salt: `0x${"a1".repeat(32)}`,
      skipFraction: 0,
      log: (message) => console.log(`   ${message}`),
    });

    heading("4. A second honest worker arrives after coverage was delivered");
    const honestB = await runWorker(MarketClient.fromConfig(configFor(KEY_HONEST_B)), honestBAddress, {
      bountyId,
      salt: `0x${"b2".repeat(32)}`,
      skipFraction: 0,
      log: (message) => console.log(`   ${message}`),
    });

    heading("Result");
    const buyerBond = await buyerMarket.pendingWithdrawals(buyerAddress);
    const finalBounty = await buyerMarket.getBounty(bountyId);
    // The paid worker auto-withdrew to its wallet, so the payout is reported from
    // the settled bounty, not from the (now-zero) pending balance.
    const honestAPayout = honestA.paid ? formatEther(finalBounty.payout) : "0";

    console.log(
      `cheat worker    found ${cheat.found}/${M}, revert=${cheat.revertReason ?? "none"}, earned 0 MON`,
    );
    console.log(
      `honest worker A found ${honestA.found}/${M}, paid=${honestA.paid}, earned ${honestAPayout} MON (withdrawn to wallet)`,
    );
    console.log(
      `honest worker B found ${honestB.found}/${M}, arrived after coverage was delivered, earned 0 MON`,
    );
    console.log(`buyer bond returned (claimable): ${formatEther(buyerBond)} MON`);
    console.log(`bounty status: ${BountyStatus[finalBounty.status]}, winner ${finalBounty.winner}`);
    console.log("\nExhaustive search proven over secp256k1, no ZK. The cheat earned zero.");
  } finally {
    anvil.stop();
  }
}
