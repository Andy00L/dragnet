import { http } from "viem";
import type { Transport } from "viem";

// Shared HTTP transport for every Dragnet read/write client.
//
// Public RPCs (Monad testnet) cap requests at 25/sec (JSON-RPC error -32005,
// LimitExceededRpcError) and cap eth_getLogs to a 100-block range. viem already
// retries -32005, but a retry only helps a single stalled request; it does nothing
// about the *rate* at which requests leave the process. A page that fires several
// readers at once (the sweep target list, the bounty detail, the lifecycle panel)
// bursts past 25/sec even though each reader on its own is modest, and a per-loop
// throttle cannot see the other loops.
//
// So pacing lives here, at the one choke point every client shares: a process-global
// gate spaces successive requests by a minimum interval, capping the aggregate rate
// across all clients in a process (one browser tab, or one server instance) under the
// RPC limit no matter how many scans run concurrently. Retries stay on as a backstop
// for a transient blip. sourceRef: Monad testnet JSON-RPC 25 req/sec; viem
// buildRequest shouldRetry (retries LimitExceededRpcError, code -32005).
const RETRY_COUNT = 10;
const RETRY_DELAY_MS = 500; // flat per-attempt delay: ~5s total recovery window

// ~18 req/sec (1000 / 55), a deliberate margin under the 25/sec cap so clock jitter
// and the odd retry cannot push a one-second window over the limit.
const MIN_REQUEST_INTERVAL_MS = 55;

// The next instant a request may leave the process, shared across every transport this
// module hands out. Each call claims the next slot and waits for it, so N concurrent
// callers fan out to one-per-interval instead of all firing at once. `Math.max(now, ...)`
// lets the cursor catch up after an idle gap rather than releasing a stale burst.
let nextRequestAt = 0;

function pace(): Promise<void> {
  const now = Date.now();
  const scheduledAt = Math.max(now, nextRequestAt);
  nextRequestAt = scheduledAt + MIN_REQUEST_INTERVAL_MS;
  const wait = scheduledAt - now;
  return wait > 0 ? new Promise((resolve) => setTimeout(resolve, wait)) : Promise.resolve();
}

export function dragnetHttpTransport(rpcUrl: string): Transport {
  const inner = http(rpcUrl, { retryCount: RETRY_COUNT, retryDelay: RETRY_DELAY_MS });
  return (params) => {
    const instance = inner(params);
    return {
      ...instance,
      request: (args, options) => pace().then(() => instance.request(args, options)),
    };
  };
}
