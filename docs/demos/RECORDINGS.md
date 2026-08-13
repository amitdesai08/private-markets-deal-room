# Demo recordings

Narrated click-throughs of the three demo documents, captured against the running Deal Room
and voiced by Azure AI Speech. **Click a file, then *View raw* to download it** — GitHub
cannot play video in a page, but any player opens these.

| Recording | Length | Size | Follows |
|---|---|---|---|
| [`walkthrough.mp4`](media/walkthrough.mp4?raw=1) | 13 min | 11 MB | [DEMO-WALKTHROUGH.md](DEMO-WALKTHROUGH.md) — all eight acts |
| [`runbook.mp4`](media/runbook.mp4?raw=1) | 8 min | 7 MB | [DEMO-RUNBOOK.md](DEMO-RUNBOOK.md) — the delivery spine, opens on access |
| [`lightning.mp4`](media/lightning.mp4?raw=1) | 5 min | 5 MB | [DEMO-LIGHTNING.md](DEMO-LIGHTNING.md) — six beats |

There is also an **interactive player** for each, which is better for presenting: jump to any
act, pause on any screen, captions for rooms where audio is awkward. It is not committed —
build it in about a minute with [`demo/`](../../demo/), which also regenerates these videos.

## What is on screen

Captured against **Deal Room** (`ca-dealhub-teams-dev-swc`) on 13 August 2026, seat by seat
through the demo profiles, so the access rules shown are the ones the server actually
enforces.

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
