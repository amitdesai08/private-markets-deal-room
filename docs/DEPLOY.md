# Deploy guide

> Deploy [The Deal Room](../README.md) into your own Azure tenant. It ships as a
> **self-contained accelerator** — a parameterised **Bicep wiring harness** with **no manual
> configuration steps** to get running.
>
> See also: [How it works](HOW-IT-WORKS.md) · full infra runbook + `what-if`: [infra/README.md](../infra/README.md)

---

## Prerequisites

| # | Requirement | Notes |
|---|---|---|
| 1 | **Azure subscription** with `Owner` (or `Contributor` + `Role Based Access Control Administrator`) | subscription-scoped deploy creates resource groups **and** role assignments |
| 2 | **Azure CLI** ≥ 2.60 + **Bicep** | `az bicep install` |
| 3 | **Region** with Microsoft Foundry + Container Apps | default `swedencentral` (EU residency) |
| 4 | **Entra admin** (Application Administrator / Global Administrator) | to run [`scripts/provision-entra.ps1`](../scripts/provision-entra.ps1), which **auto-creates** the four app registrations (Teams SSO, M365 connector, bot, MCP) and grants admin consent. Prefer to pre-create them? Pass the IDs as parameters instead. **Optional** for a data-only demo. |
| 5 | **Container images** | build with `az acr build` after infra, then `az containerapp update --image <acr>/<repo>@sha256:<digest>` (or pass `orchestratorImage` / `teamsImage`) |
| 6 | *(optional)* **Microsoft Fabric** capacity admin | only when `deployFabric = true` |
| 7 | *(optional)* **APIM publisher email** | only when `deployApim = true` |

> **Demo / POC mode:** leave all identity + optional parameters empty and the platform runs on **seeded data** with deterministic agents — **no secrets required**.

---

## Deploy — `azd up` (recommended)

The fastest path is the **Azure Developer CLI**: one command provisions the infra, (optionally) creates the Entra apps, and **builds + pushes + deploys both container images** — no manual `az acr build`.

```bash
azd up
```
- **Demo** *(default)* — infra + seeded data + images. No identity, no admin needed → **one** `azd up`.
- **Full** (Teams SSO / protected standalone console / per-user M365 docs / bot) — `azd env set DEALROOM_MODE full`, then `azd up` (creates + registers the Entra apps via the postprovision hook) and `azd up` **once more** to wire them in. Needs an Entra admin. The standalone Teams Container App URL redirects unauthenticated users through Microsoft Entra; the embedded Teams tab continues to use Teams SSO.
- **Hosted IQ router** — `azd up` deploys the Responses v2 policy router from its nested Foundry project, binds its endpoint to the orchestrator, and retains the local policy as runtime fallback. The hook owns a companion azd environment named `<root-environment>-iq-router`; skip hosted deployment with `DEALROOM_HOSTED_ROUTER=false`.
- **Foundry agents** — `azd up` also provisions the **Deal Orchestrator, News Scout and the ten persona agents** into your Foundry project (a `postdeploy` hook; best-effort, needs the `azure-ai-projects` Python SDK + Foundry data-plane access). Skip with `azd env set DEALROOM_AGENTS false`, or run [`app/scripts/create_persona_agents.py`](../app/scripts/create_persona_agents.py) by hand.
- **Exact Fabric demo** *(optional and billable)* — opt in with `DEPLOY_FABRIC=true`, a non-empty `FABRIC_ADMIN_MEMBERS` JSON array, and `HYDRATE_FABRIC_DEMO=true`. The same postdeploy hook then hydrates the tracked simulation before it creates the Four-IQ agents. Requested hydration is release-blocking; optional agent provisioning stays best-effort.

> **Foundry is fully in the deployment:** Bicep provisions the **Microsoft Foundry account + project, model deployments, connections and Bing grounding**. The `postdeploy` hook deploys the hosted router through its Foundry-native nested project, then creates the prompt/persona agents on top. [`app/scripts/create_agent.py`](../app/scripts/create_agent.py) is a copy-and-edit **template to add your own** Foundry agent.

In full mode, Entra provisioning registers both the Teams SSO redirect and the
Container Apps Easy Auth callback:

