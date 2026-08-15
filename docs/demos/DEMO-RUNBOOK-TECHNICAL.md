# Demo runbook — technical audience

> **Which document do I want?**
> - Presenting to a CTO, VP of Technology, Director of IT, security architect or engineers,
>   and not deeply technical yourself? Use the
>   [technical demo walkthrough](DEMO-WALKTHROUGH-TECHNICAL.md). It names every screen exactly
>   as it appears. **You do not need this document.**
> - Fifteen minutes and one screen? Use the [technical lightning demo](DEMO-LIGHTNING-TECHNICAL.md).
> - Setting the environment up, or answering an implementation-level question live? You are in
>   the right place. This document names REST routes and env vars the walkthrough does not.
> - Presenting to a private equity deal-team audience instead? None of this applies — use
>   the [PE-audience runbook](DEMO-RUNBOOK.md).
>
> **All three technical assets tell the same story.** The walkthrough runs 18 minutes, the
> lightning cut 10.

An 18-minute guided demo of The Deal Room's **platform**, for delivery teams presenting to an
IT or security review. It does not walk a deal team's five tabs — that is the
[PE-audience runbook](DEMO-RUNBOOK.md)'s job. It walks **identity, agentic workflows,
connector governance and Work IQ, the audit trail, and the Azure footprint** — the things an
architecture or security review actually asks about, in the order they are usually asked.

## Before you start

- **Deploy in demo mode** (`azd up`) with `DEPLOY_DEMO_PROFILES=true`, or use an existing demo
  environment. Sign in as **Michael Realman — Administrator** using the top-bar
  **"sign in as"** switcher; most of this runbook is run from that seat.
- **Say this once, out loud:** "Everything on screen is an invented demonstration book. What
  we're reviewing is what's underneath it — this deploys into your own Azure subscription and
  your own Entra tenant, not a multi-tenant SaaS product."
- Have the [architecture diagrams](../ARCHITECTURE.md) open in a second tab — Acts 7 and 8
  below are easier said while pointing at them than clicked through live.

---

## The canonical spine (tell it in this order)

1. **Open** — the 30-second pitch: your tenant, your subscription, no keys.
2. **Identity trust seam** — the **"sign in as"** switcher, admin vs analyst, resolved server-side.
3. **Agent isolation** — the two registry-set agent classes, checked per tool call.
4. **Agentic workflows** — one orchestrator, bounded specialists, a composed answer.
5. **Connector governance, and Work IQ** — Data Sources, the firm's own files/chats/mail, the CRM connector.
6. **Audit and approve-to-apply** — the assistant proposes, a person applies, everything is logged.
7. **Azure footprint** — six resource groups, one managed identity, zero secrets.
8. **Network boundary and deploy** — private endpoints as a switch; `azd up`; `seedDemoData`.

> **Safe fallback (~8 min):** beats **2 → 5 → 6 → 7** — skip the network-boundary detail and
> the live agent-isolation walk-through if time is short; narrate them instead of clicking.

> **60-second pre-flight:** confirm the **"sign in as"** switcher flips the deal count
> (**21 → 8**, admin to analyst), **Settings → Data sources** loads with the Work IQ and CRM
> connector entries visible, and the assistant panel opens inside a deal without an error.

---

## 1 · The pitch (30s)

> "The Deal Room deploys with one command, `azd up`, into your own Azure subscription and your
> own Microsoft Entra tenant. It's not multi-tenant SaaS. Everything you'll see on screen for
> the next few minutes is an invented demonstration book. The architecture underneath it is the
> real, deployed thing, and that's what we're actually reviewing."

## 2 · Identity trust seam (3 min) — *the differentiator*

1. As **Michael Realman — Administrator**, open **All deals**: **21 of 21**.
2. Switch seat to **Chidi Anagonye — Analyst**, open **All deals** again: **8**.
3. Open a deal this seat is not cleared for — it is absent, not blurred.

> "Same server, same API route, same code. A different number came back because a different
> identity made the request. There's no permissions table in this application. The role and
> the need-to-know grants live in Microsoft Entra ID, the same directory that already governs
> this firm's Teams and SharePoint."

> If asked to prove it live: open the browser's network tab on the restricted request. There's
> nothing there. The record is never transmitted, which is the difference between a
> client-side display rule and a server-enforced boundary.

## 3 · Agent isolation (2 min)

Open a deal → **💬 Ask the assistant**.

> "Every agent belongs to one of two classes, set from a registry entry in
> `app/lib/connectors.js`, not asserted by the model itself. Internal-data agents read this
> firm's governed record and can't reach the public web. The one external-web agent, the
> news-sourcing scout, reaches the open internet and can't reach a deal record. That boundary
> is checked on every tool call, server-side, before the call runs."

## 4 · Agentic workflows (2 min)

Still on the assistant panel, no new navigation needed.

> "This isn't one model with every tool bolted on. `app/lib/purposeAgent.js`, gated by
> `ORCHESTRATION=purpose`, has a Deal Orchestrator route each question to at most a couple of
> stage specialists, consult them in parallel, and compose one grounded answer that names who
> it consulted. It falls back to a single-agent chat automatically if the env var is unset. The
> routing itself is a fixed decision tree the model doesn't get a vote on, which is what stops
> a clever prompt from talking its way into a tool call it was never routed to make."

## 5 · Connector governance, and Work IQ (3 min)

1. **Settings ⚙ → Data sources.** Point out the honest reachability test on every connector,
   no static "connected" badge.
