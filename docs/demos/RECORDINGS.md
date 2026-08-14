# Demo recordings

Narrated click-throughs of the three demo documents, captured against the running Deal Room
and voiced by Azure AI Speech. **Click a file, then *View raw* to download it** — GitHub
cannot play video in a page, but any player opens these.

| Recording | Length | Size | Follows |
|---|---|---|---|
| [`walkthrough.mp4`](media/walkthrough.mp4?raw=1) | 12 min | 10.6 MB | [DEMO-WALKTHROUGH.md](DEMO-WALKTHROUGH.md) — all eight acts, 30 scenes |
| [`runbook.mp4`](media/runbook.mp4?raw=1) | 8 min | 7.7 MB | [DEMO-RUNBOOK.md](DEMO-RUNBOOK.md) — the delivery spine, 25 scenes, opens on access |
| [`lightning.mp4`](media/lightning.mp4?raw=1) | 5 min | 4.8 MB | [DEMO-LIGHTNING.md](DEMO-LIGHTNING.md) — six beats, 15 scenes, its own capture rather than the walkthrough's frames |

The runbook is the only one that reaches the **administrator** screens — access administration
and document templates — because those render for an admin seat and no other.

There is also an **interactive player** for each, which is better for presenting: jump to any
act, pause on any screen, captions for rooms where audio is awkward. It is not committed —
build it in about a minute with [`demo/`](../../demo/), which also regenerates these videos.

## What is on screen

Captured against **Deal Room** (`ca-dealhub-teams-dev-swc`) on 13–14 August 2026, seat by seat
through the demo profiles, so the access rules and deal figures shown are the ones the server
actually returns — not carried over from an older capture or the beta environment. Narrated in
**en-US-AndrewNeural**, a neutral American voice, not a regional one.

The walkthrough and the lightning demo are each captured from their own manifest
([`scenes.mjs`](../../demo/scenes.mjs), [`scenes-lightning.mjs`](../../demo/scenes-lightning.mjs)); the lightning
deck no longer reuses the walkthrough's screenshots, so its framing and pacing are its own.
The runbook still borrows the walkthrough's frames where the two decks visit the same screen
([`cuts.mjs`](../../demo/cuts.mjs)).

The narration describes the platform, not the act of presenting it — it does not tell a viewer
to read something aloud or remember a number for later, because the recording is meant to stand
on its own as a demonstration rather than as a read-along script for somebody driving it live.

The platform was **closed to anonymous callers throughout**. The capture holds an Entra
identity of its own — a certificate-backed service principal with `DealRoom.Automation` on the
tab app — and the seat still comes from the roster, which is why an administrator screen can
appear in a recording without the deployment ever being opened to whoever has the URL.

Nineteen of the twenty-four deals are the invented demonstration book — invented companies,
invented people, invented numbers. **Five are real public companies** the screener picked up
from public filings: Sound United, National CineMedia, XBP Global Holdings, Allbirds and
Voyager Therapeutics. They are named because that information is already public, and the
narration says so rather than claiming everything is fictional.

No confidential material appears in any of the three.

## Keeping them true

The narration quotes figures, and figures move. These were correct on the capture date:

| | |
|---|---|
| Partner sees | 24 deals |
| Administrator sees | 21 |
| Analyst sees | 8 |
| Untracked follow-ups | 22 across 19 deals |
| Enterprise value | $9.7B |

If the seeded book changes, re-run the pipeline rather than editing around it — the numbers
are asserted out loud in several places, and a stale one is worse than none.
