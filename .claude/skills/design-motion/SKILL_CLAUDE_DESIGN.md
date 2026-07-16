# SKILL_CLAUDE_DESIGN.md: the generate-and-integrate loop (Claude Design)

This is the default workflow for creating UI and for producing presentation
animations of the project. The session does not design these things itself;
it runs one of two tracks that share one discipline:

- **Track A: UI screens.** The session compiles the project's design system
  into one self-contained prompt file per screen, the human generates each
  screen in Claude Design (high) and returns the exports, the session
  integrates them into the codebase (data, states, routes) and gates the
  result.
- **Track B: presentation animation.** The session compiles a sequential set
  of three to four prompt files (create the piece, then refine motion and
  rhythm, then verify placement, then polish), the human runs them in order
  in Claude Design, the session receives the final piece and gates it.

Companion documents: this loop requires the ENTIRE design-motion folder read
in full before any loop work: `DESIGN_AND_MOTION_PLAYBOOK.md` (the standard),
`SKILL_UI.md` (framing, grounding, research, states matrix, gate),
`SKILL_ANIMATION.md` (motion craft, research sweep, spec method, gate), and
the router. The prompts this loop produces are only as good as the vocabulary
behind them; a partial read produces cheap prompts, and cheap prompts produce
template UI.

The division of labor that makes the loop work: the generator owns visual
exploration and first drafts; the session owns the system (tokens), the
prompts, the states, the wiring, and the gate. Generated output is a draft,
never merged as-is. The single biggest failure of naive generation is
prompting without a token sheet: the tool returns competent generic UI, the
exact template look this system exists to kill. The sheet is the compression
that makes prompts specific.

---

## 0. Iron rules (both tracks)

1. **The loop is the default.** A new surface or a Claude Design animation
   is never hand-built and never generated from an improvised chat prompt.
   If the human explicitly asks for hand-building, `SKILL_UI.md` or
   `SKILL_ANIMATION.md` take over end to end; otherwise this loop runs.
2. **Read everything first.** All files of the design-motion folder, in
   full, before the first proposal. No exceptions, no skimming.
3. **Two human gates, hard stops.** Track A: the color palette. Track B: the
   duration. In both cases the session proposes, asks, and waits. Silence is
   not approval. Nothing downstream of a gate is produced before the gate
   passes.
4. **The workspace is `ui-design/`, gitignored.** Created at the project
   root in the first loop session, with `ui-design/` added to `.gitignore`
   in the same change (editing `.gitignore` is a file edit, allowed; git
   commands never are). Layout:

   ```
   ui-design/
     palette.html            the approved palette card, attached to every run
     prompts/
       00-system.md          track A: the master system block
       01-<screen>.md ...    track A: one self-contained prompt per screen
       anim-1-create.md      track B: creates the whole piece
       anim-2-motion.md      track B: motion, rhythm, and tempo refinement
       anim-3-placement.md   track B: placement and overflow verification
       anim-4-polish.md      track B: optional final polish
     returns/
       01-<screen>/          the zip and images the human brings back
       animation/            the final animation export
   ```

5. **Prompts are files, never chat-only.** Every prompt is written as a
   markdown file under `ui-design/prompts/` so it survives the session and
   can be re-run. The chat message that follows is only the short handoff.
6. **No cheap prompts.** A prompt ships only when it is self-contained
   (Claude Design sees nothing but the one pasted document and the
   attachments) and complete against its checklist below. If any block is
   missing, the prompt is not done. Values, not adjectives: hex, px, ms,
   cubic-bezier, family names. Name the anti-patterns explicitly; the
   playbook's amateur tells travel well as "never" lines.

---

## Track A: creating UI screens

### A1. Prepare

