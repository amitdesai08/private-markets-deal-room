# The narrated walkthrough

A click-through of the full [30-minute demo](../docs/demos/DEMO-WALKTHROUGH.md), captured
against the running product and narrated by Azure AI Speech. Open
`build/demo.html` and press **Begin the walkthrough**.

It plays end to end on its own, or a presenter can drive it: the transport bar steps scene
by scene, **Scenes** jumps to any act, and **Captions** puts the narration on screen for a
room where audio is awkward. Space plays and pauses, arrow keys move.

## What it is made of

| Piece | What it does |
|---|---|
| [`scenes.mjs`](scenes.mjs) | The demo as data — one entry per scene: what the browser does, and what the narrator says over the result. **Change the demo here and nowhere else.** |
| [`capture.mjs`](capture.mjs) | Drives the real product through every scene and writes one screenshot each. |
| [`narrate.mjs`](narrate.mjs) | Sends each scene's narration to Azure AI Speech and writes an MP3. |
| [`build-player.mjs`](build-player.mjs) | Assembles `build/demo.html` from the three. |
| [`lib/cdp.mjs`](lib/cdp.mjs) | A small Chrome DevTools Protocol client. |

## Building it

```powershell
node demo/capture.mjs        # ~5 min — screenshots into build/shots
node demo/narrate.mjs        # ~1 min — narration into build/audio
node demo/build-player.mjs   # instant — writes build/demo.html
```

`build/` is generated and git-ignored. Re-run one broken scene without losing the rest by
passing its index — `node demo/capture.mjs 14 15` — and watch it happen with
`$env:DEMO_HEADED=1`.

Narration is only re-synthesised when it is missing, so editing one line of `scenes.mjs`
and re-running `narrate.mjs` costs one request. Use `--force` to redo all of them.

## What it records against

The **beta** tab — `ca-dealhub-teams-beta` — because it sets `DEMO_OPEN_SIGN_IN`, so the
capture needs no credentials and no account. More importantly, that is the deployment with
the **seat switcher**, and Act 7 is the act where an analyst opens a deal the administrator
cannot see. Doing that with real Entra sign-ins would need three accounts and three
interactive logins in the middle of the recording; the switcher does it in one click and
enforces exactly the same access rules, on the same server, against the same record.

Point it somewhere else with `DEMO_BASE_URL`, including a local
`http://localhost:8090`.

## Knobs

| Variable | Default | |
|---|---|---|
| `DEMO_BASE_URL` | the beta tab | Which deployment to record. |
| `DEMO_WIDTH` / `DEMO_HEIGHT` | `1440` × `900` | Capture viewport. |
| `DEMO_SCALE` | `2` | Device pixel ratio — 2 gives 2880 × 1800 screenshots. |
| `DEMO_HEADED` | unset | Show the browser while it works. |
| `DEMO_VOICE` | `en-GB-RyanNeural` | Any Azure neural voice. |
| `DEMO_RATE` | `-6%` | Narration pace. |
| `SPEECH_KEY` / `SPEECH_REGION` | read from Azure | Skip the CLI lookup. |

## Notes

- The screenshots are of the demonstration book: invented companies, invented people,
  invented numbers. The opening scene says so out loud, and so should you.
- Narration is synthetic. If you would rather record a human over the same scenes, delete
  `build/audio` and the player falls back to holding each scene long enough to read its
  caption.
- There is no video file. `ffmpeg` is not available on the build machine and the npm
  registry is blocked there, so the deliverable is the player. If you want an MP4, install
  ffmpeg and mux `build/audio/*.mp3` onto `build/shots/*.png` with a per-scene duration
  taken from `build/scenes.json`.
