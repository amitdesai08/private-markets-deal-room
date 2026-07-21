# Demo walkthrough — an example end-to-end workflow

A story-driven, ~20-minute demo that follows **one fund and one deal** through the
whole institutional arc — from a sourcing signal, across screening and diligence,
through the Investment Committee, and out the other side into a **live portfolio
company** the fund now monitors.

Where the [demo runbook](DEMO-RUNBOOK.md) is a feature *tour* (a checklist of what
to click), this is a *narrative* you can tell — each act is framed through the
persona who owns it, so the access model, the agents, the lifecycle and the new
**Fund & Portfolio** lens all land as one coherent story.

> **The fund in the demo:** *Fund IV — US Mid-Market Buyout* ($2.6B, vintage 2024,
> ~46% deployed, 6 portfolio companies). Everything below is grounded in the live
> (seeded) record — if anyone asks "is this real?", the agent answers cite the
> tools (`list_deals`, `get_returns`, `get_fund_overview`…).

---

## Setup (before the room)

- Deploy in demo mode (`azd up` with `DEPLOY_DEMO_PROFILES=true`) or open an
  existing demo environment. No datastore is required — the default **blob store**
  means the demo costs almost nothing, and **Cosmos is entirely optional**.
- Open the **web console** at `https://<teams-fqdn>/`, or the tab inside Teams.
- Keep the top-bar **"sign in as"** switcher handy — you'll change persona per act.

**The cast** (each is a one-click demo profile):

| Persona | Who | Owns the act |
|---|---|---|
| Analyst | Maya Olsen | Act 1 — Origination |
| Sector MDs | Retail / AI / Supply | Act 2 — Diligence |
| Fund CFO · Principal · Partner | David Osei · Marcus Feld · Eleanor Bishop | Act 3 — Decision & IC |
| Operating Partner · Fund CFO · IR | Rachel Nguyen · David Osei · Sofia Marchetti | Act 4 — Own & Monitor |

---

## Act 0 · The 30-second pitch

> "The Deal Room is an AI-native private-equity workspace that lives inside
> Microsoft Teams — and the *same* console runs standalone on the web. A deal team
> sources, screens, runs diligence, takes a deal to IC, **and then monitors what
> they own** — with every answer grounded in the live record and **scoped to who
> is asking**."

Then set the frame: *"Let's follow one deal the whole way through."*

---

## Act 1 · Origination & screening — *sign in as Maya (Analyst)*  ⏱ 3 min

1. **Deals Overview** → note the pipeline and the value strip (deals processed,
   analyst-hours saved, time-to-IC compression). *"This is the ROI story — the
   platform is already saving the team weeks."*
2. Open **Stage 1 — Origination**. Walk the funnel: a **signal** (a CxO interview,
   a filing) becomes a **candidate**, gets **auto-screened**, then **triaged**.
3. Call out the **sourcing framework** — three tiers doing three different jobs:
   - **Fund Mandate (GATE)** — the binding LPA limits; a breach is *excluded, never scored*.
   - **Investment Theme (GUIDE)** — a partner's hunting ground.
   - **Screen (RANK)** — the analyst's scored criteria.
4. A target clears the **⛔ PURSUE** gate — the collaboration space (Teams channel
   + SharePoint data room) spins up and it becomes a **deal**.

> "Screening isn't one filter narrowed three times — it's a gate, a guide and a
> ranker. That's how a real fund actually sources."

---

## Act 2 · Diligence — *sign in as a Sector MD*  ⏱ 4 min

1. Open **Stage 2 — Diligence** and pick the lead deal (the top consumer deal).
2. Show the **workstream lanes** — Commercial / Tech-AI / Operations — each owned
   by a sector MD, with findings tagged by severity.
3. As the **AI MD**, use the **agents** panel: *"Score AI-readiness and flag the
   tech risks on this deal."* The answer is grounded and cited.
4. Note that an MD **can only touch their own lane** — try the access model live.

> "Diligence is parallelised across specialists, but governed — the AI MD can't
> quietly edit the commercial lane. Every contribution is attributable."

---

## Act 3 · Decision & IC — *sign in as Fund CFO, then Partner*  ⏱ 5 min

1. Open the deal's **Decision artifacts** tab — the four cards, each derived from
   the live record:
   - **LBO / Returns** — entry multiple, sources & uses, base / upside / downside
     **IRR & MOIC** vs the 20% / 2.0x hurdle. Download **Returns model (Excel)**
     (Summary · Sources & Uses · Scenarios · Sensitivity).
   - **Value creation** — the EBITDA bridge, quantified levers, 100-day plan.
   - **Risk register** — open risks by severity × likelihood (red/amber/green).
   - **IOI / LOI** — the non-binding indication and letter of intent.