- Run SKILL_UI steps 2 to 4 first: frame the surface (scope, register,
  density profile, the interface's hero moment, theme scope, stack reality),
  ground in whatever brand truth exists, run the research sweep, and collect
  the signature-element candidates. No grounding, no prompts.
- Inventory the real product: the routes and screens list, the data shapes
  each screen renders (real field names, real magnitudes), the actions each
  screen offers, existing components worth keeping. Prompts describe real
  screens; a generator fed vague scope invents features that then get cut.
- Order the screen list hero-first. The interface's hero moment is generated
  first because it locks the style; every later screen references it.
  Generating screens in random order produces five styles.
- Collect the attachments: logo and glyphs, font names or files, one to
  three existing screenshots if any exist.

### A2. The palette gate (stop and wait)

- Build the palette from the register and the research (playbook appendix
  B): the seven roles (field, ink, muted ink, faint ink, one accent with a
  soft and a deep variant, one or two reserved accents, destructive), each
  with a hex value and a one-line rationale tied to the register.
- Present it to the human in chat, concisely: the roles with hex values, two
  or three lines on why this direction fits the product, and at most one
  alternative direction when the register genuinely allows two readings.
  Then ask explicitly: approve, or adjust which roles?
- WAIT. Do not write `palette.html`, do not write prompts, do not sketch
  screens while waiting. Adjustments loop back to this gate until the human
  approves.
- On approval, write `ui-design/palette.html`: one self-contained HTML page
  the human will attach to every Claude Design run. It shows the field as
  the page background, the seven roles as labeled swatches with hex values,
  the type pairing rendered at real sizes with the weight ceiling, the
  material recipe applied to one sample card (with the literal CSS in a
  code block), the layered shadow stack on one element, and one or two
  sample primitives (a button set, an input). This card pins color and
  material better than any prose; it is the loop's ground truth.
- Complete the per-project sheet (playbook part 7) with the approved values
  and write it to `docs/UI_DESIGN_SYSTEM.md`, as SKILL_UI requires.

### A3. The prompt pack

Write `00-system.md`, then one `NN-<screen>.md` per screen in the hero-first
order. `00-system.md` is the master copy of the system block; every screen
file EMBEDS the full system block at its top, so one file is one paste and
each prompt stays truly self-contained. When the system block changes, it
changes in `00-system.md` and every screen file is regenerated from it.

The system block contains:

1. The product in one line, and the register.
2. The full token sheet inline: the seven palette roles with hex, the type
   pairing with size steps and the weight ceiling, the radii and spacing
   scale, the material recipe as literal CSS, the layered shadow stack, and
   the signature element with its placement rule.
3. The motion tokens: the duration ladder, the named easing curves as
   cubic-bezier values, the one stagger constant (30 to 60ms), the
   overshoot budget, press scale 0.97 to 0.98.
4. The hard rules as "always" lines: one accent; the field, never flat
   white; sentence case; tabular numbers; every state designed; realistic
   data only.
5. The amateur tells as "never" lines (playbook 5.1): never animate layout
   properties, never a default or linear easing, never a bare crossfade,
   never scale-from-0, never two things competing for the eye, never a
   second accent color, never nested material, never a stagger of 100ms or
   more, and the rest that apply to this product.
6. The accessibility floor: contrast 4.5:1 body and 3:1 large, visible
   focus on everything interactive, 44px touch targets, a label on every
   input.
7. Output expectations: the project's framework and styling system,
   component naming, files per screen.

Each `NN-<screen>.md` then adds, all seven blocks present, none skipped:

1. **Purpose:** the screen's job in one sentence, and whether it is the
   hero screen or must match the attached accepted export of the hero.
2. **Layout skeleton in words:** the regions and what sits where, the
   density profile, the one primary action and its position.
3. **Content inventory:** the exact components present, the real field
   names, realistic inline sample data (real lengths and magnitudes, the
   long name, the 12-digit amount), and what not to invent: no extra
   features, no placeholder nav items.
4. **States:** which of loading (a skeleton mirroring the final layout),
   empty (designed, with the motif and one action), error (visually
   distinct from empty, with a retry), disabled, and partial apply to this
   screen, each described in one line.
5. **Motion and micro-detail, in motion vocabulary:** the entrance
   choreography (for example a staggered fade-rise, 12px, 40ms stagger, on
   the decelerate curve), hover and press behavior (lift 2 to 4px, press
   scale 0.97, spring feel), the transitions between states, which single
   element owns this screen's hero moment and exactly what it does, and
   the ambient loop when the surface is a marketing one (slow gradient
   drift on 8 to 20s cycles, a breathing hero at scale 1.02 to 1.04).
   Every duration and curve resolves to the system block's tokens.
6. **Premium details:** the finishing notes for this screen (the layered
   shadow logic and its one light direction, the one specular or gradient
   accent if any, grain only where the register allows it), the focus
   treatment, the empty-state illustration direction, number formatting,
   truncation behavior.
7. **Responsive intent:** what collapses, what hides, the table strategy
   at the smallest breakpoint, touch targets.

Prompt writing rules: self-contained always; values, not adjectives; the
states demanded explicitly (generators skip empty and error unless told);
the continuity rule stated on every non-hero screen ("match the attached
accepted screen exports: same tokens, same material, same motion feel");
and mine the playbook's worked references (appendix A's glass, appendix
D's recessed-tray dissection) for presentation-detail language when
writing blocks 5 and 6: exact shadow and button recipes, hairline
semantics, the eyebrow label system, ambient-layer geometry and numbers.

### A4. The handoff (short, numbered, in the human's language)

After writing the files, send the human a short numbered message and nothing
more, written in the language the human uses in chat. The shape:

1. In Claude Design (high): attach `ui-design/palette.html`, paste
   `ui-design/prompts/01-<hero>.md` (the system block is already inside).
   Iterate until satisfied: one variable per regeneration, 3 to 5 variants,
   pick one.
2. Export the winning screen (code and images) into
   `ui-design/returns/01-<hero>/`.
3. Next screen: attach the palette card AND the accepted screen 1 export,
   paste `02-<screen>.md`. Same rhythm down the list.
4. When the returns are in, say so; integration starts then.

### A5. Intake

- Read everything that came back before touching anything: the exported
  code, the screenshots, the zips unpacked in place under
  `ui-design/returns/`. SKILL_GENERAL section 1 applies to generated code
  too.
- Inventory it: files, the dependencies it assumes, every hardcoded value,
  every invented component, every state it skipped.
- Triage, one decision each:
  - The generator used its own utility classes or component library: decide
    once, for the whole batch, between transplanting the generated styles
    onto the project's existing primitives, or adopting the generated
    structure and re-tokenizing it. The rule: fewest new dependencies wins,
    and never two component systems in one repo.
  - Off-sheet colors, fonts, or radii appear throughout: if it is a handful,
    conform them during integration; if it is systemic, re-prompt that
    screen with the palette card attached rather than hand-repainting every
    node. One re-prompt is cheaper than fifty edits.
  - Invented features or fields: cut to the real data shape from the
    inventory in A1. The generator's imagination is not a spec.

### A6. Integration (the wiring)

The ordered pass that turns a draft into product code:

1. **Placement:** components into the root components tree by domain,
   routing files into the framework's routing tree (SKILL_GENERAL section
   3); nothing lands in a route-local components folder.
2. **Re-tokenize:** every literal color, spacing, radius, shadow, and font in
   the generated code re-mapped to the sheet's tokens. The diff should read
   as "values became tokens". A literal that survives is a future
   inconsistency.
3. **Wire data and actions:** replace sample data with real state, server
   data, or props; hook actions to real handlers; type everything fully (no
   `any`, errors as values, per SKILL_GENERAL).
4. **Build the missing states:** generators reliably skip loading, empty,
   error, and disabled. Add them from the project's primitives following the
   SKILL_UI section 8 matrix, in this same change.
5. **Accessibility and responsive completion:** focus order and visibility,
   labels, semantic landmarks, contrast re-checked after any color
   conforming, every breakpoint looked at, touch targets verified.
6. **Motion:** apply the sheet's motion tokens to hover, press, and reveals;
   wire `prefers-reduced-motion`.
7. **Dead code sweep:** unused generated variants, unused classes and
   imports, commented-out blocks: deleted in this change (SKILL_GENERAL
   section 7).

### A7. The gate

Run the SKILL_UI section 10 gate on the integrated result inside the real
app, not on the generator's preview: screenshots at 2x of every screen and
triggered state, checked against the sheet, the playbook contract (5.2), and
the amateur tells (5.1). Plus the loop-specific checks:

1. No off-token literal survived (search the touched files for hex values
   and pixel literals outside the tokens file; expect zero unexplained
   hits).
2. No second component library or styling system entered the project
   manifest.
3. The style lock held: the hero screen and every later screen read as one
   product in a side-by-side of the screenshots.
4. Everything the generator invented off-sheet was either conformed, cut, or
   deliberately adopted into the sheet (see the edge cases below), with no
   silent drift.

If a screen fails on style, prefer one re-prompt with a tightened system
block over deep hand-repainting; hand-fix only local issues. Note what was
re-prompted and why, so the pack improves for the next screen.

---

## Track B: the presentation animation

The piece: an animated presentation of the project (a promo, a launch or
showcase piece), produced in Claude Design, almost always presenting the UI
built in track A. The motion content of this folder (playbook parts 3 to 5,
SKILL_ANIMATION in full) carries a 9 of 10 weight here: whether the piece
reads chic and eye-catching or cheap is decided almost entirely by the
motion, rhythm, and detail language written into the prompts.

### B1. The duration gate (the first question, stop and wait)

- Before any other work on the piece, ask the human how long the animation
  should run, and fold into the same single question anything else that is
  genuinely unknown: the aspect and where it will play (a landing-page
  insert, a demo, a social format), and whether reference images should be
  attached (a product or film whose motion feel to emulate; optional, their
  call).
- WAIT for the answer. The whole beat structure hangs on the duration;
  nothing downstream is drafted before it is validated.
- Then frame the rest per SKILL_ANIMATION section 2: the one emotional job,
  the hero object, the one held moment, the register.

### B2. Ground

- Read the entire design-motion folder if not already read this session.
- Reuse the track A truth: the approved `ui-design/palette.html` and the
  accepted screen exports or screenshots ARE the visual system of the piece
  (the animation presents the project through the UI already built). If no
  track A ever ran, run the A2 palette gate first; an animation needs an
  approved palette too.
- Run the SKILL_ANIMATION research sweep scaled to the piece, then map the
  timeline: beats with timestamps summing exactly to the approved duration,
  the hook inside the first 3 seconds, the climax at 60 to 85 percent, the
  end card held 1.5 to 2 seconds.

### B3. The prompt set (three to four files, run in order)

Sequential refinement: prompt 1 creates, prompts 2 and 3 are improvement and
precision passes, prompt 4 is optional polish. Each file is self-contained
(it carries the piece's name and duration, the palette roles with hex, the
motion tokens, and the attachment list; Claude Design sees only what is
pasted and attached).

**`anim-1-create.md`: creates the whole piece.** Contains: the piece in two
sentences and its one emotional job; duration, aspect, silent-first, 60fps;
the visual system (palette roles with hex, type pairing, material words, the
UI screenshots as the content being presented); the hero object and every
transformation it performs; the full beat-by-beat timeline with timestamps
(per beat: its purpose, the exact on-screen text with its reading hold at 12
to 15 CPS, the one dominant motion with easing and duration, the one camera
move, and what carries over from the previous beat); the tempo rules (a new
focal change every 0.7 to 1.0 second in dense passages, one dominant change
at a time, dead air under 1.5 seconds, element-level motion that keeps
changing: quick and punchy, never static slides); the motion tokens (the
duration ladder, named cubic-bezier curves, one stagger constant of 30 to
60ms, one overshoot budget); the finishing pass parameters (playbook 3.6,
dialed low); and the coherence contract stated as binding (one light, one
physics, one lead at a time, offstage memory, everything on tokens).

**`anim-2-motion.md`: refines motion, animation, and rhythm only.** Keep
composition, scenes, palette, and content; improve exclusively how things
move. A numbered checklist the tool applies beat by beat: every easing on
the named curves (enters decelerate, exits accelerate and run about 20
percent shorter); no bare crossfade anywhere (every fade carries a small
transform); the stagger tightened to the constant (30 to 60ms; 100ms and up
reads as a slideshow); follow-through added (secondary elements trail 100 to
200ms and settle late); overlaps instead of dead gaps between beats; the
accelerando built (beats shorten into the climax, varied wave-like, never
metronomic); transitions snappy (150 to 400ms, 2px motion blur on the fast
element, removed on settle); count-ups easing the value on tabular figures;
ambient layers drifting on 8 to 20s cycles; exactly one primary motion at
any instant, with deliberate rests so the next move lands.

**`anim-3-placement.md`: verifies placement and containment.** Instruct the
tool to scan every beat at its start, mid-motion, and end frames and fix:
no text overflows or escapes its container at any frame, mid-animation
included; nothing clipped by the frame edge or a parent's bounds unless the
exit is intentional; consistent margins and safe areas for the aspect;
everything aligned to the grid, with optical alignment on icons and
baselines; no element overlapping text while the text is being read; sane
z-order through every transition; the spacing rhythm intact (no crowding
introduced by motion); the end card composed clean. Fix by resizing the
container, repositioning, or rewrapping the text, never by shrinking type
below the system's smallest step; then re-scan.

**`anim-4-polish.md`: optional final pass.** The finishing A/B (raw versus
finished visibly different, no single effect nameable); grain, vignette, and
bloom inside the playbook bands; one specular sweep at the held moment; the
peak-end shape verified (one climax, built to and held; the end frame is the
cleanest frame, held 1.5 to 2 seconds); 60fps held (blur and bloom cut first
if it slips); the reduced-motion fallback; then the SKILL_ANIMATION section
7 gate lines restated in the prompt as the tool's own checklist.

### B4. The handoff (short, numbered, in the human's language)

1. In Claude Design (high): attach `ui-design/palette.html`, the UI
   screenshots, and any reference images; paste `anim-1-create.md`.
2. When the piece plays end to end and the composition feels right, paste
   `anim-2-motion.md` on the same piece.
3. Then `anim-3-placement.md`. Then, if wanted, `anim-4-polish.md`.
4. Drop the final export in `ui-design/returns/animation/` and say so.

### B5. Intake and the gate

- Read the returned piece in full. If it embeds in the product (a
  landing-page hero, a demo insert), integrate it with the A6 discipline
  (placement, re-tokenize, reduced-motion, dead code sweep).
- Gate it against SKILL_ANIMATION section 7 (the critique gate), plus the
  anim-3 placement scan re-run by the session on the real render. A line
  that fails goes back to Claude Design as one more targeted refinement
  prompt, not as a hand-rewrite of generated animation code.

---

## Edge cases of the loop

- **No brand, no sheet possible yet:** run the SKILL_UI grounding step to
  define one from the register, then the A2 palette gate as usual. Never
  prompt without a sheet and an approved palette; that is the template-look
  path.
- **The generated output beats the sheet somewhere** (a better surface
  treatment, a smarter density): update the sheet deliberately, as one
  recorded decision (in `docs/DECISIONS.md` when the project keeps one),
  then conform everything else to the updated sheet. Improvement enters
  through the sheet or not at all.
- **Partial acceptance:** integrate the approved screens now; the pack under
  `ui-design/prompts/` keeps a later regeneration of screen four from
  restyling screen one. The system block is the anchor; regenerations always
  resend it.
- **The human returns screenshots only, no code:** treat them as validated
  reference frames and hand-build with SKILL_UI, matching the frames.
- **Multi-session reality:** the sheet (`docs/UI_DESIGN_SYSTEM.md`,
  versioned) and the workspace (`ui-design/`, gitignored) live on disk,
  never only in chat. The integration session may not be the session that
  wrote the pack; the files are the contract between them. If the pack must
  survive a fresh clone, copy `ui-design/prompts/` into `docs/design/` on
  the human's request; the returns (zips, images) stay gitignored
  regardless.
- **The generation tool is unavailable:** fall back to SKILL_UI (screens) or
  SKILL_ANIMATION (motion) end to end; the sheet, the approved palette, and
  the research already done transfer as-is.

The general coding standards and the security always-on rules apply to every
line of integrated code; the stricter rule wins. The task ends, as always,
with the SKILL_GENERAL final check, the files-affected report, and the git
handoff block.
