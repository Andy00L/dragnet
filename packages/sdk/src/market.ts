import {
  type Account,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
} from "viem";
import { type Result, type RevealPayload, bytesToAddresses, err, ok } from "@dragnet/crypto";
import { dragnetMarketAbi } from "./abi";
import type { DragnetConfig } from "./config";

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

/// One worker-facing event for a bounty, flattened from the Committed, Paid, and
/// Slashed streams. `amount` is the payout (paid), the forfeited bond (slashed), or
/// zero (committed). Sorted by block then log index by fetchFieldEvents.
export interface WorkerEvent {
  kind: "committed" | "paid" | "slashed";
  worker: Address;
  amount: bigint;
  block: bigint;
  logIndex: number;
}

/// Typed viem wrapper over DragnetMarket. Read methods return values; write
/// methods simulate first (so a revert surfaces its distinct custom error), then
/// send and wait for the receipt.
// eth_getLogs block-range cap on public RPCs (Monad testnet rejects wider spans
// with error -32614 "eth_getLogs is limited to a 100 range"). Event scans page in
// windows this wide. sourceRef: Monad testnet JSON-RPC (eth_getLogs).
const LOG_WINDOW = 100n;

// Pause between successive paged getLogs calls. Monad testnet caps requests at
// 25/sec (error -32005); one request per window plus this gap keeps a multi-window
// field-log scan comfortably under that. sourceRef: Monad testnet JSON-RPC.
const LOG_THROTTLE_MS = 45;

export class MarketClient {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient | undefined;
  private readonly account: Account | undefined;
  private readonly address: Address;
  private readonly deployBlock: bigint;

  constructor(
    address: Address,
    publicClient: PublicClient,
    walletClient?: WalletClient,
    account?: Account,
    deployBlock: bigint = 0n,
  ) {
    this.address = address;
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.account = account;
    this.deployBlock = deployBlock;
  }

  static fromConfig(config: DragnetConfig): MarketClient {
    // Retry budget so an incidental rate-limit (Monad testnet caps requests) backs
    // off and recovers instead of surfacing as a hard failure.
    const transport = http(config.rpcUrl, { retryCount: 6, retryDelay: 300 });
    const publicClient = createPublicClient({ chain: config.chain, transport });
    const walletClient = config.account
      ? createWalletClient({ chain: config.chain, transport, account: config.account })
      : undefined;
    return new MarketClient(
      config.marketAddress,
      publicClient,
      walletClient,
      config.account,
      config.deployBlock,
    );
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

  /// Wait for a sent transaction's receipt and reject a mined-but-reverted one.
  /// viem's waitForTransactionReceipt resolves for a reverted transaction (it only
  /// throws on timeout/not-found), so without this check a transaction that passed
  /// local simulation but reverted once mined (for example a reveal that lost the
  /// race after another worker was paid) would be reported as success. Thrown here
  /// so guarded() maps it to a Result.err. sourceRef: viem waitForTransactionReceipt.
  private async confirm(txHash: Hex): Promise<TransactionReceipt> {
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error(`transaction reverted on chain (tx ${txHash})`);
    }
    return receipt;
  }

  /// Wrap a read (an eth_call or getLogs) so an RPC failure, timeout, or the
  /// documented Monad rate limit surfaces as a Result.err instead of a thrown
  /// rejection. Mirrors guarded() on the write side, so every SDK method fails the
  /// same, actionable way rather than crashing the caller.
  private async guardedRead<T>(read: () => Promise<T>): Promise<Result<T>> {
    try {
      return ok(await read());
    } catch (caught) {
      return err(describeRevert(caught));
    }
  }

  async bountyCount(): Promise<Result<bigint>> {
    return this.guardedRead(() =>
      this.publicClient.readContract({ ...this.base(), functionName: "bountyCount" }),
    );
  }

