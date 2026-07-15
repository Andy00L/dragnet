import type { ReactNode } from "react";
import Link from "next/link";
import { WalletButton } from "./WalletButton";

// The slim ledger rail shared by every screen: the Gambarino wordmark, a plain
// breadcrumb, the network marker, and the connect control (overridable on the
// worker screen, which shows the running worker's address instead).
export function TopRail({ crumb, right }: { crumb?: ReactNode; right?: ReactNode }) {
  return (
    <header className="rail">
      <div className="rail-inner">
        <Link href="/" className="wordmark" style={{ color: "var(--ink)" }}>
          Dragnet
        </Link>
        {crumb !== undefined ? (
          <span className="small muted">{crumb}</span>
        ) : (
          <span className="small muted">Ledger</span>
        )}
        <span className="small" style={{ marginLeft: "auto", color: "var(--ink)" }}>
          Monad testnet
        </span>
        {right ?? <WalletButton />}
      </div>
    </header>
  );
}
