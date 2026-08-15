# Demo Center

Everything you need to show The Deal Room, or watch it shown, in one place: recordings you can
download and play right now, an interactive walkthrough you can drive yourself, and the scripts
a presenter follows to run a live session.

---

## Watch a recording

Nine narrated recordings across three audience tracks, each following one of the scripts
below. Click a file to download it — GitHub does not play video inline, but any player opens
these. All are captured against the running product with real seat-based access rules enforced
— what you see on screen is what the server actually allows that seat to see, not a mock-up.
Full provenance and what's on screen: [recordings index](demos/RECORDINGS.md).

### PE audience — deal teams, partners, IC members

| Recording | Length | Size | Follows the script |
|---|---|---|---|
| [`walkthrough.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/walkthrough.mp4) | 13 min | 11 MB | [The full walkthrough](demos/DEMO-WALKTHROUGH.md) — all eight acts |
| [`runbook.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/runbook.mp4) | 8 min | 7.5 MB | [The delivery runbook](demos/DEMO-RUNBOOK.md) — opens on access, reaches the admin screens |
| [`lightning.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/lightning.mp4) | 5 min | 4.6 MB | [The lightning cut](demos/DEMO-LIGHTNING.md) — six beats |

### Technical audience — CTO, VP of Technology, Director of IT, engineers

| Recording | Length | Size | Follows the script |
|---|---|---|---|
| [`technical.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/technical.mp4) | 9 min | 8.3 MB | [The technical walkthrough](demos/DEMO-WALKTHROUGH-TECHNICAL.md) — identity, agentic workflows, connector governance and Work IQ, audit, Azure footprint |
| [`runbook-technical.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/runbook-technical.mp4) | 7 min | 6.4 MB | [The technical runbook](demos/DEMO-RUNBOOK-TECHNICAL.md) — names REST routes and env vars |
| [`technical-lightning.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/technical-lightning.mp4) | 3 min | 3.2 MB | [The technical lightning cut](demos/DEMO-LIGHTNING-TECHNICAL.md) — six beats |

### Business audience — CEO, CFO, Managing Partner, Managing Director

| Recording | Length | Size | Follows the script |
|---|---|---|---|
| [`business.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/business.mp4) | 5 min | 5.0 MB | [The business walkthrough](demos/DEMO-WALKTHROUGH-BUSINESS.md) — operating capacity, eight acts |
| [`runbook-business.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/runbook-business.mp4) | 5 min | 4.7 MB | [The business runbook](demos/DEMO-RUNBOOK-BUSINESS.md) — the delivery-team spine |
| [`business-lightning.mp4`](https://raw.githubusercontent.com/amitdesai08/private-markets-deal-room/main/docs/demos/media/business-lightning.mp4) | 2 min | 2.5 MB | [The business lightning cut](demos/DEMO-LIGHTNING-BUSINESS.md) — six beats |

## Drive it yourself — the interactive walkthrough

Every script above is also available as an interactive, click-through player: jump to any act,
pause on any screen, and turn on captions for a room where audio doesn't carry. It isn't
published as a file — build it locally in about a minute, picking the manifest for the track
you want:

```powershell
# PE audience (default)
node demo/capture.mjs
node demo/narrate.mjs
node demo/build-player.mjs
start demo/build/demo.html

# Technical audience
node demo/capture.mjs --scenes scenes-technical.mjs --manifest scenes-technical.json
node demo/narrate.mjs --manifest scenes-technical.json
node demo/build-player.mjs --manifest scenes-technical.json --out technical.html
start demo/build/technical.html

# Business audience
node demo/capture.mjs --scenes scenes-business.mjs --manifest scenes-business.json
node demo/narrate.mjs --manifest scenes-business.json
node demo/build-player.mjs --manifest scenes-business.json --out business.html
start demo/build/business.html
```

No credentials required and nothing is installed beyond Node.js. See [`demo/`](../demo/) for
how the pipeline works if you want to customize the narration or capture new screens.

> 🎬 **Already built and hosted (PE-audience track)**: the interactive click-through and the
> recordings for the **PE-audience** walkthrough, runbook and lightning cut are live on
> **[Amit's Demos](https://victorious-field-06ec4150f.7.azurestaticapps.net/#/d/private-markets-deal-room)**
> — no build step needed. That site is access-restricted to approved accounts; ask Amit for
> access if you land on a sign-in wall. The technical- and business-audience tracks are not yet
> published there — build them locally with the commands above, or download the `.mp4`s.

## Run the live product yourself

Deploy in **demo mode** and turn on **demo profiles** — one named identity per role — to walk
the whole access model without provisioning a single real user. The seeded pipeline ships
confidential deals and a genuine need-to-know grant: sign in as the analyst and a confidential
take-private is invisible, yet she has full access to the one deal she's named on. Switch to
the partner and it opens. See the [deploy guide](DEPLOY.md) to stand it up in your own tenant.

## The demo scripts

Pick the track that matches your **audience**, then the script that matches your time slot.
Every script names exactly what to click, what to say, and what it proves — including a
delivery-team **runbook** for each track, so a live presenter who isn't the product's author can
still talk through it. Read one alongside the live product before presenting it for the first
time.

### PE audience — deal teams, partners, IC members

| Script | Length | Best for |
|---|---|---|
| [**The full walkthrough**](demos/DEMO-WALKTHROUGH.md) | 30 min (24 min if you drop two acts) | A PE audience seeing the product for the first time. Assumes no software background. |
| [**The delivery runbook**](demos/DEMO-RUNBOOK.md) | 30 min | Delivery teams running a guided session; leads with access and reaches the administrator screens. |
| [**The lightning cut**](demos/DEMO-LIGHTNING.md) | 10 min (3 min at its shortest) | A tight slot — an elevator pitch that still lands the access-model differentiator. |

### Technical audience — CTO, VP of Technology, Director of IT, engineers

| Script | Length | Best for |
|---|---|---|
| [**The technical walkthrough**](demos/DEMO-WALKTHROUGH-TECHNICAL.md) | 18 min | An architecture or security review: identity, data sovereignty, agentic workflows, connector governance and Work IQ, the audit trail, the Azure footprint. |
| [**The technical runbook**](demos/DEMO-RUNBOOK-TECHNICAL.md) | 18 min (8 min safe fallback) | A delivery engineer presenting to IT/security; names REST routes, env vars and Bicep parameters. |
| [**The technical lightning cut**](demos/DEMO-LIGHTNING-TECHNICAL.md) | 10 min (3 min at its shortest) | A short technical slot that still lands the security-boundary differentiator. |

### Business audience — CEO, CFO, Managing Partner, Managing Director

| Script | Length | Best for |
|---|---|---|
| [**The business walkthrough**](demos/DEMO-WALKTHROUGH-BUSINESS.md) | 15 min | Firm leadership evaluating operating capacity, productivity, deal flow and ease of use — every claim names the manual task it removes, no invented percentages. |
| [**The business runbook**](demos/DEMO-RUNBOOK-BUSINESS.md) | 15 min (8 min safe fallback) | A delivery team presenting to leadership; the same mechanics, with feature/API references. |
| [**The business lightning cut**](demos/DEMO-LIGHTNING-BUSINESS.md) | 10 min (3 min at its shortest) | A calendar-slot-sized cut for a CEO/CFO/Managing Partner. |

---

> 🔐 [Security & compliance](SECURITY-COMPLIANCE.md) · 📐 [Architecture](ARCHITECTURE.md) ·
> 🔑 [Access model](ACCESS-MODEL.md) · ☁️ [Deploy guide](DEPLOY.md)
