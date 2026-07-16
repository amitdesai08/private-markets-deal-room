# Operations plan — networking, least-privilege power control & cost

This plan captures three operational workstreams for The Deal Room's Azure
deployment:

1. **Least-privilege power control** — the minimum permission for the Teams
   sleep/wake feature *(implemented)*.
2. **VNet integration** — a durable fix for the Cosmos public-access dependency.
3. **Cost optimization** — no-functionality-compromise savings, ranked.

> Naming below uses the dev convention (`rg-dealhub-<domain>-dev-swc`,
> `ca-dealhub-orch-dev-swc`, …). Swap `dev`/`swc` for other environments.

---

## 1. Least-privilege power control  ✅ implemented

The Teams app sleeps/wakes the orchestrator with its **managed identity**. That
identity previously held **Contributor** on the orchestrator — far more than
needed. It now holds a **custom role with exactly four operations**, scoped to the
orchestrator container app only:

| Operation | Why |
|---|---|
| `Microsoft.App/containerApps/read` | read power state + lease tags (status) |
| `Microsoft.App/containerApps/start/action` | wake |
| `Microsoft.App/containerApps/stop/action` | sleep / auto-stop |
| `Microsoft.Resources/tags/write` | write the lease tag |

- **Definition + assignment:** `caPowerRoleDef` / `raOrchPowerControl` in
  [`infra/modules/app.bicep`](../infra/modules/app.bicep) (role name
  *“Deal Room Power Control (<namePrefix>)”*).
- **Applied live** on dev: swapped the identity from Contributor to the custom
  role and verified `status` (read), `wake` (tag-write + start) still work.
- **Nothing else** in the platform depends on that Contributor grant, so there is
  no functionality change.

> On a future clean `azd`/Bicep deploy the custom role is created automatically.
> If you also created it imperatively (as on dev), delete the redundant CLI-made
> role afterwards so only the Bicep-managed one remains.

---

## 2. VNet integration — remove the Cosmos public-access dependency

### The problem
The orchestrator reaches **Cosmos over its public endpoint** (the Container Apps
environment is **not** VNet-integrated; Cosmos has **no private endpoint**). So if
Cosmos `publicNetworkAccess` is ever set to **Disabled** (e.g. by an Azure Policy),
the orchestrator can't reach its data and boots into memory mode (0 deals) until
it's re-enabled. That's the outage we hit.

