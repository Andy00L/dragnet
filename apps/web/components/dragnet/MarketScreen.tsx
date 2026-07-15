"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TopRail } from "./TopRail";
import { statusColor, palette } from "@/lib/tokens";
import type { DataSource, LedgerRow } from "@/lib/records";

const GRID = "44px minmax(150px, 1fr) 160px 40px 84px 72px 96px 56px";
const FILTERS = ["All", "Open", "Paid", "Refunded", "Slashed"] as const;
type Filter = (typeof FILTERS)[number];

// The inline keyspace-net miniature for one ledger row: mesh bed, teal wash to the
// row's coverage, uniform canary marks, and a frontier tick when the sweep is
// partial. The same object the bounty page enlarges.
function miniMarks(coverage: number, m: number, id: string): { crosses: string[]; washW: number; frontierX: number; hasFrontier: boolean } {
  const numericId = Number(id) || 0;
  const cov = coverage / 100;
  const crosses: string[] = [];
  for (let index = 0; index < m; index++) {
    const jitter = ((((index * 7919 + numericId * 31) % 13) / 13) - 0.5) * 0.05;
    const fraction = Math.min(0.97, Math.max(0.03, (index + 0.5) / m + jitter));
    const markX = Math.round((1 + 148 * fraction) * 10) / 10;
    crosses.push(`M${markX - 2.5} 14.5 l5 5 M${markX + 2.5} 14.5 l-5 5`);
  }
  return {
    crosses,
    washW: Math.round(148 * cov * 10) / 10,
    frontierX: Math.round((1 + 148 * cov) * 10) / 10,
    hasFrontier: coverage < 100,
  };
}

