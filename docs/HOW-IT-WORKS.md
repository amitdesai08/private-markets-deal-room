# Runtime internals

The Deal Room has one backend, one deal record, and two presentation surfaces. This page names
the implementation boundaries; [Architecture](ARCHITECTURE.md) shows the complete flow.

## Services

| Service | Responsibility |
|---|---|
| **Teams/web console** | Authenticates the user and forwards requests; stores no business data |
| **Node backend** | Enforces access, serves API and MCP tools, dispatches agents, and records actions |
| **Microsoft Foundry** | Runs the policy router, purpose agents, models, and reusable IQ toolbox |
| **Microsoft Fabric** | Supplies governed business entities, analytics, and relationships |
| **Storage or Cosmos DB** | Persists deals, documents, approvals, and audit records |

## Request flow

1. The console sends the signed-in identity and request to the backend.
2. The backend resolves role, deal access, and effective scope server-side.
3. The policy router returns a bounded IQ route; it receives no source data.
4. The backend validates the route and either answers from the record, invokes one agent, or
   consults at most two purpose specialists.
5. A specialist may request one allow-listed peer review. The backend validates that hop and
   disables recursion.
6. The orchestrator synthesizes the answer and reports operational activity to the UI.

The activity trace contains routing, handoffs, sources, refusals, and synthesis. It does not
expose private model reasoning.

## Evidence boundaries

- **Foundry IQ** retrieves approved firm knowledge through the Azure AI Search knowledge-base
  MCP contract.
- **Fabric IQ** uses governed Fabric data, semantic models, and ontology relationships.
- **Work IQ** uses the signed-in user's Microsoft 365 permissions.
- **Web IQ** uses native public web search and receives no private deal or Microsoft 365 data.

The sovereignty guard refuses prompts that mix internal evidence with public-web research.
Canonical routes live in [`iqRegistry.js`](../app/lib/iqRegistry.js); enforcement lives in
[`agentSovereignty.js`](../app/lib/agentSovereignty.js). See [Access model](ACCESS-MODEL.md)
for role, need-to-know, and confidential-deal behavior.

## Assistant write-back & the audit trail

Agents propose deterministic actions grounded in deal state; they never mutate the record
directly. `POST /api/deals/:id/assistant-actions` rechecks caller identity, deal access, and write
permission before invoking the governed mutation. Every accepted change is attributed to the
signed-in user in the deal activity trail. Read-only or unauthorized callers receive `403`.

## Persistence — Cosmos is optional

**Why it matters:** run a full demo with no database to provision and no standing cost, then move to
a managed database only when production concurrency demands it.

The app persists through a single seam ([`app/lib/repo`](../app/lib/repo)) with a pluggable
`DEALROOM_STORE` driver:

| Driver | Backend | When |
|---|---|---|
| **`blob`** *(default on `azd`)* | one JSON blob per document on the existing data storage account — no new resource, no Cosmos | demos / PoCs / lean deploys |
| `cosmos` | Azure Cosmos DB for NoSQL (serverless) | production / high-concurrency |
| `memory` | in-process | local dev |

With `storeDriver=blob` the Bicep **does not provision Cosmos at all**. Switch to `cosmos`
only when you need it.

---

## Operations and code map

Power controls and cost behavior are documented in
[Operations](operations/OPERATIONS-PLAN.md). The main implementation areas are:

| Area | Location |
|---|---|
| Backend, agents, MCP, and tests | [`app/`](../app/) |
| Teams and web console | [`teams-app/`](../teams-app/) |
| Hosted policy router | [`hosted-agents/iq-router/`](../hosted-agents/iq-router/) |
| Infrastructure | [`infra/`](../infra/) |
| Agent skills | [`skills/`](../skills/) |

## Run locally

```powershell
cd app
npm install
$env:PORT = 8080
node server.js                  # http://localhost:8080/api  (demo mode without a Foundry endpoint)
```

The API runs in **demo mode** out of the box (seeded AI responses). The user console lives in
`teams-app/` (build the tab with `npm run build:tab`; it runs in Teams and as a standalone web
console). Set `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_DEPLOYMENT` to point at a deployed
Foundry model for live inference.

> Ready to ship it? See the [**Deploy guide**](DEPLOY.md).
