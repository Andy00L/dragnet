#!/usr/bin/env bun
import { type Address, type Hex, isHex, toHex } from "viem";
import { MarketClient, loadConfig } from "@dragnet/sdk";
import { runWorker } from "./worker";

interface ParsedArgs {
  bountyId: bigint;
  skipFraction: number;
  salt: Hex;
}

function randomSalt(): Hex {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function parseArgs(argv: string[]): { ok: true; value: ParsedArgs } | { ok: false; error: string } {
  const positional: string[] = [];
  let skipFraction = 0;
  let salt: Hex | undefined;
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === undefined) continue;
    if (token === "--cheat") {
      skipFraction = 0.15;
    } else if (token === "--skip") {
      const next = argv[++index];
      const parsed = Number(next);
      if (next === undefined || Number.isNaN(parsed)) {
        return { ok: false, error: "--skip requires a fraction, e.g. --skip 0.15" };
      }
      skipFraction = parsed;
    } else if (token === "--salt") {
      const next = argv[++index];
      // Validate the full 32-byte hex here, not just the 0x prefix: an invalid salt
      // otherwise crashes commitHash only after the (potentially multi-hour) scan.
      if (next === undefined || !isHex(next) || next.length !== 66) {
        return { ok: false, error: "--salt requires a 32-byte 0x-prefixed hex value" };
      }
      salt = next;
    } else {
      positional.push(token);
    }
  }
  const idText = positional[0];
  if (idText === undefined) {
    return { ok: false, error: "usage: dragnet-scan <bountyId> [--cheat | --skip 0.15] [--salt 0x..]" };
  }
  let bountyId: bigint;
  try {
    bountyId = BigInt(idText);
  } catch {
    return { ok: false, error: `bountyId must be an integer, got "${idText}"` };
  }
  return { ok: true, value: { bountyId, skipFraction, salt: salt ?? randomSalt() } };
}

/// Load config and build a signing client, or exit with a distinct message. Shared
/// by the scan and slash flows since both need a funded worker key.
function marketWithSigner(): { market: MarketClient; workerAddress: Address } {
  const config = loadConfig();
  if (!config.ok) {
    console.error(`[dragnet-scan] configuration error: ${config.error}`);
    process.exit(2);
  }
  if (config.value.account === undefined) {
    console.error("[dragnet-scan] set PRIVATE_KEY to a worker key");
    process.exit(2);
  }
  return { market: MarketClient.fromConfig(config.value), workerAddress: config.value.account.address };
}

/// After openDeadline, a worker that committed can take payout + bond from a buyer
/// who never opened (for example one that planted unfindable canaries). This is the
/// client half of that deterrent; the contract enforces the committer and deadline
/// gates. On success the credited funds are withdrawn to the worker's wallet.
async function runSlash(argv: string[]): Promise<void> {
  const idText = argv[0];
  if (idText === undefined) {
    console.error("[dragnet-scan] usage: dragnet-scan slash <bountyId>");
    process.exit(2);
  }
  let bountyId: bigint;
  try {
    bountyId = BigInt(idText);
  } catch {
    console.error(`[dragnet-scan] bountyId must be an integer, got "${idText}"`);
    process.exit(2);
  }

  const { market } = marketWithSigner();
  const slashed = await market.slash(bountyId);
  if (!slashed.ok) {
    console.error(`[dragnet-scan] slash failed: ${slashed.error}`);
    process.exit(1);
  }
  console.log(`[dragnet-scan] slashed bounty ${bountyId} (tx ${slashed.value}); payout + bond credited`);

  const withdrawn = await market.withdraw();
  if (withdrawn.ok) {
    console.log(`[dragnet-scan] withdrew credited funds to wallet (tx ${withdrawn.value})`);
  } else {
    console.log(`[dragnet-scan] funds credited; withdraw separately (${withdrawn.error})`);
  }
}

async function runScan(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (!args.ok) {
    console.error(`[dragnet-scan] ${args.error}`);
    process.exit(2);
  }

  const { market, workerAddress } = marketWithSigner();
  const outcome = await runWorker(market, workerAddress, {
    bountyId: args.value.bountyId,
    salt: args.value.salt,
    skipFraction: args.value.skipFraction,
  });

  console.log(
    `[dragnet-scan] result: found ${outcome.found}/${outcome.required}, ` +
      `revealed=${outcome.revealed}, paid=${outcome.paid}` +
      (outcome.revertReason !== undefined ? `, reason=${outcome.revertReason}` : ""),
  );
  process.exit(outcome.paid || outcome.revealed ? 0 : 1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === "slash") {
    await runSlash(argv.slice(1));
    return;
  }
  await runScan(argv);
}

main().catch((error: unknown) => {
  console.error(`[dragnet-scan] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
