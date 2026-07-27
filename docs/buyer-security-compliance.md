# Security & compliance — buyer appendix

A concise, **buyer-facing** summary of The Deal Room's security and compliance posture,
written to be attachable to a procurement / infosec review. It is deliberately honest:
every control is marked **✅ Verified today** (enforced in code / infrastructure in this
repo) or **🔜 Roadmap / customer-owned** (not yet in the product, or an external
attestation the deploying firm obtains for its own tenant).

> **Deployment model matters.** The Deal Room is an **accelerator you deploy into your
> own Azure tenant** (`azd up`), not a multi-tenant SaaS. Your data stays in **your**
> subscription, under **your** Entra directory and **your** governance. Several controls
> below (data residency, retention policy, certifications) are therefore **inherited from
> your tenant**, not imposed by a vendor.

---

## 1. Control matrix

| # | Control | Status | Implementation (where it lives) | Evidence |
|---|---|---|---|---|
| C1 | **Server-side RBAC** — five tiers (Administrator, Partner, Deal Team, Analyst, Member) with rank, write and Stage-2 gates; custom roles supported | ✅ Verified today | `app/lib/userPolicy.js` (`roleForUser`, `accessFor`, `BUILTIN_ROLE`); admin-authored overrides in `app/lib/accessConfig.js` | Roles resolved from the **verified identity**, never a client header the caller controls |
| C2 | **Per-deal need-to-know** — every deal read resolves to `full` / `status` / `none`; a confidential deal you're not on **does not exist** for you | ✅ Verified today | `app/lib/userPolicy.js` (`dealAccessLevel`, `onDealTeam`); enforced in `app/server.js` `GET /deals/:id` and `listDeals` | An analyst calling a deal she isn't named on gets **404**, not a redacted record |
| C3 | **Confidential deals & information barriers** — a deal flagged `confidential` is hidden from the status tier entirely (take-privates under NDA, clean-team carve-outs) | ✅ Verified today | `dealAccessLevel` downgrades `status → none` when `confidential` | Confidential deals vanish from the pipeline totals for non-team roles |
| C4 | **View-as is down-only** — a senior role can preview the app as any **junior** role, **never up**; out-of-range view-as is ignored | ✅ Verified today | `app/lib/userPolicy.js` (`accessFor`, `viewAsRolesFor`) | `write-access` tests assert view-as can only narrow capability |
| C5 | **Data-sovereignty egress guard** — region-restricted roles can't see out-of-region deals; the external news scout can **never** call internal M365 (Work IQ) tools | ✅ Verified today | region check in `dealAccessLevel`; connector/tool boundary in `app/lib/connectors.js` + Work IQ MCP surface | Cross-boundary calls are refused and audit-logged |
| C6 | **Append-only, attributed audit trail** — every mutating action and every assistant-applied change writes an activity entry with actor + timestamp; assistant changes carry a "via assistant · you approved" attribution | ✅ Verified today | `app/lib/store.js` (`logEvent`, `deal.activity`); `POST /api/deals/:id/assistant-actions` → `GET /api/deals/:id/activity` | The deal **Activity** tab is the running audit trail |
| C7 | **Approve-to-apply governance** — the assistant **proposes** next steps but never acts autonomously; a human clicks **Apply**, and the write is governed by the caller's role server-side | ✅ Verified today | assistant-action apply path in `app/lib/store.js` / `app/server.js`; write gate = `authorizeDealContent` | The AI can't become a side-channel around RBAC |
| C8 | **Managed identity end-to-end — no secrets in the platform path** | ✅ Verified today | User-assigned managed identity for Cosmos (AAD data plane, account-key auth **disabled**), ACR pull, and Foundry inference; `infra/main.bicep` | No connection strings / keys in the running app or this repo |
| C9 | **Private data plane** — Cosmos reached over a **Private Endpoint** inside a VNet; Cosmos **public network access Disabled** | ✅ Verified today | `infra/main.dev.bicepparam` cutover notes; live: `pe-cosmos-*` private endpoint + `privatelink.documents.azure.com`, `publicNetworkAccess=Disabled` | The datastore is not reachable from the public internet |
| C10 | **Source-freshness gate on IC/LP outputs** — a figure backed by an external source outside its freshness SLA is **blocked or labelled "not certified for IC/LP use"**; mixed-source records roll down to their weakest component | ✅ Verified today | `app/lib/reportingGuard.js` (`guardReporting`, `recordFreshness`); `GET /api/fund/reporting-readiness` | Stale third-party data can't silently feed a decision or LP report |
| C11 | **Metric lineage** — every fund/portfolio KPI carries formula + definition + unit + as-of + source-of-record; a single enforced dictionary (no per-view divergence) | ✅ Verified today | `app/lib/metrics.js`; `GET /api/fund/methodology`; governance tests in `app/test/metrics-governance.test.mjs` | LP report appendix traces each headline number to its method |
| C12 | **Connector governance** — a custom data source can't be used until an **admin approves** it; honest reachability test (never a faked "connected") | ✅ Verified today | `app/lib/connectorSettings.js`, `app/lib/connectors.js` | Unapproved sources are blocked from production answers |
| C13 | **Transport security** — HTTPS-only ingress on Azure Container Apps | ✅ Verified today | Container Apps managed ingress (TLS terminated at the platform) | — |
| C14 | **Automated regression tests** for finance correctness, metric governance and reporting freshness | ✅ Verified today | `app/test/*.mjs` (returns, metrics, metrics-governance, reportingGuard, write-access, flow-stages) | `npm test` green in CI-style run |
| C15 | **Report certification lifecycle** — LP-facing reports move draft → certified → archived, with a named approver and an immutable snapshot | 🔜 Roadmap (in progress) | see the Report certification work in this repo | — |
| C16 | **Data residency & retention policy** | 🔜 Customer-owned | Inherited from your Azure region + subscription; Cosmos/Storage retention is set by the deploying firm | You choose the region at deploy; data never leaves your tenant |
| C17 | **SOC 2 / ISO 27001 attestation** | 🔜 Customer-owned / external | Not a vendor deliverable — the accelerator runs in **your** compliance boundary; obtain attestations for your deployment | — |
| C18 | **Independent penetration test** | 🔜 External | Recommended before production; out of engineering scope for the accelerator | — |
| C19 | **Formal DR / backup RPO-RTO** | 🔜 Customer-owned | Cosmos continuous backup / geo options are configurable in your subscription | — |

