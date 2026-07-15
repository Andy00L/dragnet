#!/usr/bin/env bun
import { type Hex, toHex } from "viem";
import { MarketClient, loadConfig } from "@dragnet/sdk";
import { runWorker } from "./worker.js";

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
      if (next === undefined || !next.startsWith("0x")) {
        return { ok: false, error: "--salt requires a 0x-prefixed value" };
      }
      salt = next as Hex;
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ok) {
    console.error(`[dragnet-scan] ${args.error}`);
    process.exit(2);
  }

  const config = loadConfig();
  if (!config.ok) {
    console.error(`[dragnet-scan] configuration error: ${config.error}`);
    process.exit(2);
  }
  if (config.value.account === undefined) {
    console.error("[dragnet-scan] set PRIVATE_KEY to a worker key");
    process.exit(2);
  }

  const market = MarketClient.fromConfig(config.value);
  const outcome = await runWorker(market, config.value.account.address, {
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

void main();
