"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { N } from "@dragnet/crypto";
import { TopRail } from "./TopRail";
import { useWallet } from "./WalletProvider";
import { palette } from "@/lib/tokens";
import { groupDigits } from "@/lib/format";

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const UNITS = ["minutes", "hours", "days"] as const;
type Unit = (typeof UNITS)[number];
const DAYS_PER: Record<Unit, number> = { minutes: 1 / 1440, hours: 1 / 24, days: 1 };
const MAX_M = 64;

// Parse a keyspace bound entered as decimal or 0x-hex; null when malformed.
function parseBound(raw: string): bigint | null {
  const value = raw.trim();
  if (value.length === 0) {
    return null;
  }
  try {
    if (/^0x[0-9a-fA-F]+$/.test(value)) {
      return BigInt(value);
    }
    if (/^\d+$/.test(value)) {
      return BigInt(value);
    }
  } catch {
    return null;
  }
  return null;
}

interface FormErrors {
  lo?: string;
  hi?: string;
  m?: string;
  payout?: string;
  bond?: string;
  claim?: string;
  open?: string;
}

export function PostBountyScreen() {
  const wallet = useWallet();
  const [lo, setLo] = useState("1");
  const [hi, setHi] = useState("8000");
  const [m, setM] = useState(5);
  const [stampFrom, setStampFrom] = useState(0);
  const [payout, setPayout] = useState("5.000");
  const [bond, setBond] = useState("2.000");
  const [claimVal, setClaimVal] = useState("1");
  const [claimUnit, setClaimUnit] = useState<Unit>("hours");
  const [openVal, setOpenVal] = useState("1");
  const [openUnit, setOpenUnit] = useState<Unit>("hours");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [totalDisplay, setTotalDisplay] = useState("7.000");

  const submitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raf = useRef<number | null>(null);

  const total = useMemo(() => {
    const parsedPayout = parseFloat(payout);
    const parsedBond = parseFloat(bond);
    return (Number.isNaN(parsedPayout) ? 0 : Math.max(0, parsedPayout)) + (Number.isNaN(parsedBond) ? 0 : Math.max(0, parsedBond));
  }, [payout, bond]);

  // Odometer roll on the escrow total when payout or bond changes.
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setTotalDisplay(total.toFixed(3));
      return;
    }
    const from = parseFloat(totalDisplay) || 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 220);
      const eased = 1 - Math.pow(1 - progress, 3);
      setTotalDisplay((from + (total - from) * eased).toFixed(3));
      if (progress < 1) {
        raf.current = requestAnimationFrame(step);
      }
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current !== null) {
        cancelAnimationFrame(raf.current);
      }
    };
    // Depends on `total` only: totalDisplay is the animation output read as the
    // start value, not an input; including it would restart the roll every frame.
  }, [total]);

  useEffect(
    () => () => {
      if (submitTimer.current !== null) {
        clearTimeout(submitTimer.current);
      }
      if (raf.current !== null) {
        cancelAnimationFrame(raf.current);
      }
    },
    [],
  );

  const errors = useMemo<FormErrors>(() => {
    const loValue = parseBound(lo);
    const hiValue = parseBound(hi);
    const parsedPayout = parseFloat(payout);
    const parsedBond = parseFloat(bond);
    const claimDays = Number(claimVal) * DAYS_PER[claimUnit];
    const openDays = Number(openVal) * DAYS_PER[openUnit];
    const found: FormErrors = {};
    if (loValue === null || loValue < 1n) {
      found.lo = "lo must be at least 1";
    }
    if (hiValue === null) {
      found.hi = "hi must be a number below the group order N";
    } else if (hiValue >= N) {
      found.hi = "hi must be below the group order N";
    } else if (found.lo === undefined && loValue !== null && hiValue <= loValue) {
      found.hi = "hi must be greater than lo";
    }
    if (found.lo === undefined && found.hi === undefined && loValue !== null && hiValue !== null) {
      const span = hiValue - loValue + 1n;
      if (span < BigInt(m)) {
        found.m = `this range holds ${groupDigits(span)} key${span === 1n ? "" : "s"}, it cannot hide ${m} canaries`;
      }
    }
    if (Number.isNaN(parsedPayout) || parsedPayout <= 0) {
      found.payout = "payout must be greater than 0";
    }
    if (Number.isNaN(parsedBond) || parsedBond <= 0) {
      found.bond = "bond must be greater than 0";
    }
    if (Number.isNaN(claimDays) || claimDays <= 0 || claimDays > 365) {
      found.claim = "the claim window must be within (0, 365 days]";
    }
    if (Number.isNaN(openDays) || openDays <= 0 || openDays > 365) {
      found.open = "the open window must be within (0, 365 days]";
    }
    return found;
  }, [lo, hi, m, payout, bond, claimVal, claimUnit, openVal, openUnit]);

  const show = (key: keyof FormErrors, touchKey: string): string | false =>
    attempted || touched[touchKey] ? errors[key] ?? false : false;

  const loValue = parseBound(lo);
  const hiValue = parseBound(hi);
  const validRange = errors.lo === undefined && errors.hi === undefined && loValue !== null && hiValue !== null;
  const span = validRange && loValue !== null && hiValue !== null ? hiValue - loValue + 1n : 0n;

  const previewMarks = useMemo(() => {
    const out: { cross: string; animate: boolean }[] = [];
    for (let index = 0; index < m; index++) {
      const jitter = ((((index * 7919 + 42 * 31) % 13) / 13) - 0.5) * 0.05;
      const fraction = Math.min(0.97, Math.max(0.03, (index + 0.5) / m + jitter));
      const markX = Math.round((12 + 616 * fraction) * 10) / 10;
      out.push({ cross: `M${markX - 5} 55 l10 10 M${markX + 5} 55 l-10 10`, animate: index >= stampFrom });
    }
    return out;
  }, [m, stampFrom]);

  const probRows = useMemo(
    () =>
      [0.99, 0.95, 0.9].map((fraction) => ({
        label: `f = ${fraction.toFixed(2)}`,
        prob: `P(paid) ${Math.pow(fraction, m).toFixed(3)}`,
      })),
    [m],
  );
  const mWord = m <= 10 ? NUMBER_WORDS[m] : String(m);
  const errorKeys = Object.keys(errors) as (keyof FormErrors)[];
  const errorLabels: Record<keyof FormErrors, string> = { lo: "lo", hi: "hi", m: "m", payout: "payout", bond: "bond", claim: "claim window", open: "open window" };

  const markTouched = (key: string) => setTouched((current) => ({ ...current, [key]: true }));

  const onSubmit = () => {
    if (submitting) {
      return;
    }
    if (errorKeys.length > 0) {
      setAttempted(true);
      return;
    }
    setSubmitting(true);
    submitTimer.current = setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
    }, 1400);
  };

  const loLabel = validRange && loValue !== null ? groupDigits(loValue) : "—";
  const hiLabel = validRange && hiValue !== null ? groupDigits(hiValue) : "—";
  const spanLabel = validRange ? groupDigits(span) : "—";
  const splitLine = `payout ${(parseFloat(payout) || 0).toFixed(3)} + bond ${(parseFloat(bond) || 0).toFixed(3)}`;

  return (
    <div style={{ minHeight: "100vh" }}>
      <TopRail crumb={<><Link href="/" style={{ color: palette.muted }}>Ledger</Link> / Post a bounty</>} />

      <main className="page-prose">
        <div style={{ animation: "settleY 320ms cubic-bezier(0.16,1,0.3,1) both" }}>
          <h1 className="h1">Tag a new sweep</h1>
          <p className="lead">Hide canary keys in a range; a worker must bring them all back to be paid.</p>
        </div>

        {submitted ? (
          <div className="card" style={{ marginTop: 26, padding: "26px 28px", animation: "settleY 320ms cubic-bezier(0.16,1,0.3,1) both" }}>
            <p className="h2" style={{ color: palette.accent }}>Recorded as bounty no. 43</p>
            <p className="lead" style={{ color: palette.muted }}>
              {total.toFixed(3)} MON is held in escrow{wallet.address !== null ? ` from ${wallet.addressShort}` : ""}. The canaries are hidden; the sweep is open to any worker.
            </p>
            <Link href="/bounty/43" style={{ display: "inline-block", fontSize: 15, fontWeight: 500, marginTop: 12, padding: "10px 2px", minHeight: 44 }}>View the record</Link>
          </div>
        ) : (
          <>
            {/* Live net preview of the range being posted (nothing swept yet). */}
            <div className="card" style={{ marginTop: 26, padding: "18px 20px", animation: "settleY 320ms cubic-bezier(0.16,1,0.3,1) 40ms both" }}>
              <svg viewBox="0 0 640 120" width="100%" role="img" aria-label={`The range to scale with ${m} canary marks placed along it; nothing swept yet`}>
                <defs>
                  <pattern id="meshP" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="skewX(-12)">
                    <path d="M0 16 L16 0 M-4 4 L4 -4 M12 20 L20 12" stroke={palette.faint} strokeWidth="0.7" opacity="0.55" />
                  </pattern>
                </defs>
                <rect x="12" y="24" width="616" height="72" rx="6" fill={palette.well} />
                <rect x="12" y="24" width="616" height="72" rx="6" fill="url(#meshP)" />
                <path d="M12 25 Q320 34 628 25" stroke={palette.muted} strokeWidth="1.6" fill="none" />
                <path d="M12 95 Q320 104 628 95" stroke={palette.muted} strokeWidth="1.6" fill="none" />
                {previewMarks.map((mark, index) => (
                  <path key={index} d={mark.cross} stroke={palette.ink} strokeWidth="1.5" fill="none" style={mark.animate ? { animation: "markStamp 220ms cubic-bezier(0.34,1.4,0.5,1) both", transformBox: "fill-box", transformOrigin: "center" } : undefined} />
                ))}
                <text x="12" y="114" fontFamily="ui-monospace, Menlo, monospace" fontSize="12" fill={palette.muted}>{loLabel}</text>
                <text x="628" y="114" textAnchor="end" fontFamily="ui-monospace, Menlo, monospace" fontSize="12" fill={palette.muted}>{hiLabel}</text>
              </svg>
              <p className="small muted" style={{ margin: "10px 0 0" }}>
                Nothing is swept yet; the {mWord} marks are your canaries, stamped like any other key. <span aria-live="polite" className="mono" style={{ color: palette.ink }}>span {spanLabel} keys</span>
              </p>
            </div>

            <section style={{ marginTop: 34, animation: "settleY 320ms cubic-bezier(0.16,1,0.3,1) 80ms both" }}>
              <h2 className="section-h2">The range and its canaries</h2>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 18 }}>
                <div style={{ flex: "1 1 150px", minWidth: 0 }}>
                  <label htmlFor="f-lo" className="field-label">lo</label>
                  <input id="f-lo" className={`field${show("lo", "lo") ? " field-error" : ""}`} value={lo} onChange={(event) => setLo(event.target.value)} onBlur={() => markTouched("lo")} inputMode="numeric" />
                  {show("lo", "lo") ? <div className="inline-error">{show("lo", "lo")}</div> : null}
                </div>
                <div style={{ flex: "1 1 150px", minWidth: 0 }}>
                  <label htmlFor="f-hi" className="field-label">hi</label>
                  <input id="f-hi" className={`field${show("hi", "hi") ? " field-error" : ""}`} value={hi} onChange={(event) => setHi(event.target.value)} onBlur={() => markTouched("hi")} inputMode="numeric" />
                  {show("hi", "hi") ? <div className="inline-error">{show("hi", "hi")}</div> : null}
                </div>
                <div style={{ flex: "none" }}>
                  <span id="lab-m" className="field-label">m, canaries</span>
                  <div role="group" aria-labelledby="lab-m" style={{ display: "flex", alignItems: "center", border: `1px solid ${palette.edge}`, borderRadius: 6, background: palette.well, overflow: "hidden" }}>
                    <button type="button" className="step-btn" aria-label="Fewer canaries" onClick={() => { setM((current) => Math.max(1, current - 1)); setStampFrom(Math.max(1, m - 1)); markTouched("m"); }}>−</button>
                    <span aria-live="polite" className="mono small" style={{ minWidth: 34, textAlign: "center" }}>{m}</span>
                    <button type="button" className="step-btn" aria-label="More canaries" onClick={() => { setM((current) => Math.min(MAX_M, current + 1)); setStampFrom(m); markTouched("m"); }}>+</button>
                  </div>
                </div>
              </div>
              {(attempted || touched.m || touched.lo || touched.hi) && errors.m ? <div className="inline-error" style={{ marginTop: 10 }}>{errors.m}</div> : null}
              <p className="small muted" style={{ margin: "12px 0 0", textWrap: "pretty" }}>
                lo is at least 1, hi stays below the group order <span className="mono" title="0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141">N = 0xFFFF…4141</span>, and the range must hold at least m distinct keys.
              </p>
            </section>

            <section style={{ marginTop: 34, animation: "settleY 320ms cubic-bezier(0.16,1,0.3,1) 140ms both" }}>
              <h2 className="section-h2">Escrow and windows</h2>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 18 }}>
                <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 130px", minWidth: 0 }}>
                      <label htmlFor="f-payout" className="field-label">payout, MON</label>
                      <input id="f-payout" className={`field${show("payout", "payout") ? " field-error" : ""}`} value={payout} onChange={(event) => setPayout(event.target.value)} onBlur={() => markTouched("payout")} inputMode="decimal" />
                      {show("payout", "payout") ? <div className="inline-error">{show("payout", "payout")}</div> : null}
                    </div>
                    <div style={{ flex: "1 1 130px", minWidth: 0 }}>
                      <label htmlFor="f-bond" className="field-label">bond, MON</label>
                      <input id="f-bond" className={`field${show("bond", "bond") ? " field-error" : ""}`} value={bond} onChange={(event) => setBond(event.target.value)} onBlur={() => markTouched("bond")} inputMode="decimal" />
                      {show("bond", "bond") ? <div className="inline-error">{show("bond", "bond")}</div> : null}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <WindowField id="f-claim" label="claim window" value={claimVal} unit={claimUnit} error={show("claim", "claimVal")} onValue={setClaimVal} onUnit={setClaimUnit} onBlur={() => markTouched("claimVal")} />
                    <WindowField id="f-open" label="open window" value={openVal} unit={openUnit} error={show("open", "openVal")} onValue={setOpenVal} onUnit={setOpenUnit} onBlur={() => markTouched("openVal")} />
                  </div>
                </div>
                <div style={{ flex: "none", width: 168 }}>
                  <div className="small muted">Total to escrow</div>
                  <div aria-live="polite" className="display30 mono" style={{ marginTop: 4 }}>{totalDisplay} <span style={{ fontSize: 15, color: palette.muted }}>MON</span></div>
                  <div className="mono small" style={{ color: palette.muted, marginTop: 4 }}>{splitLine}</div>
                </div>
              </div>
            </section>

            <section style={{ marginTop: 34, animation: "settleY 320ms cubic-bezier(0.16,1,0.3,1) 200ms both" }}>
              <h2 className="h2">Why a partial sweep loses</h2>
              <p className="lead" style={{ maxWidth: 560 }}>
                A worker who skips any fraction of the range gambles every canary against it; with {mWord} canaries the odds collapse fast.
              </p>
              <div aria-live="polite" style={{ marginTop: 14, maxWidth: 380 }}>
                {probRows.map((row) => (
                  <div key={row.label} className="mono small" style={{ display: "flex", justifyContent: "space-between", gap: 24, padding: "8px 0", borderBottom: `1px dashed ${palette.edge}` }}>
                    <span style={{ color: palette.muted }}>{row.label}</span>
                    <span style={{ color: palette.ink }}>{row.prob}</span>
                  </div>
                ))}
                <div className="mono small" style={{ display: "flex", justifyContent: "space-between", gap: 24, padding: "8px 0" }}>
                  <span style={{ color: palette.muted }}>f = 1, exhaustive</span>
                  <span style={{ color: palette.paid }}>always paid</span>
                </div>
              </div>
            </section>

            {(attempted && errorKeys.length > 0) ? (
              <div role="alert" tabIndex={-1} className="error-card" style={{ marginTop: 28, padding: "16px 20px" }}>
                <p style={{ fontSize: 15, lineHeight: 1.55, fontWeight: 600, color: palette.error, margin: 0 }}>The record cannot be posted yet</p>
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                  {errorKeys.map((key) => (
                    <span key={key} className="small" style={{ color: palette.ink }}>{errorLabels[key]}: {errors[key]}</span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="card" style={{ marginTop: 28, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <span aria-live="polite" className="mono small" style={{ color: palette.ink }}>total {totalDisplay} MON</span>
              {wallet.address === null ? (
                <button type="button" className="btn-primary" onClick={wallet.connect} disabled={wallet.connecting}>
                  {wallet.connecting ? "Connecting…" : "Connect wallet"}
                </button>
              ) : (
                <button type="button" className="btn-primary" onClick={onSubmit} disabled={submitting}>
                  {submitting ? "Escrowing…" : `Post and escrow ${total.toFixed(3)} MON`}
                </button>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// One labelled window input plus its inline unit choices (not pills).
function WindowField({
  id,
  label,
  value,
  unit,
  error,
  onValue,
  onUnit,
  onBlur,
}: {
  id: string;
  label: string;
  value: string;
  unit: Unit;
  error: string | false;
  onValue: (value: string) => void;
  onUnit: (unit: Unit) => void;
  onBlur: () => void;
}) {
  return (
    <div style={{ flex: "1 1 210px", minWidth: 0 }}>
      <label htmlFor={id} className="field-label">{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <input id={id} className={`field${error ? " field-error" : ""}`} style={{ width: 84 }} value={value} onChange={(event) => onValue(event.target.value)} onBlur={onBlur} inputMode="numeric" />
        <span style={{ display: "flex", gap: 14 }}>
          {UNITS.map((option) => {
            const active = option === unit;
            return (
              <button key={option} type="button" className="unit-btn" onClick={() => onUnit(option)} style={{ color: active ? palette.accent : palette.muted, fontWeight: active ? 600 : 400, borderBottom: `2px solid ${active ? palette.accent : "transparent"}` }}>{option}</button>
            );
          })}
        </span>
      </div>
      {error ? <div className="inline-error">{error}</div> : null}
    </div>
  );
}
