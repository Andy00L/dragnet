# .claude2: changes against the master kit (.claude)

This folder is the improved kit. To adopt it, replace the contents of
`.claude` with the contents of this folder (the human does the copy), then
delete this file; internal paths intentionally say `.claude/` because that
is where the kit lives once installed. Two files are byte-equal to the
master and were kept as-is: `SKILL_GENERAL.md`,
`REFERENCE_SECURITY_AUDIT.md`.

| File | Change |
| ---- | ------ |
| `CLAUDE.md` | New "Reply style" section: concise but complete, answer first, no filler blocks, chat in the human's language. The Claude Design loop is now the DEFAULT for creating UI and presentation animations (hand-build only on explicit request). The palette and duration gates added to "Stop and ask" and to the hard reminders. The claude.ai paste block updated to match. |
| `skills/design-motion/SKILL.md` | Routing rewritten: creating UI routes to the loop (track A) by default; Claude Design presentation animations route to track B (duration question first); SKILL_UI is for small changes to existing screens. Either Claude Design track requires reading ALL files of the folder, in full. The two human gates named as hard stops. |
| `skills/design-motion/SKILL_CLAUDE_DESIGN.md` | Rewritten around the real loop. Iron rules: loop by default, full-folder read, two hard human gates, the gitignored `ui-design/` workspace (palette.html, prompts/, returns/), prompts as files, no cheap prompts. Track A: prepare, palette gate (propose, ask, WAIT), self-contained per-screen prompt files (7 mandatory blocks incl. motion vocabulary and premium details), short numbered handoff in the human's language, intake, integration, gate. Track B: duration gate first, palette and UI screenshots reused, reference images optional, the sequential prompt set anim-1-create / anim-2-motion / anim-3-placement / anim-4-polish, handoff, intake and gate. Motion content weighted 9/10 for track B. |
| `skills/design-motion/SKILL_UI.md` | Scope note added: this workflow hand-builds small changes to existing UI and serves as the loop's foundation; a NEW surface defaults to the loop unless the human explicitly asks for hand-building. |
| `skills/design-motion/SKILL_ANIMATION.md` | Routing note added: Claude Design presentation pieces follow track B of the loop (duration gate first, then the sequential prompt set); this file stays the standard and the process for code-rendered motion. The duration of a generated presentation piece is never assumed. |
| `skills/readme-craft/SKILL.md` | Mermaid diagrams now use color to illustrate structure: one classDef per boundary or trust domain (3 or 4 max), fills from the project palette, and every classDef sets fill, stroke, AND color together so both GitHub themes stay readable. Legend line when color carries meaning. Skeleton, template, and final gate updated to match. |

## Update (2026-07-09, second pass): ground truth appendix, pending review

- `skills/design-motion/DESIGN_AND_MOTION_PLAYBOOK.md`: new appendix D, a
  dissected production landing page kept as presentation language only (no
  page content): the typography discipline (size + leading + tracking set
  together, weight ceiling 500, the single eyebrow recipe), the
  recessed-tray depth model (inset-shadow trays, white cards, nested radii,
  solid vs dashed hairlines), component render recipes (machined buttons,
  icon plinths, data rows, stat circles, accordion, status ping), and the
  ambient auto-motion layer (offscreen orbit carousel at 150s/rev, two-axis
  marquee mask, scroll-scrubbed step wheel, four named easing tokens).
- `skills/design-motion/SKILL_CLAUDE_DESIGN.md`: the A3 prompt rules now
  tell the session to mine appendix D when writing the motion and
  premium-detail blocks of each screen prompt.
- These two changes live only in `.claude2` until the human validates them;
  port to `.claude` after review.
