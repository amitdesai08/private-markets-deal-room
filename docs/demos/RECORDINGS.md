# Demo recordings

Narrated click-throughs of the demo documents, captured against the running Deal Room and
voiced by Azure AI Speech. **Click a file to download it** — GitHub cannot play video in a
page, but any player opens these. Nine recordings across three audience tracks — PE, technical
and business — each pairing a walkthrough, a delivery runbook and a lightning cut.

## PE audience — deal teams, partners, IC members

| Recording | Length | Size | Follows |
|---|---|---|---|
| [`walkthrough.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/walkthrough.mp4) | 12 min | 10.6 MB | [DEMO-WALKTHROUGH.md](DEMO-WALKTHROUGH.md) — all eight acts, 30 scenes |
| [`runbook.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/runbook.mp4) | 8 min | 7.7 MB | [DEMO-RUNBOOK.md](DEMO-RUNBOOK.md) — the delivery spine, 25 scenes, opens on access |
| [`lightning.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/lightning.mp4) | 5 min | 4.8 MB | [DEMO-LIGHTNING.md](DEMO-LIGHTNING.md) — six beats, 15 scenes, its own capture rather than the walkthrough's frames |

The runbook is the only one of the three that reaches the **administrator** screens — access
administration and document templates — because those render for an admin seat and no other.

## Technical audience — CTO, VP of Technology, Director of IT, engineers

| Recording | Length | Size | Follows |
|---|---|---|---|
| [`technical.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/technical.mp4) | 8 min | 7.5 MB | [DEMO-WALKTHROUGH-TECHNICAL.md](DEMO-WALKTHROUGH-TECHNICAL.md) — 15 scenes: identity trust seam, agent isolation, connector governance, audit trail, Azure footprint |
| [`runbook-technical.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/runbook-technical.mp4) | 6 min | 5.5 MB | [DEMO-RUNBOOK-TECHNICAL.md](DEMO-RUNBOOK-TECHNICAL.md) — 14 scenes, reuses the walkthrough's frames, names REST routes and env vars |
| [`technical-lightning.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/technical-lightning.mp4) | 3 min | 2.7 MB | [DEMO-LIGHTNING-TECHNICAL.md](DEMO-LIGHTNING-TECHNICAL.md) — 8 scenes, its own capture |

This track never claims a formal certification (SOC 2, ISO 27001, a pentest) as a vendor
deliverable — those stay the deploying firm's to obtain, and the scripts say so explicitly.

## Business audience — CEO, CFO, Managing Partner, Managing Director

| Recording | Length | Size | Follows |
|---|---|---|---|
| [`business.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/business.mp4) | 5 min | 4.4 MB | [DEMO-WALKTHROUGH-BUSINESS.md](DEMO-WALKTHROUGH-BUSINESS.md) — 11 scenes across seven acts |
| [`runbook-business.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/runbook-business.mp4) | 5 min | 4.2 MB | [DEMO-RUNBOOK-BUSINESS.md](DEMO-RUNBOOK-BUSINESS.md) — reuses the walkthrough's frames |
| [`business-lightning.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/business-lightning.mp4) | 2 min | 1.8 MB | [DEMO-LIGHTNING-BUSINESS.md](DEMO-LIGHTNING-BUSINESS.md) — 6 scenes, its own capture |

This track intentionally departs from the PE and technical tracks' no-ROI-framing convention —
its audience's own question is where a firm's operating time goes. Every saving named in it is
tied to a specific manual task the product removes (compiling a status briefing, drafting a
first-cut IC memo, tracking a forgotten follow-up, re-entering data between systems, rebuilding
a quarterly report) — **there is no invented percentage or hours-saved figure anywhere in it.**

There is also an **interactive player** for each, which is better for presenting: jump to any
act, pause on any screen, captions for rooms where audio is awkward. It is not committed —
build it in about a minute with [`demo/`](../../demo/), which also regenerates these videos.

> 🎬 **Already built and hosted (PE-audience track)**: the interactive click-throughs (and
> these same recordings, playable in-browser rather than downloaded) for the **PE-audience**
> walkthrough, runbook and lightning cut are live on
> **[Amit's Demos](https://victorious-field-06ec4150f.7.azurestaticapps.net/#/d/private-markets-deal-room)**.
> That site is access-restricted to approved accounts — ask Amit for access if you land on a
> sign-in wall. The technical- and business-audience tracks are not yet published there — build
> their interactive players locally with [`demo/`](../../demo/) in the meantime, or download the
> `.mp4`s above.

## What is on screen

Captured against **Deal Room** (`ca-dealhub-teams-dev-swc`) on 13–14 August 2026, seat by seat
through the demo profiles, so the access rules and deal figures shown are the ones the server
actually returns — not carried over from an older capture or the beta environment. Narrated in
**en-US-AndrewNeural**, a neutral American voice, not a regional one.

The walkthrough and the lightning demo of every track are each captured from their own
manifest — [`scenes.mjs`](../../demo/scenes.mjs) / [`scenes-lightning.mjs`](../../demo/scenes-lightning.mjs)
for the PE audience, [`scenes-technical.mjs`](../../demo/scenes-technical.mjs) /
[`scenes-technical-lightning.mjs`](../../demo/scenes-technical-lightning.mjs) for the technical
audience, [`scenes-business.mjs`](../../demo/scenes-business.mjs) /
[`scenes-business-lightning.mjs`](../../demo/scenes-business-lightning.mjs) for the business
audience — so each lightning deck's framing and pacing is its own rather than a slice of its
walkthrough. Every runbook borrows its own walkthrough's frames where the two decks visit the
same screen ([`cuts.mjs`](../../demo/cuts.mjs)).

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

No confidential material appears in any of the nine.

## Keeping them true

The narration quotes figures, and figures move. These were correct on the capture date, and
hold across all three tracks — the technical and business recordings quote the same
administrator/analyst deal counts as the PE-audience ones, because they are reading the same
seeded record:

| | |
|---|---|
| Partner sees | 24 deals |
| Administrator sees | 21 |
| Analyst sees | 8 |
| Untracked follow-ups | 22 across 19 deals |
| Enterprise value | $9.7B |

If the seeded book changes, re-run the pipeline rather than editing around it — the numbers
are asserted out loud in several places, and a stale one is worse than none.
