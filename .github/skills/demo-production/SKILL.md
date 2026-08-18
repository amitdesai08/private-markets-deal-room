---
name: demo-production
description: 'Build, refresh, or produce a narrated demo track for The Deal Room using the demo/ capture-narrate-build pipeline. Use when asked to: build a new demo, create an audience-specific demo (technical, business, executive, IT, security, CTO, CFO, partner, PE), add a lightning cut, add a delivery runbook, record a narrated walkthrough, produce a click-through demo, add or fix voiceover/narration, refresh demo content, or publish/update recordings in docs/demos or an internal demo gallery.'
---

# Demo production (The Deal Room)

Packages the exact, calibrated process used to build the PE-audience, technical-audience and
business-audience demo tracks into a repeatable workflow. Every track produced this way ships
the same three assets, at the same production quality: a **full walkthrough**, a **lightning
cut**, and a **delivery runbook** — each with an interactive click-through, a narrated MP4, and
a markdown script a live presenter can read from.

Read this file first. It is the entry point; the `references/` files below are loaded only
when you reach the step that needs them.

## The three-asset model

Every audience track is three things, not one:

| Asset | Length | Audience | Purpose |
|---|---|---|---|
| **Full walkthrough** | 15–18 min | Whoever is watching it stand-alone | The complete story, screen by screen, own capture |
| **Lightning cut** | 10 min (3 min safe cut) | A short calendar slot | The same story, faster pacing, its **own** fresh capture — never sliced from the walkthrough |
| **Delivery runbook** | Matches the walkthrough | A presenter who isn't the author | Denser, names APIs/env vars/file paths, **reuses** the walkthrough's captured frames |

Each asset is: a `demo/scenes-<track>[-lightning].mjs` manifest (fresh capture) or a
`demo/cuts.mjs` entry (reused frames), a narrated `.mp4` in `docs/demos/media/`, an interactive
`.html` player, and a markdown script in `docs/demos/DEMO-{WALKTHROUGH,LIGHTNING,RUNBOOK}[-TRACK].md`.

## When you're asked for a new audience track

1. **Research the audience's real value proposition first.** Don't guess. Read the actual
   product code/docs for concrete, verifiable facts specific to that audience — grep for the
   product's own internal terminology (e.g. a feature's real code-name) rather than inventing
   one. Never invent a feature, a statistic, or a percentage that doesn't trace to something
   real in the codebase. See [`references/new-track-guide.md`](references/new-track-guide.md)
   for the research checklist and the exact three-tier act structure to follow, with the
   PE/technical/business tracks as worked examples.
2. **Design the acts before writing scenes.** 6–9 acts for a walkthrough, one scene per act
   beat, ~15–17 scenes total. Write the act list first, then one `say` narration per scene.
3. **Write the scene manifest(s).** Follow the exact schema and step vocabulary in
   [`references/scene-schema.md`](references/scene-schema.md) — capture.mjs throws on any verb
   not in that list, and several steps have ordering requirements (e.g. `gotoConfidential`)
   that are easy to get wrong on the first pass.
4. **Write the three markdown scripts** (walkthrough, lightning, runbook) following the
   existing docs' exact structure and prose conventions — see
   [`references/new-track-guide.md`](references/new-track-guide.md) for the section-by-section
   template and the tone rules (no ROI/productivity framing for a technical/deal-team audience
   unless the audience itself is the business/executive track, where that framing is the
   point — see that file for how to do it honestly, without invented percentages).
5. **Do the narration style pass before you spend a single Speech call.** This is not
   optional and not a nice-to-have — it is a measured, mechanical check against a calibrated
   bar, documented in [`references/narration-style.md`](references/narration-style.md). Skipping
   it produces narration that sounds noticeably more stilted than the existing tracks.
6. **Run the production pipeline.** Exact commands, prerequisites and — critically — the
   gotchas that silently produce wrong output, are in
   [`references/pipeline-reference.md`](references/pipeline-reference.md). Read it before your
   first `narrate.mjs` call; there are two gotchas in there that will otherwise cost you a
   full rebuild.
7. **Update the indices and ship it.** `docs/demos/RECORDINGS.md` and `docs/DEMO-CENTER.md`
   both need the new track added (or existing durations/sizes updated) in the same tables the
   other tracks use. Run the app's test suite, commit, push. If your team also publishes to an
   internal demo gallery outside this repo, see
   [`references/publishing.md`](references/publishing.md) for the general pattern (adapt paths
   to your own gallery's structure — it is not part of this repository).

## When you're asked to refresh or improve an existing track

Same references apply, in a different order:

1. Identify precisely what's missing or wrong — a specific factual gap, a specific tone
   problem, or a measured quality regression. "Make it better" is not actionable; "the
   technical track doesn't mention X, a real, verifiable capability" is.
2. Edit the scene manifest(s) and/or markdown docs directly.
3. **Re-run the narration style audit** in [`references/narration-style.md`](references/narration-style.md)
   on the files you touched — an edit that adds even a few sentences can silently regress the
   em-dash/contraction ratio.
4. Recapture and re-narrate. Read
   [`references/pipeline-reference.md`](references/pipeline-reference.md) **before** you run
   `narrate.mjs` — editing an existing scene's text and simply recapturing is **not** enough to
   get the new narration into the video; there is a specific flag you need, covered there in
   detail, and skipping it produces a video that silently plays the *old* narration over new
   screenshots.
5. Re-copy the rebuilt `.mp4`s into `docs/demos/media/`, update the two index docs, re-test,
   commit, push, and republish if you maintain an external gallery.

## The five gotchas that will cost you a rebuild if you skip the references

These are listed here only as a memory jog — each is covered in full, with the exact fix, in
the linked reference file. Do not treat this list as sufficient on its own.

1. `capture.mjs` with no `--manifest` flag wipes the **entire** `shots/` folder first, including
   every other manifest's screenshots. → [`pipeline-reference.md`](references/pipeline-reference.md)
2. `narrate.mjs` skips re-synthesising a scene's audio if that scene id's file **already exists
   on disk** — it does not hash the narration text, so an edited scene silently keeps its old
   audio unless you pass `--force`. → [`pipeline-reference.md`](references/pipeline-reference.md)
3. Only the step verbs listed in [`scene-schema.md`](references/scene-schema.md) exist; inventing
   one throws `unknown step`, and a few (`gotoConfidential`, `closeOverlay`) have ordering/
   navigation side effects that are easy to misuse.
4. Narration quality is measured, not judged by ear — an em-dash becomes a forced 120ms pause
   in the synthesised audio, so em-dash density and contraction density per scene are the two
   concrete numbers that separate natural-sounding narration from a stilted read-aloud. →
   [`narration-style.md`](references/narration-style.md).
5. A UI element only reads as present if it is **actually rendered in the live product for the
   seat/state the scene captures** — several product panels only render once matching data
   already exists. Verify the real on-screen text and conditions in the product's own source
   before writing a `scrollTo`/`spotlight` spec against it, rather than inferring it from a
   markdown doc. → [`scene-schema.md`](references/scene-schema.md).
