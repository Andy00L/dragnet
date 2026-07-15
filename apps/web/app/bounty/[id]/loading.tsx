import { TopRail } from "@/components/dragnet/TopRail";

const BLOCK = { background: "var(--well)", borderRadius: 8 } as const;

// Skeleton mirroring the bounty detail two-column layout, so nothing shifts.
export default function BountyLoading() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <TopRail crumb="Ledger / Bounty" />
      <main className="page">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 28, alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ ...BLOCK, height: 44, width: "62%" }} />
              <div style={{ ...BLOCK, height: 14, width: "48%", borderRadius: 7 }} />
            </div>
            <div className="card" style={{ marginTop: 24, padding: "20px 22px" }}>
              <svg viewBox="0 0 640 150" width="100%" aria-hidden="true">
                <rect x="12" y="34" width="616" height="78" rx="6" fill="var(--well)" />
              </svg>
              <div style={{ ...BLOCK, height: 13, width: "70%", borderRadius: 6, marginTop: 14 }} />
            </div>
            <div style={{ ...BLOCK, height: 168 }} />
          </div>
          <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ ...BLOCK, height: 168 }} />
            <div style={{ ...BLOCK, height: 46 }} />
          </div>
        </div>
      </main>
    </div>
  );
}