---

## 2. Identity & authentication

- **Auth model:** Microsoft **Entra ID** (SSO) for the Teams tab and web console;
  service-to-service and data-plane auth use **user-assigned managed identity** — there
  are **no secrets, connection strings or API keys in the running application or this
  repository**.
- **Identity trust seam:** the Teams surface forwards the caller's SSO token (and demo
  "view-as" selection) to the orchestrator, which **resolves the role server-side**. A
  client can never widen its own powers by editing a header — the server is authoritative.
- **Bootstrap admin:** a Day-0 administrator is set at deploy time so first-run setup has
  a guaranteed admin who then assigns everyone else in the Admin UI.

## 3. Authorization & least privilege

- Five built-in tiers (Administrator → Partner → Deal Team → Analyst → Member) plus
  admin-authored **custom roles**. Each role declares which **personas** it may act as,
  whether it may **write**, and whether it may see **Stage-2 (diligence)** deals.
- **Need-to-know** is enforced per deal on top of the tier (C2/C3): pipeline metadata is
  broadly visible, but the confidential workspace opens only to the deal team, admins, or
  anyone **named on that deal**.
- **View-as** is strictly **down-rank** (C4), so a reviewer can see exactly what a junior
  role sees without ever escalating.

## 4. Auditability & provenance

- **Append-only activity trail** per deal (C6): actor, action, timestamp. Assistant-applied
  changes are additionally stamped **"via assistant · you approved."**
- **Grounded, cited answers:** agent responses read the live record through governed MCP
  tools and cite them; the citation audit maps numeric claims to sources.
- **Reporting freshness gate (C10)** and **metric lineage (C11)** mean an LP-facing number
  is either current-and-traceable or visibly **not certified**.

## 5. Data protection & network

- **In transit:** HTTPS/TLS at the Container Apps ingress.
- **At rest:** Azure Cosmos DB (Azure-managed encryption) in **your** subscription/region;
  reached over a **Private Endpoint** with **public network access Disabled** (C9).
- **No standing secrets:** managed identity end-to-end (C8).
- **Egress control:** the data-sovereignty guard prevents an external-data agent from
  reaching internal M365 content, and cross-boundary attempts are logged (C5).

## 6. Shared-responsibility summary

| Layer | The Deal Room (accelerator) | You (deploying firm) |
|---|---|---|
| App RBAC, need-to-know, audit trail, approve-to-apply | ✅ Provided | Assign users to roles |
| Managed identity, private endpoint, no-secrets posture | ✅ Provided (Bicep) | Keep the IaC settings; supply the tenant |
| Data residency, retention, backup/DR policy | Configurable defaults | ✅ You own (region + subscription policy) |
| SOC 2 / ISO / pen test / regulatory attestations | — | ✅ You obtain for your deployment |
| Identity provider (Entra), conditional access, MFA | Consumes Entra | ✅ You own tenant policy |

---

## 7. Open items (honest gaps)

- **C15** report certification lifecycle is being added (draft → certified → archived with
  an immutable snapshot and named approver).
- **C17–C19** (SOC 2/ISO, independent pen test, formal DR RPO/RTO) are **not vendor
  deliverables** — because the accelerator runs inside your own compliance boundary, these
  are obtained/owned by the deploying firm. We recommend completing an independent pen test
  before production.

*This appendix documents controls present in this repository at the current commit. It is
not a certification and does not warrant fitness for any specific regulatory regime.*