2. As **Fund CFO**, ask the agent: *"Pull the returns model — base IRR and MOIC,
   and does it clear the hurdle?"*
3. Open the **IC readiness** tab — the decision-grade board answering the seven
   questions an IC actually asks, with a **READY / CONDITIONAL / NOT-READY** verdict
   grounded in real Fabric comparables and IC precedents.
4. Switch to **Eleanor (Partner)** and show **view-as-down**: she can see the room
   as any junior role, but **never up** — and it's enforced server-side. Only the
   Partner can approve at the **IC gate**.

> "The IC verdict isn't a progress bar — it's real gating facts. And approving at
> the gate is a partner-only power that a client can't spoof."

---

## Act 4 · Own & monitor — *sign in as Operating Partner / IR*  ⏱ 5 min  🆕

This is the **post-IC** act most tools stop short of. Open the **Fund & Portfolio**
tab.

1. **Fund / LP headline** — committed $2.6B, ~46% invested, dry powder, and the
   performance line: **TVPI · DPI · RVPI**, gross & net **MOIC / IRR**. *"This is
   what you'd put in an LP quarterly."*
2. **Portfolio monitoring** — the owned companies, each with hold period,
   entry→current multiple, EBITDA growth, **current MOIC & IRR**, value-creation
   progress and an **on-track / watch / underperform** status.
   - Expand **Summit Provisions** (on-track, ~2.2x) → the **value-creation levers**
     with % progress, the **100-day** completion, and **KPIs vs the underwriting
     plan** with variance.
   - Contrast with **Harbor Industrial Coatings** (underperform, ~0.6x) → *"The
     platform is honest — input-cost inflation pushed it below the plan, and the
     lens flags it, not hides it."*
3. **Concentration vs LPA limits** — sector and single-position exposure against
   the mandate's hard caps (max % per sector / per deal). *"Compliance-by-design —
   the same LPA gate that screens deals also watches the portfolio."*
4. As **IR (Sofia)**, ask the agent: *"How does the fund read to our LPs right
   now?"* — the **ILPA-aligned LP summary** answers in one paragraph.
5. As **Operating Partner (Rachel)**: *"Where's the biggest EBITDA-bridge lever
   across the portfolio?"*

> "The deal didn't end at IC — it became a company we own. The same governed record
> that took it to committee now tracks its value creation, its marks and its fit to
> the mandate. That's the full loop: source → screen → diligence → IC → **own**."

---

## Act 5 · The close  ⏱ 1 min

Pull the threads together:

- **One backend, two surfaces** — the *same* console in Teams and on the web.
- **Identity-aware** — access resolved server-side from who is asking; agents
  routed by role; view-as only goes down.
- **Grounded & cited** — 10 Foundry specialist agents reading the live record
  through governed MCP tools (now including `get_fund_overview` · `get_portfolio`
  · `get_fund_value`).
- **Free, keyless data** — real SEC/XBRL, GLEIF and GDELT with no paid provider.
- **Lean & Microsoft-native** — `azd up` deploys it all; the blob store means a
  demo costs almost nothing; **Cosmos is optional**; bring your own roles, personas
  and Foundry agents.

> "One command deploys the whole accelerator, and it takes a deal from the first
> signal all the way to a monitored portfolio company — all on Teams, Foundry,
> Graph and managed identity."

---

## The arc at a glance

| Act | Persona | Tab | The one line |
|---|---|---|---|
| 1 · Origination | Analyst | Stage 1 | "Gate, guide, rank — real sourcing." |
| 2 · Diligence | Sector MD | Stage 2 | "Parallel but governed." |
| 3 · Decision & IC | Fund CFO → Partner | Decision artifacts · IC readiness | "A verdict from real facts; partner-only approval." |
| 4 · Own & monitor | Operating Partner · IR | **Fund & Portfolio** | "The deal became a company we own." |
| 5 · Close | — | — | "One command, the full loop." |

## Grounding — the tools behind the story

| You show | It's backed by |
|---|---|
| Pipeline & value strip | `GET /api/analytics`, `GET /api/fund/value` |
| Lifecycle (15 stages, 6 gates) | `GET /api/lifecycle` |
| Decision artifacts | `GET /api/deals/:id/{returns,value-creation,risk-register,ioi,loi}` |
| Fund / LP performance | `GET /api/fund/overview` |
| Portfolio monitoring | `GET /api/fund/portfolio` |
| Agent answers | Foundry agents → MCP read tools (`/mcp-ro`) |
| Keyless data | `GET /api/company/:name/fundamentals`, `/api/entity/:name/lei`, `/api/news/gdelt` |

See the [demo runbook](DEMO-RUNBOOK.md) for the shorter feature-tour version and
troubleshooting.
