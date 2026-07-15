"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TopRail } from "./TopRail";
import { statusColor, palette } from "@/lib/tokens";
import { formatBound, groupDigits } from "@/lib/format";
import type { BountyDetail, DataSource } from "@/lib/records";

const MARK_FRACS = [0.13, 0.3, 0.46, 0.72, 0.88];
const TRACK_X = 12;
const TRACK_W = 616;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor(clamped / 60) % 60;
  const seconds = Math.floor(clamped) % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

// The key at the drag frontier for this coverage, in bigint so a 256-bit range
// stays exact, then rendered decimal-or-hex like every other bound.
function frontierKey(lo: bigint, hi: bigint, coverage: number): string {
  const span = hi - lo;
  const key = lo + (span * BigInt(Math.round(coverage * 1_000_000))) / 1_000_000n;
  return formatBound(key < 1n ? 1n : key);
}

function useCountdown(initialSeconds: number | null): string | null {
  const [remaining, setRemaining] = useState(initialSeconds);
  useEffect(() => {
    if (initialSeconds === null) {
      return;
    }
    const interval = setInterval(() => {
      setRemaining((current) => (current === null ? null : Math.max(0, current - 1)));
    }, 1000);
    return () => clearInterval(interval);
  }, [initialSeconds]);
  return remaining === null ? null : formatCountdown(remaining);
}

function copy(full: string): void {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(full);
  }
}

