# Security & compliance

A single reference for a PE firm's security and compliance review — control matrix, identity
model, data handling, and what the firm deploying it is responsible for. Written to be
attachable to a procurement or infosec questionnaire.

**Deployment model matters.** The Deal Room is an accelerator you deploy into **your own**
Azure tenant (`azd up`), not a multi-tenant SaaS. Your data stays in your subscription, under
your Entra directory and your governance. Several rows below — data residency, retention,
formal certifications — are therefore **inherited from your tenant**, not imposed by a vendor.

Every control is marked **✅ Verified today** (enforced in code or infrastructure in this
repository) or **🔜 Roadmap / customer-owned** (not yet in the product, or an attestation the
deploying firm obtains for its own tenant). This document is not a certification and does not
warrant fitness for any specific regulatory regime.

---

## 1. Control matrix

| # | Control | Status | Where it lives |
|---|---|---|---|
| C1 | **Server-side RBAC** — five tiers (Administrator, Partner, Deal Team, Analyst, Member) with rank, write and Stage-2 gates; custom roles supported | ✅ Verified | Role resolved from the verified identity, never a header the caller controls |
| C2 | **Per-deal need-to-know** — every deal read resolves to `full` / `status` / `none`; a confidential deal you're not on does not exist for you | ✅ Verified | An analyst calling a deal she isn't named on gets a 404, not a redacted record |
| C3 | **Confidential deals & information barriers** — a flagged deal is hidden from the status tier entirely (take-privates under NDA, clean-team carve-outs) | ✅ Verified | Confidential deals vanish from pipeline totals for non-team roles |
| C4 | **View-as is down-only** — a senior role can preview the app as any junior role, never up | ✅ Verified | Automated tests assert view-as can only narrow capability |
| C5 | **Data-sovereignty egress guard** — region-restricted roles can't see out-of-region deals; the external news agent can never call internal work-data tools | ✅ Verified | See [Data sovereignty](#3-data-sovereignty--agent-isolation) below |
| C6 | **Attributed audit trail on every deal** — every mutating action and every assistant-applied change writes an entry with a named actor and timestamp | ✅ Verified | The deal's **Activity** tab; assistant changes carry a "via assistant · you approved" attribution |
| C7 | **Approve-to-apply governance** — the assistant proposes next steps but never acts autonomously; a human clicks Apply, and the write is governed by the caller's role server-side | ✅ Verified | The AI cannot become a side-channel around RBAC |
| C8 | **Managed identity end-to-end** — no secrets in the platform path | ✅ Verified | No connection strings or keys in the running app or this repository |
| C9 | **Private data plane (optional)** — the datastore reachable over a Private Endpoint inside a VNet, with public network access disabled | 🔜 Staged in IaC | One switch (`enablePrivateEndpoints`) provisions it; see [operations plan](operations/OPERATIONS-PLAN.md) for the cutover |
| C10 | **Source-freshness gate on IC/LP outputs** — a figure backed by a stale external source is blocked or labelled "not certified for IC/LP use" | ✅ Verified | Stale third-party data can't silently feed a decision or an LP report |
| C11 | **Metric lineage** — every fund/portfolio KPI carries formula, definition, unit, as-of date and source, from one enforced dictionary | ✅ Verified | The LP report appendix traces every headline number to its method |
| C12 | **Connector governance** — a custom data source can't be used until an admin approves it; an honest reachability test, never a faked "connected" | ✅ Verified | Unapproved sources are blocked from production answers |
| C13 | **Transport security** — HTTPS-only ingress | ✅ Verified | TLS terminated at the platform |
| C14 | **Automated regression tests** for finance correctness, metric governance and reporting freshness | ✅ Verified | Run in CI on every change |
| C15 | **Report certification lifecycle** — LP-facing reports move draft → certified → archived, with a named approver and an immutable snapshot | ✅ Verified | The Firm Reporting tab prints its own certification state |
| C16 | **Data residency & retention policy** | 🔜 Customer-owned | Inherited from your Azure region and subscription; you choose the region at deploy |
| C17 | **SOC 2 / ISO 27001 attestation** | 🔜 Customer-owned | Not a vendor deliverable — obtain attestations for your own deployment |
| C18 | **Independent penetration test** | 🔜 Customer-owned | Recommended before production; outside engineering scope for the accelerator |
| C19 | **Formal DR / backup RPO-RTO** | 🔜 Customer-owned | Configurable in your subscription |

---

## 2. Identity & authentication

- **Auth model:** Microsoft **Entra ID** (SSO) for the Teams tab and the web console;
  service-to-service and data-plane auth use **user-assigned managed identity** — there are no
  secrets, connection strings or API keys in the running application or this repository.
- **Identity trust seam:** the Teams surface forwards the caller's SSO token to the
  orchestrator, which resolves the caller's role **server-side**. A client can never widen its
  own access by editing a header — the server is authoritative.
- **Bootstrap admin:** a day-0 administrator is set at deploy time, so first-run setup has a
  guaranteed admin who then assigns everyone else.

