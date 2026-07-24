# Deployment checklist — customer / delivery

A practical, step-by-step checklist to stand up The Deal Room in a customer (or
your own) Azure subscription. For the full narrative see the [README](../README.md).

> **TL;DR:** demo in one command — `azd up`. Everything below is optional
> hardening for a customer-grade deployment.

### Two deployment paths (pick one)

| Path | Command | Images | Entra apps | Foundry agents | Best for |
|---|---|---|---|---|---|
| **A · azd** *(canonical, one-command)* | `azd up` | built + pushed automatically (`azure.yaml` services, ACR remote build) | `postprovision` hook (full mode) | `postdeploy` hook | demos, fresh customer envs |
| **B · scripted** *(what the live dev env uses)* | [`scripts/deploy.ps1`](../scripts/deploy.ps1) → `az deployment sub create` | **rolled manually** after infra (`az acr build` + `az containerapp update`) | [`scripts/provision-entra.ps1`](../scripts/provision-entra.ps1) (idempotent) | run the `app/scripts/create_*_agent.py` scripts | granular control, air-gapped/CI, param-file (`*.bicepparam`) deploys |

Both deploy the **same** `infra/main.bicep`. Path A reads `infra/main.parameters.json`
(azd env-var substitution, e.g. `${DEALROOM_STORE=blob}`); Path B reads a `*.bicepparam`
(e.g. `infra/main.dev.bicepparam`). Steps 1–3 apply to both; Step 4 splits by path.

---

## 1 · Prerequisites

- [ ] **Azure subscription** with `Owner` (or `Contributor` + `Role Based Access Control Administrator`).
- [ ] **Azure CLI ≥ 2.60** + **Bicep** (`az bicep install`) and **Azure Developer CLI (azd)**.
- [ ] **Region** with Azure AI Foundry + Container Apps (default `swedencentral`).
- [ ] *(full mode only)* **Entra admin** (Application Administrator / Global Administrator) to create the app registrations.
- [ ] *(agents)* **Python 3.10+** with `az login` as an identity that has **Foundry data-plane** access.
- [ ] *(optional)* Microsoft **Fabric** capacity admin (only if binding live market intel) and an **APIM publisher email** (only if `deployApim=true`).

## 2 · Choose your mode

- [ ] **Demo** *(default)* — seeded data, deterministic agents, **no identity, no admin**. One `azd up`.
- [ ] **Full** — Teams SSO / per-user M365 docs / bot. `azd env set DEALROOM_MODE full` (needs an Entra admin).

## 3 · Choose your options (azd env)

```bash
azd env new <env-name>
azd env set AZURE_LOCATION swedencentral
```

- [ ] **Persistence** — `DEALROOM_STORE=blob` *(default, lean — no Cosmos)* or `cosmos` *(production)*.
- [ ] **Demo profiles** — `DEPLOY_DEMO_PROFILES=true` for showcase identities; **`false` for production**.
- [ ] **Foundry agents** — provisioned automatically; skip with `DEALROOM_AGENTS=false`.
- [ ] **Roles harness** — supply your Entra object IDs (users **or** groups):
      `ADMIN_IDS`, `PARTNER_IDS`, `DEAL_TEAM_IDS`, `ANALYST_IDS` (leave empty for open/demo).
- [ ] *(optional)* `deployFabric`, `deployApim`, `enablePrivateEndpoints`, `keyVaultPurgeProtection`.

## 4 · Deploy

**Path A — azd (canonical):**

- [ ] `azd up` — provisions infra, builds + pushes both images (orchestrator + teams), deploys, and provisions the Foundry agents (`postdeploy` hook).
- [ ] *(full mode)* run `azd up` a **second time** to wire the Entra apps the `postprovision` hook created.

**Path B — scripted (`deploy.ps1`, what the live dev env uses):**