- `https://<teams-fqdn>/auth-end.html`
- `https://<teams-fqdn>/.auth/login/aad/callback`

It also enables ID-token issuance for the confidential Easy Auth flow. Bicep
reuses the Teams SSO registration in a canonical deployment. A targeted update
to an existing topology may instead use a dedicated single-tenant web client
when the deployment identity cannot modify the existing Teams registration.
Bicep sets unauthenticated API access to `401`; the browser then starts the
Entra login redirect. Static bootstrap assets, health/config endpoints, and the
Bot Framework `/api/messages` endpoint remain excluded from that redirect boundary.

Pick region/subscription with `azd env new` then `azd env set AZURE_LOCATION swedencentral`.

### Reproduce the simulated Fabric view

Use an identity that administers the target Fabric capacity and can create Fabric
items under the tenant's Fabric/ontology settings:

```bash
azd env set DEPLOY_FABRIC true
azd env set FABRIC_ADMIN_MEMBERS '["<fabric-admin-object-id-or-upn>"]'
azd env set HYDRATE_FABRIC_DEMO true
azd env set FABRIC_WORKSPACE 'Deal Room Fabric IQ'
azd env set FABRIC_LAKEHOUSE deal_room_starter
azd up
```

The idempotent bootstrap owns five tables and proves their row counts are
15 companies, 12 deals, 59 diligence findings, 12 IC precedents, and 14 filing
metrics. It also proves all 12 deal and 14 filing links resolve to a company,
then publishes the Data Agent, Direct Lake model, ontology, and delegated Fabric
IQ endpoint. No customer files, M365 content, prompts, or secrets are copied.

Fabric F2 or higher is a paid resource. Leave `HYDRATE_FABRIC_DEMO=false` and
`FABRIC_ADMIN_MEMBERS=[]` for the default keyless demo. For rollback, disable
`FABRIC_LIVE` or restore the prior Container Apps revision; the app falls back to
the bundled snapshot. Suspend the Fabric capacity separately to stop compute
charges. The bootstrap preserves unrelated workspace items and lakehouse data.

---

## Deploy — guided script (no azd)

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

Prefer to run it by hand? The orchestrator just chains **`az deployment sub create`** → [`scripts/provision-entra.ps1`](../scripts/provision-entra.ps1) / [`.sh`](../scripts/provision-entra.sh) (idempotent; writes `entra.generated.bicepparam` + the secret params) → a wire re-deploy. Data-only demo needs no secrets:

```powershell
az deployment sub create --location swedencentral \
    --template-file infra/main.bicep --parameters infra/main.sample.bicepparam
```

---

## Roles — prefab or your own (the wiring harness)

Identity-aware access is a **parameter, not a configuration step**:

- **Prefab roles** — supply Entra **object IDs** (users *or* groups) for `adminIds`, `partnerIds`, `dealTeamIds`, `analystIds`. Access is enforced immediately, no code changes.
- **Your own roles** — edit [`app/lib/userPolicy.js`](../app/lib/userPolicy.js) (the single policy seam these parameters feed) to define custom roles, personas and permissions.
- **Open mode** — leave the arrays empty; `defaultAgentRole` applies to everyone.
- **Demo Mode** — set `deployDemoProfiles = true` (or `azd env set DEPLOY_DEMO_PROFILES true`) to seed one named showcase identity per role for an instant end-to-end demo, and to expose the in-app **Demo Mode** toggle (Settings → Access administration) so an admin can turn the "view as" switcher and showcase personas off/on live. **Off by default** in production. See the [Access model](ACCESS-MODEL.md).

---

## Demo data vs. a customer jumpstart

`deployDemoProfiles` (above) only controls the showcase **identities**. A separate flag controls the showcase **deals**: `seedDemoData` (or `azd env set SEED_DEMO_DATA false`) — **on by default**, so a bare `azd up` still demos out of the box with ~19 fake deals, candidates and a fake fund mandate.

