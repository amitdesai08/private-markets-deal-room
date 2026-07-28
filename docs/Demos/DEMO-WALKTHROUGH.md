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
> ~46% deployed, 6 portfolio companies). Everything below is the fund's own
> record — deals, returns, the fund overview. If anyone asks "is this real?", the
> answers show their work: each one traces back to a source you can open.

---

## Setup (before the room)

- Deploy in demo mode (`azd up` with `DEPLOY_DEMO_PROFILES=true`) or open an
  existing demo environment. No datastore is required — the default **blob store**
  means the demo costs almost nothing, and **Cosmos is entirely optional**.
- Open the **web console** at `https://<teams-fqdn>/`, or the tab inside Teams.
- Keep the top-bar **"sign in as"** switcher handy — you'll change profile per act.

**The cast** — the demo roster is **The Good Place**, one character per RBAC tier. Sign in as a
tier, then act *through* the specialist persona agents in the panel:

| Sign in as | Tier | Acts through | Owns the act |
|---|---|---|---|
| **Chidi Anagonye** | Analyst (read-only) | Analyst agent | Act 1 — Origination |
| **Tahani Al-Jamil** | Deal Team | Sector MDs (Retail / AI / Supply) | Act 2 — Diligence |
| **Eleanor Shellstrop** | Partner | Fund CFO · Principal · Partner | Act 3 — Decision & IC |
| **Eleanor Shellstrop / Michael Realman** | Partner / Admin | Operating Partner · Fund CFO · IR | Act 4 — Own & Monitor |

---

## Act 0 · The 30-second pitch

> "The Deal Room is where a deal team runs the whole institutional arc in one
> place — source, screen, diligence, take it to IC, **and then monitor the
> company they own**. The *same* workspace runs inside Microsoft Teams or the
> browser, every answer is drawn from the fund's own record, and **each person
> only sees what their role allows**."

Then set the frame: *"Let's follow one deal the whole way through."*

---

## Act 1 · Origination & screening — *sign in as Chidi Anagonye (Analyst)*  ⏱ 3 min

1. **Deals Overview** → note the **decision KPIs** (live deals, pipeline value,
   average IC readiness, next to committee) and the **Needs attention** list — the
   deals slipping toward IC, each with a plain-language *why* and one-click Open / Ask.
   *"This is the deal team's cockpit — decision data first; there's deliberately no
   ROI / hours-saved framing, because the audience is the people doing the deals."*
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

## Act 2 · Diligence — *sign in as Tahani Al-Jamil (Deal Team), act as a Sector MD*  ⏱ 4 min

1. Open **Stage 2 — Diligence** and pick the lead deal (the top consumer deal).
2. Show the **workstream lanes** — Commercial / Tech-AI / Operations — each owned
   by a sector MD, with findings tagged by severity. On the deal's **Workspace** tab,
   call out the **diligence workbench**: every lane as a **RYG** row with owner,
   progress and the blocking reason, and a persistent **“N at risk”** count.
3. As the **AI MD**, use the **agents** panel: *"Score AI-readiness and flag the
   tech risks on this deal."* The answer is grounded and cited — and the assistant
   **proposes** a next step (e.g. *“log this blocking lane as an issue”*) that you
   **Apply ▸**. It writes the change *and* an attributed entry to the deal's
   **Activity** trail — never acting on its own.
4. Note that an MD **can only touch their own lane** — try the access model live.

> "Diligence runs on every workstream at once, but with guardrails — the tech
> lead can't touch the commercial lane, and nothing changes unless a person signs
> off. Every finding and edit is attributable, so you always know who put a number
> in front of the IC."

---

## Act 3 · Decision & IC — *sign in as Eleanor Shellstrop (Partner)*  ⏱ 5 min

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
   grounded in real Fabric comparables and IC precedents. Then flip to the deal's
   **Overview** — the same verdict leads the **decision cockpit** with the **top 3
   blockers** (one-click **Resolve ▸**) and a **“what changed since last check”**
   delta so a partner sees momentum, not just status.
4. Switch to **Eleanor (Partner)** and show **view-as-down**: she can see the room
   as any junior role, but **never up** — and it's enforced server-side. Only the
   Partner can approve at the **IC gate**.

> "The IC verdict isn't a progress bar — it's real gating facts. And approving at
> the IC gate is a partner-only authority — no one can grant themselves that sign-off."

---

## Act 4 · Own & monitor — *sign in as Eleanor Shellstrop (Partner), act as Operating Partner / IR*  ⏱ 5 min  🆕

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
     reporting is honest — input-cost inflation pushed it below plan, and the
     portfolio view surfaces the underperformer instead of burying it. That's the
     mark you'd actually defend to an LP."*
3. **Concentration vs LPA limits** — sector and single-position exposure against
   the mandate's hard caps (max % per sector / per deal). *"Compliance-by-design —
   the same LPA gate that screens deals also watches the portfolio."*
   Call out the **Watchlist** at the top of the lens — the watch/underperform names
   ranked, each with its **primary driver** (worst KPI vs plan) and a **Review ▸**.
4. Open the **Report** tab — the LP-ready pack now carries a **“Source & methodology”
   lineage appendix** (every headline metric → source system → as-of → method) and an
   **output-mode badge** (LP-ready when external sources are live/within SLA, else
   Draft-not-certified). *"You can hand this to an LP and trace every number home."*
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

- **One workspace, wherever the deal team already works** — the *same* experience
  in Teams and on the web.
- **Access follows the person** — a partner sees the whole room, an analyst sees
  only their deals, and no one can look *up* the chain. It's the information
  barrier a fund is required to run.
- **One question, the whole deal team behind it** — ask once and get one answer,
  with the depth of sourcing, screening, diligence, modeling, IC-memo and
  value-creation expertise behind it. Every figure comes from the fund's own
  record, and it shows where each one came from.
- **Real data out of the box** — market, filings, ownership and live news
  catalysts, with no data-vendor subscription to buy.
- **Runs on your own tenant** — stands up fast, costs almost nothing to pilot,
  and bends to your roles, your senior personas and your own investment process.

> "It takes a deal from the very first signal all the way to a portfolio company
> you actively monitor — the full loop, source to own, inside the tools your firm
> already trusts."

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
| Assistant approve-to-apply + audit trail | `POST /api/deals/:id/assistant-actions` · `GET /api/deals/:id/activity` |
| Agent answers | Foundry agents → MCP read tools (`/mcp-ro`) |
| Keyless data | `GET /api/company/:name/fundamentals`, `/api/entity/:name/lei`, `/api/news/gdelt` |

See the [demo runbook](DEMO-RUNBOOK.md) for the shorter feature-tour version and
troubleshooting.
