import { createPublicClient, createWalletClient, custom, isHex, parseEther, toHex } from "viem";
import type { Account, Address, Hex } from "viem";
import { addressesToBytes, buildTargetList, err, generateCanaries, ok } from "@dragnet/crypto";
import type { Result } from "@dragnet/crypto";
import { MarketClient, dragnetHttpTransport } from "@dragnet/sdk";
import type { ClientMarketConfig } from "./client-config";

// EIP-1193 provider shape (same as WalletProvider). The post flow never logs or
// transmits the canary private keys: they are used only to derive the public
// hash160 target list and root, then handed back to the buyer as a local file.
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface PostFormInput {
  lo: bigint;
  hi: bigint;
  m: number;
  payout: string;
  bond: string;
  claimWindowSeconds: bigint;
  openWindowSeconds: bigint;
}

export interface PreparedPost {
  lo: bigint;
  hi: bigint;
  m: number;
  targetRoot: Hex;
  payout: bigint;
  bond: bigint;
  claimWindow: bigint;
  openWindow: bigint;
  targetList: Hex;
  // SECRET: the buyer's canary private keys, kept in memory only.
  canaries: bigint[];
}

// Generate canaries and build the target list plus its root for a post. Uses the
// platform CSPRNG (the @dragnet/crypto default). All secret material stays inside
// the returned object; nothing here writes to storage, logs, or the network.
export function preparePost(input: PostFormInput): Result<PreparedPost> {
  const canaries = generateCanaries(input.lo, input.hi, input.m);
  if (!canaries.ok) {
    return canaries;
  }
  const list = buildTargetList(canaries.value);
  if (!list.ok) {
    return list;
  }
  let payout: bigint;
  let bond: bigint;
  try {
    payout = parseEther(input.payout);
    bond = parseEther(input.bond);
  } catch {
    return err("payout and bond must be valid MON amounts");
  }
  return ok({
    lo: input.lo,
    hi: input.hi,
    m: input.m,
    targetRoot: list.value.tree.root,
    payout,
    bond,
    claimWindow: input.claimWindowSeconds,
    openWindow: input.openWindowSeconds,
    targetList: addressesToBytes(list.value.addresses),
    canaries: canaries.value,
  });
}

function chainIdOf(value: unknown): number | null {
  if (typeof value === "string" && isHex(value)) {
    return Number.parseInt(value, 16);
  }
  if (typeof value === "number") {
    return value;
  }
  return null;
}

// EIP-1193 provider errors carry a numeric code (sourceRef: EIP-1193 ProviderRpcError).
// 4001: the user rejected the request. 4902: the requested chain has not been added to
// the wallet (sourceRef: MetaMask wallet_switchEthereumChain docs).
const USER_REJECTED_CODE = 4001;
const UNRECOGNIZED_CHAIN_CODE = 4902;

function providerErrorCode(caught: unknown): number | null {
  if (typeof caught === "object" && caught !== null && "code" in caught) {
    return typeof caught.code === "number" ? caught.code : null;
  }
  return null;
}

async function readWalletChainId(provider: Eip1193Provider): Promise<number | null> {
  try {
    return chainIdOf(await provider.request({ method: "eth_chainId" }));
  } catch {
    return null;
  }
}

// Poll cadence and budget for the wallet to report the target chain after a switch or
// add request resolves. Some providers resolve wallet_switchEthereumChain before the
// switch has propagated, or without performing it at all, so the request resolving is
// not proof the wallet moved: only an eth_chainId readback is. 15 polls at 200ms give
// a slow wallet 3 seconds before the flow refuses to send on the wrong chain.
const CHAIN_SWITCH_POLL_MS = 200;
const CHAIN_SWITCH_MAX_POLLS = 15;

