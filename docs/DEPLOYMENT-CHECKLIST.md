# Deployment checklist — customer / delivery

A practical, step-by-step checklist to stand up The Deal Room in a customer (or
your own) Azure subscription. For the full narrative see the [README](../README.md).

> **TL;DR:** demo in one command — `azd up`. Everything below is optional
> hardening for a customer-grade deployment.

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

- [ ] `azd up` — provisions infra, builds + pushes the two images, deploys, and provisions the Foundry agents.
- [ ] *(full mode)* run `azd up` a **second time** to wire the Entra apps the postprovision hook created.
- [ ] *(no azd)* alternative: `./scripts/deploy.ps1` / `./scripts/deploy.sh` (same flow, guided).

## 5 · Post-deploy verification

- [ ] Orchestrator healthy: `GET https://<orchestrator-fqdn>/api/analytics` returns deals.
- [ ] Lifecycle live: `GET /api/lifecycle` returns 15 stages / 6 gates.
- [ ] Agents present: `GET /api/persona-agents` lists the agents (10 when provisioned).
- [ ] Console loads: open `https://<teams-fqdn>/` (standalone web console) or the Teams tab.
- [ ] *(demo)* the "sign in as" switcher shows the demo profiles; RBAC filters agents per role.
- [ ] *(full)* Teams SSO signs in; M365 document generation and the bot work.

## 6 · Security review (before going live)

- [ ] `DEPLOY_DEMO_PROFILES=false` and real Entra IDs supplied in the roles harness.
- [ ] Review the four Entra app registrations + consented Graph scopes (Teams SSO, M365 connector, bot, MCP).
- [ ] Confirm managed-identity RBAC (no keys in the app); rotate any deploy-time secrets.
- [ ] *(hardened)* set `enablePrivateEndpoints=true` and `keyVaultPurgeProtection=true`.
- [ ] Confirm Content Safety (`CONTENT_SAFETY_ENDPOINT`) if required by policy.

## 7 · Hand-off & teardown

- [ ] Document the env name, region, resource groups (`rg-<workload>-{core,ai,data,app,integration,network}-<env>-<loc>`) and the FQDNs.
- [ ] Tear down when finished: `azd down --purge` (removes all resources).

---

### Notes for delivery teams
- Deploy into a **fresh env** per customer/demo (`azd env new`) to keep resources isolated.
- Nothing in this repo contains customer or our-tenant identifiers — all specifics come from **your** azd env / parameters.
- The lean **blob** store keeps demo cost minimal and avoids Cosmos entirely.