- [ ] `./scripts/deploy.ps1 -Mode <demo|full> -Identity provision -EnvironmentName <env>` — runs `az deployment sub create`, then (full mode) `provision-entra.ps1` + a second wiring deploy.
- [ ] **Roll the images** (the infra deploy uses a placeholder image by design):
      ```powershell
      az acr build -r <acr> -t deal-room:v1       ./app
      az acr build -r <acr> -t deal-room-teams:v1  ./teams-app
      az containerapp update -n ca-<workload>-orch-<env>-swc  -g rg-<workload>-app-<env>-swc --image <acr>/deal-room:v1
      az containerapp update -n ca-<workload>-teams-<env>-swc -g rg-<workload>-app-<env>-swc --image <acr>/deal-room-teams:v1
      ```
- [ ] **Provision the Foundry agents** (if not using the azd hook): run the `app/scripts/create_*_agent.py` scripts while `az login`'d with Foundry data-plane access (the generated `*.env` files carry the agent IDs).

## 5 · Package & upload the Teams app  *(full mode)*

- [ ] Build the sideloadable package: `python teams-app/scripts/build_manifest.py` — generates `manifest.json` + icons and zips them, injecting the deployed **teams FQDN** (and MCP host) into `validDomains` / tab + bot config.
- [ ] **Sideload** the zip to a Teams channel (or publish to the org app catalog; set `teamsAppCatalogId` for a managed rollout).
- [ ] Confirm the **bot messaging endpoint** and Entra **redirect URIs** point at the deployed teams FQDN (the provisioning step sets these from the infra outputs).

## 6 · Post-deploy verification

- [ ] Orchestrator healthy: `GET https://<orchestrator-fqdn>/api/analytics` returns deals.
- [ ] Lifecycle live: `GET /api/lifecycle` returns 15 stages / 6 gates.
- [ ] Agents present: `GET /api/persona-agents` lists the agents (10 when provisioned).
- [ ] Console loads: open `https://<teams-fqdn>/` (standalone web console) or the Teams tab.
- [ ] *(demo)* the "sign in as" switcher shows the demo profiles; RBAC filters agents per role.
- [ ] *(full)* Teams SSO signs in; M365 document generation and the bot work.

## 7 · Security review (before going live)

- [ ] `DEPLOY_DEMO_PROFILES=false` and real Entra IDs supplied in the roles harness.
- [ ] Review the four Entra app registrations + consented Graph scopes (Teams SSO, M365 connector, bot, MCP).
- [ ] Confirm managed-identity RBAC (no keys in the app); rotate any deploy-time secrets.
- [ ] *(hardened)* set `enablePrivateEndpoints=true` and `keyVaultPurgeProtection=true`. Enabling private endpoints **recreates the Container Apps env** (new FQDNs) — follow the staged cutover runbook in [OPERATIONS-PLAN.md § VNet integration](OPERATIONS-PLAN.md#2-vnet-integration--remove-the-cosmos-public-access-dependency) (capture/recovery checklist + phases).
- [ ] Confirm Content Safety (`CONTENT_SAFETY_ENDPOINT`) if required by policy.
- [ ] Review agent **data sovereignty** (internal-data vs external-web isolation) — [DATA-SOVEREIGNTY.md](DATA-SOVEREIGNTY.md).

## 8 · Operations (post-go-live)

- [ ] **Cost / power** — one-command sleep/wake + nightly auto-sleep + Log Analytics cap: see [OPERATIONS-PLAN.md § Cost optimization](OPERATIONS-PLAN.md#3-cost-optimization-no-functionality-compromise).
- [ ] **Least-privilege power role** — confirm the orchestrator's power-control identity holds the custom 4-action role, not Contributor ([OPERATIONS-PLAN.md § 1](OPERATIONS-PLAN.md#1-least-privilege-power-control--implemented)).

## 9 · Hand-off & teardown

- [ ] Document the env name, region, resource groups (`rg-<workload>-{core,ai,data,app,integration,network}-<env>-<loc>`) and the FQDNs.
- [ ] Tear down when finished: `azd down --purge` (Path A) or delete the resource groups / `az deployment sub` stack (Path B).

---

### Notes for delivery teams
- Deploy into a **fresh env** per customer/demo (`azd env new`) to keep resources isolated.
- Nothing in this repo contains customer or our-tenant identifiers — all specifics come from **your** azd env / parameters.
- The lean **blob** store keeps demo cost minimal and avoids Cosmos entirely.
