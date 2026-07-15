"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { truncateHex } from "@/lib/format";

// Minimal EIP-1193 surface for an injected wallet. No `any`: the request result is
// validated at the call site before use.
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

interface WalletState {
  address: string | null;
  addressShort: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

function firstAccount(result: unknown): string | null {
  if (Array.isArray(result) && typeof result[0] === "string") {
    return result[0];
  }
  return null;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (connecting || address !== null) {
      return;
    }
    const provider = typeof window !== "undefined" ? window.ethereum : undefined;
    if (provider === undefined) {
      setError("No wallet detected. Install a Monad-compatible wallet to connect.");
      return;
    }
    setError(null);
    setConnecting(true);
    provider
      .request({ method: "eth_requestAccounts" })
      .then((result) => {
        const account = firstAccount(result);
        if (account === null) {
          setError("The wallet returned no account.");
          return;
        }
        setAddress(account);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Wallet connection was refused.");
      })
      .finally(() => setConnecting(false));
  }, [address, connecting]);

  const value = useMemo<WalletState>(
    () => ({
      address,
      addressShort: address === null ? null : truncateHex(address, 4, 4),
      connecting,
      error,
      connect,
    }),
    [address, connecting, error, connect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const value = useContext(WalletContext);
  if (value === null) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return value;
}