// Make sure the injected wallet is on the configured chain: request a switch if not,
// offer to add the chain when the wallet does not know it (4902), then trust only a
// re-read of eth_chainId before letting a transaction flow proceed. Without the
// readback, a wallet that resolves the switch request optimistically lets the caller
// send on the old chain and fail later with a chain-mismatch at the first write.
export async function ensureChain(provider: Eip1193Provider, config: ClientMarketConfig): Promise<Result<true>> {
  const targetId = config.chain.id;
  if ((await readWalletChainId(provider)) === targetId) {
    return ok(true);
  }
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: toHex(targetId) }],
    });
  } catch (caught) {
    const code = providerErrorCode(caught);
    if (code === USER_REJECTED_CODE) {
      return err(`chain switch rejected in the wallet; switch to ${config.chain.name} (chain ${targetId}) to continue`);
    }
    if (code !== UNRECOGNIZED_CHAIN_CODE) {
      return err(`could not switch the wallet to ${config.chain.name} (chain ${targetId})`);
    }
    // 4902: the wallet does not know the chain yet. Adding it also prompts a switch.
    try {
      const explorer = config.chain.blockExplorers?.default;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: toHex(targetId),
            chainName: config.chain.name,
            nativeCurrency: config.chain.nativeCurrency,
            rpcUrls: [config.rpcUrl],
            ...(explorer === undefined ? {} : { blockExplorerUrls: [explorer.url] }),
          },
        ],
      });
    } catch (addCaught) {
      return providerErrorCode(addCaught) === USER_REJECTED_CODE
        ? err(`adding ${config.chain.name} rejected in the wallet; add chain ${targetId} to continue`)
        : err(`could not add ${config.chain.name} (chain ${targetId}) to the wallet`);
    }
  }
  for (let poll = 0; poll < CHAIN_SWITCH_MAX_POLLS; poll++) {
    if ((await readWalletChainId(provider)) === targetId) {
      return ok(true);
    }
    await new Promise((resolve) => setTimeout(resolve, CHAIN_SWITCH_POLL_MS));
  }
  return err(`the wallet is still not on ${config.chain.name} (chain ${targetId}); switch it in the wallet and retry`);
}

// Post the prepared bounty from the injected wallet, escrowing payout + bond. The
// bounty id comes back from the on-chain BountyPosted event (via MarketClient).
export async function postOnChain(
  provider: Eip1193Provider,
  buyer: Address,
  config: ClientMarketConfig,
  prepared: PreparedPost,
): Promise<Result<{ bountyId: bigint; txHash: Hex }>> {
  const chainReady = await ensureChain(provider, config);
  if (!chainReady.ok) {
    return chainReady;
  }
  const account: Account = { address: buyer, type: "json-rpc" };
  const publicClient = createPublicClient({ chain: config.chain, transport: dragnetHttpTransport(config.rpcUrl) });
  const walletClient = createWalletClient({ chain: config.chain, transport: custom(provider), account });
  const market = new MarketClient(config.marketAddress, publicClient, walletClient, account);
  return market.postBounty({
    lo: prepared.lo,
    hi: prepared.hi,
    m: prepared.m,
    targetRoot: prepared.targetRoot,
    payout: prepared.payout,
    bond: prepared.bond,
    claimWindow: prepared.claimWindow,
    openWindow: prepared.openWindow,
    targetList: prepared.targetList,
  });
}

// Serialize the buyer's canary keys for a local download. Never called with any
// path that transmits the result; the caller turns this into a Blob download.
export function canaryKeysFile(bountyId: bigint, rangeLabel: string, m: number, targetRoot: Hex, canaries: bigint[]): string {
  return JSON.stringify(
    {
      bountyId: bountyId.toString(),
      range: rangeLabel,
      m,
      targetRoot,
      canaries: canaries.map((key) => toHex(key, { size: 32 })),
      warning:
        "SECRET. These canary private keys prove your bounty. Store them securely and never share them. You need them to refund the bounty after it expires.",
    },
    null,
    2,
  );
}
