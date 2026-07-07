# Deal Room — Transformation Plan (MVP → Target State)

**Baseline (deployed today):** `dealhub` on Azure — shared backend `ca-dealhub-orch` (single data source: `/api` + Entra-secured `/mcp` + `app/lib` → Cosmos), Teams app `ca-dealhub-teams` (embedded dashboard + bot + SSO + `/config`), Foundry `aif-dealhub` with `deal-room-analyst` live, DI/Search/Content-Safety/Speech, Functions/Service Bus/Event Grid, domain-split Bicep, CI/CD. Fabric + APIM off; no D365/Dataverse/Power Automate/Purview.

**Goal:** evolve the lightweight MVP substrate (Cosmos + in-app workflow) into the enterprise Microsoft platform (Fabric · D365/Power Platform · Purview · APIM) and elevate agents to true Foundry multi-agent — **without regressing** the working experience. Each wave is independently shippable.

**Legend:** ⚙️ = infra/Bicep · 🧩 = app/backend code · 💬 = Teams app · ☁️ = tenant/portal (admin) · 🤖 = Foundry/agents.

---

## Wave 0 — Finish the current surfaces (quick wins, days)
| # | Task | Type | Status | Done when |
|---|---|---|---|---|
| 0.1 | Complete **M365 Copilot** agent: create the Teams Developer Portal OAuth registration for MCP app `043b18b9`, paste `reference_id` into `apiPlugin.json`, repackage. | ☁️💬 | 🟡 **Packaged** — `deal-mcp-openapi.yaml` filled (host/tenant/client), `build_manifest.py --copilot` bundles the agent + emits `copilotAgents`. Only the TDP OAuth registration id remains (manual, portal). | Copilot answers a deal question via `/mcp` |
| 0.2 | **Per-user data scoping** in the tab: backend accepts the SSO/OBO user token, `app/lib` filters deals by persona/entitlement; injected bootstrap sends `getAuthToken()`. | 🧩💬 | 🔴 Needs an entitlement model (product decision) + backend token validation. | Tab shows the signed-in user's persona view, not anonymous |
| 0.3 | Wire **Content Safety** into the deal-agent chat (fail-open guard on user input). | 🧩 | ✅ **Done** — `lib/contentSafety.js` screens `chatDealAgent` input; UAMI has *Cognitive Services User* on `cs-dealhub`; `CONTENT_SAFETY_ENDPOINT` set; live on rev 0000008. | Egregious input is refused; business text passes |
| 0.4 | Pin dev images **by digest** in CI (avoid stack-redeploy image reverts). | ⚙️ | ✅ **Done** — `deal-room-app.yml` deploys the `${{ github.sha }}` tag; manual updates use digest. | `deal-room-app.yml` deploys by digest; stack redeploy safe |
| 0.5 | Deploy the **news scout** Foundry agent (needs a Grounding-with-Bing connection in `ai` module). | ⚙️🤖 | 🔴 Blocked on a Grounding-with-Bing connection (marketplace/portal). | `/api/config` `newsAgent: live` |

---

## Wave 1 (T1+T2) — Data spine → Fabric/OneLake + governed grounding
**Why first:** grounding, comps, and real scoring all depend on the unified deal estate.

| # | Task | Type |
|---|---|---|
| 1.1 | Enable **Fabric capacity** in `infra/modules/data.bicep` (already conditional): set `deployFabric=true` + `fabricAdminMembers`, F2 (dev)/F64 (prod), consolidated in `rg-dealhub-data`. | ⚙️ |
| 1.2 | Create **OneLake Lakehouse** (bronze/silver/gold) + **Data Warehouse** marts; ADLS Gen2 shortcuts (the `landing/bronze/silver/gold` containers already exist). | ☁️⚙️ |
| 1.3 | **Data Factory pipelines** to ingest institutional feeds (Preqin·PitchBook·Morningstar·eFront·FactSet·CapIQ) + D365 → OneLake. Start with the connectors we already have (Morningstar MCP, SEC EDGAR, Bing) and add feeds incrementally. | ☁️ |
| 1.4 | Introduce a **Fabric data agent** and repoint `app/lib/repo`/`store.js` seam: reads come from Fabric (gold) / data agent; Cosmos becomes workflow-state/index only. Keep the demo fallback. | 🧩🤖 |
| 1.5 | **AI Search indexers** over OneLake + SharePoint corpus (hybrid + semantic); embeddings via `text-embedding-3-large`. | ⚙️🧩 |
| 1.6 | **Citations everywhere**: agents return source refs from Search; surface them in the dashboard + IC memo. | 🧩🤖 |
| 💬 1.7 | **Teams:** add a **Power BI (Fabric) tab** (pipeline analytics, signal dashboards) alongside the deal dashboard; add it to the manifest `configurableTabs`. | 💬 |

