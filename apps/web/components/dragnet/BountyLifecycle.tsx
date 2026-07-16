"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAddress } from "viem";
import type { Hex } from "viem";
import { BountyStatus } from "@dragnet/sdk";
import { useWallet } from "./WalletProvider";
import { clientMarketConfig } from "@/lib/client-config";
import type { ClientMarketConfig } from "@/lib/client-config";
import { readClient, withdrawPayout } from "@/lib/run-onchain";
import { openBountyOnChain, parseCanaryKeysFile, readClaimable, slashBountyOnChain } from "@/lib/lifecycle-onchain";
import { formatMon, truncateHex } from "@/lib/format";
import { palette } from "@/lib/tokens";

interface BountyFacts {
  status: number;
  buyer: string;
  claimDeadlineSec: number;
  openDeadlineSec: number;
  escrow: string;
}

type Busy = "open" | "slash" | "withdraw" | null;

// The lifecycle panel for the connected wallet on a bounty's page: reclaim a standing
// balance, open an unclaimed bounty as its buyer, or slash an abandoned one as a
// committer. Rendered only when a market is configured (real mode); it reads the
// bounty's deadlines and the wallet's claimable balance from the chain itself, so the
// server detail payload stays unchanged. Nothing shows unless an action is available.
export function BountyLifecycle({ bountyId }: { bountyId: string }) {
  const wallet = useWallet();
  const [config, setConfig] = useState<ClientMarketConfig | null>(null);
  const [facts, setFacts] = useState<BountyFacts | null>(null);
  const [claimable, setClaimable] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [canaryKeys, setCanaryKeys] = useState<bigint[] | null>(null);
  const [keysLabel, setKeysLabel] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // clientMarketConfig reads NEXT_PUBLIC_* env inlined at build time; resolve it once
  // on the client so a null (demo mode) result hides this panel entirely.
  useEffect(() => {
    setConfig(clientMarketConfig());
  }, []);

  const address = wallet.address;

  // Sync with the chain (an external system): read the bounty's lifecycle facts and,
  // when a wallet is connected, its claimable balance. Re-runs when the wallet changes
  // or a completed action bumps refreshToken. The ignore flag drops a stale read if
  // the inputs change before it resolves.
  useEffect(() => {
    if (config === null) {
      return;
    }
    let ignore = false;
    const load = async () => {
      let numericId: bigint;
      try {
        numericId = BigInt(bountyId);
      } catch {
        return;
      }
      const bounty = await readClient(config).getBounty(numericId);
      if (ignore) {
        return;
      }
      if (bounty.ok) {
        setFacts({
          status: bounty.value.status,
          buyer: bounty.value.buyer,
          claimDeadlineSec: Number(bounty.value.claimDeadline),
          openDeadlineSec: Number(bounty.value.openDeadline),
          escrow: formatMon(bounty.value.payout + bounty.value.bond),
        });
      }
      if (address !== null && isAddress(address)) {
        const owed = await readClaimable(config, address);
        if (!ignore && owed.ok) {
          setClaimable(owed.value);
        }
      } else if (!ignore) {
        setClaimable(null);
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [config, bountyId, address, refreshToken]);

  const onLoadKeys = useCallback(async (file: File) => {
    setError(null);
    let numericId: bigint;
    try {
      numericId = BigInt(bountyId);
    } catch {
      setError(`invalid bounty id ${bountyId}`);
      return;
    }
    const text = await file.text();
    const parsed = parseCanaryKeysFile(text, numericId);
    if (!parsed.ok) {
      setCanaryKeys(null);
      setKeysLabel(null);
      setError(parsed.error);
      return;
    }
    setCanaryKeys(parsed.value);
    setKeysLabel(`${file.name} · ${parsed.value.length} keys`);
  }, [bountyId]);

  const settled = (tx: Hex, message: string) => {
    setNotice(`${message} (${truncateHex(tx, 8, 5)})`);
    setRefreshToken((current) => current + 1);
  };

  const provider = typeof window !== "undefined" ? window.ethereum : undefined;
  const ready = config !== null && provider !== undefined && address !== null && isAddress(address);

  const onWithdraw = async () => {
    if (busy !== null || !ready || config === null || provider === undefined || address === null) {
      return;
    }
    setBusy("withdraw");
    setError(null);
    setNotice(null);
    const result = await withdrawPayout(provider, address, config);
    setBusy(null);
    if (result.ok) {
      settled(result.value, "withdrawn to your wallet");
    } else {
      setError(result.error);
    }
  };

  const onOpen = async () => {
    if (busy !== null || !ready || config === null || provider === undefined || address === null || canaryKeys === null) {
      return;
    }
    setBusy("open");
    setError(null);
    setNotice(null);
    let numericId: bigint;
    try {
      numericId = BigInt(bountyId);
    } catch {
      setBusy(null);
      setError(`invalid bounty id ${bountyId}`);
      return;
    }
    const result = await openBountyOnChain(provider, address, config, numericId, canaryKeys);
    setBusy(null);
    if (result.ok) {
      settled(result.value, "opened and escrow reclaimed");
    } else {
      setError(result.error);
    }
  };

  const onSlash = async () => {
    if (busy !== null || !ready || config === null || provider === undefined || address === null) {
      return;
    }
    setBusy("slash");
    setError(null);
    setNotice(null);
    let numericId: bigint;
    try {
      numericId = BigInt(bountyId);
    } catch {
      setBusy(null);
      setError(`invalid bounty id ${bountyId}`);
      return;
    }
    const result = await slashBountyOnChain(provider, address, config, numericId);
    setBusy(null);
    if (result.ok) {
      settled(result.value, "slashed and escrow claimed");
    } else {
      setError(result.error);
    }
  };

  if (config === null) {
    return null;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const isOpen = facts !== null && facts.status === BountyStatus.Open;
  const claimElapsed = facts !== null && nowSec > facts.claimDeadlineSec;
  const openElapsed = facts !== null && nowSec > facts.openDeadlineSec;
  const isBuyer =
    facts !== null && address !== null && address.toLowerCase() === facts.buyer.toLowerCase();
  const canOpen = isOpen && claimElapsed && isBuyer;
  const canSlash = isOpen && openElapsed;
  const hasClaimable = claimable !== null && claimable > 0n;

  // Nothing to offer this visitor: keep the page uncluttered rather than showing an
  // empty control (the existing run/explorer action still renders below).
  if (!hasClaimable && !canOpen && !canSlash) {
    return null;
  }

  const settleIn = "settleY 320ms cubic-bezier(0.16,1,0.3,1) both";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {hasClaimable && claimable !== null ? (
        <div className="card" style={{ padding: 22, animation: settleIn }}>
          <div style={{ fontSize: 15, color: palette.muted }}>Your claimable balance</div>
          <div className="display30 mono" style={{ marginTop: 6 }}>
            {formatMon(claimable)} <span style={{ fontSize: 15, color: palette.muted }}>MON</span>
          </div>
          <p className="small muted" style={{ margin: "6px 0 14px", textWrap: "pretty" }}>
            Credited to your wallet on chain from a paid reveal, an open, or a slash. Withdraw it whenever.
          </p>
          <button type="button" className="btn-primary" style={{ width: "100%" }} disabled={busy !== null} onClick={() => void onWithdraw()}>
            {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
          </button>
        </div>
      ) : null}

      {canOpen ? (
        <div className="card" style={{ padding: 22, animation: settleIn }}>
          <p style={{ fontSize: 15, lineHeight: 1.55, fontWeight: 600, color: palette.ink, margin: 0 }}>Reclaim your escrow</p>
          <p className="small muted" style={{ margin: "6px 0 14px", textWrap: "pretty" }}>
            The claim window has closed with no paid worker. Load the canary keys you saved when posting to prove the canaries were findable and reclaim {facts?.escrow} MON.
          </p>
          {/* A real button drives a hidden input, so the loader keeps a visible focus
              ring and a keyboard path (a visually-hidden input would not). */}
          <button type="button" className="btn-outline" onClick={() => fileInputRef.current?.click()}>
            {keysLabel ?? "Load canary keys (.json)"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) {
                void onLoadKeys(file);
              }
            }}
          />
          <button
            type="button"
            className="btn-primary"
            style={{ width: "100%", marginTop: 10 }}
            disabled={busy !== null || canaryKeys === null}
            onClick={() => void onOpen()}
          >
            {busy === "open" ? "Opening…" : `Open and reclaim ${facts?.escrow ?? ""} MON`}
          </button>
        </div>
      ) : null}

      {canSlash ? (
        <div className="card" style={{ padding: 22, animation: settleIn }}>
          <p style={{ fontSize: 15, lineHeight: 1.55, fontWeight: 600, color: palette.ink, margin: 0 }}>Claim an abandoned bounty</p>
          <p className="small muted" style={{ margin: "6px 0 14px", textWrap: "pretty" }}>
            The open window has passed and the buyer never opened this bounty. If you committed to it, you can take the full {facts?.escrow} MON escrow.
          </p>
          {ready ? (
            <button type="button" className="btn-primary" style={{ width: "100%" }} disabled={busy !== null} onClick={() => void onSlash()}>
              {busy === "slash" ? "Slashing…" : `Slash and claim ${facts?.escrow ?? ""} MON`}
            </button>
          ) : (
            <button type="button" className="btn-primary" style={{ width: "100%" }} onClick={wallet.connect} disabled={wallet.connecting}>
              {wallet.connecting ? "Connecting…" : "Connect wallet to slash"}
            </button>
          )}
        </div>
      ) : null}

      {notice !== null ? (
        <p aria-live="polite" className="mono small" style={{ color: palette.ink, margin: 0 }}>
          {notice} ✓
        </p>
      ) : null}
      {error !== null ? (
        <div role="alert" className="error-card" style={{ padding: "14px 18px" }}>
          <p className="small" style={{ color: palette.ink, margin: 0, overflowWrap: "anywhere" }}>{error}</p>
        </div>
      ) : null}
    </div>
  );
}
