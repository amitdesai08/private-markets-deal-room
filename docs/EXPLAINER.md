# The Deal Room — explained for builders

You are an **IT / platform professional with no private-equity (PE) background**. This is the
one doc that lets you understand the product, demo it, and explain it to an industry
professional with confidence. It covers: what the app *is*, the business it models, what every
screen *shows*, what every agent *does*, how access is *enforced*, and a glossary of the jargon.

Companion docs: [PERSONAS.md](PERSONAS.md) (who uses it) · [AGENTS.md](AGENTS.md) (agent
reference) · [DEAL-STAGES.md](DEAL-STAGES.md) · [ACCESS-MODEL.md](ACCESS-MODEL.md) ·
[DATA-SOVEREIGNTY.md](DATA-SOVEREIGNTY.md) · [SKILLS.md](../SKILLS.md).

---

## 1. What is this app?

**The Deal Room is a Teams-native AI workspace for a private-equity fund.** A PE fund buys
companies, improves them, and sells them for a profit. Doing that involves a long pipeline of
research, analysis, modelling and committee decisions — today spread across email, Excel,
PowerPoint, data rooms and people's heads. The Deal Room pulls that pipeline into **Microsoft
Teams** and puts a set of **governed AI agents** on top of it, so the team can *ask* for
analysis instead of assembling it by hand — while a strict access model makes sure each person
only sees and does what their role allows.

Think of it as: **a CRM + analytics + document-drafting layer for deal-making, with an AI
copilot per job, all inside Teams, all identity-governed.**

## 2. The business it models (the deal lifecycle)

Every company the fund looks at moves through four stages. This is the spine of the whole app.

| Stage | Name | What happens (plain English) | Key outputs |
|---|---|---|---|
| **1** | **Origination & Screening** | Find companies worth buying ("sourcing"), then filter them against the fund's rules ("screening") | Target shortlist, screening one-pagers, comps |
| **2** | **Diligence & Approval** | Investigate the shortlisted company deeply, then take it to the **Investment Committee** for a go/no-go | Diligence findings, risk register, returns model, **IC memo** |
| **3** | **Execution & Closing** | Negotiate and sign the purchase; legal + compliance | LOI/SPA, KYC/AML clearance, funds flow |
| **4** | **Value Creation & Exit** | Own and grow the company (3–6 yrs), then sell it | 100-day plan, EBITDA bridge, portfolio reporting, exit |

Returns are judged in **IRR** (annualised %) and **MOIC** (multiple of money in→out). See
[DEAL-STAGES.md](DEAL-STAGES.md) for the detailed gates.

## 3. What the app shows (screen by screen)

The product is a **Teams tab** (the main app) plus an **in-Teams chat** copilot. The surfaces
(React components in `teams-app/tab/src`):

- **Dashboard** — the fund's pipeline at a glance: deals by stage, what needs attention, next
  actions. Your landing page.
- **Stage 1–4 boards** (`Stage1`–`Stage4`) — one board per lifecycle stage showing the deals in
  it and the stage-specific tools/skills (e.g. Stage 1 = screening + comps; Stage 3 = SPA + KYC).
- **Deal detail** (`DealDetail`, `DealArtifacts`) — everything about one company: the record,
  the diligence artifacts, the IC-readiness view, the returns and risk register. **This is where
  access enforcement is most visible** — a confidential deal outside your team simply isn't here.
- **Fund** — fund-level numbers: portfolio companies, TVPI/DPI/RVPI, net IRR/MOIC, dry powder,
  concentration vs the mandate limits.
- **Power BI / Report** — an embedded Power BI report tab for richer fund/portfolio analytics.
- **Chat panel** (the copilot) — a drawer where the user asks the agents in natural language.
  It's **identity-aware**: it sends the user's role, so answers are scoped to what they may see.
  Ask **"what can you do?"** here to get a role-scoped capability tour.
- **Admin / Data Sources / Settings** — map Entra users/groups to roles, connect data sources
  (incl. **Work IQ** for M365 content and **Power BI**), and configure the app. Admin-only.
- **Offline** — a graceful state when the backend is unreachable.

## 4. What the agents do

Two ways to think about the agents. **Today** they're **persona-shaped** (one agent per PE role
— Analyst, Partner, Fund CFO, Operating Partner, GC, IR, plus the sector MDs and the external
News Scout). The **scaffolded target** is **purpose-shaped** — a few agents named for the *job*,
with an **orchestrator** that routes to them. Full reference: [AGENTS.md](AGENTS.md).

Purpose agents (the direction), each bundling **skills** (`skills/<slug>/SKILL.md`):

