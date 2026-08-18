# Narration style — the calibrated natural-speech bar

The narration is voiced by Azure AI Speech (`en-US-AndrewNeural`), and it is meant to sound like
someone actually talking through a product, not a document being read aloud — the internal
reference point used to calibrate this was the cadence of a well-produced product-launch
keynote, not a technical manual. Below is the mechanical, measurable process that keeps every
new track at the same bar as the originals, instead of relying on "it sounds fine to me."

## Why this is measurable, not a matter of taste

`demo/narrate.mjs`'s SSML shaping does exactly one transformation beyond the raw text: it turns
every em-dash surrounded by spaces into a **120ms forced `<break>`**.

```js
// from narrate.mjs's ssml() function
.replace(/\s+\u2014\s+/g, '<break time="120ms"/> ');
```

The neural voice already paces sentence and clause boundaries on its own — periods and commas
need no help. An em-dash is the *only* punctuation this pipeline treats specially, precisely
because the voice otherwise runs straight through it as if the words on either side were one
clause. That means **em-dash density is a direct, physical measurement of how many forced
pauses are stacked into a scene's audio** — write a scene with five em-dashes and you have
written five extra beats of hesitation into it, whether that was the intent or not.

Contraction density ("it's", "doesn't", "can't", "there's", "that's" vs. "it is", "does not",
"cannot", "there is", "that is") is the other half of the same signal: natural spoken English is
heavily contracted, and a narration written in fully-expanded formal register reads as written
prose being read aloud, not as someone talking.

## The calibrated targets

Measured against `demo/scenes.mjs` (the original, most-iterated-on PE-audience walkthrough,
treated as the reference bar):

| Metric | Target (per scene) | How to measure |
|---|---|---|
| Em-dash density | **≤ ~0.9** occurrences of `—` per scene (the lightning cut's bar is stricter still, ~0.5) | count `—` characters ÷ count of `id: '` occurrences in the file |
| Contraction density | **≥ ~2.3** contractions per scene | count matches of `n't|'s |'re |'ll |'ve ` (with a preceding lowercase letter, to avoid matching a possessive on a proper noun) ÷ scene count |

### The exact audit commands (PowerShell)

Run this after writing or editing any scene file, **before** spending any Speech-synthesis
budget on it:

```powershell
$content = Get-Content demo/scenes-<name>.mjs -Raw
$dashes = ([regex]::Matches($content, [char]0x2014)).Count
$scenes = ([regex]::Matches($content, "id: '")).Count
$contractions = ([regex]::Matches($content, "n't|(?<=[a-z])'s |(?<=[a-z])'re |(?<=[a-z])'ll |(?<=[a-z])'ve ")).Count
"scenes=$scenes dashes=$dashes perScene=$([math]::Round($dashes/$scenes,2)) contractions=$contractions perSceneC=$([math]::Round($contractions/$scenes,2))"
```

If a rewrite comes in above ~1.0 dashes/scene or below ~2.0 contractions/scene, go back through
and: (a) convert most em-dashes to a period (split into two sentences) or a comma, keeping only
the rare one that's doing real dramatic work; (b) convert formal constructions to their
contraction ("does not" → "doesn't", "there is" → "there's", "cannot" → "can't", "it is" →
"it's", "that is" → "that's").

## The other narration rules (not measurable, but just as load-bearing)

- **No presenter-instructions.** The `say` text describes the product, never the act of
  presenting it. Banned patterns: "read this aloud", "ask it...", "now switch to...", "remember
  that number for later", "notice that...". Also avoid "it asks you" phrasing even when
  describing product behaviour — it reads as addressing the viewer directly, which breaks the
  illusion that this is describing a real thing rather than a script being followed.
- **Shorter sentences, not longer ones.** If a sentence needs three clauses to make its point,
  it's usually two sentences.
- **Avoid colons as a clause-joiner in `say` text** for the same reason as em-dashes — even
  though `narrate.mjs` doesn't currently add a break on a colon, a colon-joined compound
  sentence tends to correlate with the same overly-written, under-contracted register the
  em-dash rule is fixing. If you find yourself reaching for one, it's usually a sign the
  sentence should just be split.
- **Grounded claims only, no invented statistics.** Any time-saving, capability, or comparison
  claim must trace to a real, verifiable mechanic in the product or its documentation. This
  applies with extra force to a business/executive-audience track that is explicitly framed
  around productivity or ROI — see `references/new-track-guide.md` for how the existing
  business track threads that needle without inventing a single percentage.
- **Double-check any on-screen fact you assert out loud** (a deal count, a persona name, a
  screen label) against the live product at write time — these numbers move as the seeded demo
  data changes, and a stale one asserted confidently is worse than not mentioning it. See
  `docs/demos/RECORDINGS.md`'s "Keeping them true" section for the pattern of documenting which
  figures were current as of which capture date.

## Applying this to an edit, not just a fresh write

The same audit applies when you're only touching a few scenes in an existing manifest — run it
on the whole file after your edit, not just eyeballing the lines you changed. A few added
sentences with two em-dashes each can move the whole file's average more than expected on a
short manifest (a lightning cut, for example, might only have 6–9 scenes total).
