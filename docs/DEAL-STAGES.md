# Inside a deal — stages, workspace & the data room

> A deep dive into what The Deal Room lets you *do* on a deal: how a deal moves
> stage-to-stage, what lives in each stage, everything inside a deal's workspace, and the
> **per-deal document repository** (Teams channel + SharePoint data room + one-click Word /
> Excel generation).
>
> New here? Start with the [README](../README.md). This is the detail behind its
> [lifecycle overview](../README.md#-the-whole-lifecycle--source-to-exit), and pairs with the
> [Access model](ACCESS-MODEL.md) and [How it works](HOW-IT-WORKS.md).

---

## How a deal moves

A deal is a single record that advances through the lifecycle. The workspace *is* the
process — you drive it from the deal's **Stages & orchestration** tab, and every action is
grounded in the live record and gated by [who's asking](ACCESS-MODEL.md).

| Action | What it does | API |
|---|---|---|
| **PURSUE** *(Stage 1 gate)* | Promotes a screened candidate to a live deal and **provisions its collaboration space** — a real Teams channel + SharePoint data room. | `POST /api/sourcing/:id/promote` |
| **Launch diligence** | Stands up the Stage-2 workspace: DD checklist, playbook templates and advisor-paired swimlanes. | `POST /api/deals/:id/launch` |
| **Run a step** | Runs the current lifecycle step's agent work (diligence lane, synthesis, memo, …). | `POST /api/deals/:id/steps/:stepKey/run` |
| **Advance / Back** | Moves the deal forward through a gate (or back a step) with the accountable persona's sign-off. | `POST /api/deals/:id/advance` · `/back` |
| **Ensure channel** | (Re)provisions the deal's Teams channel + data room on demand. | `POST /api/deals/:id/teams/ensure` |

> ⚡ Each stage names the **accountable persona** and the **artifacts** it produces, and the
> six **decision gates** (⛔ PURSUE · IOI · LOI · IC · Signing · Exit) are where capital and
> resources are committed.

---

## The five workspaces

### 1 · Origination & Screening — the funnel

Find, frame and rank targets, then commit to pursue.

| You can | Detail |
|---|---|
| **Explore CxO signals** | M365 mail / chats / meetings + Dynamics 365 CRM, surfaced as sourcing signals. |
| **Scan news & filings** | A News & Filings desk with an AI **catalyst classifier**; Analyst Reports for thesis context. |
| **Run the sourcing framework** | Fund Mandate *gates* → Investment Themes *guide* → Screens *rank* — a discover-to-score loop. |
| **Deep-dive any target** | Live **SEC EDGAR** filings, a Morningstar-quality read, and an **AI-generated analyst report** (sector outlook, competitive position, key risks, screening recommendation) — sourced live and cited. |
| **Record PURSUE** | At the Screening Gate the MD commits the shortlist; a screened deal + its collaboration space are created. |

**Personas:** Analyst · MDs · Partner  ·  **Produces:** screened deal, thesis, screen scorecard

### 2 · Diligence & Approval — the deal hub

Work the deal across specialist lanes and roll findings up to the IC.

| You can | Detail |
|---|---|
| **Launch the workspace** | DD checklist, playbook templates and advisor-paired **swimlanes**, each node linking out. |
| **Run diligence** | The agent works the deal across specialist personas (commercial, financial, legal, tax, tech/AI, ops, ESG), grounded in the live record and the data room. |
| **Log issues & conditions** | Capture diligence issues and CP/CS conditions against the deal. |
| **Synthesise** | Findings and risks roll up into an IC-ready view. |
| **Record the decision** | The MD / partner approves; the deal advances to execution. |

**Personas:** Deal-team lane owners · Principal · Partner  ·  **Produces:** findings, risk items, synthesis, IC pack

### 3 · Execution — sign & close

Carry the approved case through terms, signing and financing to close.

| You can | Detail |
|---|---|
| **Carry the IC case** | The IOI/LOI, the IC-readiness verdict and the approved investment case flow into execution. |
| **Sign (SPA)** | Legal execution — SPA, reps & warranties and conditions to close — led by the **General Counsel**. |
| **Arrange financing** | The debt package — sources & uses, leverage and covenant headroom — with the **Fund CFO**. |
| **Close & hand off** | Completion, then a clean hand-off into ownership and the 100-day plan. |

**Personas:** General Counsel · Fund CFO · Partner  ·  **Produces:** signed SPA, financing plan, closing pack

### 4 · Value & Exit — own & realise

Run the value-creation plan, monitor the company, and take it to exit.

| You can | Detail |
|---|---|
| **Drive value creation** | The 100-day plan and quantified levers, tracked on an **EBITDA bridge** vs entry, with the **Operating Partner**. |
| **Monitor the portfolio** | Current **MOIC / IRR**, KPIs vs plan, the add-on pipeline, and LP-ready board packs. |
| **Prepare the exit** | **Exit-readiness** scoring and a dual-track (trade sale / secondary) exit recommendation to the exit committee. |

**Personas:** Operating Partner · Portfolio team · IR  ·  **Produces:** VCP tracker, board packs, exit recommendation

### Fund & Portfolio — the LP lens

A fund-level roll-up across every owned company: **DPI · TVPI · RVPI**, deployed vs dry
powder, and concentration vs LPA limits — the executive value dashboard.

---

## Inside a deal — the workspace tabs

Open any deal for a single-scope workspace. What you see is [scoped to your access](ACCESS-MODEL.md):
a **full** workspace if you're on the deal team (or a deal-team-tier role / admin), a
**status-only** summary otherwise, and **nothing** for a confidential deal you're not on.

| Tab | What you can do | API |
|---|---|---|
| **Overview** | Read the thesis, key figures and headline financials for the deal. | `GET /api/deals/:id` |
| **Stages & orchestration** | Drive the deal: launch diligence, run the current step, advance/back through gates; open the Teams channel + data room. | `…/launch` · `…/steps/:key/run` · `…/advance` |
| **Workspace** | Work the diligence swimlanes, cycle checklist items, and record contributions. | `…/checklist/:item/cycle` · `…/contributions` |
| **Market research** | Fabric / OneLake **comparable deals**, **IC precedents** and **benchmark findings**, plus a **source-citation audit** of the memo's claims. | `…/citations` · `/api/market-intel` |
| **Decision artifacts** | The artifacts a PE IC decides on — returns, value-creation, risk register, IOI/LOI — each exportable to Excel. | see below |
| **Documents** | Generate Word/Excel docs from the live record and publish them into the deal's SharePoint data room. | see [The document repository](#the-document-repository) |
| **IC readiness** | The **READY / CONDITIONAL / NOT-READY** verdict and the required-artifact checklist. | `…/ic-readiness` |
| **Ask agents** | Chat with the deal analyst or a persona agent, scoped to this deal and grounded in its record. | `/api/deal-agent/chat` · `/api/persona-agents/:p/chat` |

### Decision artifacts

Derived from the live record, callable by the agents (`get_returns` / `get_value_creation`
/ `get_risk_register`), and rendered in the **Decision artifacts** tab:

- **LBO / returns** (`GET /api/deals/:id/returns`) — entry multiple, leverage, **sources & uses**, base / upside / downside **IRR & MOIC**, and an exit-multiple × EBITDA-CAGR **sensitivity grid** against the 20% / 2.0x hurdle. Exportable to **Excel**.
- **Value-creation plan** (`GET /api/deals/:id/value-creation`) — the **EBITDA bridge**, quantified levers with owner + timeline, and the **100-day plan**.
- **Risk register** (`GET /api/deals/:id/risk-register`) — every open risk across the lanes with severity × likelihood, mitigation and owner (red / amber / green).
- **IOI / LOI** (`GET /api/deals/:id/ioi` · `/loi`) — the non-binding indication and letter of intent, with valuation, structure and exclusivity.

---

## The document repository

Every pursued deal gets its **own collaboration space**, provisioned on the PURSUE gate via
delegated Microsoft Graph, with a durable channel↔deal mapping that keeps the agent's
context correct as deals scale:

- **A Teams channel** — the deal's conversation and activity feed (proactive Adaptive Cards
  post here, deep-linking back to the tab).
- **A SharePoint virtual data room (VDR)** — the deal's document store.

### Generate documents from the live deal

From a deal's **Documents** tab you produce polished, board-ready documents straight from the
live record — no copy-paste, always current:

| Document | Format | Endpoint |
|---|---|---|
| **IC memo** | Word (`.docx`) | `POST /api/deals/:id/documents/ic-memo` |
| **Deal model** | Excel (`.xlsx`) | `POST /api/deals/:id/documents/model` |
| **Returns model** | Excel (`.xlsx`) | `POST /api/deals/:id/documents/returns` |
| **Deal model — live** | Excel (`.xlsx`, live formulas) | `POST /api/deals/:id/documents/model?live=1` |
| **CSV export** | CSV | `GET /api/deals/:id/model.csv` |

### Two destinations — download or publish

Each document can go to one of two places (`?dest=`):

| Destination | Who | How it's built |
|---|---|---|
| **Download** *(default)* | Anyone with deal access | A **personal working copy**, generated on the requester's **own Microsoft 365 licence** — needs no M365 connection. |
| **Publish to data room** | Deal-team / partner *(write-gated)* | Authored **as the requester** via an on-behalf-of Graph token and saved into the deal's **shared SharePoint VDR**. |

- **List the data room** — `GET /api/deals/:id/documents` returns the folder URL and its files.
- **Least-privilege** — read follows deal access; **publishing** to the shared VDR needs
  deal-team or partner rights (read-only users can still download their own copy).
- **Degrades cleanly** — with M365 not connected, download still works; publishing returns a
  friendly "connect Microsoft 365" prompt rather than an error.

---

## Access within a deal

What a deal shows — and what you can do in it — follows the two-tier need-to-know model:

- **Full** workspace for admins, deal-team-tier roles, and **anyone named on the deal's team**.
- **Status-only** summary (metadata, no confidential workspace) for the status tier.
- **Invisible** — a `confidential` deal doesn't appear at all unless you're on its team.

See [the Access model](ACCESS-MODEL.md) for the full model.