For a customer jumpstart — deploying this platform for a real firm's use, not a demo — set `seedDemoData = false` before the first deploy. The store then boots empty instead of permanently persisting fake records into the customer's real Cosmos/blob account (the seeding is insert-if-missing, so it never overwrites work in progress, but it also never removes what it already wrote on an earlier boot — there's no "unseed" once `seedDemoData` was ever true against that store).

With an empty store, replace the seeded record with the firm's real data behind the same `/api` + store seam:

- **Deals, candidates, fund mandate** — connect your existing CRM / deal database (DealCloud, Salesforce, Allvue/eFront, or an internal system) from **Settings → Data sources → Connect your CRM / deal database** (admin only), then press **Sync now** to pull the pipeline in — matched to the Deal Room's record by connector + native id, so a re-sync never duplicates. Or load deals through the existing sourcing input methods ([`app/lib/store.js`](../app/lib/store.js)) directly, against the same shape as [`app/data/deals.js`](../app/data/deals.js) / [`app/data/candidates.js`](../app/data/candidates.js).
- **Live signals & market data** — wire real sources through the connector registry in [`app/lib/connectors.js`](../app/lib/connectors.js); see [Data integration](integration/DATA-INTEGRATION.md) for the full "adding a connector" checklist and the entity-resolution seam (`mergeIntel()` in [`app/lib/companies.js`](../app/lib/companies.js)).
- **System of record sync** (DealCloud, Salesforce, Allvue, etc.) — the same CRM connector above also pushes IC decisions back out automatically the moment a deal clears a gate (verdict, conditions, risk register, returns model), so the firm's CRM stays the book of truth for pipeline while the Deal Room stays the book of record for the decision. See [Data integration](integration/DATA-INTEGRATION.md) Part B for the full design and [`app/lib/sorSync.js`](../app/lib/sorSync.js) for the implementation.

---

## Customize & extend (agentic skills)

- **New agents** — copy [`app/scripts/create_agent.py`](../app/scripts/create_agent.py), edit the name + instructions, and run it to provision your own Foundry specialist agent (it gets the whole read-only research surface via the Deal MCP server automatically). Add its id to [`personaPolicy.js`](../app/lib/personaPolicy.js) / [`personaAgent.js`](../app/lib/personaAgent.js) / [`userPolicy.js`](../app/lib/userPolicy.js) to surface it as an RBAC-governed persona.
- **New personas & lanes** — add a persona to [`app/data/personas.js`](../app/data/personas.js) + the policy files; the lifecycle, RBAC and demo profiles pick it up.
- **New tools** — add a read tool to [`app/lib/mcp/dealServer.js`](../app/lib/mcp/dealServer.js) and every agent discovers it at runtime (no re-provisioning). The **Deal MCP server** (`/mcp`) is also the reusable tool surface for your own hosted / Copilot Studio agents.
- **New stages & artifacts** — extend the lifecycle in [`app/data/flow.js`](../app/data/flow.js) and add artifact builders in [`app/lib/diligence.js`](../app/lib/diligence.js).
- **Persistence** — pick the backend with `storeDriver` (`blob` = lean default, `cosmos` = production) behind the single [`app/lib/repo`](../app/lib/repo) seam.
- **Data** — set `seedDemoData = false` for a real deployment (see [Demo data vs. a customer jumpstart](#demo-data-vs-a-customer-jumpstart)), then replace the seeded record with your source of truth behind the single `/api` + store seam; wire your own providers alongside the keyless pack in [`app/lib/providers`](../app/lib/providers).
- **Surfaces** — the Teams tab is the *same build* as the standalone web console; add tabs/cards without touching the backend.

---

## Plain Bicep (subscription-agnostic)

Pick the subscription at deploy time:

```powershell
az group create -n rg-deal-room-dev -l swedencentral
az deployment group create -g rg-deal-room-dev \
    -f infra/main.bicep -p infra/main.dev.bicepparam
# then build & push the app image to the created ACR and point the Container App at it
```

See [infra/README.md](../infra/README.md) and [app/README.md](../app/README.md) for full
details, and [app/graph/README.md](../app/graph/README.md) for the Microsoft Graph
mailbox-signals setup.

> Authentication is via **managed identity** end to end — there are no secrets in this
> repository. Microsoft 365 / Copilot, Dynamics 365, SharePoint and Purview are SaaS /
> tenant-level and are configured via licensing / admin portals, not by Bicep.