**Done when:** every figure in the screen/memo traces to a Search citation; a Power BI signal dashboard is a Teams tab.

---

## Wave 2 (T4) — Foundry multi-agent orchestration
**Why:** move from 1 real agent + app logic to the 13-agent + orchestrator target.

| # | Task | Type |
|---|---|---|
| 2.1 | Author the **13 specialist agents** in Foundry Agent Service (extend the `create_*_agent.py` pattern): Sourcing, Screening, Prioritization, Gate, Diligence-Planner, Document-Intelligence, Commercial-DD, Tech/AI-DD, Ops-DD, IC-Memo, Compliance, Approval, Covenant-Monitoring. | 🤖 |
| 2.2 | Build the **Deal Orchestrator** (Foundry connected-agents / multi-agent) that decomposes "run diligence on X" and fans out to lanes **in parallel**, writing back to the shared record. | 🤖🧩 |
| 2.3 | Expose all tools via **MCP** (extend the existing secured `/mcp`): Fabric data agent, D365/Dataverse, SharePoint/Graph, Doc Intelligence, AI Search. | 🧩 |
| 2.4 | Add **PTU** deployments for prod-critical paths (sourcing scan, IC memo); Standard for burst/dev. | ⚙️ |
| 2.5 | **APIM AI Gateway** (`infra/modules/integration.bicep`, `deployApim=true` for prod): token limits, load-balancing across deployments, semantic caching, centralized logging; route all model + MCP traffic through it. | ⚙️ |
| 2.6 | **Foundry tracing + evaluations** (groundedness/quality) wired to App Insights. | ⚙️🤖 |
| 💬 2.7 | **Teams:** upgrade the bot to **actionable Adaptive Cards** (Approve / Request info / Open deal) that call back into the orchestrator; add an **agent-feed** message extension to drop a deal card into any chat. | 💬 |

**Done when:** a single "run diligence" request fans out to parallel Foundry agents; APIM fronts all AI traffic; traces/evals visible.

---

## Wave 3 (T3) — Workflow system-of-record → Dynamics 365 + Power Platform
**Why:** governed pipeline, routed approvals, and audit belong in Dataverse/D365, not the app.

| # | Task | Type |
|---|---|---|
| 3.1 | Provision **Dynamics 365 Sales** + **Dataverse** (Power Platform prod environment); model the deal/opportunity/decision/approval tables as the workflow **system of record**. | ☁️ |
| 3.2 | **Power Automate** flows for M3 gate, M4 launch, M6 approval routing, M7 monitoring (replace the in-app equivalents). | ☁️ |
| 3.3 | Repoint the app: pipeline/opportunity/approval **reads/writes go to Dataverse** via Graph/connector; the app + Teams become the **experience layer** over D365. Keep Cosmos for agent state/threads. | 🧩 |
| 3.4 | **Copilot Studio** declarative copilots surfaced in Teams for CRM-centric tasks (optional). | ☁️ |
| 💬 3.5 | **Teams:** approvals arrive as **Adaptive Card approvals** (Power Automate → Teams) in the deal channel; a **meeting side panel** for IC meetings shows the live memo + Q&A and captures the decision back to D365. | 💬☁️ |

**Done when:** PURSUE and IC approval are D365/Power-Automate driven, surfaced and captured in Teams.

---

