# The Deal Room

> **AI-native private-equity deal flow — native to Microsoft Teams.**

The Deal Room is a private-equity workspace where a fund **sources, screens, runs
diligence, takes deals to the Investment Committee, and then monitors the companies
it owns** — all from inside the Microsoft Teams channel the team already works in
(and the *same* console on the web). Ask an **@mentionable AI agent** in plain
language, read a **channel-native dashboard**, and move deals **stage to stage** —
with every answer **grounded in the live deal record**, delivered by **role-aware
agents**, and **scoped to who is asking**.

It ships as a **one-command Azure accelerator** you deploy into your own tenant — no
paid data providers required to demo, and no Cosmos DB required to run.

![The Deal Room console rendered inside Microsoft Teams](teams-app/docs/teams-dashboard.png)

<sub>*The same console runs **natively in Microsoft Teams** and as a **standalone web app**, over one shared deal record.*</sub>

**Built on** Azure AI Foundry (managed-identity model inference) · a Teams **Bot
Framework** agent + **Entra-SSO channel tab** · a **Deal MCP server** for M365 Copilot
and hosted agents · subscription-agnostic **Bicep** on **Azure Container Apps**.

> 📘 [Architecture](docs/architecture.drawio) · 🎬 [Demo walkthrough](docs/Demos/DEMO-WALKTHROUGH.md) · 🚚 [Deployment checklist](docs/DEPLOYMENT-CHECKLIST.md) · [Demo runbook](docs/Demos/DEMO-RUNBOOK.md) · [Operations plan](docs/OPERATIONS-PLAN.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)
>
> *Tip: use GitHub's **outline** button (top-right of this file) to jump between sections.*

---

## ✨ Feature set at a glance

| Area | Capabilities |
|---|---|
| **Teams-native experience** | @mentionable **conversational agent** grounded in the channel's deal · **Entra-SSO channel tab** + the *same* **standalone web console** · proactive **Adaptive Card** alerts · per-deal **Teams channel + SharePoint** data rooms |
| **End-to-end deal process** | A **15-stage institutional lifecycle** (3 phases · 6 decision gates) · a Stage-1 **origination funnel** with a *gate → guide → rank* sourcing framework · a Stage-2 **diligence hub** with specialist workstream lanes |
| **Decision & IC** | **Decision artifacts** — LBO/returns (IRR/MOIC + sensitivity), value-creation / 100-day plan, risk register, IOI/LOI — each derived from the live record and exportable to **Excel** · an **IC-readiness** board with a READY / CONDITIONAL / NOT-READY verdict |
| **Fund & portfolio** *(post-IC)* | **Owned-company monitoring** (hold, current MOIC/IRR, value-creation progress, KPIs vs plan) · a **fund / LP view** (DPI · TVPI · RVPI, deployed vs dry powder, concentration vs LPA limits) · an **executive value dashboard** |
| **AI & agents** | **10 role-governed Foundry agents** (analyst, partner, principal, 3 sector MDs, operating partner, fund CFO, GC, investor relations) · a **Deal MCP server** for M365 Copilot / hosted agents · Foundry inference via managed identity · **Fabric / OneLake** market intelligence |
| **Identity-aware governance** | **RBAC** resolved by *who is asking* · a two-tier **status-vs-full** deal model with **deal-team need-to-know** and **confidential deals** · **role-based agent routing** · hierarchy **“view-as-down”** · a runtime **Demo Mode** toggle + one-click demo profiles |
| **Real data & documents** | **Keyless** SEC EDGAR/XBRL, GLEIF & GDELT data — real numbers, no paid provider · per-user **Word / Excel** generation on the requester's own M365 licence · CSV export |
| **Azure-native platform** | One-command **`azd up`** · subscription-agnostic **Bicep** · **domain-split resource groups** · a **pluggable store** (blob-per-document by default — *no Cosmos* — or Cosmos DB) · **managed identity** end-to-end · **cost control** — one-command sleep/wake of the whole platform + an in-Teams offline gate |

## 🚀 Deploy this accelerator

The Deal Room ships as a **self-contained Azure accelerator** — a parameterised
**Bicep wiring harness** you deploy into *your own* tenant and subscription. One
subscription-scoped command provisions everything; you supply only a handful of
parameters and run the Bicep. There are **no manual configuration steps** to get
it running.

