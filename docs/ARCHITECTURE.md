# Architecture

> The one-page picture of [The Deal Room](../README.md). Read this first; everything else in
> `docs/` is a detail of something on this page.
>
> Next: [How it works](HOW-IT-WORKS.md) for the internals · [Access model](ACCESS-MODEL.md) for
> who may see what · [Deploy guide](DEPLOY.md) to run it.

---

## In one paragraph

One backend holds the data and does the thinking. Two surfaces show it: a Teams channel tab
with a conversational bot, and the same build served as a standalone web console. M365 Copilot
and hosted agents reach the same deal tools through an Entra-secured MCP endpoint. Models come
from Azure AI Foundry over managed identity, so there are no keys in the app. The whole thing
is subscription-agnostic Bicep on Azure Container Apps.

---

## The shape of it

![The Deal Room — one backend, two surfaces](diagrams/how-it-fits-together.svg)

**The rule that keeps it honest:** the console tier holds no data. Every read and write is
forwarded to the one backend, so there is a single source of truth and nothing to keep in sync.

---

## Who is allowed to see what

Access is decided on the server. The client can state who it is, but it cannot widen its own
powers — the asserted identity is honoured only when the call carries the shared bot key.

![The identity trust seam](diagrams/identity-trust-seam.svg)

Full behaviour — the two-tier RBAC, deal-team need-to-know, confidential deals and MNPI
barriers — is in the [access model](ACCESS-MODEL.md).

---

## The Azure footprint

Subscription-scoped Bicep, split into six resource groups so each domain can be governed and
costed on its own — with the Microsoft 365 tenant it reads from on one side, and the keyless
public sources on the other. **The numbered line is a single request, in order**, from the tab
through the identity seam to the deal store; the dashed lines are platform services and the
optional private path.

![The Deal Room on Azure — the tenant, the subscription, its six resource groups and the path a request takes through them](diagrams/azure-architecture.svg)

| Resource group | What lives there |
|---|---|
| **app** | The two container apps and their environment, the registry, the bot registration and the Function App. |
| **ai** | Azure AI Foundry models and embeddings, Bing grounding, AI Search. |
| **data** | The deal store — a storage account by default, Cosmos DB when you need it — and Fabric capacity. |
| **integration** | API Management, Service Bus and Event Grid for event-driven signals. |
| **core** | Key Vault, the user-assigned managed identity, Log Analytics and Application Insights. |
| **network** | VNet, private endpoints and private DNS zones. |

---

## What runs where

| Tier | Container app | Role |
|---|---|---|
| **Deal Room (API + data)** | `ca-dealhub-orch-*` — image `deal-room` | The API / data / MCP plane: the pluggable store, the agent engine, the MCP server and Graph provisioning. **The only tier that holds data.** |
| **Deal Room console** | `ca-dealhub-teams-*` — image `deal-room-teams` | The user-facing console — Teams tab, bot, and the same build as a standalone web app. Forwards everything to the backend. |

---

## Two choices worth knowing early

- **The database is optional.** `DEALROOM_STORE=blob` is the default and writes one JSON blob
  per document to the storage account that already exists, so a full demo provisions no
  database and carries no standing database cost. Switch to `cosmos` for production
  concurrency. See [persistence](HOW-IT-WORKS.md#persistence--cosmos-is-optional).
- **It can be switched off.** The platform sleeps and wakes as one unit, and an idle demo can
  cost nothing. See [cost control](HOW-IT-WORKS.md#cost-control--sleep--wake-the-platform) and
  the [operations plan](operations/OPERATIONS-PLAN.md).

---

## The diagrams themselves

All three drawings above live in one draw.io file —
[`docs/diagrams/deal-room-architecture.drawio`](diagrams/deal-room-architecture.drawio), one
page per diagram. That file is the source; the SVGs beside it are generated from it and
committed, because GitHub renders SVG inside a page and cannot render `.drawio`.

To change a diagram, edit the `.drawio` — the
[draw.io VS Code extension](https://marketplace.visualstudio.com/items?itemName=hediet.vscode-drawio)
opens it in place, or use draw.io desktop — then regenerate the SVGs:

```powershell
pwsh scripts/build-diagrams.ps1
```

Each SVG also carries a copy of its own diagram, so it reopens in draw.io on its own if that is
all you have. They are exported with `--theme auto`, which is what keeps them readable in
GitHub's dark mode as well as its light one.

---

## Where to go next

| If you want to | Read |
|---|---|
| Understand the internals | [How it works](HOW-IT-WORKS.md) |
| Know who can see what | [Access model](ACCESS-MODEL.md) |
| Deploy it | [Deploy guide](DEPLOY.md) |
| Connect real market data | [Data integration](integration/DATA-INTEGRATION.md) |
| Answer a security review | [Security appendix](security/buyer-security-compliance.md) |