> **Scope of this claim:** the above describes the deployed product's own runtime path. This
> repository separately ships an *optional, developer-invoked* demo-production tool
> (`scripts/setup-demo-access.ps1`) that can create a short-lived, least-privilege service
> principal — scoped to one resource a developer names, and only ever after that developer
> explicitly approves the exact plan — for capturing a demo of an Azure resource built outside
> this product (a Foundry deployment, an ADF pipeline, and similar). It is never invoked by the
> running application, never runs unattended, and any credential it creates is written to a
> git-ignored local file — it never reaches the deployed product's auth path or this
> repository's tracked contents. The same script, and the decision procedure behind it, are
> also part of the canonical, standalone
> [`amitdesai08/demo-production-skill`](https://github.com/amitdesai08/demo-production-skill)
> repo that this repo's copy of the demo-production skill is installed from, so the identical
> scoping and approval rules apply when the skill is used outside this repository too. See
> [external-resource-access.md](../.github/skills/demo-production/references/external-resource-access.md)
> for the full procedure.

## 3. Data sovereignty — agent isolation

The AI agents are split into two hard classes with a boundary enforced **server-side**, at
every tool call, before it runs — an agent's class is set from its name in a registry and is
never self-asserted by a model:

| Class | Agents | Reads the fund's data | Reaches the public web |
|---|---|:--:|:--:|
| **internal-data** | the deal analyst, the ten persona agents, the Fabric data agent | ✓ governed, deal-scoped | ✗ never |
| **external-web** | the news-sourcing agent (Bing-grounded) | ✗ never | ✓ public sourcing only |

A tool call outside the calling agent's class is **refused before it runs** — so neither a
manipulated prompt nor a compromised conversation can move data across the line. An
internal-data agent has no reachable path to the public web; the external-web agent has no
reachable path to a deal record. Deeper technical detail, including the Kusto query that
surfaces every attempted boundary crossing: [Data sovereignty](security/DATA-SOVEREIGNTY.md).

## 4. Authorization & least privilege

- Five built-in tiers (Administrator → Partner → Deal Team → Analyst → Member), plus
  admin-authored custom roles. Each declares which specialist agents it may use, whether it may
  write, and whether it may see Stage-2 (diligence) deals.
- **Need-to-know** is enforced per deal on top of the tier (C2/C3): pipeline metadata is
  broadly visible, but the confidential workspace opens only to the deal team, admins, or
  anyone named on that deal.
- **View-as** is strictly down-rank (C4), so a reviewer can see exactly what a junior role sees
  without ever escalating.

## 5. Auditability & provenance

Two logs exist, and they answer different questions — worth being precise about which is which.

- **The deal's Activity trail** is the customer-facing, attributed record (C6): every entry
  carries a named actor and a timestamp, and an assistant-applied change is additionally
  stamped "via assistant · you approved." This is the log a compliance reviewer or an LP
  question is asking about, and it is what's covered by C6 above.
- **The internal ingestion event log** is separate, system-level telemetry used for signal
  bookkeeping (for example, tracking what's been pulled from a mailbox connector). It is not
  attributed and not append-only today. It has no bearing on deal decisions or the audit
  answer to "who did what" — that question is answered by the Activity trail — but a firm
  connecting live Microsoft 365 data should know the distinction before treating the two as
  interchangeable.
- **Grounded, cited answers:** agent responses read the live record through governed tools and
  cite their sources; a citation audit maps every numeric claim back to where it came from.
- **Reporting freshness (C10)** and **metric lineage (C11)** mean an LP-facing number is either
  current and traceable, or visibly not certified.

## 6. Data protection & network

- **In transit:** HTTPS/TLS at the ingress.
- **At rest:** your data store, in your subscription and region, with Azure-managed encryption.
- **No standing secrets:** managed identity end-to-end (C8).
- **Egress control:** the data-sovereignty guard prevents an external-data agent from reaching
  internal work-data content, and a crossing attempt is logged (C5).
- **Private networking** is available behind one deployment switch (C9) — see the
  [operations plan](operations/OPERATIONS-PLAN.md) for the cutover from the default posture.

## 7. Shared responsibility

| Layer | The Deal Room (accelerator) | You (deploying firm) |
|---|---|---|
| App RBAC, need-to-know, audit trail, approve-to-apply | ✅ Provided | Assign users to roles |
| Managed identity, private endpoint option, no-secrets posture | ✅ Provided (Bicep) | Keep the IaC settings; supply the tenant |
| Data residency, retention, backup/DR policy | Configurable defaults | ✅ You own (region + subscription policy) |
| SOC 2 / ISO / pen test / regulatory attestations | — | ✅ You obtain for your deployment |
| Identity provider (Entra), conditional access, MFA | Consumes Entra | ✅ You own tenant policy |

## 8. Your responsibilities when deploying

- Supply your **own** Entra object IDs in the roles configuration; do not rely on demo names in
  production.
- Turn **demo profiles off** in production — they exist for demonstrations only. With demo
  profiles off, access is driven solely by the Entra object IDs you supply.
- Review the Entra app registrations and their consented Microsoft Graph scopes before going
  live.
- Rotate deploy-time secrets and restrict who can read the Container App secret store.

## 9. Reporting a vulnerability

Please do not open a public GitHub issue for a security vulnerability. Report it privately so
it can be triaged and fixed before disclosure: use **GitHub → Security → Report a
vulnerability**, or email your delivery contact directly. Include a description, the affected
component, reproduction steps, and any suggested remediation.

---

> For the engineering-level detail behind these controls — current implementation state,
> known gaps ahead of a live-tenant connection, and file-level references — see
> [Data sovereignty](security/DATA-SOVEREIGNTY.md) and [Data handling](integration/DATA-HANDLING.md).
> Those are written for the delivery and engineering team, not for a compliance questionnaire.