### Prerequisites
| # | Requirement | Notes |
|---|---|---|
| 1 | **Azure subscription** with `Owner` (or `Contributor` + `Role Based Access Control Administrator`) | subscription-scoped deploy creates resource groups **and** role assignments |
| 2 | **Azure CLI** ≥ 2.60 + **Bicep** | `az bicep install` |
| 3 | **Region** with AI Foundry + Container Apps | default `swedencentral` (EU residency) |
| 4 | **Entra admin** (Application Administrator / Global Administrator) | to run [`scripts/provision-entra.ps1`](scripts/provision-entra.ps1), which **auto-creates** the four app registrations (Teams SSO, M365 connector, bot, MCP) and grants admin consent. Prefer to pre-create them? Pass the IDs as parameters instead. **Optional** for a data-only demo. |
| 5 | **Container images** | build with `az acr build` after infra, then `az containerapp update --image <acr>/<repo>@sha256:<digest>` (or pass `orchestratorImage` / `teamsImage`) |
| 6 | *(optional)* **Microsoft Fabric** capacity admin | only when `deployFabric = true` |
| 7 | *(optional)* **APIM publisher email** | only when `deployApim = true` |

> **Demo / POC mode:** leave all identity + optional parameters empty and the platform runs on **seeded data** with deterministic agents — **no secrets required**.

### Deploy — `azd up` (recommended)

The fastest path is the **Azure Developer CLI**: one command provisions the infra, (optionally) creates the Entra apps, and **builds + pushes + deploys both container images** — no manual `az acr build`.

```bash
azd up
```
- **Demo** *(default)* — infra + seeded data + images. No identity, no admin needed → **one** `azd up`.
- **Full** (Teams SSO / per-user M365 docs / bot) — `azd env set DEALROOM_MODE full`, then `azd up` (creates + registers the Entra apps via the postprovision hook) and `azd up` **once more** to wire them in. Needs an Entra admin.
- **Foundry agents** — `azd up` also provisions the **Deal Orchestrator, News Scout and the ten persona agents** into your Foundry project (a `postdeploy` hook; best-effort, needs the `azure-ai-projects` Python SDK + Foundry data-plane access). Skip with `azd env set DEALROOM_AGENTS false`, or run [`app/scripts/create_persona_agents.py`](app/scripts/create_persona_agents.py) by hand.

> **Foundry is fully in the template:** the Bicep provisions the **AI Foundry account + project, model deployments and Bing grounding**; the `postdeploy` hook creates the **agents** on top; and [`app/scripts/create_agent.py`](app/scripts/create_agent.py) is a copy-and-edit **template to add your own** Foundry agent.

Pick region/subscription with `azd env new` then `azd env set AZURE_LOCATION swedencentral`.

### Deploy — guided script (no azd)

Prefer plain `az`? The orchestrator runs the same flow: it logs you in, lets you pick **demo** vs **full**, **auto-detects** the identity path, then deploys, provisions Entra, and wires everything.

```powershell
./scripts/deploy.ps1     # Windows / PowerShell 7
```
```bash
./scripts/deploy.sh      # Linux / macOS
```
Non-interactive (CI): `./scripts/deploy.sh --mode full --identity provision --env dev --yes`

**Identity paths** — auto-detected, or choose in the menu / `-Identity`:

| Path | Chosen when | What it does |
|---|---|---|
| `provision` | you're an Entra admin *(recommended)* | creates the four app registrations + grants admin consent with your `az` login, then wires them |
| `byo` | app IDs already set in your param file | skips creation, just wires |
| `deployment-script` | you pass a Graph-permissioned managed identity | creates the apps **inside** the Bicep deploy *(advanced)* |

Prefer to run it by hand? The orchestrator just chains **`az deployment sub create`** → [`scripts/provision-entra.ps1`](scripts/provision-entra.ps1) / [`.sh`](scripts/provision-entra.sh) (idempotent; writes `entra.generated.bicepparam` + the secret params) → a wire re-deploy. Data-only demo needs no secrets: `az deployment sub create --location swedencentral --template-file infra/main.bicep --parameters infra/main.sample.bicepparam`. Full runbook + `what-if`: [infra/README.md](infra/README.md).