### Important security context (informs the recommendation)
Cosmos **local auth is disabled** — data-plane access is **Entra RBAC only** (the
orchestrator's managed identity holds *Cosmos DB Built-in Data Contributor*). No
connection string or key can read the data. So `publicNetworkAccess=Enabled` is
**not** a data-exposure risk on its own; the endpoint is reachable but unusable
without a valid Entra token + RBAC. This gives us a cheap near-term option.

### Option A — Pragmatic (near-term, low risk): keep public access ON, stop the drift
Because access is RBAC-only, leaving `publicNetworkAccess=Enabled` is acceptable.
The real issue is *something disabling it*. Steps:

> **✅ Investigated (dev, 2026-07-16):** the only policy touching Cosmos is the
> `Azure_Security_Baseline` assignment with effect **audit** — it *flags* public
> access but does **not** enforce or disable it. No Deny/Modify assignment was found.
> So the Disabled state was a **manual/one-off action, not automatic enforcement** —
> keeping public access **Enabled will persist**. (The audit baseline is only
> *satisfied* by Option B's private endpoints.)

1. **Find what disabled it** — check for an Azure Policy assignment forcing
   `publicNetworkAccess=Disabled` on Cosmos:
   ```powershell
   az policy state list --resource <cosmosId> --query "[?complianceState=='NonCompliant'].policyDefinitionName" -o tsv
   ```
2. If a policy is the cause, **exempt** this Cosmos account (or the data RG) from it,
   or switch the policy effect to `Audit`.
3. Optionally **tighten** with the Cosmos IP firewall instead of full-public:
   allow *Azure services* + your admin IPs (`az cosmosdb update --ip-range-filter …`).
4. Keep the data-safety habit: the `platform-power.ps1 start` path and any
   orchestrator redeploy already assume public access is Enabled.

**Effort:** minutes. **Risk:** low. **Trade-off:** endpoint remains publicly
reachable (but RBAC-gated).

### Option B — Hardened (target state): private endpoints + VNet-integrated CA env
Route orchestrator → Cosmos entirely over the VNet so public access can stay
**Disabled permanently**. Most scaffolding already exists, but there is a
**Bicep ↔ live drift** that must be reconciled first (verified 2026-07-16):

- ✅ **`snet-cae` exists in the live VNet:** `10.40.6.0/23`, delegated to
  `Microsoft.App/environments` — correctly sized/delegated for a Consumption CA env.
- ✅ `snet-pe` (`10.40.4.0/24`) exists; private-endpoint + private-DNS definitions for
  Cosmos, data storage (blob+dfs), Foundry, Key Vault, AI Search and Service Bus are in
  [`infra/modules/network.bicep`](../infra/modules/network.bicep), gated by
  `enablePrivateEndpoints` (default `false`).
- ✅ **DRIFT RESOLVED — now staged in Bicep:** `network.bicep` now defines
  `snet-cae` (`10.40.6.0/23`, delegated to `Microsoft.App/environments`) to match the
  live VNet and **outputs its subnet id** (`snetCaeId`). (The too-small `snet-app` `/24`
  remains for reference but is unused by the CA env.)
- ✅ **CA-env VNet integration staged (flag-gated):** `app.bicep` takes a `caeSubnetId`
  param and sets `vnetConfiguration.infrastructureSubnetId` on `caEnv` **only when it is
  non-empty**; `main.bicep` passes `network.outputs.snetCaeId` when
  `enablePrivateEndpoints=true` (empty otherwise). Inert at the default (`false`).
  **Still true that a CA environment cannot be VNet-joined after creation** — so the
  cutover **recreates** the env (delete-first, below); it is not an in-place update.

**Because a CA environment cannot be VNet-joined after creation, the cutover
*recreates* the environment.** The IaC is **staged and `az bicep build`-validated**;
both flags flip together in one deliberate deploy. To cut over, set the two **CUTOVER
SWITCHES** in [`infra/main.dev.bicepparam`](../infra/main.dev.bicepparam)
(`enablePrivateEndpoints=true`, `deploySearch=false`) and run the deploy — after the
delete-first step below (immutable env).

| Phase | Change | Notes / risk |
|---|---|---|
| 0 · IaC *(done)* | `snet-cae` defined + `snetCaeId` output (`network.bicep`); `caeSubnetId` param + conditional `vnetConfiguration` (`app.bicep`); subnet wired to `app` (`main.bicep`). | ✅ **Staged + `az bicep build`-validated.** Inert while `enablePrivateEndpoints=false` — routine deploys unaffected. |
| 1 · Pre-flight | Confirm Cosmos `publicNetworkAccess=Enabled`; snapshot the current orchestrator/Teams FQDNs; announce the maintenance window. | The orchestrator must boot with data during the cutover. |
| 2 · Delete env | Delete both container apps + the `cae-*` environment (immutable `vnetConfiguration`). | Brief downtime starts here; new default FQDNs are issued on recreate. |
| 3 · Cutover deploy | Flip the two CUTOVER SWITCHES → deploy. Recreates the CA env **VNet-integrated** (`snet-cae`) + both apps, creates private endpoints + private DNS for Cosmos et al. (their `publicNetworkAccess` → `Disabled`), and drops the unused AI Search. | `internal:false` keeps a public ingress endpoint; egress routes via the VNet to the private endpoints. |
| 4 · Repoint Teams | Update the Teams manifest `validDomains` + bot messaging endpoint to the new FQDNs; re-upload the app. `SHARED_BACKEND_URL`/`APP_BASE_URL` are Bicep-derived and update automatically. | A **custom domain** avoids this step on future recreates. |
| 5 · Verify + lock | From the orchestrator, `privatelink.documents.azure.com` resolves to the PE IP; `/api/config` shows `datastore: cosmos` with deals. Then Cosmos `publicNetworkAccess=Disabled` holds permanently. | Roll back by re-enabling Cosmos public access if resolution fails. |

> **Staged, inert, deploy-ready.** The Bicep above changes nothing while the CUTOVER
> SWITCHES stay off (default) — routine deploys are unaffected. The delete-first env
> recreate is the only step that can't be pre-staged in IaC; rehearse in a scratch RG
> first. On command, flip the two switches and run Phases 1–5 in a maintenance window.

**Effort:** high (env recreate + new FQDNs). **Risk:** medium — do it in a
maintenance window and rehearse in a scratch RG first. **Payoff:** the Cosmos
public-access toggle problem disappears for good, plus defense-in-depth for all
data services.

### Recommendation
Do **Option A now** (stop the drift — minutes; already the persisting state). **Option B
is now staged + `az bicep build`-validated** behind the CUTOVER SWITCHES — execute it on
command in a maintenance window (rehearse the env recreate in a scratch RG first).

---

## 3. Cost optimization (no functionality compromise)

Ranked by monthly saving. Container-apps idle cost is already handled by the
**sleep/wake + auto-stop** feature; these target the *standing* costs.

### 3.1 Remove Azure AI Search — **biggest win, zero functionality impact**
`srch-dealhub-dev-<suffix>` is **Basic** (~**$75/mo**) and is **not referenced
anywhere in the application code** — the app uses Foundry, Fabric and the keyless
data providers, not AI Search. It is pure standing cost.

- **📦 Staged:** gated behind `deploySearch` (default **false**) in
  [`infra/modules/ai.bicep`](../infra/modules/ai.bicep) + `infra/main.bicep`. Fresh /
  customer deploys **skip it**. The next infra deploy of the dev stack will **remove**
  the existing unused Search (deployment-stack `deleteResources`) — the ~$75/mo saving
  lands then. Set `deploySearch=true` if you ever need search / vector retrieval.
- **Optional (immediate):** delete the live one now —
  `az search service delete -n <name> -g rg-dealhub-ai-dev-swc`
  (`az search service list -g rg-dealhub-ai-dev-swc -o table` for the name).
  *Not done autonomously — destructive.*

### 3.2 Cap Log Analytics ingestion — ✅ applied
The workspace had **no daily cap** (`dailyQuotaGb = -1`) and 30-day retention.

- **✅ Applied (dev):** daily cap set to **1 GB** (well above dev's actual usage).
  Reverse with `az monitor log-analytics workspace update -n log-dealhub-dev-swc -g rg-dealhub-core-dev-swc --set workspaceCapping.dailyQuotaGb=-1`.
- **📦 Staged:** `logAnalyticsDailyQuotaGb` param (default -1) added to
  [`infra/modules/core.bicep`](../infra/modules/core.bicep) + `infra/main.bicep` so
  it's durable — set it per environment.
- Consider App Insights / Container Apps log **sampling** to cut volume further.

**Compromise:** logs stop for the day if the cap is hit (fine for dev; raise/remove for prod).

### 3.3 Scheduled off-hours auto-sleep — ✅ staged (workflow added)
Run the `sleep` action on a nightly schedule so the orchestrator is down off-hours;
users self-wake from the Teams gate when needed.

- **📦 Staged:** [`.github/workflows/deal-room-sleep.yml`](../.github/workflows/deal-room-sleep.yml)
  — nightly `sleep` (03:00 UTC) + on-demand `sleep|stop|start|status`. **Opt-in:** set
  repo variable `ENABLE_SCHEDULED_SLEEP=true` and the `AZURE_*` OIDC secrets (the
  identity needs rights to stop/start the container apps).
- **No functionality compromise** — the offline gate + 1-hour wake covers ad-hoc use.

### 3.4 Optional — orchestrator scale-to-zero (`minReplicas 0`)
The orchestrator is pinned `min=max=1`. Dropping `minReplicas` to `0` lets it scale
to zero when idle (cost) — but it interacts with the offline gate's 2.5 s health
check (a cold start can read as briefly “offline”). If you want this, also raise the
gate's health timeout / cold-start handling. Keep `maxReplicas=1` (single-writer).
**Teams app must stay `minReplicas ≥ 1`** — it serves the offline gate.

### Already optimal (leave as-is)
- **ACR** — Basic (~$5/mo), the cheapest tier.
- **Cosmos** — serverless (per-request; ~$0 idle).
- **Container Apps environment** — Consumption (no idle environment charge).
- **Function App** — Flex Consumption (scales to zero) + stopped by the power script.

### Rough monthly impact (dev)
| Action | Est. saving | Status |
|---|---|---|
| Remove AI Search | ~$75/mo | 📦 gated off (removed on next deploy) |
| Cap Log Analytics | bounds open-ended | ✅ applied + gated in Bicep |
| Nightly auto-sleep | ~16 h/day compute | 📦 workflow added (opt-in) |
| Orchestrator min=0 | small | not staged (cold-start tradeoff) |
