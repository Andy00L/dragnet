"use client";

import { TopRail } from "@/components/dragnet/TopRail";

// Error boundary for the ledger read: distinct from the empty state, with a real
// retry that re-runs the server fetch.
export default function MarketError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ minHeight: "100vh" }}>
      <TopRail crumb="Ledger" />
      <main className="page">
        <div className="error-card" style={{ marginTop: 16, padding: "26px 28px" }}>
          <p className="h2" style={{ color: "var(--error)" }}>The ledger did not load</p>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink)", margin: "8px 0 0" }}>
            The Monad testnet RPC returned an error before the records could be read.
          </p>
          <button type="button" onClick={reset} className="link-retry" style={{ marginTop: 14 }}>
            Retry
          </button>
        </div>
      </main>
    </div>
  );
}
