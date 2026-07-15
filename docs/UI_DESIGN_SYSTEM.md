# Dragnet UI design system (per-project sheet)

The single source of truth for the dashboard. Every component reads these tokens;
no literal colors, radii, shadows, or durations in components. Approved direction:
"Warm paper / ledger" (light, warm parchment, one tonal accent). This sheet is
written to satisfy the anti-slop law in `.claude/skills/slop.md`; where the two
ever disagree, the stricter one wins.

## The world (decide the signature first)

Dragnet is a naturalist's field ledger for keyspace. A buyer tags `m` "canary"
private keys and hides them, indistinguishable, inside a range `[lo, hi]`. A worker
drags a dragnet through the range and must bring back every tagged canary to prove
the sweep was exhaustive; miss one and the payout is zero. The interface is that
ledger: aged paper, ink, a specimen teal, and one crafted artifact, the keyspace
net, that carries the whole idea.

House style, one line: a quiet naturalist's ledger, tactile paper and ink, one
tonal teal, and a hand-built dragnet that makes an exhaustive keyspace sweep legible
at a glance.

## The signature artifact (built first; everything supports it)

**The keyspace net.** A bespoke SVG object, not a progress bar and not a page grid:
a dragnet drawn across the range with a roped top and bottom edge and a slight sag,
holding the canary marks as small hand-inked specimen stamps placed along it
(uniform, so canary and target are indistinguishable). The swept span is a low-alpha
teal wash filling the net from `lo` to the drag frontier; the unswept tail is bare
paper with the net visible. Found canaries get stamped and ringed in accent (caught
in the net). It appears once, large, on the bounty detail (the hero object), and as
an honest miniature of the same object inline in the market ledger. Nowhere is a
faint full-page grid used; the only "net" is this contained, authored object.

## Palette (warm paper, the only theme)

| Role | Hex | Use |
| --- | --- | --- |
| Field / paper | `#ECE6D8` | page substrate, carries grain (never flat) |
| Raised surface | `#F4EFE3` | a card, lifted by tone, not shadow |
| Sunken well | `#E4DDCC` | inset areas (a form field trough, the net bed) |
| Ink | `#22201B` | primary text, warm near-black, never `#000` |
| Muted ink | `#6E6656` | secondary text |
| Faint ink | `#A79D89` | disabled, placeholder, quiet meta |
| Accent (specimen teal) | `#1F5B52` | the one interactive color, as a tonal value shift |
| Accent soft | `#D7E2DB` | accent wash / a filled area, low presence |
| Accent deep | `#16443E` | pressed / hovered accent text |
| Reserved: paid | `#3E7B4F` | the ink-stamp "paid", once per screen |
| Paid soft | `#DCE7DA` | |
| Reserved: pending | `#B07A24` | pending / incomplete sweep, sparingly |
| Pending soft | `#EDE2C7` | |
| Destructive | `#A83A2B` | errors, slashed |
| Destructive soft | `#EEDAD3` | |
| Border edge | `#D9D1BE` | self-colored tonal edge (a darker paper tone) |
| Top highlight | `#FCF8EF` | 1px inner top light on a raised surface |

Anti-slop palette rules (from `slop.md`): the accent is **tonal**, a dark
desaturated value shift, never a poster-bright swatch splashed on type, dots, and
buttons. Reserved colors are punctuation, one use per screen each, never a generic
status color. The field is a **specific chosen warm paper with grain**, never flat
oat-milk cream and never the UI-kit gray. Borders are **self-colored tonal edges**
plus a top highlight, never a contrasting hairline outline on every box.

## Type (distinctive display, neutral body, mono only for data)

- Display: **Gambarino** (Fontshare, self-hosted via `next/font/local`), for
  headings, the wordmark, and pull statements. A distinctive expressive serif, off
  the Google-defaults shelf (`slop.md` rejects Inter, Geist, Fraunces, and the whole
  rotation). Fallback in the palette card only: Georgia.
- Body / UI: **system-ui**. Genuinely neutral, not a trendy Google sans; it carries
  running text, controls, and labels.
