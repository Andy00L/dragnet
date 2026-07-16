import { http } from "viem";

// Shared HTTP transport for every Dragnet read/write client.
//
// Public RPCs (Monad testnet) cap requests at 25/sec (JSON-RPC error -32005,
// LimitExceededRpcError) and cap eth_getLogs to a 100-block range. viem already
// retries -32005, but with a flat delay and a low default attempt count that a
// sustained burst (a paged log scan, or several clients reading at once) outlasts,
// surfacing the limit as a hard failure. Raising the attempt count and the delay
// gives a transient rate-limit a wider window to clear before the read gives up.
// Centralised here so the SDK and the web app share one policy instead of three
// drifting copies. sourceRef: Monad testnet JSON-RPC limits; viem buildRequest
// shouldRetry (retries LimitExceededRpcError, code -32005).
const RETRY_COUNT = 10;
const RETRY_DELAY_MS = 500; // flat per-attempt delay: ~5s total recovery window

export function dragnetHttpTransport(rpcUrl: string) {
  return http(rpcUrl, { retryCount: RETRY_COUNT, retryDelay: RETRY_DELAY_MS });
}
