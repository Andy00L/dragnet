import { TopRail } from "@/components/dragnet/TopRail";

const GRID = "44px minmax(150px, 1fr) 160px 40px 84px 72px 96px 56px";
const CELL = { height: 12, background: "var(--well)", borderRadius: 6 } as const;

// The ledger skeleton, mirroring the real column grid so nothing shifts on resolve.
export default function MarketLoading() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <TopRail crumb="Ledger" />
      <main className="page">
        <div style={{ height: 44, width: "36%", background: "var(--well)", borderRadius: 8 }} />
        <div style={{ height: 14, width: "48%", background: "var(--well)", borderRadius: 7, marginTop: 12 }} />
        <div className="card card-12" style={{ marginTop: 30, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: GRID, columnGap: 16, padding: "12px 22px", borderBottom: "1px solid var(--edge)" }}>
            <span style={CELL} />
            <span style={{ ...CELL, width: "60%" }} />
            <span style={{ ...CELL, width: "50%" }} />
            <span />
            <span style={CELL} />
            <span style={CELL} />
            <span style={CELL} />
            <span />
          </div>
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div key={row} style={{ display: "grid", gridTemplateColumns: GRID, columnGap: 16, alignItems: "center", padding: "15px 22px", borderBottom: "1px dashed var(--edge)" }}>
              <span style={{ ...CELL, height: 13, width: 24 }} />
              <span style={{ ...CELL, height: 13, width: "70%" }} />
              <svg viewBox="0 0 150 34" width="150" height="34" aria-hidden="true">
                <rect x="1" y="5" width="148" height="24" rx="3" fill="var(--well)" />
              </svg>
              <span style={{ ...CELL, height: 13 }} />
              <span style={{ ...CELL, height: 13 }} />
              <span style={{ ...CELL, height: 13 }} />
              <span style={{ ...CELL, height: 13, width: "60%" }} />
              <span style={{ ...CELL, height: 13 }} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