export function BountyDetailScreen({ detail, source }: { detail: BountyDetail; source: DataSource }) {
  const cov = detail.coverage / 100;
  const countdown = useCountdown(detail.claimRemainingSec);
  const settled = detail.status !== "Open";

  const marks = useMemo(
    () =>
      MARK_FRACS.map((fraction) => {
        const centerX = TRACK_X + TRACK_W * fraction;
        return {
          centerX,
          cross: `M${centerX - 5} 68 l10 10 M${centerX + 5} 68 l-10 10`,
          ringed: fraction <= cov,
          ringDelay: Math.round(200 + 320 * fraction),
        };
      }),
    [cov],
  );
  // The net's marks are a fixed stylised motif; the caption counts the real
  // canaries returned (from the on-chain k/m), so it stays correct for any m.
  const returnedCount = Number.parseInt(detail.bestReturn.split("/")[0] ?? "0", 10) || 0;
  const ringedPhrase = returnedCount === 0 ? "None" : returnedCount >= detail.m ? "All" : String(returnedCount);
  const washW = Math.round(TRACK_W * cov * 10) / 10;
  const frontierX = Math.round((TRACK_X + TRACK_W * cov) * 10) / 10;
  const spanLabel = formatBound(detail.hi - detail.lo + 1n);
  const loLabel = formatBound(detail.lo);
  const hiLabel = formatBound(detail.hi);

  return (
    <div style={{ minHeight: "100vh" }}>
      <TopRail
        crumb={
          <>
            <Link href="/" style={{ color: palette.muted }}>Ledger</Link> / Bounty no. {detail.id}
          </>
        }
      />

      <main className="page">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 28, alignItems: "stretch" }}>
          {/* Left column: head, the net, the on-chain check. */}
          <div style={{ flex: "1 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ animation: "settleY 320ms cubic-bezier(0.16,1,0.3,1) both" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
                <h1 className="h1">Range {detail.rangeLabel}</h1>
                {detail.status === "Open" ? (
                  <span style={{ color: palette.accent, fontWeight: 600, fontSize: 15 }}>Open</span>
                ) : detail.status === "Paid" ? (
                  <span className="paid-stamp" style={{ fontSize: 15, animation: "stampIn 220ms cubic-bezier(0.34,1.4,0.5,1) 900ms both" }}>✓ Paid</span>
                ) : (
                  <span style={{ color: statusColor[detail.status], fontWeight: 600, fontSize: 15 }}>{detail.status}</span>
                )}
              </div>
              <div className="mono small" style={{ marginTop: 10, color: palette.muted, display: "flex", gap: 20, flexWrap: "wrap" }}>
                <span>m = {detail.m}</span>
                <button type="button" className="copy-data mono" onClick={() => copy(detail.targetRoot)} title="Copy targetRoot" style={{ background: "transparent", border: "none", color: palette.muted, padding: 0 }}>
                  targetRoot {formatBound(BigInt(detail.targetRoot))}
                </button>
                {settled ? (
                  detail.settledBlock !== null ? (
                    <span>settled · block {groupDigits(detail.settledBlock)}</span>
                  ) : (
                    <span>settled</span>
                  )
                ) : (
                  <span aria-live="polite" suppressHydrationWarning>claim closes {countdown}</span>
                )}
              </div>
            </div>

            {/* The net, the hero object, in a specimen card with a cut index tab. */}
            <div style={{ position: "relative", marginTop: 26, animation: "settleY 320ms cubic-bezier(0.16,1,0.3,1) 60ms both" }}>
              <div style={{ position: "absolute", top: -25, left: 14, height: 27, zIndex: 1, background: palette.surface, border: `1px solid ${palette.edge}`, borderBottom: `1px solid ${palette.surface}`, borderRadius: "6px 6px 0 0", padding: "3px 14px 0", fontFamily: "var(--font-gambarino), Georgia, serif", fontSize: 14, color: palette.muted }}>
                {detail.id}
              </div>
              <div className="card" style={{ padding: 22 }}>
                <svg viewBox="0 0 640 150" width="100%" role="img" aria-label="Keyspace net over the range; teal wash marks the swept span; ringed specimen marks are canaries brought back">
                  <defs>
                    <pattern id="meshD" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="skewX(-12)">
                      <path d="M0 16 L16 0 M-4 4 L4 -4 M12 20 L20 12" stroke={palette.faint} strokeWidth="0.7" opacity="0.55" />
                    </pattern>
                    <linearGradient id="washD" x1="0" x2="1" y1="0" y2="0">
                      <stop offset="0" stopColor={palette.accent} stopOpacity="0.20" />
                      <stop offset="1" stopColor={palette.accent} stopOpacity="0.10" />
                    </linearGradient>
                    <clipPath id="bedClipD"><rect x="12" y="34" width="616" height="78" rx="6" /></clipPath>
                  </defs>
                  <rect x="12" y="34" width="616" height="78" rx="6" fill={palette.well} />
                  <g clipPath="url(#bedClipD)">
                    <g style={{ animation: "washIn 320ms cubic-bezier(0.16,1,0.3,1) 200ms both", transformBox: "fill-box", transformOrigin: "left center" }}>
                      <rect x="12" y="34" width={washW} height="78" fill="url(#washD)" />
                    </g>
                  </g>
                  <rect x="12" y="34" width="616" height="78" rx="6" fill="url(#meshD)" />
                  <path d="M12 35 Q320 45 628 35" stroke={palette.muted} strokeWidth="1.6" fill="none" />
                  <path d="M12 111 Q320 121 628 111" stroke={palette.muted} strokeWidth="1.6" fill="none" />
                  {cov > 0.001 && cov < 0.999 ? (
                    <>
                      <line x1={frontierX} y1="26" x2={frontierX} y2="120" stroke={palette.accent} strokeWidth="1.6" />
                      <circle cx={frontierX} cy="26" r="4.5" fill={palette.accent} />
                      <text x={frontierX} y="14" textAnchor="middle" fontFamily="ui-monospace, Menlo, monospace" fontSize="11.5" fill={palette.accent}>key {frontierKey(detail.lo, detail.hi, cov)}</text>
                    </>
                  ) : null}
                  {marks.map((mark, index) => (
                    <g key={index}>
                      <path d={mark.cross} stroke={palette.ink} strokeWidth="1.5" fill="none" />
                      {mark.ringed ? (
                        <circle cx={mark.centerX} cy="73" r="10" fill="none" stroke={palette.accent} strokeWidth="1.5" style={{ animation: `markStamp 220ms cubic-bezier(0.34,1.4,0.5,1) ${mark.ringDelay}ms both`, transformBox: "fill-box", transformOrigin: "center" }} />
                      ) : null}
                    </g>
                  ))}
                  <text x="12" y="140" fontFamily="ui-monospace, Menlo, monospace" fontSize="12" fill={palette.muted}>{loLabel}</text>
                  <text x="628" y="140" textAnchor="end" fontFamily="ui-monospace, Menlo, monospace" fontSize="12" fill={palette.muted}>{hiLabel}</text>
                </svg>
                <p className="small muted" style={{ margin: "14px 0 0", textWrap: "pretty" }}>
                  {ringedPhrase} of the {detail.m} canaries {returnedCount === 1 ? "is" : "are"} ringed and back in hand; the bare marks past the frontier lie in mesh no worker has dragged yet. Canary and ordinary key are stamped alike, only an exhaustive sweep finds them all.
                </p>
                <div className="mono small" style={{ display: "flex", gap: 28, flexWrap: "wrap", marginTop: 12, color: palette.ink }}>
                  <span>span {spanLabel} keys</span>
                  <span>m = {detail.m} canaries</span>
                  <span>best return {detail.bestReturn}</span>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 22, animation: "settleY 320ms cubic-bezier(0.16,1,0.3,1) 120ms both" }}>
              <h2 className="h2">How one returned key is checked on chain</h2>
              <div style={{ display: "flex", alignItems: "flex-start", marginTop: 18 }}>
                {[
                  { title: "ecrecover", note: "recovers the key’s address", hash: "0x7099…79C8" },
                  { title: "hash160", note: "RIPEMD160 of SHA256 of the compressed key", hash: "0x751e76e8…433bd6" },
                  { title: "Merkle", note: "the leaf sits under targetRoot", hash: "0xdf37668d…723632" },
                ].map((step, index) => (
                  <div key={step.title} style={{ display: "contents" }}>
                    {index > 0 ? (
                      <div style={{ flex: "none", width: 30, paddingTop: 11 }}><div style={{ height: 1, background: palette.faint }} /></div>
                    ) : null}
                    <div style={{ flex: "1 1 0", minWidth: 0, animation: `settleY 320ms cubic-bezier(0.16,1,0.3,1) ${240 + index * 60}ms both` }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: palette.ink }}>{step.title}</div>
                      <div className="small muted" style={{ marginTop: 2 }}>{step.note}</div>
                      <div className="mono" style={{ fontSize: 12.5, color: palette.ink, marginTop: 8 }}>{step.hash} ✓</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="small muted" style={{ margin: "16px 0 0" }}>
                Each step is an EVM precompile, so no zero-knowledge proof is needed.
              </p>
            </div>
          </div>

          {/* Right column: escrow, the field log, the primary action. */}
          <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
            <div className="card" style={{ padding: 22, animation: "settleY 320ms cubic-bezier(0.16,1,0.3,1) 60ms both" }}>
              <div style={{ fontSize: 15, color: palette.muted }}>Escrow held</div>
              <div className="display30" style={{ marginTop: 6 }}>
                {detail.escrow} <span style={{ fontSize: 16, color: palette.muted }}>MON</span>
              </div>
              <div className="mono small" style={{ color: palette.muted, marginTop: 4 }}>payout {detail.payout} + bond {detail.bond}</div>
              <div style={{ marginTop: 16, display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontSize: 13, color: palette.faint }}>posted by</span>
                <button type="button" className="copy-data mono small" onClick={() => copy(detail.buyer)} title="Copy address" style={{ background: "transparent", border: "none", color: palette.ink, padding: 0 }}>
                  {detail.buyerShort}
                </button>
              </div>
            </div>

            <div style={{ animation: "settleY 320ms cubic-bezier(0.16,1,0.3,1) 120ms both" }}>
              <h2 className="h2" style={{ marginBottom: 6 }}>The sweep so far</h2>
              {detail.workers.length === 0 ? (
                <div style={{ padding: "18px 0", borderTop: `1px solid ${palette.edge}`, borderBottom: `1px solid ${palette.edge}`, marginTop: 8 }}>
                  <p style={{ fontSize: 15, lineHeight: 1.55, color: palette.ink, margin: 0 }}>No worker has swept this range yet.</p>
                  <p className="small muted" style={{ margin: "4px 0 0" }}>The first commit opens the field log.</p>
                </div>
              ) : (
                <div aria-live="polite">
                  {detail.workers.map((worker, index) => (
                    <div key={worker.full} className="log-row" style={{ display: "grid", gridTemplateColumns: "minmax(104px, auto) 1fr 38px 84px", columnGap: 12, alignItems: "baseline", padding: "14px 10px", margin: "0 -10px", borderBottom: `1px solid ${palette.edge}`, borderRadius: 4 }}>
                      <button type="button" className="copy-data mono small" onClick={() => copy(worker.full)} title="Copy address" style={{ background: "transparent", border: "none", color: palette.ink, padding: 0, textAlign: "left" }}>{worker.addr}</button>
                      <span style={{ minWidth: 0 }}>
                        {worker.paid ? (
                          <span className="paid-stamp" style={{ fontSize: 14, animation: `stampIn 220ms cubic-bezier(0.34,1.4,0.5,1) ${720 + index * 40}ms both` }}>✓ Paid</span>
                        ) : (
                          <>
                            <span className="small" style={{ display: "block", fontWeight: 600, color: worker.wordColor }}>{worker.word}</span>
                            {worker.sub ? <span style={{ display: "block", fontSize: 12.5, lineHeight: 1.4, color: worker.subColor }}>{worker.sub}</span> : null}
                          </>
                        )}
                      </span>
                      <span className="mono small" style={{ color: palette.muted, textAlign: "right" }}>{worker.covLabel}</span>
                      <span className="mono small" style={{ color: worker.amountColor, textAlign: "right" }}>{worker.amount}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: "auto" }}>
              {detail.status === "Open" ? (
                <Link href={`/run/${detail.id}`} className="btn-primary" style={{ width: "100%" }}>Run a worker</Link>
              ) : (
                <a href="https://testnet.monadexplorer.com" target="_blank" rel="noreferrer" style={{ display: "inline-block", fontSize: 15, fontWeight: 500, padding: "12px 2px", minHeight: 44 }}>View on Monad explorer</a>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