## Wave 4 (T5) — Compliance, governance & security hardening
| # | Task | Type |
|---|---|---|
| 4.1 | **Microsoft Purview**: lineage across OneLake/SharePoint/Dataverse; **SFDR/ILPA evidence** + audit trail; the Compliance agent writes to Purview as the memo assembles. | ☁️🤖 |
| 4.2 | **Entra Agent ID** for each Foundry agent (per-agent identity, least privilege, OBO/token exchange). | ☁️⚙️ |
| 4.3 | **Private endpoints on** (`enablePrivateEndpoints=true` in prod params — already supported in `network` module) for OpenAI/Search/Cosmos/KV/Storage/Service Bus; **Defender for Cloud** + **Azure Policy** (region-lock swc, CMK, PE enforcement). | ⚙️ |
| 4.4 | **Key Vault CMK** + purge protection (prod); secrets already Container-App-secret backed. | ⚙️ |
| 💬 4.5 | **Teams:** apply **sensitivity labels** to the SharePoint VDR shown in the tab; compliance flags render as inline banners in the deal view. | 💬☁️ |

**Done when:** prod is private-networked, Purview shows the audit/lineage, agents have their own identities.

---

## Wave 5 (T6) — Collaboration polish + Close→Monitor
| # | Task | Type |
|---|---|---|
| 5.1 | **Provision the SharePoint VDR for real** (Graph): create the site/library + 13-folder taxonomy + labels on launch (today it's deep-link modeled; the M365 Graph seam already creates a Teams channel per deal). | 🧩☁️ |
| 5.2 | **Word/Excel co-authoring** for the IC memo/model (Copilot in Office); the memo drafts from the live record and co-edits in place. | ☁️ |
| 5.3 | **M7 Covenant-Monitoring** agent live: post-close KPI/covenant watch → breach alerts. | 🤖🧩 |
| 5.4 | **Document → LBO model** depth: Doc Intelligence custom models → structured financials → generated model in Fabric/Excel. | 🤖 |
| 💬 5.5 | **Teams:** covenant/breach **alerts as Adaptive Cards** to the deal channel; a **portfolio-monitoring tab** (Power BI) for post-close. | 💬 |

---

## Teams app evolution — consolidated track (💬)
The Teams interface stays a **thin layer over the shared backend**; each wave adds a capability:

1. **Now → Wave 0:** finish Copilot agent (0.1), per-user SSO scoping (0.2). Package already ships tab + bot + SSO.
2. **Wave 1:** add a **Power BI/Fabric analytics tab**; citations visible in the embedded dashboard.
3. **Wave 2:** **actionable Adaptive Cards** (approve/request-info/open-deal) + **message extension** to share deal cards into chats.
4. **Wave 3:** **approval cards** (Power Automate) + **IC-meeting side panel** capturing decisions to D365.
5. **Wave 4:** **sensitivity labels** + compliance banners in the tab.
6. **Wave 5:** **covenant-breach alert cards** + **portfolio-monitoring tab**.

All Teams changes flow through `teams-app/` (server proxy/bootstrap, `build_manifest.py` for manifest surfaces) and deploy via the `dealhub-teams` image (build → roll out **by digest**). No `app/` coupling beyond the shared `/api` + `/mcp` contract.

---

## Sequencing & effort (indicative)
| Wave | Theme | Rough effort | Gate |
|---|---|---|---|
| 0 | Finish surfaces | days | none |
| 1 | Fabric data spine + grounding | weeks | Fabric capacity + feed access |
| 2 | Foundry multi-agent + APIM | weeks | Wave 1 data spine |
| 3 | D365 / Power Platform workflow | weeks | D365 licensing |
| 4 | Purview / security hardening | weeks | Waves 1–3 in place |
| 5 | Collaboration polish + monitor | weeks | Waves 1–3 |

**Guiding rule:** the shared backend stays the single source of truth throughout; each wave **swaps a substrate** (Cosmos→Fabric, in-app workflow→D365) or **adds a governed capability** (APIM, Purview, agents) behind the same `/api` + `/mcp` contract, so the web + Teams + Copilot experiences keep working while the platform deepens.