### Roles — prefab or your own (the wiring harness)
Identity-aware access is a **parameter, not a configuration step**:
- **Prefab roles** — supply Entra **object IDs** (users *or* groups) for `adminIds`, `partnerIds`, `dealTeamIds`, `analystIds`. Access is enforced immediately, no code changes.
- **Your own roles** — edit [`app/lib/userPolicy.js`](app/lib/userPolicy.js) (the single policy seam these parameters feed) to define custom roles, personas and permissions.
- **Open mode** — leave the arrays empty; `defaultAgentRole` applies to everyone.
- **Demo Mode** — set `deployDemoProfiles = true` (or `azd env set DEPLOY_DEMO_PROFILES true`) to seed one named showcase identity per role for an instant end-to-end demo, and to expose the in-app **Demo Mode** toggle (Settings → Access administration) so an admin can turn the “view as” switcher and showcase personas off/on live. **Off by default** in production.

### Customize & extend (agentic skills)
- **New agents** — copy [`app/scripts/create_agent.py`](app/scripts/create_agent.py), edit the name + instructions, and run it to provision your own Foundry specialist agent (it gets the whole read-only research surface via the Deal MCP server automatically). Add its id to [`personaPolicy.js`](app/lib/personaPolicy.js) / [`personaAgent.js`](app/lib/personaAgent.js) / [`userPolicy.js`](app/lib/userPolicy.js) to surface it as an RBAC-governed persona in the app.
- **New personas & lanes** — add a persona to [`app/data/personas.js`](app/data/personas.js) + the policy files; the lifecycle, RBAC and demo profiles pick it up.
- **New tools** — add a read tool to [`app/lib/mcp/dealServer.js`](app/lib/mcp/dealServer.js) and every agent discovers it at runtime (no re-provisioning). The **Deal MCP server** (`/mcp`) is also the reusable tool surface for your own hosted / Copilot Studio agents.
- **New stages & artifacts** — extend the lifecycle in [`app/data/flow.js`](app/data/flow.js) and add artifact builders in [`app/lib/diligence.js`](app/lib/diligence.js) (e.g. returns / VCP / risk register).
- **Persistence** — pick the backend with `storeDriver` (`blob` = lean default, `cosmos` = production) behind the single [`app/lib/repo`](app/lib/repo) seam.
- **Data** — replace the seeded record with your source of truth behind the single `/api` + store seam; wire your own providers alongside the keyless pack in [`app/lib/providers`](app/lib/providers).
- **Surfaces** — the Teams tab is the *same build* as the standalone web console; add tabs/cards (like the **Decision artifacts** tab) without touching the backend.

### Cost control — sleep & wake the platform
An idle demo shouldn't cost anything. You can power the platform off/on as one unit:
- **Whole-platform switch** — [`scripts/platform-power.ps1`](scripts/platform-power.ps1) / [`.sh`](scripts/platform-power.sh) with `stop`, `start`, `sleep` (orchestrator off, Teams gate stays up) or `status`. `stop`/`start` also stop/start the **Function App** and **suspend/resume Fabric capacity**, and print a **standing-cost report** for resources that keep billing and can't be stopped (AI Search, API Management, Container Registry, Log Analytics, App Insights, Cosmos). Use `-ComputeOnly` for just the container apps.
- **Self-service in Teams** — when the orchestrator is asleep, the tab shows an **offline gate**: anyone can **bring it online for 1 hour** (it then auto-stops), while **keeping it online indefinitely is admin-only** (gated by `ADMIN_IDS`, enforced server-side). The Teams app enforces the auto-stop and stores the "lease" as a tag on the orchestrator (no extra datastore).
- **How it's wired** — the Teams app's managed identity is granted rights to start/stop only the orchestrator (`raOrchPowerControl` in [`infra/modules/app.bicep`](infra/modules/app.bicep)); set `PLATFORM_LEASE_HOURS` to change the lease and `ADMIN_IDS` to gate the indefinite path (empty = anyone may). Turn it all off with `PLATFORM_CONTROL=false`.

---

## 🤖 Talk to your deals — the conversational agent

**`@Deal Room Assistant`** is a Teams bot you @mention in any deal channel. It
replies in **natural language, grounded in that specific deal** — it works out
*which* deal from the channel itself, so you never restate the company or deal name.

**Ask it the way you'd ask a colleague:**

> 💬 *@Deal Room Assistant, what's the investment thesis here, in three lines?*
> 💬 *@Deal Room Assistant, summarise the latest diligence findings and open risks.*
> 💬 *@Deal Room Assistant, what's the current valuation and the key financials?*
> 💬 *@Deal Room Assistant, how does the retail MD read this opportunity?*
> 💬 *@Deal Room Assistant, what changed on this deal this week?*

