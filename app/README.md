# The Deal Room — orchestrator (API · data · MCP)

The **orchestrator** is the Deal Room's API, data and MCP service — the only tier
that holds data. It has **no bundled web client**: the user console is the Deal
Room Teams app (`../teams-app/`), which also runs as a standalone web console.
This service exposes the deal record, the specialist **agents**, the decision
**artifacts**, the **MCP** tool surface, and the Microsoft Graph provisioning
that stands up each deal's Teams channel + SharePoint data room. It runs in the
orchestrator Container App provisioned by `../infra/main.bicep`.

> The customer-facing narrative (features, deploy, customize, demo) is in the
> [root README](../README.md); this doc is the service reference.

## The deal model

The demo **spine** is two stages joined by the **PURSUE** gate (nine steps); the
full institutional **lifecycle** (15 stages across 3 phases with six decision
gates) is modelled in `data/flow.js` and served at `GET /api/lifecycle`:

```
Stage 1 · Origination & Screening   (the screening funnel)
  O1 Deal Sourcing → O2 Auto Screen → O3 Triage → O4 Screening Gate
        ⚡ PURSUE — Power Automate spins up the deal collaboration space
Stage 2 · Diligence & Approval      (the Deal Collaboration Hub on M365)
  1 Launch → 2 Diligence → 3 Synthesis → 4 Approval & Execution → 5 Archive
```

## How it works

Running a step's agent produces a **cited** artifact on the live record, updates
the deal (diligence lanes, IC memo, compliance), tallies **hours saved**, lifts
the **IC readiness** score and pulls the **IC date** forward — making the
time-to-IC value explicit at every step. Advancing past **O4** triggers the
**PURSUE** gate: the collaboration space (Teams channel + SharePoint data room)
spins up and the deal crosses into Stage 2.

## What the service does

- **Sourcing & screening (Stage 1)** — CxO signals (M365 mail/chats/meetings +
  D365 CRM), a news & filings desk with an AI **catalyst classifier**,
  third-party analyst-report thesis context, and the **sourcing framework**:
  Fund Mandate (GATE) → Investment Theme (GUIDE) → Screen (RANK). Targets that
  breach the mandate are excluded, never scored; survivors are gate-passed then
  screen-ranked (`lib/scoring.js`, `data/mandates.js`).
- **Ten specialist agents** — a Deal Orchestrator plus Analyst, Partner,
  Principal, three sector MDs, Operating Partner, Fund CFO, General Counsel and
  Investor Relations. Each is a Foundry agent that reads the live pipeline
  through the read-only MCP tools, **governed by the requester's role**
  (`lib/userPolicy.js` + `lib/personaPolicy.js` + `lib/personaAgent.js`).
- **Decision artifacts** — LBO/returns (IRR/MOIC + sensitivity), value-creation /
  100-day plan, risk register, IOI/LOI drafts, and the **IC readiness** board
  (the seven questions an IC actually asks + a READY / CONDITIONAL / NOT-READY
  verdict) — all derived from the live record and callable by the agents
  (`lib/diligence.js`, `lib/store.js`).
- **Market intelligence** — grounded in the fund's **Microsoft Fabric / OneLake**
  data (comparable & historical deals, IC voting precedents, benchmark findings)
  via `lib/fabric.js`; falls back to a materialised snapshot when direct SQL
  isn't bound (`FABRIC_LIVE`). Cosmos/blob remains the deal system-of-record.
- **Free, keyless data** — SEC EDGAR/XBRL fundamentals (a Morningstar
  substitute), GLEIF entity/ownership and GDELT news (`lib/providers`,
  `lib/filings.js`) — no paid data licences required.
- **M365 document generation** — per-user Word IC memos + Excel deal/returns
  models, downloaded or published to the deal's SharePoint data room
  (`lib/m365/office.js`).

## Persistence

State goes through one seam (`lib/repo`) with a pluggable `DEALROOM_STORE`
driver: **`blob`** (lean blob-per-document, the default — no Cosmos), `cosmos`
(Azure Cosmos DB for NoSQL) or `memory` (local dev). The governed record carries
an append-only audit trail; the operational primitives (issues, conditions,
assumption snapshots) persist and write audit events.

## Architecture

- **API / data / MCP** — Node.js / Express (ESM). Exposes the deal record, persona
  quick-actions, the Deal Orchestrator chat and the MCP tool surface. No bundled web
  client — the user console is the Deal Room Teams app (`teams-app/`), which also runs
  as a standalone web console.
- **AI** — calls the deployed **Azure AI Foundry** `gpt-4o` deployment via the
  OpenAI SDK using **managed identity** (`DefaultAzureCredential`). If no
  endpoint is configured it runs in **demo mode** with realistic seeded output,
  so the service is fully usable offline.

