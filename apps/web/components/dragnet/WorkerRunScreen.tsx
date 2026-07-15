"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { isAddress } from "viem";
import type { Hex } from "viem";
import { TopRail } from "./TopRail";
import { useWallet } from "./WalletProvider";
import { clientMarketConfig } from "@/lib/client-config";
import { commitAndReveal, loadRunTarget, sweepKeyspace, withdrawPayout } from "@/lib/run-onchain";
import { palette } from "@/lib/tokens";
import { formatBound, truncateHex } from "@/lib/format";

export interface RunContext {
  id: string;
  rangeLabel: string;
  m: number;
  payout: string;
  lo: string;
  hi: string;
}

type Phase = "idle" | "sweeping" | "committing" | "returning" | "paid" | "zero";
type Mode = "full" | "skip";

const PHASE_ORDER: Record<Phase, number> = { idle: 0, sweeping: 1, committing: 2, returning: 3, paid: 4, zero: 4 };
const SKIP_TARGET = 0.85;

// Demo-mode step details, shown when no market is configured. In real mode the
// live transaction hashes and revert reason replace these.
const DEMO_COMMIT_TX = "0x54ebfb…b54c3";
const DEMO_REVEAL_TX = "0x9f2a…e71";
const DEMO_REVERT = "revert LengthMismatch";

function prefersReduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// The worker run: drag the net through the range and land honestly on Paid or
// earned-zero. When a market is configured and a wallet is connected, the sweep is
// real (an in-browser keyspace search reusing @dragnet/scanner) and the commit and
// reveal are real transactions; otherwise the same beats play as a demonstration.
export function WorkerRunScreen({ context }: { context: RunContext }) {
  const wallet = useWallet();
  const config = useMemo(() => clientMarketConfig(), []);
  const real = config !== null;

  const totalKeys = useMemo(() => {
    try {
      return BigInt(context.hi) - BigInt(context.lo) + 1n;
    } catch {
      return 8000n;
    }
  }, [context.hi, context.lo]);
  const payoutTarget = Number(context.payout) || 0;

  const [mode, setMode] = useState<Mode>("full");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [payoutDisplay, setPayoutDisplay] = useState("0.000");
  const [withdrawn, setWithdrawn] = useState(false);

  // Real-mode state. In demo mode these keep their demo defaults / stay null.
  const [realError, setRealError] = useState<string | null>(null);
  const [foundReal, setFoundReal] = useState<number | null>(null);
  const [commitDetail, setCommitDetail] = useState(DEMO_COMMIT_TX);
  const [revealDetail, setRevealDetail] = useState(DEMO_REVEAL_TX);
  const [revertLabel, setRevertLabel] = useState(DEMO_REVERT);
  const [withdrawTx, setWithdrawTx] = useState<Hex | null>(null);

  const raf = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Bumped on every start and every reset; an in-flight real run bails when its
  // captured token no longer matches, so a reset or unmount cancels it cleanly.
  const runToken = useRef(0);

  const clearRun = () => {
    runToken.current++;
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => () => clearRun(), []);

  const skipMode = mode === "skip";
  const target = skipMode ? SKIP_TARGET : 1;

  const countPayout = () => {
    if (prefersReduced()) {
      setPayoutDisplay(payoutTarget.toFixed(3));
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const progressValue = Math.min(1, (now - start - 250) / 600);
      if (progressValue >= 0) {
        const eased = 1 - Math.pow(1 - Math.max(0, progressValue), 3);
        setPayoutDisplay((payoutTarget * eased).toFixed(3));
      }
      if (progressValue < 1) {
        raf.current = requestAnimationFrame(step);
      }
    };
    raf.current = requestAnimationFrame(step);
  };

  // Demo sweep (no chain): animate the net, then land on paid or earned-zero.
  const afterSweep = (runMode: Mode) => {
    timers.current.push(setTimeout(() => setPhase("committing"), 500));
    timers.current.push(setTimeout(() => setPhase("returning"), 1600));
    timers.current.push(
      setTimeout(() => {
        if (runMode === "full") {
          setPhase("paid");
          countPayout();
        } else {
          setPhase("zero");
        }
      }, 2600),
    );
  };

  const startSweep = () => {
    const runMode = mode;
    const runTarget = runMode === "full" ? 1 : SKIP_TARGET;
    setPhase("sweeping");
    setProgress(0);
    setWithdrawn(false);
    setPayoutDisplay("0.000");
    if (prefersReduced()) {
      setProgress(runTarget);
      timers.current.push(setTimeout(() => afterSweep(runMode), 300));
      return;
    }
    const duration = runMode === "full" ? 2800 : 2400;
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = Math.min(1, (now - start) / duration);
      const eased = elapsed < 0.5 ? 2 * elapsed * elapsed : 1 - Math.pow(-2 * elapsed + 2, 2) / 2;
      setProgress(runTarget * eased);
      if (elapsed < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        afterSweep(runMode);
      }
    };
    raf.current = requestAnimationFrame(step);
  };

  // Real run: load and verify the target list, sweep the keyspace in the browser,
  // then commit and reveal on chain. Each await checks its run token so a reset
  // mid-flight abandons the stale run instead of writing its state back.
  const startRealRun = async (runMode: Mode) => {
    const provider = typeof window !== "undefined" ? window.ethereum : undefined;
    if (config === null || wallet.address === null || provider === undefined || !isAddress(wallet.address)) {
      setRealError("connect a wallet on the configured network to sweep");
      return;
    }
    const worker = wallet.address;
    const token = ++runToken.current;
    setRealError(null);
    setFoundReal(0);
    setWithdrawn(false);
    setWithdrawTx(null);
    setPayoutDisplay("0.000");
    setProgress(0);
    setPhase("sweeping");

    let bountyId: bigint;
    try {
      bountyId = BigInt(context.id);
    } catch {
      setRealError(`invalid bounty id ${context.id}`);
      return;
    }

    const loaded = await loadRunTarget(config, bountyId);
    if (runToken.current !== token) return;
    if (!loaded.ok) {
      setRealError(loaded.error);
      return;
    }
    const bountyTarget = loaded.value;

    const skipFraction = runMode === "skip" ? 1 - SKIP_TARGET : 0;
    const swept = await sweepKeyspace(bountyTarget, skipFraction, (fraction, found) => {
      if (runToken.current !== token) return;
      setProgress(runMode === "skip" ? fraction * SKIP_TARGET : fraction);
      setFoundReal(found);
    });
    if (runToken.current !== token) return;
    if (!swept.ok) {
      setRealError(swept.error);
      return;
    }

    const outcome = await commitAndReveal(provider, worker, config, bountyId, swept.value, bountyTarget, (stage) => {
      if (runToken.current !== token) return;
      setPhase(stage);
    });
    if (runToken.current !== token) return;
    if (!outcome.ok) {
      setRealError(outcome.error);
      return;
    }

    const done = outcome.value;
    if (done.commitTx !== undefined) {
      setCommitDetail(truncateHex(done.commitTx, 8, 5));
    }
    if (done.paid && done.revealTx !== undefined) {
      setRevealDetail(truncateHex(done.revealTx, 8, 5));
      setPhase("paid");
      countPayout();
    } else {
      setRevertLabel(done.revertReason !== undefined ? `revert ${done.revertReason}` : "earned zero");
      setPhase("zero");
    }
  };

  const startRun = () => {
    if (phase !== "idle") return;
    clearRun();
    if (real) {
      void startRealRun(mode);
    } else {
      startSweep();
    }
  };

  const onWithdraw = async () => {
    if (!real) {
      setWithdrawn(true);
      return;
    }
    const provider = typeof window !== "undefined" ? window.ethereum : undefined;
    if (config === null || wallet.address === null || provider === undefined || !isAddress(wallet.address)) {
      setRealError("connect a wallet to withdraw");
      return;
    }
    const result = await withdrawPayout(provider, wallet.address, config);
    if (result.ok) {
      setWithdrawTx(result.value);
      setWithdrawn(true);
    } else {
      setRealError(result.error);
    }
  };

  const resetTo = (nextMode: Mode) => {
    clearRun();
    setMode(nextMode);
    setPhase("idle");
    setProgress(0);
    setPayoutDisplay("0.000");
    setWithdrawn(false);
    setRealError(null);
    setFoundReal(null);
    setWithdrawTx(null);
  };

  const idx = PHASE_ORDER[phase];
  const running = idx >= 1 && idx <= 3;
  const settled = idx === 4;
  // The big error overlay shows for an operational failure; a withdraw failure
  // after payment is surfaced inline instead so the Paid card stays.
  const errored = realError !== null && phase !== "paid";
  const demoAddr = skipMode ? "0x3C44…93BC" : "0x7099…79C8";
  const workerAddr = real ? wallet.addressShort ?? "connect wallet" : demoAddr;

  const marks = useMemo(() => {
    const numericId = Number(context.id) || 42;
    const out: { centerX: number; cross: string; fraction: number }[] = [];
    for (let index = 0; index < context.m; index++) {
      const jitter = ((((index * 7919 + numericId * 31) % 13) / 13) - 0.5) * 0.05;
      const fraction = Math.min(0.94, Math.max(0.06, (index + 0.5) / context.m + jitter));
      const centerX = Math.round((12 + 816 * fraction) * 10) / 10;
      out.push({ centerX, fraction, cross: `M${centerX - 6} 89 l12 12 M${centerX + 6} 89 l-12 12` });
    }
    return out;
  }, [context.id, context.m]);

  const caughtMarks = marks.map((mark) => ({ ...mark, caught: idx >= 1 && mark.fraction <= target && progress >= mark.fraction }));
  const visualCaught = caughtMarks.filter((mark) => mark.caught).length;
  const caught = real && foundReal !== null ? foundReal : visualCaught;
  const sweptLabel = formatBound((totalKeys * BigInt(Math.round(progress * 1_000_000))) / 1_000_000n);
  const totalLabel = formatBound(totalKeys);
  const sweptFullLabel = formatBound((totalKeys * BigInt(Math.round(target * 1_000_000))) / 1_000_000n);
  const washW = Math.round(816 * progress * 10) / 10;
  const frontierX = Math.round((12 + 816 * progress) * 10) / 10;
  const hasFrontier = progress > 0.001 && progress < 0.999;
  const shortSweep = foundReal !== null && foundReal < context.m;
  const zeroExplains =
    !real || shortSweep
      ? "A partial sweep misses a canary; that is the whole design."
      : "The return did not settle on chain; nothing was paid.";

  const steps = [
    {
      name: "Sweep",
      order: 1,
      detail: idx > 1 ? `swept ${sweptFullLabel} keys` : idx === 1 ? "in progress…" : false,
      detailColor: palette.muted,
      note: false as string | false,
      noteColor: palette.muted,
    },
    {
      name: "Commit",
      order: 2,
      detail: idx > 2 ? commitDetail : false,
      detailColor: palette.muted,
      note: idx === 2 ? "waiting for the next block, the return must land in a later block than the commit" : false,
      noteColor: palette.pending,
    },
    {
      name: "Return",
      order: 3,
      detail: idx > 3 ? (phase === "zero" ? revertLabel : revealDetail) : false,
      detailColor: phase === "zero" ? palette.error : palette.muted,
      note: false as string | false,
      noteColor: palette.muted,
    },
  ];

  const runningLine =
    phase === "sweeping"
      ? "The net is moving; every key in its path is tried against the tagged set."
      : phase === "committing"
        ? "Sealing the catch on chain before revealing it."
        : "Opening the catch for the contract to verify.";
  const runningCta = phase === "sweeping" ? "Sweeping…" : phase === "committing" ? "Committing…" : "Returning…";

  const stepColor = (order: number) => (idx === order ? palette.accent : idx > order ? palette.ink : palette.faint);
  const stepWeight = (order: number) => (idx === order || idx > order ? 600 : 400);

  return (
    <div style={{ minHeight: "100vh" }}>
      <TopRail
        crumb={
          <>
            <Link href="/" style={{ color: palette.muted }}>Ledger</Link> / <Link href={`/bounty/${context.id}`} style={{ color: palette.muted }}>Bounty no. {context.id}</Link> / Run
          </>
        }
        right={<span className="mono small" style={{ color: palette.muted }}>{workerAddr}</span>}
      />

      <main className="page-work">
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap", animation: "settleY 320ms cubic-bezier(0.16,1,0.3,1) both" }}>
          <div style={{ minWidth: 0 }}>
            <h1 className="h1">Sweep bounty no. {context.id}</h1>
            <p className="lead" style={{ maxWidth: 520 }}>
              Drag the net across the whole range and bring back all {context.m} canaries to be paid {context.payout} MON.
            </p>
          </div>
          <div role="group" aria-label="Sweep mode" style={{ display: "inline-flex", gap: 3, background: palette.well, border: `1px solid ${palette.edge}`, borderRadius: 6, padding: 3, flex: "none" }}>
            <button type="button" className="mode-btn" onClick={() => resetTo("full")} style={{ color: !skipMode ? palette.accent : palette.muted, fontWeight: !skipMode ? 600 : 400, background: !skipMode ? palette.surface : "transparent", boxShadow: !skipMode ? "inset 0 1px 0 var(--highlight)" : "none" }}>Sweep the full range</button>
            <button type="button" className="mode-btn" onClick={() => resetTo("skip")} style={{ color: skipMode ? palette.accent : palette.muted, fontWeight: skipMode ? 600 : 400, background: skipMode ? palette.surface : "transparent", boxShadow: skipMode ? "inset 0 1px 0 var(--highlight)" : "none" }}>Skip the top 15%</button>
          </div>
        </div>

        <div className="card" style={{ marginTop: 24, padding: "18px 22px 20px", animation: "settleY 320ms cubic-bezier(0.16,1,0.3,1) 60ms both" }}>
          <div aria-live="polite" className="mono small" style={{ color: palette.ink, display: "flex", gap: 24, flexWrap: "wrap" }}>
            <span>swept {sweptLabel} / {totalLabel} keys</span>
            <span>caught {caught} of {context.m}</span>
            <span style={{ color: palette.muted }}>worker {workerAddr}</span>
          </div>
          <svg viewBox="0 0 840 190" width="100%" role="img" aria-label={`Keyspace net over the range; ${caught} of ${context.m} canaries caught${skipMode ? "; the top 15 percent is skipped and shows bare mesh" : ""}`} style={{ marginTop: 10 }}>
            <defs>
              <pattern id="meshW" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="skewX(-12)">
                <path d="M0 16 L16 0 M-4 4 L4 -4 M12 20 L20 12" stroke={palette.faint} strokeWidth="0.7" opacity="0.55" />
              </pattern>
              <pattern id="meshDense" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="skewX(-12)">
                <path d="M0 8 L8 0 M-2 2 L2 -2 M6 10 L10 6" stroke={palette.faint} strokeWidth="0.7" opacity="0.65" />
              </pattern>
              <linearGradient id="washRun" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor={palette.accent} stopOpacity="0.20" />
                <stop offset="1" stopColor={palette.accent} stopOpacity="0.10" />
              </linearGradient>
              <clipPath id="bedClipW"><rect x="12" y="40" width="816" height="110" rx="6" /></clipPath>
            </defs>
            <rect x="12" y="40" width="816" height="110" rx="6" fill={palette.well} />
            <g clipPath="url(#bedClipW)">
              <rect x="12" y="40" width={washW} height="110" fill="url(#washRun)" />
              {skipMode ? <rect x="705.6" y="40" width="122.4" height="110" fill="url(#meshDense)" /> : null}
            </g>
            <rect x="12" y="40" width="816" height="110" rx="6" fill="url(#meshW)" />
            <path d="M12 41 Q420 53 828 41" stroke={palette.muted} strokeWidth="1.6" fill="none" />
            <path d="M12 149 Q420 161 828 149" stroke={palette.muted} strokeWidth="1.6" fill="none" />
            {skipMode ? <text x="766" y="32" textAnchor="middle" fontFamily="ui-monospace, Menlo, monospace" fontSize="11.5" fill={palette.muted}>skipped</text> : null}
            {hasFrontier ? (
              <>
                <line x1={frontierX} y1="30" x2={frontierX} y2="158" stroke={palette.accent} strokeWidth="1.6" />
                <circle cx={frontierX} cy="30" r="5" fill={palette.accent} />
              </>
            ) : null}
            {caughtMarks.map((mark, index) => (
              <g key={index}>
                <path d={mark.cross} stroke={palette.ink} strokeWidth="1.5" fill="none" />
                {mark.caught ? (
                  <circle cx={mark.centerX} cy="95" r="11" fill="none" stroke={palette.accent} strokeWidth="1.5" style={{ animation: "markStamp 220ms cubic-bezier(0.34,1.4,0.5,1) both", transformBox: "fill-box", transformOrigin: "center" }} />
                ) : null}
              </g>
            ))}
            <text x="12" y="178" fontFamily="ui-monospace, Menlo, monospace" fontSize="12" fill={palette.muted}>{formatBound(BigInt(context.lo))}</text>
            <text x="828" y="178" textAnchor="end" fontFamily="ui-monospace, Menlo, monospace" fontSize="12" fill={palette.muted}>{formatBound(BigInt(context.hi))}</text>
          </svg>
        </div>

        <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginTop: 30, animation: "settleY 320ms cubic-bezier(0.16,1,0.3,1) 120ms both" }}>
          <section style={{ flex: "1 1 400px", minWidth: 0 }}>
            <h2 className="section-h2">The run</h2>
            <div style={{ position: "relative", marginTop: 16, paddingLeft: 26 }}>
              <div style={{ position: "absolute", left: 5, top: 10, bottom: 12, width: 1, background: palette.edge }} />
              {steps.map((step) => {
                const active = idx === step.order;
                return (
                  <div key={step.name} style={{ position: "relative", padding: "10px 0" }}>
                    <span style={{ position: "absolute", left: -26, top: 12, width: 11, height: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {idx > step.order ? (
                        <span style={{ fontSize: 13, lineHeight: 1, color: palette.ink, background: palette.paper }}>✓</span>
                      ) : (
                        <span style={{ display: "block", width: 9, height: 9, borderRadius: "50%", background: active ? palette.accent : palette.paper, border: `1px solid ${active ? palette.accent : palette.faint}`, transition: "background-color 220ms cubic-bezier(0.4,0,0.2,1)" }} />
                      )}
                    </span>
                    <span style={{ fontSize: 15, lineHeight: 1.55, fontWeight: stepWeight(step.order), color: stepColor(step.order), transition: "color 220ms cubic-bezier(0.4,0,0.2,1)" }}>{step.name}</span>
                    {step.detail ? <span className="mono small" style={{ marginLeft: 12, color: step.detailColor }}>{step.detail}</span> : null}
                    {step.note ? <div className="small" style={{ color: step.noteColor, marginTop: 2 }}>{step.note}</div> : null}
                  </div>
                );
              })}
              {/* Settle: the terminal step. */}
              <div style={{ position: "relative", padding: "10px 0" }}>
                <span style={{ position: "absolute", left: -26, top: 12, width: 11, height: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {settled ? (
                    <span style={{ fontSize: 13, lineHeight: 1, color: palette.ink, background: palette.paper }}>✓</span>
                  ) : (
                    <span style={{ display: "block", width: 9, height: 9, borderRadius: "50%", background: palette.paper, border: `1px solid ${palette.faint}` }} />
                  )}
                </span>
                <span style={{ fontSize: 15, lineHeight: 1.55, fontWeight: settled ? 600 : 400, color: settled ? palette.ink : palette.faint }}>Settle</span>
                {phase === "paid" ? <span className="mono small" style={{ marginLeft: 12, color: palette.ink }}>Paid {context.payout} MON</span> : null}
                {phase === "zero" ? <span className="mono small" style={{ marginLeft: 12, color: palette.muted }}>earned zero · 0.000 MON</span> : null}
              </div>
            </div>
          </section>

          <section style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column" }}>
            <h2 className="section-h2">The outcome</h2>

            {errored ? (
              <div aria-live="polite" className="error-card" style={{ marginTop: 16, padding: "20px 22px", animation: "settleY 220ms cubic-bezier(0.16,1,0.3,1) both" }}>
                <p style={{ fontSize: 15, lineHeight: 1.55, fontWeight: 600, color: palette.error, margin: 0 }}>The sweep could not complete</p>
                <p className="small" style={{ color: palette.ink, margin: "6px 0 0", overflowWrap: "anywhere" }}>{realError}</p>
              </div>
            ) : phase === "idle" ? (
              <p className="lead" style={{ margin: "16px 0 0" }}>Nothing has been dragged yet. The record lands here once the net has crossed the range.</p>
            ) : running ? (
              <p aria-live="polite" style={{ fontSize: 15, lineHeight: 1.55, color: palette.muted, margin: "16px 0 0" }}>{runningLine}</p>
            ) : null}

            {!errored && phase === "paid" ? (
              <div aria-live="polite" className="card" style={{ marginTop: 16, padding: "20px 22px" }}>
                <span className="paid-stamp" style={{ fontSize: 15, animation: "stampIn 220ms cubic-bezier(0.34,1.4,0.5,1) both" }}>✓ Paid</span>
                <div className="display30 mono" style={{ marginTop: 12 }}>{payoutDisplay} <span style={{ fontSize: 15, color: palette.muted }}>MON</span></div>
                <div className="mono small" style={{ color: palette.muted, marginTop: 4 }}>all {context.m} canaries returned, sweep exhaustive</div>
              </div>
            ) : null}

            {!errored && phase === "zero" ? (
              <div aria-live="polite" style={{ marginTop: 16, animation: "settleY 220ms cubic-bezier(0.16,1,0.3,1) both" }}>
                <p style={{ fontSize: 15, lineHeight: 1.55, fontWeight: 600, color: palette.muted, margin: 0 }}>Earned zero</p>
                <p className="mono small" style={{ color: palette.muted, margin: "6px 0 0" }}>{revertLabel} · 0.000 MON</p>
                <p className="small muted" style={{ margin: "8px 0 0", textWrap: "pretty" }}>{zeroExplains}</p>
              </div>
            ) : null}

            <div style={{ marginTop: "auto", paddingTop: 20 }}>
              {errored ? (
                <button type="button" className="btn-outline" onClick={() => resetTo(mode)}>Start over</button>
              ) : phase === "idle" ? (
                real && wallet.address === null ? (
                  <button type="button" className="btn-primary" style={{ width: "100%" }} onClick={wallet.connect} disabled={wallet.connecting}>{wallet.connecting ? "Connecting…" : "Connect wallet to sweep"}</button>
                ) : (
                  <button type="button" className="btn-primary" style={{ width: "100%" }} onClick={startRun}>Start the sweep</button>
                )
              ) : running ? (
                <button type="button" className="btn-primary" style={{ width: "100%" }} disabled>{runningCta}</button>
              ) : phase === "paid" && !withdrawn ? (
                <button type="button" className="btn-primary" style={{ width: "100%" }} onClick={() => void onWithdraw()}>Withdraw</button>
              ) : phase === "paid" && withdrawn ? (
                <p className="mono small" style={{ color: palette.ink, margin: 0, padding: "12px 0" }}>
                  withdrawn to {workerAddr} ✓{withdrawTx !== null ? ` (${truncateHex(withdrawTx, 6, 4)})` : ""}
                </p>
              ) : phase === "zero" ? (
                <button type="button" className="btn-outline" onClick={() => resetTo("full")}>Sweep the full range</button>
              ) : null}
              {phase === "paid" && realError !== null ? (
                <p className="small" style={{ color: palette.error, margin: "8px 0 0" }}>{realError}</p>
              ) : null}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
