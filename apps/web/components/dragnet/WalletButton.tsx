"use client";

import { useWallet } from "./WalletProvider";

// The rail's connect control. Real injected-wallet connect (EIP-1193); once
// connected it shows the truncated account in mono. Never a dead control.
export function WalletButton() {
  const { address, addressShort, connecting, error, connect } = useWallet();
  const label = address !== null ? addressShort : connecting ? "Connecting…" : "Connect wallet";
  return (
    <button
      type="button"
      onClick={connect}
      className="btn-ghost"
      disabled={connecting || address !== null}
      title={error ?? undefined}
      aria-label={address !== null ? `Connected: ${address}` : "Connect wallet"}
    >
      {address !== null ? <span className="mono">{addressShort}</span> : label}
    </button>
  );
}