```
app/
  server.js            Express API / data / MCP host
  lib/      ai.js      Foundry (Azure OpenAI) client, live-or-demo
            agents.js   step runner — produces cited artifacts per flow step
            scoring.js  sourcing-framework engine — gate + screen scoring + nesting validation
            store.js    in-memory state: deals, journey, signals, framework, scoring
            graph.js    Microsoft Graph webhook receiver (O1 mailbox signals)
  data/     flow.js      the deal spine + full 15-stage lifecycle (`/api/lifecycle`)
            personas.js  persona / lane metadata
            deals.js     seeded deals
            signals.js   O1 CxO signals (mailbox: emails/chats/meetings + CRM)
            news.js      O1 news & filings desk (tiered sources, catalysts, per-company news/filings/quality + financials)
            research.js  O1 analyst reports — thesis context per company (sector/competitive/sell-side)
            mandates.js  sourcing framework — fund mandate (gate) + themes (guide) + screens (rank)
  Dockerfile           multi-stage build (deps → runtime)
```

## Run locally (see it today)

```powershell
cd app
npm install
npm start                 # API on http://localhost:8080/api
```

Open <http://localhost:8080/api/analytics>. With no Azure variables set it runs in
**demo mode**. To use the live model locally, `az login` and set:

```powershell
$env:AZURE_OPENAI_ENDPOINT = "https://<your-foundry>.cognitiveservices.azure.com/"
$env:AZURE_OPENAI_DEPLOYMENT = "gpt-4o"
npm start
```

## Configuration (environment variables)

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | HTTP port | `8080` |
| `AZURE_OPENAI_ENDPOINT` | Foundry/Azure OpenAI endpoint; unset ⇒ demo mode | — |
| `AZURE_OPENAI_DEPLOYMENT` | Model deployment name | `gpt-4o` |
| `AZURE_OPENAI_API_VERSION` | API version | `2024-10-21` |
| `AZURE_OPENAI_API_KEY` | Optional key (prefer managed identity) | — |
| `AZURE_CLIENT_ID` | User-assigned identity client id for `DefaultAzureCredential` | — |

In Azure these are set automatically on the Container App by `infra/main.bicep`.

## Deploy to Azure

The orchestrator Container App, its ACR, and the Foundry env wiring are created
by `infra/main.bicep`. To ship the app image:

1. Deploy infra (see `../infra/README.md`).
2. Push the image and roll it out — automated by
   `../.github/workflows/deal-room-app.yml`, or manually:

```powershell
$RG = "rg-dealhub-app-dev-swc"
$ACR = az acr list -g $RG --query "[0].name" -o tsv
$LOGIN = az acr list -g $RG --query "[0].loginServer" -o tsv

# Server-side build (no local Docker needed)
az acr build -r $ACR -t deal-room:latest ./app

# Roll out
az containerapp update -n ca-dealhub-orch-dev-swc -g $RG --image "$LOGIN/deal-room:latest"
```

> The Container App starts on the placeholder image until the first app rollout.
> A full infra stack redeploy resets the image to the placeholder — re-run the
> app workflow (or the commands above) to restore the Deal Room image.

## API surface

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/health` | Liveness probe |
| GET | `/api/config` | AI mode (live/demo), model, region |
| GET | `/api/flow` | The end-to-end deal flow (stages, 9 steps, PURSUE gate) |
| GET | `/api/deals`, `/api/deals/:id` | Deal list + full deal record (with journey position) |
| POST | `/api/deals/:id/steps/:stepKey/run` | Run a step's orchestration agent → cited artifact |
| POST | `/api/deals/:id/advance` | Advance the deal to the next step (crosses the gate) |
| POST | `/api/deals/:id/back` | Move the deal back a step |
| GET | `/api/signals/mailbox`, `/api/signals/companies` | O1 CxO signals (M365 data + grouped signals) |
| GET | `/api/signals/companies/:id/crm` | Dynamics 365 CRM relationship lookup |
| GET | `/api/news/desk` | O1 news & filings desk (L1, tiered sources, catalysts, companies) |
| POST | `/api/news/find-more` | Surface the next discovered company (agent-classified) |
| POST | `/api/news/findings/:id/catalyst` | Manually reassign a finding's catalyst |
| POST | `/api/news/sources/:id/test` | Test a source's connectivity |
| GET | `/api/research` | O1 analyst reports — thesis context attached to each discovered company |
| GET | `/api/framework`, `/api/targets/scored` | Sourcing framework (fund gate · themes · screens) + gated, screen-ranked targets |
| POST | `/api/screens/:id/select` | Select / deselect a screen for ranking |
| POST | `/api/themes/:id/select` | Toggle every screen under a theme |
| PATCH | `/api/screens/:id` | Edit a screen's criteria (validated to nest within its theme + fund gate) |
| POST | `/api/screens` | Create a new screen under a theme (nesting-validated) |
| POST/GET | `/api/graph/notifications`, `/api/graph/signals` | Graph mailbox webhook (see `graph/README.md`) |

> The full route list (lifecycle, per-deal artifacts, persona agents, access,
> keyless data providers) is discoverable from the running service; the MCP tool
> surface is served at `/mcp` (read/write) and `/mcp-ro` (read-only for agents).