![The conversational agent answering in the Teams interface — grounded in live deal data](teams-app/docs/teams-agent-chat.png)

<sub>*The Deal Room agent in the Teams tab: asked in plain language, it lists every deal with stage, status and IC readiness — grounded via the live deal tools (`mcp_dealroom.list_deals`).*</sub>

Behind every reply:

- **Channel-grounded** — resolves the deal from a durable channel↔deal map (with a
  company-name fallback), then calls the **live** deal tools (`get_deal`, financials,
  diligence, signals) so answers reflect the current record, not a snapshot.
- **Persona-aware** — routes to the right specialist lens (analyst, the sector MDs,
  partner, and the wider deal-team roles) and frames the answer from that viewpoint.
- **Identity-gated** — what it will tell you (and do) depends on **who is asking** —
  see [Identity-aware access](#-identity-aware-access-rbac) below.

## 📊 The Teams dashboard (channel tab)

An **Entra-SSO channel tab** renders the deal workspace **natively inside Teams** —
no separate portal, no second sign-in. SSO carries the signed-in user through, so
the dashboard knows *who* is looking.

- **Home command centre** — fund KPIs, the live origination funnel, and the
  deals-in-diligence roster.
- **Per-deal detail** — thesis, financials, diligence, signals and news for the deal
  the channel is scoped to.
- **Inline chat panel** — the same conversational agent, docked beside the data.
- **Proactive Adaptive Cards** — deal events post into the channel as cards with a
  deep link back to the tab, turning the channel into the deal's activity feed.
- **Native Teams theming** — light / dark / high-contrast, with a deal-focused layout
  when the tab is pinned to a single deal channel.

![The Deal Room dashboard rendered inside Microsoft Teams](teams-app/docs/teams-dashboard.png)

## 🗂️ The deal areas — one workspace per stage

The app *is* the process: each phase of the buyout has its own workspace, and a deal
simply advances from one to the next, gated at every hand-off. Origination and
diligence are shown in depth below; execution, ownership and the fund roll-up follow
the same pattern.

### 1 · Origination & Screening — the funnel

| Area | What it does |
|---|---|
| **Deal Sourcing** | A CxO Signals explorer (M365 mail / chats / meetings + Dynamics 365 CRM), a News & Filings desk with an AI **catalyst classifier**, and Analyst Reports thesis context. |
| **Sourcing framework** | Fund Mandate *gates* · Investment Themes *guide* · Screens *rank* — a discover-to-score loop. |
| **Auto Screen → Triage** | Candidates are scored and triaged against the mandate. |
| **Screening Gate** | A decision desk where the MD records **PURSUE** on the gate-ready shortlist, creating a screened deal. |

![Stage 1 — Origination & Screening in the Teams tab](teams-app/docs/teams-stage1.png)

**Deep-dive analytics on any target.** Expand a candidate for a grounded workup —
**SEC EDGAR filings**, a Morningstar quality read, and an **AI-generated analyst
report** (sector outlook, competitive position, key risks, and a screening
recommendation) — all sourced live and cited:

![Stage 1 deep-dive — SEC filings and an AI-generated analyst report for a target](teams-app/docs/teams-stage1-analytics.png)

<sub>*Drilling into National CineMedia (NCMI): live SEC filings alongside an AI-generated analyst report — thesis, sector outlook, competitive position, key risks and a screening recommendation.*</sub>

> ⚡ **PURSUE** provisions the deal's collaboration space — a real **Teams channel**
> and a **SharePoint virtual data room** — via delegated Microsoft Graph, with a
> durable channel↔deal mapping that keeps the agent's context correct as deals scale.

### 2 · Diligence & Approval — the deal hub

| Area | What it does |
|---|---|
| **Launch** | Stands up the diligence workspace — DD checklist, playbook templates, and advisor-paired swimlanes, each node linking out. |
| **Diligence** | The agent works the deal across specialist personas, grounded in the live record and the data room. |
| **Synthesis** | Findings and risks roll up for the investment committee. |
| **Approval & Execution → Archive** | The MD / partner records the decision; the deal is executed and archived. |

![Stage 2 — Diligence & Approval in the Teams tab](teams-app/docs/teams-stage2.png)

### 3 · Execution — sign & close

| Area | What it does |
|---|---|
| **IC & terms** | The IOI/LOI, the IC-readiness verdict, and the approved investment case carried into execution. |
| **Signing (SPA)** | Legal execution — SPA, reps & warranties and conditions to close — led by the General Counsel persona. |
| **Financing** | The debt package — sources & uses, leverage and covenant headroom — with the Fund CFO. |
| **Close & hand-off** | Completion, then a clean hand-off into ownership and the 100-day plan. |

### 4 · Value & Exit — own & realise

| Area | What it does |
|---|---|
| **Value creation** | The 100-day plan and quantified levers, tracked on an **EBITDA bridge** vs entry, with the Operating Partner. |
| **Portfolio monitoring** | Current **MOIC / IRR**, KPIs vs plan, the add-on pipeline, and LP-ready board packs. |
| **Exit** | **Exit-readiness** scoring and a dual-track exit recommendation to the exit committee. |

### Fund & Portfolio — the LP lens

A fund-level roll-up across every owned company: **DPI · TVPI · RVPI**, deployed vs dry
powder, and concentration vs LPA limits — the executive value dashboard.

## 🏛️ The lifecycle behind the areas

Behind those workspaces sits the complete institutional mid-market buyout process —
**15 stages across 3 phases**, with the six **decision gates** (⛔) where capital &
resources are committed. Each stage names the accountable **persona** and the artifacts
it produces (`GET /api/lifecycle`).

| Phase | Stages | Gates |
|---|---|---|
| **1 · Origination & Screening** | Fund mandate · Sourcing · Screening & triage | ⛔ **PURSUE** |
| **2 · Diligence & Execution** | NDA/data-room · Confirmatory DD + QoE · Financing · Closing | ⛔ **IOI** · ⛔ **LOI** · ⛔ **IC** · ⛔ **Signing** |
| **3 · Ownership & Exit** | Value creation & 100-day · Monitoring & add-ons | ⛔ **Exit** |

### Decision artifacts
Each deal carries the artifacts a PE IC actually decides on — derived from the live
record, callable by the agents (`get_returns` / `get_value_creation` / `get_risk_register`),
and shown in the deal's **Decision artifacts** tab:

- **LBO / returns** (`/api/deals/:id/returns`) — entry multiple, leverage, **sources & uses**, base/upside/downside **IRR & MOIC**, and an exit-multiple × EBITDA-CAGR **sensitivity grid** vs the 20% / 2.0x hurdle. Exportable to **Excel**.
- **Value-creation plan** (`/api/deals/:id/value-creation`) — the **EBITDA bridge**, quantified levers with owner + timeline, and the **100-day plan**.
- **Risk register** (`/api/deals/:id/risk-register`) — every open risk across the lanes with severity × likelihood, mitigation and owner (red/amber/green).
- **IOI / LOI** (`/api/deals/:id/ioi` · `/loi`) — the non-binding indication and letter of intent, with valuation, structure and exclusivity.

### Free, keyless market data
For demos without a paid provider, the platform supplements the seeded record with
**real, keyless** data: **SEC EDGAR / XBRL** fundamentals (`/api/company/:name/fundamentals` — a Morningstar-quality substitute, also the automatic "quality" read when Morningstar isn't connected), **GLEIF** entity & ownership (`/api/entity/:name/lei`), and **GDELT** news (`/api/news/gdelt`). See `/api/providers/keyless`.

### Persistence — Cosmos is optional
The app persists through a single seam ([`app/lib/repo`](app/lib/repo)) with a pluggable
`DEALROOM_STORE` driver:

| Driver | Backend | When |
|---|---|---|
| **`blob`** *(default on `azd`)* | one JSON blob per document on the **existing data storage account** — no new resource, no Cosmos | demos / PoCs / lean deploys |
| `cosmos` | Azure Cosmos DB for NoSQL (serverless) | production / high-concurrency |
| `memory` | in-process | local dev |

With `storeDriver=blob` the Bicep **does not provision Cosmos at all** — no account, no
private endpoint, no cost. Switch to `cosmos` only when you need it.

## 🔐 Identity-aware access (RBAC)

Every answer — and every action — is scoped to **who is asking**, resolved server-side
so a client can never widen its own powers. Access resolves on **two tiers**:

- **Status tier — pipeline awareness for everyone.** Every role sees the *metadata* of
  every non-confidential deal (company, sector, size, stage, status, IC readiness).
  Analysts get a clean **status-only view** of post-screening deals — never a dead-end
  lock.
- **Content tier — the workspace, on need-to-know.** The confidential workspace
  (financials, diligence findings, signed terms, valuations, documents and the agents)
  opens to the **deal-team role**, **admins**, or **anyone named on that deal's team**.

| Role | Agents | Deal metadata | Deal workspace | Write |
|---|---|---|---|---|
| **Administrator** | **all 10** | every deal | every deal | ✓ |
| **Partner** | all 10 | every deal | every deal | ✓ |
| **Deal team** | 8 | every deal | every deal | ✓ |
| **Analyst / Member** | 1 | every deal *(status)* | only deals they're **named on** | read-only |

- **Deal-team need-to-know** — add a user to a specific deal's team (`deal.team`) and
  they get the **full** workspace for *that* deal regardless of their role tier — true
  least-privilege, deal by deal.
- **Confidential deals** — flag a deal `confidential` and it disappears from the status
  tier entirely: only its named team and admins even know it exists. Built for
  take-privates under NDA, carve-outs on a clean-team protocol, or a live exit.
- **Role-based agent routing** — the orchestrator surfaces *only* the agents a role may
  call; an Administrator can call **every** agent.
- **Hierarchy “view-as-down”** — a senior role can preview the room **as any lower
  role**, and **never** upward — so it can't self-elevate.
- **Graceful downgrade** — an unauthorised persona request is quietly narrowed to a
  read-only analyst view rather than refused, so the conversation keeps flowing.

![Role-gated access in the Teams tab](teams-app/docs/teams-rbac.png)

<sub>*Viewing as an Analyst, a post-screening deal shows a status-only summary — the full financials, findings and terms stay with the deal team, and confidential deals don't appear at all — while a partner, admin or a **named deal-team member** sees the whole record.*</sub>

### Demo profiles — the whole access model, in one click

Flip on `deployDemoProfiles` (`azd env set DEPLOY_DEMO_PROFILES true`) and the tab's
**“sign in as”** switcher is seeded with one named profile per role, so the model is
demoable without provisioning a single user. Every profile is enforced end-to-end by
the orchestrator — the switcher even shows how many agents each identity may call:

| Profile | Role | Agents |
|---|---|---|
| **Sam Rivera** — Platform Administrator | admin | **10** · view-as any role |
| **Eleanor Bishop** — Partner / Deal Sponsor | partner | **10** |
| **Marcus Feld** — Principal / Deal Lead | deal-team | 8 |
| **James Whitfield** — Retail MD | deal-team | 8 |
| **Dr. Priya Nair** — AI MD | deal-team | 8 |
| **Diego Marquez** — Supply Chain MD | deal-team | 8 |
| **Rachel Nguyen** — Operating Partner | deal-team | 8 |
| **David Osei** — Fund CFO | deal-team | 8 |
| **Priya Raman** — General Counsel | deal-team | 8 |
| **Sofia Marchetti** — Investor Relations | partner | **10** |
| **Maya Olsen** — Analyst | analyst | 1 · read-only |

> 🕵️ **Need-to-know, live in the demo.** The seeded pipeline ships with **confidential
> deals** — a take-private under NDA, a carve-out on a clean-team protocol, and a live
> exit — plus a real **need-to-know grant**. Sign in as **Maya (Analyst)** and the wider
> pipeline is **status-only**, the confidential take-private and exit are **invisible**,
> yet she gets the **full** workspace on the two deals she's *named on* — including the
> confidential carve-out. Switch to **Eleanor (Partner)** or **Sam (Admin)** and every
> deal opens. No code, no redeploy — just the switcher.

**Demo Mode is a live switch, too.** `deployDemoProfiles` sets the initial state (and,
in a production deploy, hard-disables it), but an administrator can flip Demo Mode
off/on at runtime from **Settings → Access administration** — with it off, the “view
as” switcher and showcase personas disappear and every user sees only their own role
and identity. Only the Entra object IDs you supply in the harness then apply.

## Under the hood — one backend, two surfaces

A single application, a single source of truth, presented through two complementary
tiers that run side by side:

| Tier | Container app | Role |
|---|---|---|
| **Deal Room (API + data)** | `ca-dealhub-orch-*` (image `deal-room`) | The API / data / MCP plane — the pluggable store (**blob-per-document by default**, Cosmos DB optional), the MCP server, Foundry agents, and Microsoft Graph provisioning. **The only tier that holds data**; no bundled web client. |
| **Deal Room console (Teams + web)** | `ca-dealhub-teams-*` (image `deal-room-teams`) | The user-facing console — the Teams channel tab + conversational bot, and the *same* console served as a **standalone web app**. Holds **no data**; every read/write forwards to the orchestrator over `/api`. |

> **One console, two surfaces — not a duplicated app.** The console tier proxies all
> data to the one backend (`SHARED_BACKEND_URL`), so there's a single data source and
> nothing to keep in sync. The *same* console renders natively inside a Teams channel
> and as a standalone web app over the *same* deal record.

**Teams platform capabilities used** — Entra **SSO** (tab per-user context) · **Bot
Framework** conversational bot (single-tenant) with a Teams channel · **channel tabs** ·
**Adaptive Cards** proactive alerts · **deep links** back to the tab · **org app
catalog** distribution & install · per-deal **Teams channels** + **SharePoint** data
rooms · an **MCP** endpoint that lets **M365 Copilot** and hosted agents call the same
grounded deal tools.

### Why it matters

- **Zero context-switching** — Q&A, diligence, and approvals happen in the channel the
  deal team already lives in; adoption doesn't hinge on opening a separate app.
- **Grounded and current** — the bot and tab read the live record through one backend,
  so there's no stale copy or "which version?" ambiguity.
- **Least-privilege by identity** — specialists, Stage-2 data, and write actions are
  scoped to the requester's role.
- **Auditable deal spaces** — each deal gets its own channel + SharePoint data room.
- **Portable accelerator** — the whole experience is parameterised Bicep; a new tenant
  stands it up from app registrations + a handful of parameters.

## Repository layout

```
.
├── app/                    The API / data / MCP service (Node/Express) — no web client
│   ├── lib/                AI client, agents, pluggable store, MCP server, Graph, fund/portfolio engine
│   ├── data/               Lifecycle & flow, personas, deals, sourcing framework, owned portfolio
│   ├── scripts/            Foundry agent provisioning (create_agent.py template + persona agents)
│   ├── mcp/                Deal MCP server OpenAPI + Copilot Studio guide
│   └── Dockerfile          Multi-stage build (deps → runtime)
├── teams-app/              The Teams interface tier (thin front end; holds no data)
│   ├── tab/                Teams-native + standalone web console (React + Vite)
│   ├── server/             SSO/OBO, bot (Bot Framework), backend proxy, Adaptive Cards
│   ├── manifest/           Teams app manifest + build script
│   └── Dockerfile          Multi-stage build (tab → server → runtime)
├── infra/                  Azure IaC — subscription-scoped, domain-split into 6 resource groups
│   ├── main.bicep          Orchestrator + modules/ (core · ai · data · app · integration · network)
│   └── main.{dev,test,prod,sample}.bicepparam
├── docs/                   Architecture, deployment checklist, demo runbook & walkthrough
├── scripts/                Deploy + Entra-provisioning + azd hooks
└── .github/workflows/      OIDC CI/CD for infra and app
```

## Run locally

```powershell
cd app
npm install
$env:PORT = 8080
node server.js                  # http://localhost:8080/api  (demo mode without a Foundry endpoint)
```

The API runs in **demo mode** out of the box (seeded AI responses). The user console
lives in `teams-app/` (build the tab with `npm run build:tab`; it runs in Teams and as
a standalone web console). Set
`AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_DEPLOYMENT` to point at a deployed Foundry
model for live inference.

## Deploy to Azure

The Bicep is **subscription-agnostic** — pick the subscription at deploy time.

```powershell
az group create -n rg-dealroom-dev-swc -l swedencentral
az deployment group create -g rg-dealroom-dev-swc \
    -f infra/main.bicep -p infra/main.dev.bicepparam
# then build & push the app image to the created ACR and point the Container App at it
```

See `infra/README.md` and `app/README.md` for the full details, and
`app/graph/README.md` for the Microsoft Graph mailbox-signals setup.

## Notes

- Authentication is via **managed identity** end to end — there are no secrets in
  this repository.
- Microsoft 365 / Copilot, Dynamics 365, SharePoint and Purview are SaaS /
  tenant-level and are configured via licensing / admin portals, not by Bicep.