2. Scroll to **Work IQ**.
3. Scroll to **Custom sources**, pending until an administrator approves.
4. Scroll to **Your CRM / deal database.**

> "Work IQ, in `app/lib/m365/workIqGraph.js`, backs four governed tools over Microsoft Graph:
> search_files, read_channel_messages, search_mail and search. Delegated mode is preferred and
> runs as the signed-in user, so Microsoft 365 enforces that person's own file and mailbox
> permissions on top of our deal need-to-know. App-only client credentials are the fallback for
> background agent work, and that path is read-only by design. The same surface is exposed to
> Copilot and Copilot Studio via `lib/mcp/workiqServer.js`."

> "The system-of-record connector: `POST /api/connectors` with `kind: 'sor'`, admin-gated end
> to end. Register, configure, enable and remove all require the administrator role
> server-side, not just hidden in the UI. Inbound pull is matched on connector id plus the
> provider's own native record id, never on company name, so a re-sync can't create a
> duplicate. Outbound push fires automatically the moment a deal clears an IC gate, and it's
> not awaited on the decision path, so an unreachable CRM can never block or duplicate a
> decision already recorded here."

## 6 · Audit and approve-to-apply (2 min)

1. Ask the assistant a question that proposes an action; point at the **Apply ▸** chip.
2. Open the deal's **Audit trail**.

> "The assistant proposes; a person presses Apply, and that write is governed by the caller's
> own role, server-side, exactly as if a human had typed it directly. `GET
> /api/deals/:id/activity` returns a named, timestamped entry for every mutation, with a 'via
> assistant, you approved' badge on anything the assistant proposed. If compliance asks 'can we
> reconstruct who changed what', the answer already exists."

## 7 · The Azure footprint (2 min)

Talk through this alongside the [architecture diagrams](../ARCHITECTURE.md).

> "Subscription-scoped Bicep, six resource groups: app, ai, data, integration, core, network,
> so each domain is governed and costed on its own. Every Azure-to-Azure call is authorised by
> one user-assigned managed identity and an RBAC role assignment scoped to exactly the resource
> it touches. There's no connection string, API key or secret anywhere in the running
> application or in this repository."

## 8 · Network boundary and deploy (2 min)

> "Private networking, `enablePrivateEndpoints`, is one switch, not a re-architecture. On, the
> storage account and Cosmos DB sit behind private endpoints in a VNet, public network access
> is disabled, private DNS resolves the lookups, and the data plane never touches the public
> internet. It's off by default so a lean pilot deploys in minutes."

> "Standing this up for real is `azd up` against the target subscription. Set
> `seedDemoData = false` before the first deploy for a customer jumpstart, and the store boots
> empty, populated only through the firm's own connectors, the CRM connector shown a moment ago
> among them. Nothing fake ever reaches a real firm's Cosmos account."

## Close (30s)

> "One deployment, your subscription, your Entra tenant. Access resolved server-side, agent
> classes hard-isolated and routed by a fixed orchestrator, connectors honestly tested and
> admin-gated, every write attributable, and no secret anywhere in the path."

**The ask:** *"An architecture review with your security team, or a pilot deployment into a
sandbox subscription, before anything customer-facing goes live."*

---

## Quick reference

| Feature | Where |
|---|---|
| Identity resolution, server-side | `requestingIdentity`, honoured only with the shared bot key — see [`ACCESS-MODEL.md`](../ACCESS-MODEL.md) |
| Agent class registry | `app/lib/connectors.js` — internal-data vs external-web |
| Agentic workflow / orchestrator delegation | `app/lib/purposeAgent.js`, `ORCHESTRATION=purpose` — see [`docs/integration/AGENTS.md`](../integration/AGENTS.md) |
| Work IQ (files, chats, mail) | `app/lib/m365/workIqGraph.js` · **Settings ⚙ → Data sources → Work IQ** · `lib/mcp/workiqServer.js` |
| Data sources / connector governance | **Settings ⚙ → Data sources** · `POST /api/connectors` |
| CRM / system-of-record connector | **Settings ⚙ → Data sources → Your CRM** · `app/lib/sorSync.js` |
| Approve-to-apply | in-deal **💬 Ask** → **Apply ▸** · `POST /api/deals/:id/assistant-actions` |
| Audit trail | deal → **Audit trail** · `GET /api/deals/:id/activity` |
| Azure footprint (6 resource groups) | [`infra/main.bicep`](../../infra/main.bicep) |
| Private networking switch | `enablePrivateEndpoints` param in `main.bicep` |
| Customer jumpstart (no seed data) | `seedDemoData` param — `false` for a real deployment |
| Architecture diagrams | [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) |
| Security control matrix | [`docs/SECURITY-COMPLIANCE.md`](../SECURITY-COMPLIANCE.md) |

## Troubleshooting

- **"Sign in as" switcher doesn't change the deal count** — the console is caching the roster;
  restart the console container after enabling `DEPLOY_DEMO_PROFILES=true`.
- **Data sources panel shows no CRM entry** — confirm the deployment is on a build that
  includes the `sorSync.js` connector; older environments predate it.
- **Assistant panel won't open inside a deal** — Foundry agents weren't provisioned; run
  `app/scripts/create_persona_agents.py` or re-`azd up` with `DEALROOM_AGENTS` unset.
- **Private endpoint questions you can't answer live** — that's expected; point to
  [`infra/README.md`](../../infra/README.md) and offer a follow-up architecture session rather
  than guessing at network specifics in the room.
