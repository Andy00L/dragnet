import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Address, type Hex, createTestClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { type RandomBytes } from "@dragnet/crypto";
import { BountyStatus, type DragnetConfig, MarketClient, anvilLocal } from "@dragnet/sdk";
import { openBounty as buyerOpen, postBounty as buyerPost } from "@dragnet/buyer";
import { runWorker } from "@dragnet/scanner";
import { type AnvilHandle, deployMarket, startAnvil } from "../src/anvil.js";

// Public Foundry/anvil default dev accounts (mnemonic "test test ... junk").
// These hold no real value and exist only on the local node.
const KEY_BUYER: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const KEY_HONEST: Hex = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const KEY_CHEAT: Hex = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

const SALT_HONEST: Hex = `0x${"a1".repeat(32)}`;
const SALT_CHEAT: Hex = `0x${"c0".repeat(32)}`;

const LO = 1n;
const HI = 6000n;
const M = 4;
const PAYOUT = parseEther("1");
const BOND = parseEther("1");

function seededRandomBytes(seed: number): RandomBytes {
  let state = BigInt(seed) & ((1n << 64n) - 1n);
  return (length: number): Uint8Array => {
    const out = new Uint8Array(length);
    for (let index = 0; index < length; index++) {
      state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
      out[index] = Number((state >> 33n) & 0xffn);
    }
    return out;
  };
}

let anvil: AnvilHandle;
let marketAddress: Address;

const buyerAddress = privateKeyToAccount(KEY_BUYER).address;
const honestAddress = privateKeyToAccount(KEY_HONEST).address;
const cheatAddress = privateKeyToAccount(KEY_CHEAT).address;

function marketFor(privateKey: Hex): MarketClient {
  const config: DragnetConfig = {
    chainKey: "local",
    chain: anvilLocal,
    rpcUrl: anvil.rpcUrl,
    marketAddress,
    // Fresh anvil starts at block 0, so paging events from 0 is cheap here.
    deployBlock: 0n,
    account: privateKeyToAccount(privateKey),
  };
  return MarketClient.fromConfig(config);
}

beforeAll(async () => {
  // Connect to an already-running node when DRAGNET_TEST_RPC is set (the way this
  // sandbox runs it); otherwise spawn a local anvil for this test.
  const existing = process.env.DRAGNET_TEST_RPC;
  anvil =
    existing !== undefined && existing.length > 0
      ? { rpcUrl: existing, stop: () => {} }
      : await startAnvil(8545, 1);
  marketAddress = await deployMarket(anvil.rpcUrl, KEY_BUYER);
});

afterAll(() => {
  anvil?.stop();
});

