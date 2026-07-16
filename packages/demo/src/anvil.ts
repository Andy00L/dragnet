import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Address, type Hex, createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvilLocal, dragnetMarketAbi } from "@dragnet/sdk";

const ARTIFACT_PATH = join(
  import.meta.dir,
  "../../../contracts/out/DragnetMarket.sol/DragnetMarket.json",
);

export interface AnvilHandle {
  rpcUrl: string;
  stop: () => void;
}

/// Spawn a local anvil node with interval mining, so blocks tick on their own and
/// the reveal (which must land after its commit block) is not stuck waiting.
export async function startAnvil(port = 8545, blockTimeSeconds = 1): Promise<AnvilHandle> {
  const proc = Bun.spawn(
    ["anvil", "--port", String(port), "--block-time", String(blockTimeSeconds), "--silent"],
    { stdout: "ignore", stderr: "ignore" },
  );
  const rpcUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForRpc(rpcUrl);
  } catch (caught) {
    // The handle (and its stop()) is never returned on this path, so kill the child
    // here or it is orphaned, holding the port and failing every later run.
    proc.kill();
    throw caught;
  }
  return {
    rpcUrl,
    stop: () => {
      proc.kill();
    },
  };
}

async function waitForRpc(rpcUrl: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      });
      if (response.ok) return;
    } catch {
      // Node not up yet; keep polling.
    }
    if (Date.now() > deadline) {
      throw new Error(`[startAnvil] anvil at ${rpcUrl} did not become ready in ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

function loadBytecode(): Hex {
  const parsed: unknown = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("bytecode" in parsed)) {
    throw new Error(`[loadBytecode] ${ARTIFACT_PATH} has no bytecode; run 'forge build' first`);
  }
  const bytecode = parsed.bytecode;
  if (typeof bytecode !== "object" || bytecode === null || !("object" in bytecode)) {
    throw new Error(`[loadBytecode] bytecode.object missing in ${ARTIFACT_PATH}`);
  }
  const object = bytecode.object;
  if (typeof object !== "string") {
    throw new Error("[loadBytecode] bytecode.object is not a string");
  }
  return `0x${object.replace(/^0x/, "")}`;
}

/// Deploy DragnetMarket to a running node and return its address.
export async function deployMarket(rpcUrl: string, deployerKey: Hex): Promise<Address> {
  const account = privateKeyToAccount(deployerKey);
  const transport = http(rpcUrl);
  const wallet = createWalletClient({ chain: anvilLocal, transport, account });
  const publicClient = createPublicClient({ chain: anvilLocal, transport });
  const hash = await wallet.deployContract({
    abi: dragnetMarketAbi,
    bytecode: loadBytecode(),
    args: [],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.contractAddress === null || receipt.contractAddress === undefined) {
    throw new Error("[deployMarket] deployment produced no contract address");
  }
  return receipt.contractAddress;
}
