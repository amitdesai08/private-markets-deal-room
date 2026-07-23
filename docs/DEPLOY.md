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
| 3 | **Region** with AI Foundry + Container Apps | default `swedencentral` (EU residency) |
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
- **Full** (Teams SSO / per-user M365 docs / bot) — `azd env set DEALROOM_MODE full`, then `azd up` (creates + registers the Entra apps via the postprovision hook) and `azd up` **once more** to wire them in. Needs an Entra admin.
- **Foundry agents** — `azd up` also provisions the **Deal Orchestrator, News Scout and the ten persona agents** into your Foundry project (a `postdeploy` hook; best-effort, needs the `azure-ai-projects` Python SDK + Foundry data-plane access). Skip with `azd env set DEALROOM_AGENTS false`, or run [`app/scripts/create_persona_agents.py`](../app/scripts/create_persona_agents.py) by hand.

> **Foundry is fully in the template:** the Bicep provisions the **AI Foundry account + project, model deployments and Bing grounding**; the `postdeploy` hook creates the **agents** on top; and [`app/scripts/create_agent.py`](../app/scripts/create_agent.py) is a copy-and-edit **template to add your own** Foundry agent.

Pick region/subscription with `azd env new` then `azd env set AZURE_LOCATION swedencentral`.

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

## Customize & extend (agentic skills)

- **New agents** — copy [`app/scripts/create_agent.py`](../app/scripts/create_agent.py), edit the name + instructions, and run it to provision your own Foundry specialist agent (it gets the whole read-only research surface via the Deal MCP server automatically). Add its id to [`personaPolicy.js`](../app/lib/personaPolicy.js) / [`personaAgent.js`](../app/lib/personaAgent.js) / [`userPolicy.js`](../app/lib/userPolicy.js) to surface it as an RBAC-governed persona.
- **New personas & lanes** — add a persona to [`app/data/personas.js`](../app/data/personas.js) + the policy files; the lifecycle, RBAC and demo profiles pick it up.
- **New tools** — add a read tool to [`app/lib/mcp/dealServer.js`](../app/lib/mcp/dealServer.js) and every agent discovers it at runtime (no re-provisioning). The **Deal MCP server** (`/mcp`) is also the reusable tool surface for your own hosted / Copilot Studio agents.
- **New stages & artifacts** — extend the lifecycle in [`app/data/flow.js`](../app/data/flow.js) and add artifact builders in [`app/lib/diligence.js`](../app/lib/diligence.js).
- **Persistence** — pick the backend with `storeDriver` (`blob` = lean default, `cosmos` = production) behind the single [`app/lib/repo`](../app/lib/repo) seam.
- **Data** — replace the seeded record with your source of truth behind the single `/api` + store seam; wire your own providers alongside the keyless pack in [`app/lib/providers`](../app/lib/providers).
- **Surfaces** — the Teams tab is the *same build* as the standalone web console; add tabs/cards without touching the backend.

---

## Plain Bicep (subscription-agnostic)

Pick the subscription at deploy time:

```powershell
az group create -n rg-dealroom-dev-swc -l swedencentral
az deployment group create -g rg-dealroom-dev-swc \
    -f infra/main.bicep -p infra/main.dev.bicepparam
# then build & push the app image to the created ACR and point the Container App at it
```

See [infra/README.md](../infra/README.md) and [app/README.md](../app/README.md) for full
details, and [app/graph/README.md](../app/graph/README.md) for the Microsoft Graph
mailbox-signals setup.

> Authentication is via **managed identity** end to end — there are no secrets in this
> repository. Microsoft 365 / Copilot, Dynamics 365, SharePoint and Purview are SaaS /
> tenant-level and are configured via licensing / admin portals, not by Bicep.
