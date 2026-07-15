import {
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
} from "viem";
import { type Result, type RevealPayload, bytesToAddresses, err, ok } from "@dragnet/crypto";
import { dragnetMarketAbi } from "./abi.js";
import type { DragnetConfig } from "./config.js";

export enum BountyStatus {
  None = 0,
  Open = 1,
  Paid = 2,
  Refunded = 3,
  Slashed = 4,
}

export interface OnChainBounty {
  buyer: Address;
  status: number;
  m: number;
  claimDeadline: bigint;
  openDeadline: bigint;
  lo: bigint;
  hi: bigint;
  targetRoot: Hex;
  payout: bigint;
  bond: bigint;
  winner: Address;
}

export interface PostBountyParams {
  lo: bigint;
  hi: bigint;
  m: number;
  targetRoot: Hex;
  payout: bigint;
  bond: bigint;
  claimWindow: bigint;
  openWindow: bigint;
  targetList: Hex;
}

/// Typed viem wrapper over DragnetMarket. Read methods return values; write
/// methods simulate first (so a revert surfaces its distinct custom error), then
/// send and wait for the receipt.
export class MarketClient {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient | undefined;
  private readonly account: Account | undefined;
  private readonly address: Address;

  constructor(
    address: Address,
    publicClient: PublicClient,
    walletClient?: WalletClient,
    account?: Account,
  ) {
    this.address = address;
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.account = account;
  }

  static fromConfig(config: DragnetConfig): MarketClient {
    const transport = http(config.rpcUrl);
    const publicClient = createPublicClient({ chain: config.chain, transport });
    const walletClient = config.account
      ? createWalletClient({ chain: config.chain, transport, account: config.account })
      : undefined;
    return new MarketClient(config.marketAddress, publicClient, walletClient, config.account);
  }

  private base() {
    return { address: this.address, abi: dragnetMarketAbi } as const;
  }

  /// Run a write flow with a signer in hand, mapping any revert to its distinct
  /// custom-error name. Keeps viem's per-call type inference intact (no casts).
  private async guarded<T>(
    action: (wallet: WalletClient, account: Account) => Promise<T>,
  ): Promise<Result<T>> {
    if (this.walletClient === undefined || this.account === undefined) {
      return err("no signer configured: set PRIVATE_KEY");
    }
    try {
      return ok(await action(this.walletClient, this.account));
    } catch (caught) {
      return err(describeRevert(caught));
    }
  }

  async bountyCount(): Promise<bigint> {
    return this.publicClient.readContract({ ...this.base(), functionName: "bountyCount" });
  }

  async getBounty(bountyId: bigint): Promise<OnChainBounty> {
    return this.publicClient.readContract({
      ...this.base(),
      functionName: "getBounty",
      args: [bountyId],
    });
  }

  async pendingWithdrawals(account: Address): Promise<bigint> {
    return this.publicClient.readContract({
      ...this.base(),
      functionName: "pendingWithdrawals",
      args: [account],
    });
  }

  async getBlockNumber(): Promise<bigint> {
    return this.publicClient.getBlockNumber();
  }

  async getTransactionBlock(hash: Hex): Promise<bigint> {
    const receipt = await this.publicClient.getTransactionReceipt({ hash });
    return receipt.blockNumber;
  }

