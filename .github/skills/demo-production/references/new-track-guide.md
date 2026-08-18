# Designing a new audience track

This is the template used for the PE-audience, technical-audience and business-audience tracks.
Follow the same shape for any future audience.

## Step 1 — Research the audience's real value proposition

Do not start writing narration until you can answer, with citations to real code/docs, "what
does this audience actually care about, and what in this product concretely serves that?"

- **Technical / IT / security audience** cares about: identity and access enforcement, data
  sovereignty, what an AI agent can and can't reach, connector/integration governance, audit
  trails, the cloud footprint and deployment model, extensibility. Ground every claim in a
  real mechanism — grep the codebase for the actual enforcement point (a middleware function, a
  registry lookup, an env var gate) rather than describing a feature in marketing language.
- **Business / executive audience** (CEO, CFO, managing partner) cares about: what a tool takes
  off their team's plate, deal-flow throughput, ease of adoption, why this over the status quo.
  This is the one audience where productivity/ROI framing is appropriate — but see the "no
  invented statistics" rule below; every saving must be tied to a **named manual task** the
  product removes, never a percentage or a speed claim that can't be substantiated.
- **Deal-team / practitioner audience** cares about: does this help me do my actual job, is the
  data trustworthy, does it show its sources. Decision-grade data, not a productivity pitch —
  this is the one audience where ROI framing should be deliberately **avoided**.

Concretely: grep the codebase's own internal documentation and code comments for how the team
building the product already talks about a capability internally (their own established
terminology) before inventing a name for it yourself. If a term doesn't appear anywhere in the
codebase, don't assume it exists — ask, or use the closest real, documented concept instead of
guessing at a plausible-sounding feature name.

## Step 2 — Design the acts, then the scenes

A full walkthrough is 6–9 acts, one scene per act beat, for roughly 15–17 scenes and 8–18
minutes of narrated video. Write the act list (an `ACTS` array of `{ n, title }`) before writing
a single scene — the acts are the outline; scenes fill it in.

A lightning cut is its **own fresh capture**, not a slice of the walkthrough — it has its own
pacing, typically 6–9 scenes, and should stand alone as a 10-minute (3-minute-safe-cut) story
with the same claims but fewer stops.

A runbook **reuses** the walkthrough's already-captured frames (via `demo/cuts.mjs`'s `use:
'<scene-id>'` references), adding denser, more implementation-facing narration overrides —
naming REST routes, env vars, file paths — for a presenter who is delivering the demo but isn't
its author.

## Step 3 — The three markdown scripts, exact structure

Each of the three docs (`docs/demos/DEMO-WALKTHROUGH[-TRACK].md`,
`docs/demos/DEMO-LIGHTNING[-TRACK].md`, `docs/demos/DEMO-RUNBOOK[-TRACK].md`) follows this
shape — copy the structure from the existing PE-audience docs and the technical/business docs
directly rather than reinventing it:

**Walkthrough doc:**
- Header: who it's for, how long, a note on when the checked-against-product date was
- A pointer to the narrated version (`demo/`, which scenes file builds it)
- "Before you start" — the spoken disclaimer line to say out loud, which seat to sign in as
- One act section per act: a short "what to click" list, then one or more `>` blockquoted
  spoken lines matching (or closely paraphrasing) the scene's `say` text
- "The questions you will actually be asked" — a Q&A table, one-line answers
- "The one-page card" — a compact table mapping act → screen → the one line that lands
- Named "traps" — things a presenter commonly gets wrong for this specific audience
- "The one-paragraph version" — a single blockquote summarising the whole pitch

**Lightning doc:**
- Same disclaimer pattern, shorter
- A single table: beat / what to do / what it proves
- A named "N-minute cut" pointing at the 2–3 beats that carry the whole story alone
- Close + ask
- "What it addresses for [audience]" table
- "If you are asked" — hands off cost/security/architecture questions to the walkthrough's Q&A
  rather than duplicating them

**Runbook doc:**
- A "which document do I want?" callout at the very top, routing a reader to the walkthrough or
  lightning doc instead if they don't need this level of detail
- "The canonical spine" — a numbered list of beats in a fixed order, plus a "safe fallback" (a
  shorter subsequence of the same beats) and a "60-second pre-flight" checklist
- One numbered section per beat, denser than the walkthrough, naming real API routes/env
  vars/file paths
- "Quick reference" — a feature → screen/API mapping table
- "Troubleshooting" — real, specific failure modes and fixes

## Step 4 — The "no invented numbers" discipline

This is a hard rule, not a suggestion, and it is what makes a business/ROI-framed track
credible instead of a marketing pitch:

- Never write "X% faster" or "saves N hours" — there is no way to substantiate it and the
  moment an audience catches one invented number, they stop trusting all the others.
- Instead, name the **specific manual task removed** and the **mechanism that removes it** —
  "a committee memo is normally a multi-day drafting exercise; here the IC pack is already
  drafted from the live record the moment the deal is created" is a claim you can defend
  because it's about what the product mechanically does, not a claim about how much time that
  saves any particular firm.
- Any on-screen number you do assert (a deal count, a persona's seat count) must be verified
  live against the actual running product at write time, and documented as "current as of
  [date]" in the recordings index, because seeded demo data changes.

## Worked examples to copy from

- `demo/scenes.mjs` + `docs/demos/DEMO-WALKTHROUGH.md` — the original, most-calibrated
  PE-audience track. Use this as the narration-style reference above all others.
- `demo/scenes-technical.mjs` + `docs/demos/DEMO-WALKTHROUGH-TECHNICAL.md` — a technical/IT
  audience track: identity trust seam, agent isolation, agentic-workflow orchestration,
  connector governance, an internal-data-source integration, audit trail, cloud footprint,
  deploy story.
- `demo/scenes-business.mjs` + `docs/demos/DEMO-WALKTHROUGH-BUSINESS.md` — a business/executive
  audience track: ease of use, a triaged daily view, deal-flow-at-scale framing, first-draft
  document generation, follow-up tracking, cross-system integration, reporting — all under the
  no-invented-numbers discipline above.
- `demo/cuts.mjs` — both runbook cuts (`runbook`, `runbook-technical`, `runbook-business`),
  showing the `use: '<scene-id>'` reuse pattern and the denser override-narration style.
