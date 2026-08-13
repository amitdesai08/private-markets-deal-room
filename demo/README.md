# The narrated walkthrough

A click-through of the full [30-minute demo](../docs/demos/DEMO-WALKTHROUGH.md), captured
against the running product and narrated by Azure AI Speech. Open
`build/demo.html` and press **Begin the walkthrough**.

> **Open it in Edge or Chrome, not VS Code's built-in browser.** That one is Electron and
> decodes neither MP3 nor Opus, so the walkthrough plays silently and looks broken. It is the
> browser, not the build.
>
> ```powershell
> start msedge "$PWD\demo\build\demo.html"
> ```

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
| [`build-video.mjs`](build-video.mjs) | Renders the same scenes to an MP4, for sharing off-GitHub. |
| [`cuts.mjs`](cuts.mjs) | Shorter edits of the walkthrough — same screens, tighter narration. |
| [`build-cut.mjs`](build-cut.mjs) | Assembles a cut's manifest from screens already captured. |
| [`lib/cdp.mjs`](lib/cdp.mjs) | A small Chrome DevTools Protocol client. |

## Building it

```powershell
node demo/capture.mjs        # ~10 min — screenshots into build/shots
node demo/narrate.mjs        # ~1 min  — narration into build/audio
node demo/build-player.mjs   # instant — writes build/demo.html
node demo/build-video.mjs    # ~3 min  — writes build/walkthrough.mp4
```

`build/` is generated and git-ignored. Re-run one broken scene without losing the rest by
passing its index — `node demo/capture.mjs 14 15` — and watch it happen with
`$env:DEMO_HEADED=1`.

## Shorter cuts

[`cuts.mjs`](cuts.mjs) holds alternative edits that reuse screens the walkthrough already
captured, so a cut costs a Speech call per line and needs no browser at all. `lightning`
follows [DEMO-LIGHTNING.md](../docs/demos/DEMO-LIGHTNING.md) — fifteen scenes, about six
minutes.

```powershell
node demo/build-cut.mjs lightning
node demo/narrate.mjs      --manifest scenes-lightning.json
node demo/build-player.mjs --manifest scenes-lightning.json --out lightning.html
node demo/build-video.mjs  --manifest scenes-lightning.json --out lightning.mp4
```

A cut re-orders scenes, so the cursor that pressed through to the next screen is dropped —
it would be pointing at a control that no longer leads anywhere.

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

## Running it as a service principal

`narrate.mjs` asks the Azure CLI for a token, so it works as whoever is signed in. For
unattended runs there is a certificate-backed identity, `sp-dealroom-demo-automation`, which
holds **Cognitive Services Speech User** and **Cognitive Services User** on the Speech resource
and **Reader** on the app resource group — enough to narrate and to read configuration, and
nothing else. It cannot change any resource.

```powershell
# in its own CLI profile, so an interactive session is not replaced
$env:AZURE_CONFIG_DIR = "$env:TEMP\az-dealroom-automation"
az login --service-principal `
  -u 4732cfda-458b-4a5c-9714-f87a2d3e61d9 `
  --certificate "$env:USERPROFILE\.azure\sp-dealroom-demo-automation.pem" `
  --tenant 301fb807-bdbc-4bac-802f-39b67f298b6c
node demo/narrate.mjs
```

The private key lives in `~/.azure/sp-dealroom-demo-automation.pem` and is **not** in this
repository. There is no client secret. To retire the identity:
`az ad app delete --id 4732cfda-458b-4a5c-9714-f87a2d3e61d9`.

It authenticates to **Azure**, not to the product. The Deal Room authorises people by name
against a deal team, so a service principal cannot hold a seat and cannot be used to capture
screenshots — that still needs either a signed-in person or the demo profiles.

## Notes

- The screenshots are of the demonstration book: invented companies, invented people,
  invented numbers. The opening scene says so out loud, and so should you.
- Narration is synthetic. If you would rather record a human over the same scenes, delete
  `build/audio` and the player falls back to holding each scene long enough to read its
  caption.
- `build-video.mjs` needs ffmpeg. It is not required for the player — only if you want a file
  to send someone. `winget install Gyan.FFmpeg`, or unzip a portable build and point
  `DEMO_FFMPEG` at it.

## Why none of this is published

The build stays on your machine. `build/` is git-ignored and no video or screenshot of the
walkthrough is committed — this repository is public, and the walkthrough is a tour of a
running deployment.

It is also, separately, not something GitHub can host well. That was worth establishing once,
so nobody spends an afternoon rediscovering it. GitHub renders README markdown through a
sanitiser that, **in repository context**, drops far more than the `/markdown` API does:

| Tag | In a README |
|---|---|
| `<script>` | stripped — so no interactive player, ever |
| `<iframe>`, `<embed>`, `<object>` | stripped, or escaped to visible text |
| `<audio>` | stripped — so stills plus narration is not an option either |
| `<video>` | **stripped**, whatever the `src` host — relative, `raw.githubusercontent`, even `user-attachments` |
| `<img>`, `<picture>`, `<details>`, `<a>` | kept |

Two traps in there. The `/markdown` REST endpoint **keeps** `<video>`, so it will tell you the
embed works; pass `context`, or render a real README via
`GET /repos/{owner}/{repo}/readme` with `Accept: application/vnd.github.html`, and it goes. And
GitHub's file viewer will not play a committed MP4 either — it answers *"we can't show files
that are this big right now"* even at 3 MB — so a committed video only ever offers a download.

The one route to a playing video on a GitHub page is to upload the file through the web UI —
drag it into an issue or pull request comment — and paste back the `user-attachments` URL,
which the site turns into a player. There is no API for it.

To share the walkthrough inside your own tenant, put `build/walkthrough.mp4` in SharePoint or a
Teams channel: Teams plays it inline, and access is governed by the tenant already.