export function MarketScreen({ rows, source }: { rows: LedgerRow[]; source: DataSource }) {
  const [filter, setFilter] = useState<Filter>("All");

  const filtered = useMemo(
    () => (filter === "All" ? rows : rows.filter((row) => row.status === filter)),
    [rows, filter],
  );
  const countLabel = `${filtered.length} ${filtered.length === 1 ? "record" : "records"}`;

  return (
    <div style={{ minHeight: "100vh" }}>
      <TopRail crumb="Ledger" />

      {/* Shared mesh pattern for every row miniature. */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <pattern id="meshM" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="skewX(-12)">
            <path d="M0 10 L10 0 M-2.5 2.5 L2.5 -2.5 M7.5 12.5 L12.5 7.5" stroke={palette.faint} strokeWidth="0.6" opacity="0.55" />
          </pattern>
        </defs>
      </svg>

      <main className="page">
        <div
          style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap", animation: "settleY 320ms cubic-bezier(0.16,1,0.3,1) both" }}
        >
          <div style={{ minWidth: 0 }}>
            <h1 className="h1">The keyspace ledger</h1>
            <p className="lead" style={{ maxWidth: 560 }}>
              Open sweeps and their bounties. Bring back every tagged canary to be paid.
            </p>
            {source === "sample" ? (
              <p className="small faint" style={{ margin: "8px 0 0" }}>
                Demo records. Set a market address to read live from Monad testnet.
              </p>
            ) : null}
          </div>
          <Link href="/post" className="btn-primary">
            Post a bounty
          </Link>
        </div>

        <div
          style={{ display: "flex", alignItems: "baseline", gap: 28, flexWrap: "wrap", marginTop: 30, animation: "settleY 320ms cubic-bezier(0.16,1,0.3,1) 40ms both" }}
        >
          {FILTERS.map((name) => {
            const active = name === filter;
            return (
              <button
                key={name}
                type="button"
                className="filter-btn"
                onClick={() => setFilter(name)}
                style={{ color: active ? palette.accent : palette.muted, fontWeight: active ? 600 : 400 }}
              >
                {name}
                <span style={{ display: "block", width: 18, height: 2, background: active ? palette.accent : "transparent" }} />
              </button>
            );
          })}
          <span aria-live="polite" className="mono small" style={{ marginLeft: "auto", color: palette.muted }}>
            {countLabel}
          </span>
        </div>

        <div
          className="card card-12"
          style={{ marginTop: 16, overflow: "hidden", animation: "settleY 320ms cubic-bezier(0.16,1,0.3,1) 80ms both" }}
        >
          <div
            style={{ display: "grid", gridTemplateColumns: GRID, columnGap: 16, padding: "12px 22px", borderBottom: `1px solid ${palette.edge}`, fontSize: 12.5, lineHeight: 1.4, color: palette.faint }}
          >
            <span>no.</span>
            <span>range</span>
            <span>the sweep</span>
            <span style={{ textAlign: "right" }}>m</span>
            <span style={{ textAlign: "right" }}>payout</span>
            <span style={{ textAlign: "right" }}>bond</span>
            <span>status</span>
            <span style={{ textAlign: "right" }}>returned</span>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: "40px 22px 44px" }}>
              <p style={{ fontSize: 15, lineHeight: 1.55, color: palette.ink, margin: 0 }}>No open sweeps right now.</p>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                Post a bounty to open the first record, or clear the filter.
              </p>
            </div>
          ) : (
            filtered.map((row, index) => {
              const net = miniMarks(row.coverage, row.m, row.id);
              return (
                <Link
                  key={row.id}
                  href={`/bounty/${row.id}`}
                  title={`Open bounty no. ${row.id}`}
                  className="ledger-row"
                  style={{ display: "grid", gridTemplateColumns: GRID, columnGap: 16, alignItems: "center", padding: "13px 22px", borderBottom: `1px dashed ${palette.edge}`, color: palette.ink, animation: `settleY8 220ms cubic-bezier(0.16,1,0.3,1) ${index * 40}ms both` }}
                >
                  <span className="mono small" style={{ color: palette.muted }}>{row.id}</span>
                  <span
                    className="mono small"
                    title={row.rangeFull}
                    style={{ color: palette.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {row.rangeLabel}
                  </span>
                  <svg viewBox="0 0 150 34" width="150" height="34" role="img" aria-label={`Keyspace net miniature, ${row.coverage} percent swept, ${row.m} canary marks`}>
                    <rect x="1" y="5" width="148" height="24" rx="3" fill={palette.well} />
                    <g style={{ animation: `washIn 320ms cubic-bezier(0.16,1,0.3,1) ${200 + index * 40}ms both`, transformBox: "fill-box", transformOrigin: "left center" }}>
                      <rect x="1" y="5" width={net.washW} height="24" fill={palette.accent} opacity="0.16" />
                    </g>
                    <rect x="1" y="5" width="148" height="24" rx="3" fill="url(#meshM)" />
                    <path d="M1 6 Q75 8.5 149 6" stroke={palette.muted} strokeWidth="0.9" fill="none" />
                    <path d="M1 28 Q75 30.5 149 28" stroke={palette.muted} strokeWidth="0.9" fill="none" />
                    {net.crosses.map((cross, markIndex) => (
                      <path key={markIndex} d={cross} stroke={palette.ink} strokeWidth="1" fill="none" />
                    ))}
                    {net.hasFrontier ? (
                      <line x1={net.frontierX} y1="2" x2={net.frontierX} y2="32" stroke={palette.accent} strokeWidth="1.4" />
                    ) : null}
                  </svg>
                  <span className="mono small" style={{ color: palette.muted, textAlign: "right" }}>{row.m}</span>
                  <span className="mono small" style={{ color: palette.ink, textAlign: "right" }}>{row.payout}</span>
                  <span className="mono small" style={{ color: palette.muted, textAlign: "right" }}>{row.bond}</span>
                  <span style={{ minWidth: 0 }}>
                    {row.status === "Paid" ? (
                      <span
                        className="paid-stamp"
                        style={{ fontSize: 12.5, padding: "1px 7px", borderRadius: 5, animation: "stampIn 220ms cubic-bezier(0.34,1.4,0.5,1) 640ms both" }}
                      >
                        ✓ Paid
                      </span>
                    ) : (
                      <span className="small" style={{ fontWeight: 600, color: statusColor[row.status] }}>{row.status}</span>
                    )}
                  </span>
                  <span className="mono small" style={{ color: palette.muted, textAlign: "right" }}>{row.returnedLabel}</span>
                </Link>
              );
            })
          )}
        </div>

        <p className="small faint" style={{ margin: "14px 2px 0" }}>
          Each line is a live record; the miniature is the same net you will find on its page, washed to its true coverage.
        </p>
      </main>
    </div>
  );
}