  /// Poll until the chain advances past `block`. The reveal must land in a strictly
  /// later block than the commit, so a worker waits here between the two.
  async waitForBlockAfter(block: bigint, pollMs = 500, maxWaitMs = 60_000): Promise<Result<bigint>> {
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      const current = await this.getBlockNumber();
      if (current > block) return ok(current);
      if (Date.now() > deadline) {
        return err(`timed out waiting for a block after ${block} (still at ${current})`);
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  /// Fetch the published target list (hash160 addresses) from the BountyPosted event.
  async fetchTargetList(bountyId: bigint): Promise<Result<Hex[]>> {
    const logs = await this.publicClient.getContractEvents({
      ...this.base(),
      eventName: "BountyPosted",
      args: { bountyId },
      fromBlock: "earliest",
    });
    const first = logs[0];
    if (first === undefined || first.args.targetList === undefined) {
      return err(`no BountyPosted event found for bounty ${bountyId}`);
    }
    return bytesToAddresses(first.args.targetList);
  }

  async postBounty(params: PostBountyParams): Promise<Result<{ bountyId: bigint; txHash: Hex }>> {
    return this.guarded(async (wallet, account) => {
      const { request, result } = await this.publicClient.simulateContract({
        ...this.base(),
        account,
        functionName: "postBounty",
        args: [
          params.lo,
          params.hi,
          params.m,
          params.targetRoot,
          params.payout,
          params.bond,
          params.claimWindow,
          params.openWindow,
          params.targetList,
        ],
        value: params.payout + params.bond,
      });
      const txHash = await wallet.writeContract(request);
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      // The authoritative id is the one the contract assigned, read from the
      // BountyPosted event. The simulated `result` reflects pre-send state and would
      // be wrong if another postBounty is mined between simulate and send.
      const marketLogs = receipt.logs.filter(
        (entry) => entry.address.toLowerCase() === this.address.toLowerCase(),
      );
      const posted = parseEventLogs({
        abi: dragnetMarketAbi,
        eventName: "BountyPosted",
        logs: marketLogs,
      });
      const emitted = posted[0];
      const bountyId = emitted !== undefined ? emitted.args.bountyId : result;
      return { bountyId, txHash };
    });
  }

  async commit(bountyId: bigint, commitHash: Hex): Promise<Result<Hex>> {
    return this.guarded(async (wallet, account) => {
      const { request } = await this.publicClient.simulateContract({
        ...this.base(),
        account,
        functionName: "commit",
        args: [bountyId, commitHash],
      });
      const txHash = await wallet.writeContract(request);
      await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      return txHash;
    });
  }

  async reveal(bountyId: bigint, payload: RevealPayload, salt: Hex): Promise<Result<Hex>> {
    return this.guarded(async (wallet, account) => {
      const { request } = await this.publicClient.simulateContract({
        ...this.base(),
        account,
        functionName: "reveal",
        args: [bountyId, payload.keys, payload.px, payload.py, payload.proofs, salt],
      });
      const txHash = await wallet.writeContract(request);
      await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      return txHash;
    });
  }

  async openBounty(bountyId: bigint, payload: RevealPayload): Promise<Result<Hex>> {
    return this.guarded(async (wallet, account) => {
      const { request } = await this.publicClient.simulateContract({
        ...this.base(),
        account,
        functionName: "openBounty",
        args: [bountyId, payload.keys, payload.px, payload.py, payload.proofs],
      });
      const txHash = await wallet.writeContract(request);
      await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      return txHash;
    });
  }

  async slash(bountyId: bigint): Promise<Result<Hex>> {
    return this.guarded(async (wallet, account) => {
      const { request } = await this.publicClient.simulateContract({
        ...this.base(),
        account,
        functionName: "slash",
        args: [bountyId],
      });
      const txHash = await wallet.writeContract(request);
      await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      return txHash;
    });
  }

  async withdraw(): Promise<Result<Hex>> {
    return this.guarded(async (wallet, account) => {
      const { request } = await this.publicClient.simulateContract({
        ...this.base(),
        account,
        functionName: "withdraw",
      });
      const txHash = await wallet.writeContract(request);
      await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      return txHash;
    });
  }
}

/// Extract a distinct, actionable message from a viem contract error, preferring
/// the contract's custom-error name (LengthMismatch, NotCommitted, and so on).
export function describeRevert(caught: unknown): string {
  if (caught instanceof BaseError) {
    const reverted = caught.walk((error) => error instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name !== undefined && name.length > 0) return name;
      if (reverted.reason !== undefined && reverted.reason.length > 0) return reverted.reason;
    }
    return caught.shortMessage;
  }
  return caught instanceof Error ? caught.message : String(caught);
}