| Agent | What it does for the user | Example ask |
|---|---|---|
| **Orchestrator** | Routes the request; answers "what can you do?" per role | "Where should I focus today?" |
| **Sourcing** | Finds & maps targets to the mandate | "Any new targets in industrial software?" |
| **Screening** | Screens a target vs mandate/comps/unit economics | "Screen Project Atlas — advance or pass?" |
| **Diligence** | Plans & drives diligence; flags red risks | "What's blocking IC readiness on Atlas?" |
| **Modeling** | Builds the LBO/DCF/returns with sensitivity | "Build the base/bull/bear LBO for Atlas" |
| **IC-Memo** | Drafts the IC memo + deck, audits every figure | "Draft the IC memo; check the citations" |
| **Value-Creation** | 100-day plan, EBITDA bridge, portfolio monitoring | "Which portfolio company is off-plan?" |

Two hard rules make the agents trustworthy:

1. **They never guess.** Each agent has *no* deal data in its context — it calls governed tools
   (`get_deal`, `get_returns`, `get_ic_readiness`, …) to read the live record, and cites which
   tool each number came from.
2. **They never leak.** Reads are threaded with the caller's identity; a deal outside the
   user's need-to-know is *refused*, not summarised (see §5).

The one **external-web** agent (News Scout) can read the public web for sourcing signals but can
*never* touch internal deal data — and vice-versa. That boundary is enforced and audit-logged
([DATA-SOVEREIGNTY.md](DATA-SOVEREIGNTY.md)).

## 5. How access is enforced (the part IT will ask about)

Everything hangs off the user's **Entra ID** identity. The flow:

1. The Teams tab/chat sends the signed-in user's identity to the backend (the Teams proxy
   injects the trusted identity + a view-as role — a client can't forge a wider role).
2. `roleForUser` ([userPolicy.js](../app/lib/userPolicy.js)) resolves the **role** (admin ·
   partner · deal-team · analyst · member, or a custom Entra-mapped role).
3. Every read is gated: `dealAccessLevel` returns **full / status-only / none** per deal, so
   confidential deals are hidden or redacted; `list_deals`/`search_deals` return only visible
   deals. **Even the agents' shared MCP refuses confidential-deal detail**, because it runs with
   the agent's own credentials rather than the end user's — a deliberate belt-and-braces choice.
4. Writes (advancing a deal, recording a finding) require the role's authority — read-only roles
   are routed to a read-only agent.

Net: an analyst literally cannot get a confidential deal's detail out of the UI *or* the chat.
See [ACCESS-MODEL.md](ACCESS-MODEL.md) and the "Governance & data protection" section of
[AGENTS.md](AGENTS.md).

## 6. How to demo / explain it to a PE professional

A 3-minute talk track (there are full runbooks in [docs/Demos](Demos)):

1. **Open the Dashboard** — "Here's the fund's whole pipeline, by stage, in Teams."
2. **Ask the chat "what can you do?"** — "The copilot answers *for my role* — an analyst sees
   sourcing/screening/modelling; a partner also sees IC and the LP lens."
3. **Open a deal and ask "screen this target"** — "It reads the live record and cites its
   sources. It's drafting analyst work, not making the decision."
4. **Switch to the analyst persona and open a confidential deal** — "It's gone. Access is
   enforced server-side — the AI can't be a side-channel around need-to-know."
5. **Open the Fund tab** — "And here's the LP-facing picture: TVPI, net IRR, concentration."

The message to an industry pro: *"It's your deal pipeline in Teams with a copilot per job that's
grounded in your real data and bounded by your access model."*

## 7. Glossary (fastest way to sound fluent)

| Term | Meaning |
|---|---|
| **GP / LP** | General Partner (the PE firm) / Limited Partner (the investors: pensions, endowments) |
| **Fund / Mandate / LPA** | The capital pool / the rules it invests within / the Limited Partnership Agreement |
| **Sourcing / Screening / Diligence** | Find deals / qualify them / investigate them deeply |
| **IC / IC memo** | Investment Committee (the go/no-go body) / the write-up submitted to it |
| **CIM / QoE** | Confidential Information Memorandum (the seller's pitch book) / Quality of Earnings report |
| **IOI / LOI / SPA** | Indication of Interest / Letter of Intent / Sale & Purchase Agreement |
| **KYC / AML** | Know-Your-Customer / Anti-Money-Laundering compliance checks |
| **LBO / DCF / comps** | Leveraged Buyout / Discounted Cash Flow / comparable companies & transactions |
| **IRR / MOIC** | Internal Rate of Return (%/yr) / Multiple On Invested Capital (×) |
| **TVPI / DPI / RVPI** | Total value / Distributed value / Residual value — each ÷ paid-in capital (LP metrics) |
| **EBITDA / EBITDA bridge** | Core profit measure / how you get from entry profit to exit profit (value levers) |
| **Dry powder** | Committed capital not yet invested |
| **Hold period / Exit** | How long the fund owns a company / selling it (the payoff) |
| **100-day plan** | The post-acquisition action plan for the first quarter of ownership |
| **Entra ID / RBAC** | Microsoft's identity service / Role-Based Access Control (who can see/do what) |
