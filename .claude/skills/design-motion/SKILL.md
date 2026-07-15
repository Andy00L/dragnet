---
name: design-motion
description: Use whenever the task creates or changes anything the user will see: building or restyling UI (components, pages, layouts, styling, a new frontend, a landing page, a dashboard), creating an animation or any motion piece (UI motion, hero reveal, product film, promo, demo insert, loading or ambient piece), preparing prompts for Claude Design or another generation tool to produce UI or motion, or reviewing an interface's design quality. Routes to the static-UI workflow, the animation workflow, or the generate-and-integrate loop, which share one playbook: token-first system, materials, motion families, finishing pass, coherence guardrail, and pass/fail gates. Do not load only for pure backend or logic changes with no visible surface.
---

# Design and motion (the router: loads the right workflow on demand)

This skill keeps the design standards out of context until a visual task shows
up, then loads exactly what that task needs. When it triggers, do all of the
following before producing anything:

1. Route the task:
   - **Creating UI** (a new frontend, a page or screen set, a dashboard, a
     landing page, any surface that does not exist yet): the Claude Design
     loop, `SKILL_CLAUDE_DESIGN.md` track A, is the default. The session
     compiles prompts, the human generates the screens in Claude Design, the
     session integrates the returns. Hand-building a new surface end to end
     happens only when the human explicitly asks for it.
   - **A presentation animation produced with Claude Design** (a promo or
     showcase piece of the project): `SKILL_CLAUDE_DESIGN.md` track B. Its
     first act is asking the human for the duration and waiting.
   - **Small changes to existing UI** (restyle a component, adjust spacing,
     add or fix states on screens that already exist): `SKILL_UI.md`.
   - **Motion implemented in the project's code by the session** (UI
     micro-motion, scroll choreography, a code-rendered piece):
     `SKILL_ANIMATION.md`.
   - Mixed tasks read every workflow that applies.
2. Read the documents for the route, in full:
   - Either Claude Design track reads ALL the files in this folder, in full:
     this router, `DESIGN_AND_MOTION_PLAYBOOK.md`, `SKILL_UI.md`,
     `SKILL_ANIMATION.md`, and `SKILL_CLAUDE_DESIGN.md`. The prompts the loop
     produces must carry the full design and motion vocabulary (tokens,
     materials, motion families, choreography, attention rules, finishing);
     a prompt written from a partial read comes out cheap, and cheap prompts
     produce template UI.
   - The `SKILL_UI.md` route reads the playbook plus `SKILL_UI.md`.
   - The `SKILL_ANIMATION.md` route reads the playbook plus
     `SKILL_ANIMATION.md`.
3. Fill the per-project sheet at the end of the playbook for the product at
   hand. If the project already has a design system, that system supplies the
   exact token values and the playbook supplies the method.
4. Where any workflow refers to `docs/DESIGN_AND_MOTION_PLAYBOOK.md`, use the
   copy in this folder; a project-local copy under `docs/` wins if present.
5. The loop's human gates are hard stops: the color palette (track A) and the
   animation duration (track B) are proposed, asked, and waited for. Never
   advance past one on an assumption or on silence.
6. Nothing ships before the matching gate passes: SKILL_UI section 10 for
   screens, SKILL_ANIMATION section 7 for motion, SKILL_CLAUDE_DESIGN
   section A7 for integrated screens and B5 for a returned animation.

The general coding standards (SKILL_GENERAL.md) and the security always-on
rules keep applying to any code this work produces; the stricter rule wins.
After reading this skill and its documents, extend the acknowledgement line
from CLAUDE.md to: Standards loaded: coding-standards + security-audit +
design-motion