- Data: **ui-monospace** (system mono), tabular, **only** for real data: hashes,
  addresses, hex ranges, ids, MON amounts, block numbers. Never on labels, eyebrows,
  buttons, or captions (mono-as-house-voice is slop).
- Steps (px / line-height / tracking): display 40/1.08/-0.01em; h1 30/1.15/-0.005em;
  h2 20/1.25/0; body 15/1.55/0; small 13.5/1.45/0; data-mono 13.5/1.45 tabular.
- No tracked-caps eyebrow on every section, and no single label costume everywhere.
  Open a section with its heading or a real sentence; vary how sections begin.

## Space, shape, and one bespoke silhouette

- 4px rhythm (4/8/12/16/20/24/32/48/64). Content max 1120; prose column 680; side
  padding 32 desktop / 20 mobile. Generous gutters; never set text against an edge.
- Radii: input 6, card 8, large panel 12. Nested radius = parent minus padding.
- The one bespoke silhouette: the bounty "specimen card" carries a small cut index
  tab on its top-left corner (a notched shape, like a filed record), used once as
  the card's identity. Clear the cut: pad content well clear of the notch.

## Depth and material (tonal, not shadows)

- Elevation is **tonal**: a raised surface is `#F4EFE3` (lighter than the `#ECE6D8`
  field) with a 1px self-colored edge `#D9D1BE` and a 1px inner top highlight
  `#FCF8EF`. That reads as a lifted paper lip catching light, no drawn outline.
- No default all-around drop shadow. A genuine overlay (menu, dialog) gets one
  tight, directional, ink-tinted shadow: `0 1px 2px rgba(34,32,27,0.10), 0 8px 20px
  rgba(34,32,27,0.10)`, cast from the top-left light, never a symmetric halo.
- One light source, top-left, like a page under a desk lamp; a very soft, feathered
  paper vignette agrees with it. No radial glow behind any object.
- Grain: fine noise on the paper substrate only, ~4% opacity, behind content, never
  over text. Any large tone transition carries grain so it never bands.

## Motion (authored, content-safe)

- Durations: 120 small, 220 standard, 320 large; exits ~20% shorter.
- Easing: enter/decelerate `cubic-bezier(0.16,1,0.3,1)`; exit `cubic-bezier(0.4,0,1,1)`;
  on-screen `cubic-bezier(0.4,0,0.2,1)`. One authored ink-stamp settle
  (`cubic-bezier(0.34,1.4,0.5,1)`), used only on the paid stamp.
- No hover boop: buttons never translate or scale on hover; state changes by a tonal
  fill/ink shift or an icon slide. No growing-underline hover. Cards do not lift; an
  interactive row shifts tone to the raised surface only, no shadow, no border glow.
- Content is visible by default. Entrance motion animates a small `y` on
  already-present content; the no-JS fallback shows everything. Never gate content on
  opacity-0 or a reveal.
- The keyspace net's coverage wash fills the **full** track smoothly (clip-based,
  stable caps); canary marks stamp in as found; the frontier handle drags across.
- Library: Motion (motion.dev) for authored motion; shadcn/ui + Radix for accessible
  primitives, art-directed hard. No Tailwind blueprint grid backgrounds.
- `prefers-reduced-motion`: static, fully readable, wash at its final coverage.

## Screens (hero-first)

1. Bounty detail (hero) — the specimen record and the live sweep.
2. Market — the ledger of bounties with the inline net miniature.
3. Post a bounty — the buyer tags canaries and sets the sweep; escrow + `f^m` note.
4. Worker run — drag the net, bring back canaries, be paid or earn zero.

## Stack

Next.js (App Router, latest stable) + Bun, deployable to Vercel. TypeScript strict,
errors as values. viem against Monad testnet (chainId 10143) reading the deployed
`DragnetMarket`, reusing `@dragnet/sdk` and `@dragnet/crypto`. Self-host Gambarino
via `next/font/local`; shadcn/ui + Motion as the component and motion foundation.

## Final gate

Before shipping, walk `.claude/skills/slop.md` point by point against every screen,
fix each miss, and confirm. Then the SKILL_UI section 10 screenshot gate, contrast
in the one theme, and the SKILL_GENERAL final check.
