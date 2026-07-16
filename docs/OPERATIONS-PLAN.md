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
**Disabled permanently**. Most scaffolding already exists:

- ✅ VNet `vnet-dealhub-dev-swc` (`10.40.0.0/16`) with `snet-cae` (for the CA env)
  and `snet-pe` (for private endpoints).
- ✅ Private-endpoint + private-DNS definitions for Cosmos, data storage (blob+dfs),
  Foundry, Key Vault, AI Search and Service Bus in
  [`infra/modules/network.bicep`](../infra/modules/network.bicep), gated by
  `enablePrivateEndpoints` (default `false`).
- ❌ The Container Apps environment (`caEnv` in `app.bicep`) has **no**
  `vnetConfiguration` — and **a CA environment cannot be VNet-joined after
  creation**. It must be **recreated** with an infrastructure subnet.

**Because of that constraint, enabling private endpoints *without* first
VNet-integrating the CA env would break connectivity** (the apps would lose the
public endpoint and can't reach the private one). Sequence carefully:

| Phase | Change | Notes / risk |
|---|---|---|
| 0 · Prep | Confirm `snet-cae` sizing + delegation. Consumption-only env needs a **/23**; a workload-profile env needs a **/27**. Delegate `snet-cae` to `Microsoft.App/environments`. | Resize the subnet if needed (may require redeploying the VNet). |
| 1 · CA env recreate | Add `vnetConfiguration.infrastructureSubnetId = snet-cae` to `caEnv` in `app.bicep`; redeploy. This **recreates** the environment **and both container apps** → brief downtime + **new default FQDNs**. | Update the Teams manifest `validDomains`, the bot messaging endpoint, and any bookmarked URLs. `SHARED_BACKEND_URL` / `APP_BASE_URL` are Bicep-derived and update automatically. Consider a **custom domain** to keep a stable URL across env recreates. |
| 2 · Private endpoints | Deploy with `enablePrivateEndpoints=true` → PEs + private DNS zones/links for Cosmos et al.; each service's `publicNetworkAccess` flips to `Disabled`. | The `main.prod.bicepparam` profile already sets this posture. |
| 3 · Verify | From the orchestrator, `privatelink.documents.azure.com` resolves to the PE IP; `/api/config` shows `datastore: cosmos` with deals; Cosmos `publicNetworkAccess=Disabled` permanently. | Roll back by re-enabling public access if resolution fails. |

**Effort:** high (env recreate + new FQDNs). **Risk:** medium — do it in a
maintenance window and rehearse in a scratch RG first. **Payoff:** the Cosmos
public-access toggle problem disappears for good, plus defense-in-depth for all
data services.

### Recommendation
Do **Option A now** (stop the drift — minutes) and schedule **Option B** as the
hardening target for a maintenance window (ideally validated on a fresh
`enablePrivateEndpoints=true` deploy of the *prod* param set before touching a
shared env).

---

## 3. Cost optimization (no functionality compromise)

Ranked by monthly saving. Container-apps idle cost is already handled by the
**sleep/wake + auto-stop** feature; these target the *standing* costs.

### 3.1 Remove Azure AI Search — **biggest win, zero functionality impact**
`srch-dealhub-dev-p3tks` is **Basic** (~**$75/mo**) and is **not referenced
anywhere in the application code** — the app uses Foundry, Fabric and the keyless
data providers, not AI Search. It is pure standing cost.

- **Now:** delete it — `az search service delete -n srch-dealhub-dev-p3tks -g rg-dealhub-ai-dev-swc`
- **Future deploys:** gate it behind a `deploySearch=false` param in
  `infra/modules/ai.bicep` (add the flag if not present) so it isn't provisioned
  unless a feature actually needs it.

> Deletion is destructive — run it once you've confirmed no future roadmap item
> needs Search (semantic/vector retrieval). It's re-creatable from Bicep in minutes.

### 3.2 Cap Log Analytics ingestion — currently **unbounded**
The workspace `log-dealhub-dev-swc` has **no daily cap** (`dailyQuotaGb = -1`) and
30-day retention. Runaway ingestion is the classic surprise bill.

- Set a modest daily cap (dev): `az monitor log-analytics workspace update -n log-dealhub-dev-swc -g rg-dealhub-core-dev-swc --set workspaceCapping.dailyQuotaGb=1`
- Reduce Application Insights / Container Apps log **sampling** to cut volume.
- 30-day retention is already the free-tier default — fine.

**Saving:** bounds an open-ended cost; **compromise:** logs stop for the day if the
cap is hit (acceptable for dev/demo; raise or remove for prod).

### 3.3 Scheduled off-hours auto-sleep — compute savings, wakes on demand
Run the existing `sleep` action on a nightly schedule so the orchestrator is down
outside working hours; users self-wake from the Teams gate when needed.

- A GitHub Actions `schedule` cron calling `scripts/platform-power.ps1 -Action sleep`, or an Azure Automation runbook / Logic App.
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
| Action | Est. saving | Effort | Compromise |
|---|---|---|---|
| Remove AI Search | ~$75 | low | none (unused) |
| Cap Log Analytics | bounds open-ended | low | logs capped/day |
| Nightly auto-sleep | compute off ~16 h/day | low–med | none |
| Orchestrator min=0 | small | med | cold-start vs gate |
