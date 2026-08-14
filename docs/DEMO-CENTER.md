# Demo Center

Everything you need to show The Deal Room, or watch it shown, in one place: recordings you can
download and play right now, an interactive walkthrough you can drive yourself, and the scripts
a presenter follows to run a live session.

---

## Watch a recording

Three narrated recordings, each following one of the scripts below. Click a file to download it
— GitHub does not play video inline, but any player opens these.

| Recording | Length | Size | Follows the script |
|---|---|---|---|
| [`walkthrough.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/walkthrough.mp4) | 13 min | 11 MB | [The full walkthrough](demos/DEMO-WALKTHROUGH.md) — all eight acts |
| [`runbook.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/runbook.mp4) | 8 min | 7.5 MB | [The delivery runbook](demos/DEMO-RUNBOOK.md) — opens on access, reaches the admin screens |
| [`lightning.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/lightning.mp4) | 5 min | 4.6 MB | [The lightning cut](demos/DEMO-LIGHTNING.md) — six beats |

All three are captured against the running product with real seat-based access rules enforced
— what you see on screen is what the server actually allows that seat to see, not a mock-up.
Full provenance and what's on screen: [recordings index](demos/RECORDINGS.md).

## Drive it yourself — the interactive walkthrough

The same three scripts are also available as an interactive, click-through player: jump to any
act, pause on any screen, and turn on captions for a room where audio doesn't carry. It isn't
published as a file — build it locally in about a minute:

```powershell
node demo/capture.mjs
node demo/narrate.mjs
node demo/build-player.mjs
start demo/build/demo.html
```

No credentials required and nothing is installed beyond Node.js. See [`demo/`](../demo/) for
how the pipeline works if you want to customize the narration or capture new screens.

> 🎬 **Already built and hosted**: this same interactive click-through (and the recordings
> above, playable in-browser) are live on
> **[Amit's Demos](https://victorious-field-06ec4150f.7.azurestaticapps.net/#/d/private-markets-deal-room)**
> — no build step needed. That site is access-restricted to approved accounts; ask Amit for
> access if you land on a sign-in wall.

## Run the live product yourself

Deploy in **demo mode** and turn on **demo profiles** — one named identity per role — to walk
the whole access model without provisioning a single real user. The seeded pipeline ships
confidential deals and a genuine need-to-know grant: sign in as the analyst and a confidential
take-private is invisible, yet she has full access to the one deal she's named on. Switch to
the partner and it opens. See the [deploy guide](DEPLOY.md) to stand it up in your own tenant.

## The demo scripts

Pick the one that matches your time slot and audience.

| Script | Length | Best for |
|---|---|---|
| [**The full walkthrough**](demos/DEMO-WALKTHROUGH.md) | 30 min (24 min if you drop two acts) | A PE audience seeing the product for the first time. Assumes no software background. |
| [**The delivery runbook**](demos/DEMO-RUNBOOK.md) | 30 min | Delivery teams running a guided session; leads with access and reaches the administrator screens. |
| [**The lightning cut**](demos/DEMO-LIGHTNING.md) | 10 min (3 min at its shortest) | A tight slot — an elevator pitch that still lands the access-model differentiator. |

Each script is written for whoever is presenting: what to click, what to say, and what it
proves. Read one alongside the live product before presenting it for the first time.

---

> 🔐 [Security & compliance](SECURITY-COMPLIANCE.md) · 📐 [Architecture](ARCHITECTURE.md) ·
> 🔑 [Access model](ACCESS-MODEL.md) · ☁️ [Deploy guide](DEPLOY.md)
