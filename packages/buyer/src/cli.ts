#!/usr/bin/env bun
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Hex, isHex, parseEther } from "viem";
import { MarketClient, loadConfig } from "@dragnet/sdk";
import { postBounty } from "./post.js";
import { openBounty } from "./open.js";

const SECRETS_DIR = join(process.cwd(), ".dragnet");

interface SavedBounty {
  bountyId: string;
  lo: string;
  hi: string;
  m: number;
  canaryKeys: string[];
}

function parse(argv: string[]): { positionals: string[]; flags: Map<string, string> } {
  const positionals: string[] = [];
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === undefined) continue;
    if (token.startsWith("--")) {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(token.slice(2), next);
        index++;
      } else {
        flags.set(token.slice(2), "true");
      }
    } else {
      positionals.push(token);
    }
  }
  return { positionals, flags };
}

function requireFlag(flags: Map<string, string>, name: string): string {
  const value = flags.get(name);
  if (value === undefined) {
    console.error(`[dragnet-buyer] missing required --${name}`);
    process.exit(2);
  }
  return value;
}

function saveSecret(record: SavedBounty): string {
  // Canary private keys stay secret until the buyer opens, so create the directory
  // and file owner-only; other local users on a shared host must not read them.
  mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
  const path = join(SECRETS_DIR, `bounty-${record.bountyId}.json`);
  writeFileSync(path, JSON.stringify(record, null, 2), { mode: 0o600 });
  // writeFileSync applies mode only when creating; enforce it if the file existed.
  chmodSync(path, 0o600);
  return path;
}

function loadSecret(bountyId: string): SavedBounty {
  const path = join(SECRETS_DIR, `bounty-${bountyId}.json`);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    console.error(`[dragnet-buyer] cannot read saved bounty at ${path}`);
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(`[dragnet-buyer] ${path} is not valid JSON`);
    process.exit(1);
  }
  if (typeof parsed !== "object" || parsed === null || !("canaryKeys" in parsed)) {
    console.error(`[dragnet-buyer] ${path} is missing canaryKeys`);
    process.exit(1);
  }
  const canaryKeys: unknown = (parsed as { canaryKeys: unknown }).canaryKeys;
  if (!Array.isArray(canaryKeys) || canaryKeys.length === 0) {
    console.error(`[dragnet-buyer] ${path} has no canary keys`);
    process.exit(1);
  }
  // Every key must be a base-10 digit string so the later BigInt conversion in
  // runOpen cannot throw on a corrupted or hand-edited file.
  for (const key of canaryKeys) {
    if (typeof key !== "string" || !/^\d+$/.test(key)) {
      console.error(`[dragnet-buyer] ${path} has a malformed canaryKeys entry`);
      process.exit(1);
    }
  }
  return parsed as SavedBounty;
}

async function runPost(flags: Map<string, string>): Promise<void> {
  const config = loadConfig();
  if (!config.ok) {
    console.error(`[dragnet-buyer] ${config.error}`);
    process.exit(2);
  }
  if (config.value.account === undefined) {
    console.error("[dragnet-buyer] set PRIVATE_KEY to the buyer key");
    process.exit(2);
  }

  const realFlag = flags.get("real");
  const realTargets: Hex[] = [];
  if (realFlag !== undefined) {
    for (const part of realFlag.split(",")) {
      if (!isHex(part)) {
        console.error(`[dragnet-buyer] --real entry "${part}" is not hex`);
        process.exit(2);
      }
      realTargets.push(part);
    }
  }

  const market = MarketClient.fromConfig(config.value);
  const result = await postBounty(market, {
    lo: BigInt(requireFlag(flags, "lo")),
    hi: BigInt(requireFlag(flags, "hi")),
    m: Number(requireFlag(flags, "m")),
    payout: parseEther(requireFlag(flags, "payout")),
    bond: parseEther(requireFlag(flags, "bond")),
    claimWindow: BigInt(requireFlag(flags, "claim")),
    openWindow: BigInt(requireFlag(flags, "open")),
    realTargets,
  });
  if (!result.ok) {
    console.error(`[dragnet-buyer] post failed: ${result.error}`);
    process.exit(1);
  }

  const path = saveSecret({
    bountyId: result.value.bountyId.toString(),
    lo: requireFlag(flags, "lo"),
    hi: requireFlag(flags, "hi"),
    m: Number(requireFlag(flags, "m")),
    canaryKeys: result.value.canaryKeys.map((key) => key.toString()),
  });

  console.log(`[dragnet-buyer] posted bounty ${result.value.bountyId} (tx ${result.value.txHash})`);
  console.log(`[dragnet-buyer] target root ${result.value.targetRoot}`);
  console.log(`[dragnet-buyer] list has ${result.value.addresses.length} addresses`);
  console.log(`[dragnet-buyer] canary keys saved to ${path} (secret; gitignored)`);
}

async function runOpen(positionals: string[]): Promise<void> {
  const bountyIdText = positionals[0];
  if (bountyIdText === undefined) {
    console.error("[dragnet-buyer] usage: dragnet-buyer open <bountyId>");
    process.exit(2);
  }
  const config = loadConfig();
  if (!config.ok) {
    console.error(`[dragnet-buyer] ${config.error}`);
    process.exit(2);
  }
  if (config.value.account === undefined) {
    console.error("[dragnet-buyer] set PRIVATE_KEY to the buyer key");
    process.exit(2);
  }

  const saved = loadSecret(bountyIdText);
  const canaryKeys = saved.canaryKeys.map((key) => BigInt(key));
  const market = MarketClient.fromConfig(config.value);
  const opened = await openBounty(market, BigInt(bountyIdText), canaryKeys);
  if (!opened.ok) {
    console.error(`[dragnet-buyer] open failed: ${opened.error}`);
    process.exit(1);
  }
  console.log(`[dragnet-buyer] opened bounty ${bountyIdText} and reclaimed escrow (tx ${opened.value})`);
}

async function main(): Promise<void> {
  const { positionals, flags } = parse(process.argv.slice(2));
  const command = positionals[0];
  const rest = positionals.slice(1);
  if (command === "post") {
    await runPost(flags);
  } else if (command === "open") {
    await runOpen(rest);
  } else {
    console.error("[dragnet-buyer] usage: dragnet-buyer <post|open> [flags]");
    process.exit(2);
  }
}

void main();
