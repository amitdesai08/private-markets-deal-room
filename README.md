# The Deal Room

> **The AI deal team that lives in Microsoft Teams.**

Private-equity deal flow runs on scattered spreadsheets, inboxes and data rooms — and the
answers live in people's heads. **The Deal Room** puts the whole journey — **source → screen
→ diligence → IC → own → exit** — inside the Microsoft Teams channel your fund already works
in, with an **AI deal team you talk to in plain language**. Every answer is grounded in the
live deal record, delivered by the right specialist, and scoped to who's asking.

No new portal to adopt. No paid data feeds to demo. **One command** to stand it up in your own
tenant.

![The Deal Room console rendered inside Microsoft Teams](teams-app/docs/teams-dashboard.png)

<sub>*The same console runs **natively in Microsoft Teams** and as a **standalone web app**, over one shared deal record.*</sub>

> 🧭 **Go deeper —** [**How it works**](docs/HOW-IT-WORKS.md) · [**Inside a deal**](docs/DEAL-STAGES.md) · [**Access model**](docs/ACCESS-MODEL.md) · [**Deploy**](docs/DEPLOY.md) · [Architecture diagram](https://viewer.diagrams.net/?tags=%7B%7D&lightbox=1&nav=1&title=architecture#Uhttps%3A%2F%2Fraw.githubusercontent.com%2Famitdesai08%2Fprivate-markets-deal-room%2Fmain%2Fdocs%2Farchitecture.drawio) · [Demo walkthrough](docs/Demos/DEMO-WALKTHROUGH.md) · [Security](SECURITY.md)

---

## Why it matters

| | |
|---|---|
| 🗣️ **Zero context-switching** | Q&A, diligence and approvals happen in the channel the team already lives in — adoption doesn't hinge on opening a separate app. |
| 🎯 **The right answer for the right person** | Specialists, deal data and write actions are scoped to the requester's role, with true **deal-by-deal need-to-know** and hide-able **confidential deals**. |
| 🧾 **One source of truth** | The bot, the dashboard and M365 Copilot all read the *same* live record — no stale copies, no "which version?". |
| ⚡ **Demo-ready in minutes** | Real, **keyless** market data and **one-command** deploy — no paid data providers, and no Cosmos DB required to run. |

## What you can do

- **Ask your deals questions** in plain language and get grounded, cited answers.
- **Source & screen** targets with an AI funnel and live SEC / analyst workups.
- **Run diligence** across specialist lanes into an IC-ready pack.
- **Decide** on returns (IRR/MOIC), value-creation, risk and IOI/LOI — exportable to Excel.
- **Own & exit** — monitor MOIC/IRR, run the 100-day plan, and prep the exit.
- **Generate board-ready documents** (Word IC memos, Excel models) into each deal's data room.
- **Keep it confidential** — hide sensitive deals and grant access person-by-person.

---

## The major features

### 💬 An AI deal team you @mention

**`@Deal Room Assistant`** is a Teams bot you @mention in any deal channel. It replies in
**natural language, grounded in that specific deal** — it works out *which* deal from the
channel itself, so you never restate the company or deal name, and it answers from the right
**specialist's** viewpoint (analyst, sector MDs, partner, …).

> 💬 *what's the investment thesis here, in three lines?*
> 💬 *summarise the latest diligence findings and open risks.*
> 💬 *how does the retail MD read this opportunity?*

![The conversational agent answering in the Teams interface — grounded in live deal data](teams-app/docs/teams-agent-chat.png)

### 📊 A dashboard native to your channel

An **Entra-SSO channel tab** renders the deal workspace **natively inside Teams** — no separate
portal, no second sign-in — and the *same* build runs as a standalone web console. Fund KPIs,
the live origination funnel, per-deal detail, an inline agent chat, and proactive **Adaptive
Card** alerts that turn the channel into the deal's activity feed.

### 🗂️ The whole lifecycle — source to exit

The app *is* the process: five workspaces carry a deal from first signal to realisation, gated
at every hand-off — **Origination → Diligence → Execution → Value & Exit**, plus a **Fund &
Portfolio** roll-up. Each stage names the accountable persona and produces the artifacts the IC
actually decides on.

![Stage 1 — Origination & Screening in the Teams tab](teams-app/docs/teams-stage1.png)

> 🔎 **[Inside a deal — a tab-by-tab tour of every stage & workspace →](docs/DEAL-STAGES.md)**

### 📁 Every deal gets its own data room

The moment a deal is pursued it gets a **Teams channel** and a **SharePoint virtual data room**,
provisioned via Microsoft Graph. From the deal's **Documents** tab you generate board-ready
**Word IC memos** and **Excel deal / returns models** straight from the live record —
**download** a personal copy on your own M365 licence, or **publish** into the shared data room
(write-gated to the deal team, authored *as you*).

### 📑 Decision-grade artifacts & IC readiness

Every deal carries the artifacts a PE IC decides on — **LBO / returns** (IRR/MOIC + sensitivity
grid), a **value-creation / 100-day plan** (EBITDA bridge), a **risk register**, and **IOI/LOI**
— each derived from the live record and exportable to Excel, with an **IC-readiness** board that
calls a **READY / CONDITIONAL / NOT-READY** verdict.

### 🔐 Need-to-know access & confidential deals

Access is scoped to **who is asking**, resolved server-side. Everyone gets **pipeline
awareness** (deal metadata); the **confidential workspace** opens only to the deal team, admins,
or **anyone named on that deal**. Flag a deal **confidential** and it vanishes from everyone
else's view — built for take-privates under NDA, carve-outs on a clean-team protocol, or a live
exit.

![Role-gated access in the Teams tab](teams-app/docs/teams-rbac.png)

> 🔎 **[The full access model — roles, need-to-know & demo mode →](docs/ACCESS-MODEL.md)**

### 📈 Real numbers, no paid data

For demos without a paid provider, the platform runs on **real, keyless** data — **SEC EDGAR /
XBRL** fundamentals, **GLEIF** entity & ownership, and **GDELT** news — so every figure is real
and cited, out of the box.

### ☁️ Enterprise-ready, one command to deploy

Azure-native and portable: **Azure AI Foundry** agents via managed identity, **10 role-governed
specialist agents**, **Fabric / OneLake** market intelligence, and a **Deal MCP server** that
lets **M365 Copilot** and hosted agents call the same grounded tools. It ships as
subscription-agnostic **Bicep** you deploy with **one `azd up`**, with a built-in **sleep/wake**
switch so an idle demo costs nothing.

> 🔎 **[Deploy it in your own tenant →](docs/DEPLOY.md)** · **[How it works →](docs/HOW-IT-WORKS.md)**

---

## See it in action

Deploy in **demo mode** (or open the web console) and flip on **demo profiles** — one named
identity per role — to walk the whole access model without provisioning a single user. The
seeded pipeline even ships **confidential deals** and a real **need-to-know grant**: sign in as
the analyst and the confidential take-private and exit are invisible, yet she has full access to
the one deal she's named on. Switch to the partner and everything opens.

> 🎬 [Demo walkthrough](docs/Demos/DEMO-WALKTHROUGH.md) · 📋 [Demo runbook](docs/Demos/DEMO-RUNBOOK.md) · 🔐 [Access model](docs/ACCESS-MODEL.md)

---

## For builders — the "How"

| Guide | What's inside |
|---|---|
| [**How it works**](docs/HOW-IT-WORKS.md) | Architecture diagram, the one-backend/two-surfaces model, AI Foundry agents, the pluggable store, the identity trust seam, cost control, repo layout & run-locally. |
| [**Deploy guide**](docs/DEPLOY.md) | Prerequisites, `azd up`, the guided script, identity paths, roles, and how to customize & extend. |
| [**Access model**](docs/ACCESS-MODEL.md) | Two-tier RBAC, deal-team need-to-know, confidential deals, demo profiles & the runtime Demo Mode toggle. |
| [**Inside a deal**](docs/DEAL-STAGES.md) | A tab-by-tab tour of every stage, the workspace, decision artifacts and the document repository. |
| [Infra runbook](infra/README.md) · [App service](app/README.md) | Deep Bicep / `what-if` details and the API / MCP service. |
| [Deployment checklist](docs/DEPLOYMENT-CHECKLIST.md) · [Operations plan](docs/OPERATIONS-PLAN.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) | Go-live, run-book, security posture and how to contribute. |

---

<sub>**Built on** Azure AI Foundry (managed-identity inference) · a Teams **Bot Framework** agent + **Entra-SSO channel tab** · a **Deal MCP server** for M365 Copilot & hosted agents · subscription-agnostic **Bicep** on **Azure Container Apps**. Authentication is **managed identity** end to end — no secrets in this repository.</sub>
