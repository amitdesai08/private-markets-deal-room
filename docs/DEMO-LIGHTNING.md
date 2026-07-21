# Lightning demo — 7 minutes, mapped to PE needs

A fast, high-signal demo of The Deal Room that hits the whole feature set in ~7
minutes, plus an explicit **feature → private-equity need** map you can speak to.

- Longer options: the [feature tour](DEMO-RUNBOOK.md) (~18 min) and the
  [end-to-end narrative](DEMO-WALKTHROUGH.md) (~20 min).
- Everything is grounded in the live (seeded) record — *Fund IV, US Mid-Market
  Buyout* ($2.6B, vintage 2024, ~46% deployed, 6 portfolio companies). If anyone
  asks "is this real?", the agents' answers cite the tools (`list_deals`,
  `get_deal`, `get_returns`, `get_fund_overview`).

> **One-line positioning:** *An AI-native private-equity workspace that lives
> inside Microsoft Teams — deal teams source, screen, run diligence, and take
> deals to IC, with every answer grounded in the deal record and scoped to who
> is asking.*

---

## Before the room (30 seconds of setup)

- Open the **web console** (`https://<teams-fqdn>/`) or the **tab in Teams**.
- Keep the top-bar **"sign in as"** switcher handy — no real sign-in needed.
- The demo is **self-contained**: seeded deals + market intel ship in the image,
  so it runs with **no paid data vendor** and near-zero standing cost.

---

## The 7-minute flow

| # | Beat (time) | Do / say | Feature shown |
|---|---|---|---|
| 0 | **Pitch** (0:30) | Say the one-liner above. "Same console runs in Teams *and* standalone web." | Teams-native + web console |
| 1 | **Who's asking** (1:00) | "Sign in as" **Sam Rivera (Admin)** → all **10 specialist agents**. Switch to **Maya Olsen (Analyst)** → rail collapses to 1, Stage-2 deals lock. As **Eleanor Bishop (Partner)**, use **"view as → Analyst"**. | Identity-aware access; view-as only ever goes *down*, enforced server-side |
| 2 | **Originate** (1:30) | Open **Stage 1 — Origination**. Show the **News & filings desk**: live catalysts (GDELT) + real SEC filings (EDGAR) on a target; run the screening gate. | Sourcing signals, screening, free live data |
| 3 | **Diligence** (1:30) | Open a deal → **Stage 2 — Diligence**. Ask a **Sector MD agent** (Retail/AI/Supply) a lane question; show it grounds on **benchmark findings + comparable deals** from the fund's own history. | Specialist persona agents; market-intelligence grounding |
| 4 | **Decide** (1:30) | Ask the **Fund CFO** for the **LBO case (IRR / MOIC)**; open the **IC memo** and **IC voting precedents**. | Auto-drafted decision artifacts; IC governance |
| 5 | **Own it** (0:30) | Open **Fund & Portfolio** — the post-IC lens: portfolio monitoring, value-creation, LP-ready fund view. | Full lifecycle beyond the deal |
| 6 | **Control the sources** (0:30) | Open **Data Sources**: free tier (EDGAR/GDELT/GLEIF) on by default; subscription providers (Morningstar/LSEG/Moody's) sign-in; **toggle a source off** live. | Governed, configurable connectors; cost story |

**Ultra-short (3 min):** run beats **0 → 1 → 3 → 4** — the differentiator (access),
a grounded specialist answer, and the IC artifact. That alone tells the story.

---

## Feature → PE need map (the "why it matters")

| Platform capability | PE firm need / pain it addresses | Why it lands |
|---|---|---|
| **Identity-aware access + view-as** (server-enforced) | Information barriers, deal-team confidentiality, LP/regulatory segregation of duties | Access is resolved on the server from *who is asking* — not a UI toggle; view-as never escalates privilege |
| **10 specialist persona agents** (partner, principal, sector MDs, operating partner, fund CFO, GC, IR, analyst) | Thin deal teams and scarce senior time; consistent, complete diligence coverage | Every lane — commercial, tech/AI, supply chain, legal, returns — has an expert on tap, 24/7 |
| **Deal orchestrator + grounded answers** | Trust and auditability — "can I believe the AI?" | Every answer cites the tool/source and is grounded in the live deal record — no hallucinated numbers |
| **Full lifecycle: 15 stages, 6 decision gates** | Repeatable IC governance and process discipline across deals | Codifies the institutional process so nothing skips a gate or an owner |
| **Auto-drafted decision artifacts** (IOI, diligence plan, LBO/returns, IC memo) | Time-to-IC; analyst grunt-work; partner-ready outputs | Drafts the exact artifacts partners vote on, from the live record |
| **Market intelligence** (comparable deals, benchmark diligence findings, IC precedents, company financials) | Pattern-matching to prior deals; not repeating past mistakes | Grounds a new deal in the fund's *own* history and precedent |
| **Free data sources** — SEC EDGAR, GDELT, GLEIF | Data-vendor cost; thin coverage of mid-market / private targets | Real filings, news catalysts, and entity/ownership data with **no subscription** |
| **Subscription connectors via MCP** — Morningstar, LSEG, Moody's | Reuse of existing vendor entitlements | Bring-your-own-data: sign in and the same workflow gets premium sources |
| **Data Sources config menu** | Governance and cost control over which sources feed a deal | Turn any source on/off per engagement; free tier keeps demos/POCs cheap |
| **Teams-native + SharePoint VDR + M365** | Adoption — deal teams won't leave where they already work; document estate | No new tool to learn; the VDR lives in SharePoint under existing tenancy |
| **Deal MCP server (read/write)** | Extensibility into Copilot Studio / the agent ecosystem | The deal record becomes a governed tool surface other agents can use |
| **Fund & Portfolio lens** | Post-close value creation and LP reporting | The same platform owns the asset *after* IC — origination to exit in one place |
| **Self-contained seed + sleep/wake power control** | Cost-efficient pilots; fast stand-up / tear-down | Spins up and down on command and runs with no paid data — a demo costs almost nothing |

---

## Close (15 seconds)

> "One workspace, inside the tools your deal teams already use, that takes a deal
> from a sourcing signal to an IC decision to a monitored portfolio company —
> every answer grounded and scoped to who's asking, and every data source under
> your control. It stands up in one command and runs on free data out of the box."
