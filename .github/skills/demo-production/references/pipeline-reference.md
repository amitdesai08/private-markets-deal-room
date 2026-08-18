# Production pipeline — exact commands and gotchas

## Prerequisites

- **Live product instance reachable.** Confirm with a plain request before starting; note the
  URL and capture date, since seeded demo figures (deal counts, follow-up counts) move over
  time and any figure narrated out loud needs to be current as of the capture.
- **An active `az login` session.** `demo/narrate.mjs` and `demo/capture.mjs`'s authenticated
  requests both go through Azure AD tokens minted from the current CLI session. Don't run `az
  login` yourself inside an agent session unless explicitly asked — assume it's already
  authenticated and treat a token failure as a signal to check with the user, not to start an
  interactive login flow.
- **ffmpeg on `PATH`.** `demo/build-video.mjs` shells out to it. If it isn't a permanent
  install yet, prepend it for the current terminal/session:
  ```powershell
  $env:Path += ";<path-to-ffmpeg>\bin"
  ```
  This needs to be done in **every new terminal** until ffmpeg is on the permanent system PATH.

## The full command set, per manifest

For a **fresh-capture manifest** (a walkthrough or a lightning cut — anything with its own
`scenes-<name>.mjs` file):

```powershell
node demo/capture.mjs      --scenes scenes-<name>.mjs --manifest scenes-<name>.json
node demo/narrate.mjs      --manifest scenes-<name>.json [--force]   # see gotcha #2 below
node demo/build-player.mjs --manifest scenes-<name>.json --out <name>.html
node demo/build-video.mjs  --manifest scenes-<name>.json --out <name>.mp4
```

For a **runbook cut** (reuses already-captured frames via `demo/cuts.mjs`, no browser
automation needed):

```powershell
node demo/build-cut.mjs runbook-<name>
node demo/narrate.mjs      --manifest scenes-runbook-<name>.json [--force]
node demo/build-player.mjs --manifest scenes-runbook-<name>.json --out runbook-<name>.html
node demo/build-video.mjs  --manifest scenes-runbook-<name>.json --out runbook-<name>.mp4
```

Check `build-cut.mjs`'s own reported output filename rather than assuming — it derives the
manifest name from the cut key you pass it.

## Gotcha #1 — the bare `capture.mjs` invocation wipes `shots/`

Running `node demo/capture.mjs` with **no `--manifest` flag** (i.e. targeting the default
`scenes.json`) clears the entire `demo/build/shots/` folder first, including every other
manifest's screenshots. If you've already captured other decks in this session, recapturing the
default manifest with no flag will destroy their screenshots and their video builds will start
failing with "no such file."

**Rule:** always pass an explicit `--manifest` for anything other than the very first,
already-established walkthrough capture. If you genuinely need to recapture the default deck
too, do it *first*, before any other manifest, in the same session.

## Gotcha #2 — `narrate.mjs` caches by file existence, not by content

This is the single most expensive mistake to make, because it fails silently and produces a
perfectly normal-looking successful build.

`narrate.mjs` decides whether to (re-)synthesise a scene's audio purely by checking whether
`audio/<scene-id>.mp3` already exists on disk with a nonzero size:

```js
// from narrate.mjs
const size = await stat(abs).then((st) => st.size).catch(() => 0);
if (size > 0 && !FORCE) {
  // ...reuses the existing file, does NOT check whether scene.say changed
  continue;
}
```

It does **not** hash or compare the narration text. So the sequence "edit a scene's `say` text
for an existing scene id → recapture → run `narrate.mjs`" will **not** pick up the new text if
that scene id already has audio from a previous run — it silently keeps the old audio, and
`build-video.mjs` will happily assemble a video with screenshots that don't match what's being
said. The build succeeds; the output is wrong.

**Rule:** whenever you edit `say` text for a scene id that has been narrated before in this
manifest, run `narrate.mjs` with `--force`:

```powershell
node demo/narrate.mjs --manifest scenes-<name>.json --force
```

`--force` re-synthesises everything in the manifest, which costs more Speech calls and takes
longer, but is the only way to guarantee the audio matches the current text. Brand-new scene
ids are unaffected by this either way (there's no existing file to reuse), so this only matters
when you're **editing** an existing track, not writing one from scratch.

## Gotcha #3 — `narrate.mjs` reads from the captured JSON, not from the source `.mjs`

Related to the above: narration text is synthesised from `scene.say` as it exists in the
**captured** manifest (`demo/build/scenes-<name>.json`), which is written by `capture.mjs`, not
read fresh from `demo/scenes-<name>.mjs` at narrate time. If you edit a scene's text in the
source file, you must **recapture first** (which rewrites the captured JSON with the new text),
*then* run `narrate.mjs --force`. Running `narrate.mjs` alone after a source edit, without
recapturing, does nothing useful — it will just re-synthesise whatever was captured last time.

## Order of operations, summarised

For an edit to an **existing** scene's text: edit the `.mjs` source → `capture.mjs --manifest
X.json` (recapture) → `narrate.mjs --manifest X.json --force` → `build-player.mjs` →
`build-video.mjs`.

For a **brand-new** scene appended to an existing manifest: same order, but `--force` is
optional (the new scene gets synthesised regardless; existing untouched scenes are still
skipped correctly since their text didn't change) — though it costs nothing extra to add
`--force` anyway if you're already forcing a full rebuild for other edited scenes in the same
file, and it removes any doubt.

## After the build: shipping it

1. Copy the rebuilt `.mp4`s from `demo/build/` into `docs/demos/media/` (that folder is
   git-tracked; `demo/build/` itself is gitignored).
2. Update `docs/demos/RECORDINGS.md` and `docs/DEMO-CENTER.md` — both keep a table per track
   with length, size and scene-count/act-count callouts that need to match the new build.
3. Run the app's own test suite (`npm test` from the app's root) to make sure nothing else was
   disturbed — demo work touches no application code, but it's a cheap, fast confirmation.
4. Commit and push. Include the new/changed `.mp4` files — they're small enough (a few MB each)
   to live in git directly alongside the docs that reference them.