describe("Dragnet end to end on a live contract", () => {
  test(
    "an honest worker proves coverage and is paid; the buyer's bond returns",
    async () => {
      const buyerMarket = marketFor(KEY_BUYER);
      const posted = await buyerPost(buyerMarket, {
        lo: LO,
        hi: HI,
        m: M,
        payout: PAYOUT,
        bond: BOND,
        claimWindow: 3600n,
        openWindow: 3600n,
        rng: seededRandomBytes(101),
      });
      expect(posted.ok).toBe(true);
      if (!posted.ok) return;
      const bountyId = posted.value.bountyId;

      const buyerPendingBefore = await buyerMarket.pendingWithdrawals(buyerAddress);

      const honestMarket = marketFor(KEY_HONEST);
      const outcome = await runWorker(honestMarket, honestAddress, {
        bountyId,
        salt: SALT_HONEST,
        skipFraction: 0,
        log: () => {},
      });

      expect(outcome.found).toBe(M);
      expect(outcome.revealed).toBe(true);
      expect(outcome.paid).toBe(true);
      expect(outcome.withdrawTx).toBeDefined();

      const bounty = await honestMarket.getBounty(bountyId);
      expect(bounty.status).toBe(BountyStatus.Paid);
      expect(bounty.winner.toLowerCase()).toBe(honestAddress.toLowerCase());

      const buyerPendingAfter = await buyerMarket.pendingWithdrawals(buyerAddress);
      expect(buyerPendingAfter - buyerPendingBefore).toBe(BOND);
    },
    60_000,
  );

  test(
    "a cheat that skips part of the range misses a canary and earns zero",
    async () => {
      const buyerMarket = marketFor(KEY_BUYER);
      const posted = await buyerPost(buyerMarket, {
        lo: LO,
        hi: HI,
        m: M,
        payout: PAYOUT,
        bond: BOND,
        claimWindow: 3600n,
        openWindow: 3600n,
        rng: seededRandomBytes(202),
      });
      expect(posted.ok).toBe(true);
      if (!posted.ok) return;
      const bountyId = posted.value.bountyId;

      // Stop scanning one key below the highest canary, so exactly that canary is
      // missed: coverage is m-1, the reveal cannot be formed, the cheat gets nothing.
      const maxCanary = posted.value.canaryKeys.reduce(
        (highest, key) => (key > highest ? key : highest),
        0n,
      );

      const cheatMarket = marketFor(KEY_CHEAT);
      const cheatPendingBefore = await cheatMarket.pendingWithdrawals(cheatAddress);

      const outcome = await runWorker(cheatMarket, cheatAddress, {
        bountyId,
        salt: SALT_CHEAT,
        scanTo: maxCanary - 1n,
        revealEvenIfShort: true, // force the doomed reveal so the on-chain revert is asserted
        log: () => {},
      });

      expect(outcome.found).toBe(M - 1);
      expect(outcome.revealed).toBe(false);
      expect(outcome.paid).toBe(false);
      expect(outcome.revertReason).toBe("LengthMismatch");

      const cheatPendingAfter = await cheatMarket.pendingWithdrawals(cheatAddress);
      expect(cheatPendingAfter - cheatPendingBefore).toBe(0n);

      const bounty = await cheatMarket.getBounty(bountyId);
      expect(bounty.status).toBe(BountyStatus.Open);
    },
    60_000,
  );

  test(
    "an unclaimed bounty is opened by the buyer, who reclaims payout and bond",
    async () => {
      const buyerMarket = marketFor(KEY_BUYER);
      const posted = await buyerPost(buyerMarket, {
        lo: LO,
        hi: HI,
        m: M,
        payout: PAYOUT,
        bond: BOND,
        claimWindow: 2n,
        openWindow: 3600n,
        rng: seededRandomBytes(303),
      });
      expect(posted.ok).toBe(true);
      if (!posted.ok) return;
      const bountyId = posted.value.bountyId;

      // Jump past the short claim window with no worker having revealed.
      const testClient = createTestClient({
        chain: anvilLocal,
        transport: http(anvil.rpcUrl),
        mode: "anvil",
      });
      await testClient.increaseTime({ seconds: 120 });
      await testClient.mine({ blocks: 1 });

      const pendingBefore = await buyerMarket.pendingWithdrawals(buyerAddress);
      const opened = await buyerOpen(buyerMarket, bountyId, posted.value.canaryKeys);
      expect(opened.ok).toBe(true);

      const bounty = await buyerMarket.getBounty(bountyId);
      expect(bounty.status).toBe(BountyStatus.Refunded);

      const pendingAfter = await buyerMarket.pendingWithdrawals(buyerAddress);
      expect(pendingAfter - pendingBefore).toBe(PAYOUT + BOND);
    },
    60_000,
  );

  test(
    "a committer slashes a buyer who never opens and collects payout plus bond",
    async () => {
      const buyerMarket = marketFor(KEY_BUYER);
      const posted = await buyerPost(buyerMarket, {
        lo: LO,
        hi: HI,
        m: M,
        payout: PAYOUT,
        bond: BOND,
        claimWindow: 3600n,
        openWindow: 3600n,
        rng: seededRandomBytes(404),
      });
      expect(posted.ok).toBe(true);
      if (!posted.ok) return;
      const bountyId = posted.value.bountyId;

      // A worker scans short of the top canary, so it commits (proving it scanned)
      // but does not send the doomed reveal: the bounty stays Open with a committer
      // on record. This is also the TA6 case (found < m sends no reveal).
      const maxCanary = posted.value.canaryKeys.reduce(
        (highest, key) => (key > highest ? key : highest),
        0n,
      );
      const cheatMarket = marketFor(KEY_CHEAT);
      const outcome = await runWorker(cheatMarket, cheatAddress, {
        bountyId,
        salt: SALT_CHEAT,
        scanTo: maxCanary - 1n,
        log: () => {},
      });
      expect(outcome.committed).toBe(true);
      expect(outcome.revealed).toBe(false);
      expect(outcome.revertReason).toBeUndefined();

      // Jump past the claim and open windows so slash is allowed.
      const testClient = createTestClient({
        chain: anvilLocal,
        transport: http(anvil.rpcUrl),
        mode: "anvil",
      });
      await testClient.increaseTime({ seconds: 7300 });
      await testClient.mine({ blocks: 1 });

      const cheatPendingBefore = await cheatMarket.pendingWithdrawals(cheatAddress);
      const slashed = await cheatMarket.slash(bountyId);
      expect(slashed.ok).toBe(true);

      const bounty = await cheatMarket.getBounty(bountyId);
      expect(bounty.status).toBe(BountyStatus.Slashed);
      expect(bounty.winner.toLowerCase()).toBe(cheatAddress.toLowerCase());

      const cheatPendingAfter = await cheatMarket.pendingWithdrawals(cheatAddress);
      expect(cheatPendingAfter - cheatPendingBefore).toBe(PAYOUT + BOND);
    },
    60_000,
  );
});
