/// Regenerate packages/sdk/src/abi.ts from the compiled Foundry artifact.
/// Run after changing DragnetMarket.sol: `forge build` then `bun run scripts/gen-abi.ts`.
import { readFileSync, writeFileSync } from "node:fs";

const ARTIFACT = "contracts/out/DragnetMarket.sol/DragnetMarket.json";
const OUTPUT = "packages/sdk/src/abi.ts";

function main(): void {
  const raw = readFileSync(ARTIFACT, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || !("abi" in parsed)) {
    throw new Error(`[gen-abi] ${ARTIFACT} has no abi field; run 'forge build' first`);
  }
  const abi = (parsed as { abi: unknown }).abi;
  const header =
    `// Generated from ${ARTIFACT} by scripts/gen-abi.ts. Do not edit by hand.\n\n`;
  const body = `export const dragnetMarketAbi = ${JSON.stringify(abi, null, 2)} as const;\n`;
  writeFileSync(OUTPUT, header + body);
  console.log(`[gen-abi] wrote ${OUTPUT}`);
}

main();