  async getBounty(bountyId: bigint): Promise<Result<OnChainBounty>> {
    return this.guardedRead(() =>
      this.publicClient.readContract({ ...this.base(), functionName: "getBounty", args: [bountyId] }),
    );
  }

  async pendingWithdrawals(account: Address): Promise<Result<bigint>> {
    return this.guardedRead(() =>
      this.publicClient.readContract({
        ...this.base(),
        functionName: "pendingWithdrawals",
        args: [account],
      }),
    );
  }

  async getTransactionBlock(hash: Hex): Promise<Result<bigint>> {
    return this.guardedRead(async () => {
      const receipt = await this.publicClient.getTransactionReceipt({ hash });
      return receipt.blockNumber;
    });
  }

  /// Poll until the chain advances past `block`. The reveal must land in a strictly
  /// later block than the commit, so a worker waits here between the two.
  async waitForBlockAfter(block: bigint, pollMs = 500, maxWaitMs = 60_000): Promise<Result<bigint>> {
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      const current = await this.guardedRead(() => this.publicClient.getBlockNumber());
      if (!current.ok) return current;
      if (current.value > block) return ok(current.value);
      if (Date.now() > deadline) {
        return err(`timed out waiting for a block after ${block} (still at ${current.value})`);
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  /// Find the newest match for a paged query, scanning [deployBlock, head] backward
  /// in windows so a recent event resolves in the first request. Used for one-off
  /// lookups (the target list, posted once per bounty).
  private async findLatestPaged<TLog>(
    query: (fromBlock: bigint, toBlock: bigint) => Promise<TLog[]>,
  ): Promise<TLog | undefined> {
    const head = await this.publicClient.getBlockNumber();
    let toBlock = head;
    while (toBlock >= this.deployBlock) {
      const fromBlock =
        toBlock - LOG_WINDOW + 1n < this.deployBlock ? this.deployBlock : toBlock - LOG_WINDOW + 1n;
      const logs = await query(fromBlock, toBlock);
      const last = logs[logs.length - 1];
      if (last !== undefined) {
        return last;
      }
      if (fromBlock <= this.deployBlock) {
        break;
      }
      toBlock = fromBlock - 1n;
    }
    return undefined;
  }

  /// Find the BountyPosted event for one bounty, scanning newest-first so a recent
  /// post resolves in the first window. Shared by fetchTargetList and the field-log
  /// scan, which both need the post (its list, and the block it landed in).
  private async findBountyPosted(bountyId: bigint) {
    return this.findLatestPaged((fromBlock, toBlock) =>
      this.publicClient.getContractEvents({
        ...this.base(),
        eventName: "BountyPosted",
        args: { bountyId },
        fromBlock,
        toBlock,
      }),
    );
  }

  /// Fetch the published target list (hash160 addresses) from the BountyPosted event.
  async fetchTargetList(bountyId: bigint): Promise<Result<Hex[]>> {
    const found = await this.guardedRead(() => this.findBountyPosted(bountyId));
    if (!found.ok) return found;
    if (found.value === undefined || found.value.args.targetList === undefined) {
      return err(`no BountyPosted event found for bounty ${bountyId}`);
    }
    return bytesToAddresses(found.value.args.targetList);
  }

  /// Fetch and flatten the Committed, Paid, and Slashed events for a bounty into a
  /// single chronologically sorted list (the field log source). One getLogs per
  /// window (sequential, throttled) keeps the scan under the RPC's request-rate cap;
  /// the raw logs are decoded locally, so extra event types cost no requests.
  async fetchFieldEvents(bountyId: bigint): Promise<Result<WorkerEvent[]>> {
    return this.guardedRead(() => this.readFieldEvents(bountyId));
  }

  /// The throwing body of fetchFieldEvents, wrapped by guardedRead above so an RPC
  /// failure mid-scan becomes a Result.err rather than an unhandled rejection.
  private async readFieldEvents(bountyId: bigint): Promise<WorkerEvent[]> {
    const head = await this.publicClient.getBlockNumber();
    // A bounty's Committed/Paid/Slashed events cannot predate its post, so start the
    // scan at the BountyPosted block instead of deployBlock. This keeps the scan
    // bounded to the bounty's own lifetime rather than growing with total chain
    // history, which otherwise makes every field-log read linearly slower over time.
    const posted = await this.findBountyPosted(bountyId);
    const startBlock =
      posted?.blockNumber !== undefined && posted.blockNumber !== null
        ? posted.blockNumber
        : this.deployBlock;
    const rawLogs: Log[] = [];
    let fromBlock = startBlock;
    while (fromBlock <= head) {
      const toBlock = fromBlock + LOG_WINDOW - 1n > head ? head : fromBlock + LOG_WINDOW - 1n;
      const logs = await this.publicClient.getLogs({ address: this.address, fromBlock, toBlock });
      for (const log of logs) {
        rawLogs.push(log);
      }
      fromBlock = toBlock + 1n;
      if (fromBlock <= head) {
        await new Promise((resolve) => setTimeout(resolve, LOG_THROTTLE_MS));
      }
    }

    const events: WorkerEvent[] = [];
    for (const log of parseEventLogs({ abi: dragnetMarketAbi, eventName: "Committed", logs: rawLogs })) {
      if (log.args.bountyId !== bountyId || log.blockNumber === null || log.logIndex === null) {
        continue;
      }
      events.push({ kind: "committed", worker: log.args.worker, amount: 0n, block: log.blockNumber, logIndex: log.logIndex });
    }
    for (const log of parseEventLogs({ abi: dragnetMarketAbi, eventName: "Paid", logs: rawLogs })) {
      if (log.args.bountyId !== bountyId || log.blockNumber === null || log.logIndex === null) {
        continue;
      }
      events.push({ kind: "paid", worker: log.args.worker, amount: log.args.payout, block: log.blockNumber, logIndex: log.logIndex });
    }
    for (const log of parseEventLogs({ abi: dragnetMarketAbi, eventName: "Slashed", logs: rawLogs })) {
      if (log.args.bountyId !== bountyId || log.blockNumber === null || log.logIndex === null) {
        continue;
      }
      events.push({ kind: "slashed", worker: log.args.committer, amount: log.args.amount, block: log.blockNumber, logIndex: log.logIndex });
    }
    events.sort((left, right) =>
      left.block !== right.block ? (left.block < right.block ? -1 : 1) : left.logIndex - right.logIndex,
    );
    return events;
  }

  async postBounty(params: PostBountyParams): Promise<Result<{ bountyId: bigint; txHash: Hex }>> {
    return this.guarded(async (wallet, account) => {
      const { request } = await this.publicClient.simulateContract({
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
      const receipt = await this.confirm(txHash);
      // The authoritative id is the one the contract assigned, read from the
      // BountyPosted event. The simulated `result` reflects pre-send state and would
      // be wrong if another postBounty is mined between simulate and send. confirm()
      // has already rejected a reverted receipt, so a successful post must carry the
      // event; its absence means an unexpected ABI/address mismatch, surfaced as an
      // error rather than silently trusting the stale simulate value.
      const marketLogs = receipt.logs.filter(
        (entry) => entry.address.toLowerCase() === this.address.toLowerCase(),
      );
      const posted = parseEventLogs({
        abi: dragnetMarketAbi,
        eventName: "BountyPosted",
        logs: marketLogs,
      });
      const emitted = posted[0];
      if (emitted === undefined) {
        throw new Error(`postBounty mined (tx ${txHash}) but emitted no BountyPosted event`);
      }
      return { bountyId: emitted.args.bountyId, txHash };
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
      await this.confirm(txHash);
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
      await this.confirm(txHash);
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
      await this.confirm(txHash);
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
      await this.confirm(txHash);
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
      await this.confirm(txHash);
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
