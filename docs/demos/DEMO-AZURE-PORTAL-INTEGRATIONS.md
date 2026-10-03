# Architecture walkthrough and IQ reference guide

A two-part companion to the [technical walkthrough](DEMO-WALKTHROUGH-TECHNICAL.md):

1. **Talk track** — a seven-minute, read-only walkthrough of the deployed architecture.
2. **IQ reference guide** — a question-driven map showing where to demonstrate Work IQ,
   Fabric IQ and Foundry IQ, what each proves, and what not to expose.

**Audience:** CTO, platform engineering, cloud security, or an architecture review.

**Access model:** one-off interactive capture under the presenter's existing Azure session.
This workflow does not create a service principal or grant any role. Use a dedicated capture
identity only if this must later run unattended or be handed to another presenter.

## What this proves

| Stop | Proof |
|---|---|
| Resource groups | The platform is deployed into domain-owned Azure boundaries. |
| Container Apps | The console and backend are separate workloads with independently versioned revisions. |
| Managed identity and RBAC | Azure calls are made by identity, with roles scoped to the resources being called. |
| Azure AI Foundry | Models are deployments in the customer's own AI account and project. |
| Foundry IQ | Approved diligence knowledge is retrieved through Azure AI Search with managed identity and returned with citations. |
| Fabric IQ | Fund market intelligence and historical evidence come from Microsoft Fabric/OneLake in an explicitly reported live or snapshot mode. |
| Application Insights | Both runtime tiers feed the customer's own operational telemetry. |
| Deal Room Data sources | Work IQ, Fabric IQ and Foundry IQ meet at one governed application boundary, not in the browser. |

This is a proof path, not a general Azure tour. Do not open data explorers, secret values,
mailbox contents, raw traces, access tokens, or the account/tenant switcher while presenting.

## Part 1: Architecture talk track

Use this part as the presenter script. It follows one request from the application boundary
through runtime, identity, AI and telemetry, then returns to the product to connect the three
IQ capabilities.

### Before the meeting

1. Use a clean browser profile and sign in to the Azure portal with an account that has
   read-only visibility of the deployment. Collapse the account menu before sharing.
2. Choose the environment. The examples below use `<env>` and `<loc>` rather than fixed names;
   the current development deployment uses `dev` and `swc`.
3. Resolve the backend Container App resource ID, then verify the current session without
   changing Azure:

   ```powershell
   $resourceId = az containerapp show `
       --name ca-dealhub-orch-green `
     --resource-group rg-dealhub-app-dev-swc `
     --query id -o tsv

   ./scripts/setup-demo-access.ps1 -Verify -ResourceId $resourceId
   ```

4. Open these tabs before presenting, but leave each on its **Overview** blade:
   - Resource groups
   - the backend Container App
   - `id-dealhub-<env>-<loc>`
   - the Azure AI Foundry account
   - `srch-dealhub-<env>-<suffix>`
   - the Fabric workspace or its **Fund reporting data** connector
   - `appi-dealhub-<env>-<loc>`
   - Deal Room **Settings → Data sources**
5. Confirm the Container Apps and Application Insights pages show healthy data. If telemetry
   is empty, skip that stop rather than generating synthetic traffic during the meeting.

### Safety rails

**Safe to show:** resource names, types, regions, health, revision names, image tags, identity
assignment, role names and scopes, model deployment names, Application Map, request rates and
failure counts.

**Do not open:** Container App secret values, Key Vault objects, Storage browser, Cosmos Data
Explorer, raw request payloads, Log Analytics rows containing user or deal fields, access keys,
connection strings, tokens, mailbox messages, or Microsoft Entra **Certificates & secrets**.

For Foundry IQ, show the Search service overview, identity, access-control role names, and
knowledge-base name only. Do not open indexed document content, Search Explorer results, source
credentials, or raw retrieval payloads during a shared-screen presentation.

Do not claim that every optional service is active merely because it exists. Narrate what the
selected environment actually shows. In particular, private networking and Fabric are
deployment choices, and Work IQ configuration does not prove that every Graph request succeeds.

### The click path

### 1. Resource groups: ownership boundaries (45 seconds)

In the Azure portal, search for **Resource groups**, then filter on `rg-dealhub-`.

Point out the six Bicep-defined domains:

- `rg-dealhub-app-<env>-<loc>`
- `rg-dealhub-ai-<env>-<loc>`
- `rg-dealhub-data-<env>-<loc>`
- `rg-dealhub-integration-<env>-<loc>`
- `rg-dealhub-core-<env>-<loc>`
- `rg-dealhub-network-<env>-<loc>`

> "This is one subscription-scoped deployment split by operational ownership. Application,
> AI, data, integration, identity and observability, and network controls can be governed and
> costed independently without splitting the product into separate sources of truth."

Do not open **Deployments** during the live path; failed historical experiments can distract
from the architecture being reviewed.

### 2. Container Apps: two runtime tiers (60 seconds)

Open `rg-dealhub-app-<env>-<loc>` and select the backend Container App. For the current
production environment that is `ca-dealhub-orch-green`.

1. On **Overview**, point to status, region and application URL.
2. Open **Revision management** and point to the healthy revision and immutable image tag.
3. Return to the resource group and point to the corresponding Teams/console app.

> "The user surface and the backend are separate containers. The console holds no deal data;
> it forwards authorised requests to the backend. Revisions let us deploy and verify each tier
> independently, while the backend remains the single API, data and MCP plane."

Do not open **Containers → Environment variables**. Even masked configuration is unnecessary
to prove the runtime split.

### 3. Managed identity and scoped RBAC (75 seconds)

Open `rg-dealhub-core-<env>-<loc>` → `id-dealhub-<env>-<loc>`.

1. On **Overview**, identify it as a user-assigned managed identity.
2. Open **Azure role assignments**.
3. Group or scan by scope and point to resource-level assignments rather than reading every
   row aloud.

> "This identity is attached to the workloads. Azure-to-Azure calls obtain tokens from the
> platform instead of loading connection strings into application code. The role assignment
> is the permission: a named operation at a named scope, independently reviewable in Azure."

Role assignments prove authorization design; they do not prove a request succeeded. Runtime
proof comes from the next two stops.

### 4. Azure AI Foundry: model integration (60 seconds)

Open `rg-dealhub-ai-<env>-<loc>` and select the Azure AI Foundry account, then:

1. Stay on **Overview** long enough to establish subscription, resource group and region.
2. Open **Model deployments** and show the deployment names and provisioning state.
3. If the portal offers **Go to Azure AI Foundry**, mention it but do not enter a playground or
   submit a prompt during this infrastructure proof.

> "The app calls named model deployments in this Azure AI account. The deployment owns model
> choice, version and capacity; the Container App reaches it with managed identity. Changing a
> model deployment does not require moving deal data into a vendor tenant."

Do not open **Keys and Endpoint**.

### 5. Foundry IQ: cited diligence knowledge (90 seconds)

Open the Azure AI Search service in `rg-dealhub-ai-<env>-<loc>`. The default provisioned name
follows `srch-dealhub-<env>-<suffix>`.

1. On **Overview**, establish that this is the customer-owned Search service used by Foundry IQ.
2. Open **Identity** and show that the Search service has a system-assigned managed identity.
3. Open **Access control (IAM)** → **Role assignments** and point out:
   - the Container App user-assigned identity has **Search Index Data Reader**;
   - the Search service identity has **Cognitive Services User** on the Foundry account so the
     knowledge base can use the configured model for answer synthesis.
4. If the portal exposes **Knowledge bases**, show the approved knowledge-base name but do not
   open source documents. Otherwise, show the same name in Deal Room **Settings → Data sources →
   Approved diligence knowledge**.

> "Foundry IQ is the governed knowledge layer, while the Foundry project supplies the model.
> The app authenticates to Azure AI Search with its managed identity, retrieves only from the
> configured knowledge base, and receives an answer plus source references. No Search key is
> stored in the app, and the connector does not report connected until a real retrieval succeeds."

#### Backend request path

| Step | Backend behavior | Control |
|---|---|---|
| 1. Configure | `config.js` reads the Search endpoint, knowledge-base name and optional knowledge source from environment variables; an administrator can override the same fields in Data sources. | Both endpoint and knowledge-base name are required. Empty configuration remains disconnected. |
| 2. Authorize | `dealAgent.js` resolves the requested deal through the existing `get_deal` authorization path before retrieval. | A denied or status-only seat cannot use Foundry IQ as a side channel into the deal. |
| 3. Minimize | `foundryIq.js` creates a fixed IC-playbook query from sector, subsector, stage and one approved focus such as commercial, legal or technology. | Company name, deal id, valuation, figures, findings, documents and free-form user text are not sent to Search. |
| 4. Authenticate | `DefaultAzureCredential` requests a token for `https://search.azure.com/.default`. | The Container App identity holds **Search Index Data Reader**; no API key is used. |
| 5. Retrieve | The client calls `POST /knowledgebases/{name}/retrieve?api-version=2026-04-01` with one semantic intent. | Only Azure AI Search HTTPS endpoints are accepted; requests time out after 30 seconds. |
| 6. Normalize | The response is reduced to bounded answer text and at most eight citations containing source id, type, title, excerpt and an HTTPS URL when supplied by Search. | Raw activity and arbitrary source fields are not passed to the model or UI. |
| 7. Compose | The internal Deal Analyst applies the cited playbook requirements to the separately governed deal record. | `foundry_iq_search` is internal-data only. The external news agent is denied, and no citations means the assistant must say the playbook lacks supporting evidence. |

The first supported use case is an **IC playbook evidence brief**. A user asks, for example,
"Which approved technology diligence tests and IC evidence standards apply to this deal?" The
backend sends only the target classification and stage to Foundry IQ, receives cited firm
guidance, and then compares that guidance with the deal record already available inside the
authorized conversation. This separation prevents the shared knowledge service from becoming
another copy of confidential deal data.

The relevant implementation is
[`app/lib/foundryIq.js`](../../app/lib/foundryIq.js), with connector ownership in
[`app/lib/connectors.js`](../../app/lib/connectors.js), agent dispatch in
[`app/lib/dealAgent.js`](../../app/lib/dealAgent.js), and the enforced internal-tool boundary in
[`app/lib/agentSovereignty.js`](../../app/lib/agentSovereignty.js).

### 6. Application Insights: operational integration (45 seconds)

Open `rg-dealhub-core-<env>-<loc>` → `appi-dealhub-<env>-<loc>`.

1. Open **Application map**.
2. Point to the application nodes, request volume and failures only.
3. Optionally open **Live metrics** if it is already populated and contains no identifying
   dimensions.

> "Both runtime tiers report into observability owned by this subscription. This is where an
> operator proves availability and dependency behaviour without reading deal content. The
> application audit trail answers who changed a deal; Application Insights answers whether
> the platform and its dependencies behaved correctly."

Avoid raw traces and Logs in a shared-screen demo.

### 7. Return to Data sources: the integration boundary (60 seconds)

Return to the Deal Room → **Settings → Data sources**. Point to **Work IQ**, **Fund reporting
data** and **Approved diligence knowledge**.

> "The three IQs contribute different evidence. Work IQ brings in the live work around this
> deal. Fabric IQ brings the fund's structured market data and transaction history. Foundry IQ
> brings approved diligence and IC standards with citations. They don't call one another. The
> authorized Deal Analyst selects the sources needed for the question, keeps each result
> bounded, and composes the answer with its provenance intact."

> "A useful way to remember the roles is now, before and should. Work IQ says what is happening
> now. Fabric IQ says what the fund has seen before. Foundry IQ says what the firm says should
> be tested. Deal authorization happens before any of those results are combined."

Point to the connector's real status. Say **configured** unless a live round trip on that
screen has succeeded; do not use **connected** as a synonym.

### Close

> "What we have just shown is one governed intelligence plane over three evidence systems:
> current work from Work IQ, fund history from Fabric IQ, and approved standards from Foundry
> IQ. Two independently deployed runtime tiers, managed identities, scoped roles and
> customer-owned telemetry make that composition inspectable without exposing a key."

Return to the technical walkthrough for **Deploy, extend, jumpstart**.

### Short path (three minutes)

When time is tight, show only:

1. `rg-dealhub-app-<env>-<loc>` → backend Container App → **Revision management**.
2. `id-dealhub-<env>-<loc>` → **Azure role assignments**.
3. Azure AI Search → **Identity** and **Access control (IAM)**.
4. Deal Room → **Settings → Data sources** → **Work IQ**, **Fund reporting data**, then
   **Approved diligence knowledge**.

This preserves the runtime, authorization, live-work, fund-history and cited-knowledge proof
without opening data or telemetry surfaces.

## Part 2: IQ reference guide

Use this part when the room asks a question, wants to see one IQ capability in more depth, or
needs implementation guidance. Do not run it front to back. Start with the question, choose the
matching row below, and show the narrowest surface that proves the answer.

### Which IQ answers which question?

| Capability | Question it answers | Governed source | Best product proof | Best platform proof |
|---|---|---|---|---|
| **Work IQ** | "What is happening now around this deal?" | SharePoint and OneDrive files, Teams messages, mail and durable deal notes | Open a provisioned deal, then show its documents, conversation or Work IQ panel; use **Settings → Data sources → Work IQ** for connector status. | Show the app registration/API permissions only in a separately approved security review; the normal architecture demo stays in the product because Graph permissions are enforced per request. |
| **Fabric IQ** | "What does our fund data and transaction history tell us?" | Microsoft Fabric/OneLake companies, comparable deals, benchmark findings, IC precedents and filing metrics | Open **Market intelligence** for structured evidence; use the Fabric Data Agent question surface when available; use **Settings → Data sources** to state `live`, `materialized`, `seed` or grounded mode honestly. | Open the Fabric workspace and `deal_room_starter` lakehouse overview or lineage only when the presenter has approved read access. Do not open table rows in a shared-screen architecture review. |
| **Foundry IQ** | "Which approved firm standards apply to this deal?" | The approved diligence and IC playbook in Azure AI Search | Open **Settings → Data sources → Approved diligence knowledge**, run its real connectivity test, then ask the Deal Analyst an evidence-standard question and point to citations. | Show Azure AI Search **Overview**, **Identity**, **IAM**, and the knowledge-base name; show the Foundry model deployment separately. |

The shortest distinction to say aloud is:

> "Work IQ is now. Fabric IQ is before. Foundry IQ is should. The Deal Analyst combines only
> the evidence needed for the question, after identity and deal access are resolved."

### How the IQs interact

The IQs are peer evidence sources. They do not copy data into one another and they do not call
one another directly. The Deal Analyst is the orchestrator.

| Step | What happens | Boundary preserved |
|---|---|---|
| **1. Authorize** | The backend resolves the user, seat and deal before selecting tools. | A tool cannot widen deal access. |
| **2. Select** | The Deal Analyst chooses Work IQ, Fabric IQ, Foundry IQ or a combination based on the question. | Only necessary sources are called. |
| **3. Retrieve** | Each IQ returns bounded evidence from its own system under its own identity and permission model. | Microsoft 365 content stays in Graph; fund data stays in Fabric/OneLake; approved knowledge stays in Azure AI Search. |
| **4. Compose** | The Deal Analyst compares the returned evidence with the already authorized deal record. | Source labels, modes and citations remain attached. |
| **5. Respond** | The user receives one answer that distinguishes current facts, historical evidence and firm standards. | Missing or disconnected evidence is stated, not invented. |

**Example: "Is this deal ready for IC?"**

- **Work IQ** finds the latest diligence files, Teams decisions and relevant correspondence.
- **Fabric IQ** supplies comparable transactions, recurring diligence findings and prior IC
   conditions from the fund's OneLake data.
- **Foundry IQ** supplies the approved evidence requirements and IC playbook citations.
- **Deal Analyst** compares all three with the authorized deal record and identifies evidence
   present, gaps and next actions. It does not merge the three source systems or write back
   automatically.

### Question-to-screen guide

| If they ask... | Go here | Show | Say |
|---|---|---|---|
| "Can it read our Teams and SharePoint content?" | A provisioned deal → documents or conversation | A file list or Teams thread already visible to the current seat | "Work IQ uses Microsoft Graph. Delegated reads run as the signed-in user when a token is available, so Microsoft 365 permissions remain in force on top of deal access." |
| "Does it read a shared mailbox in the background?" | **Settings → Data sources → Work IQ** | The configured/connected status and mailbox target, not messages | "The app-only path is read-only and targets the configured shared mailbox. The mailbox is a data source, not a source of user authority." |
| "Where do comparables and IC precedents come from?" | **Market intelligence** | Comparable deals, benchmark findings, IC precedents and the displayed source/freshness mode | "Fabric IQ serves fund market data from OneLake. The screen states whether it is live or a point-in-time materialized snapshot." |
| "Can I ask the lakehouse a question in plain English?" | Fabric Data Agent question surface, when exposed | One bounded question and its cited/grounded answer | "A published Fabric Data Agent is used when bound; otherwise the app can ground a Foundry model on the same bounded snapshot and labels that mode explicitly." |
| "Can it apply our diligence methodology?" | Deal Analyst on an authorized deal | Ask: `Which approved technology diligence tests and IC evidence standards apply to this deal?` | "Foundry IQ retrieves the approved playbook; the Deal Analyst separately reads the authorized deal and applies only cited requirements." |
| "How do you stop the knowledge base leaking deal facts?" | Azure AI Search IAM, then this guide's Foundry IQ request path | Search Index Data Reader on the app identity and the minimized-query step | "The backend authorizes the deal first and sends only classification, stage and an approved focus. It does not send the company, valuation, findings, documents or free-form prompt to Search." |
| "How do we know a connector really works?" | **Settings → Data sources** | **Test** and the resulting status/latency | "Configured means settings exist. Connected means a real bounded round trip succeeded. The UI does not use those words interchangeably." |
| "Can an external agent use these sources?" | Architecture diagram or agent governance reference | The internal-data tool boundary | "Foundry IQ and Fabric IQ are internal-data tools. Agent sovereignty denies them to the external news agent; deal authorization still applies before deal context is composed." |

### Work IQ reference

**Request path:** Teams or web identity → backend deal authorization → governed Work IQ tool →
Microsoft Graph → bounded files, messages or mail result → Deal Analyst response.

**Where to show it:** begin in **Settings → Data sources → Work IQ** to establish honest status.
For a business proof, move to a provisioned deal and show **Documents**, **Conversation**, or the
shared Work IQ notes panel. Keep the current seat visible so the audience can connect the result
to a person and permissions.

**Implementation anchors:** `app/lib/m365/workIqGraph.js` owns Graph reads,
`app/lib/mcp/workiq.js` exposes the governed tools, and the Teams server performs delegated
on-behalf-of token exchange. The background mail path uses the configured
`WORKIQ_MAILBOX_USER` and app-only permissions.

**Claims you can make:** delegated reads preserve the signed-in user's Microsoft 365 access;
the app-only mailbox path is read-only; deal authorization is additive to Microsoft 365
authorization; unavailable Graph access degrades without inventing content.

**Do not claim:** that configuration proves every Graph permission has tenant consent, that an
app-only token represents a human, or that a user can see every file attached to a deal.

### Fabric IQ reference

**Request path:** authorized firm user → `/api/market-intel` or `/api/fabric/ask` → Fabric
adapter → live OneLake SQL endpoint or bounded materialized snapshot → filtered market evidence
or natural-language answer.

**Where to show it:** use **Market intelligence** first because it exposes the actual structured
evidence: companies, comparables, benchmark diligence findings, IC precedents and filing metrics.
Use **Settings → Data sources** to point out the Fabric Data Agent mode. If a dedicated question
surface is available, ask a bounded fund-data question such as `What recurring commercial
diligence risks appear in prior deals?`

**Modes to state exactly:**

- `live` — the app queried the Fabric lakehouse SQL analytics endpoint with managed identity;
- `materialized` — a point-in-time OneLake projection persisted in the app store;
- `seed` — the packaged snapshot extracted from the same lakehouse for a portable demo;
- Data Agent `grounded` — a Foundry model answers only over that bounded snapshot;
- Data Agent `live` — a published Fabric Data Agent endpoint answered with its citations.

**Implementation anchors:** `app/lib/fabric.js` owns the live/materialized/seed data contract,
`app/lib/fabricDataAgent.js` owns natural-language Q&A, and `/api/market-intel`, `/api/fabric`
and `/api/fabric/ask` are the backend proof routes.

**Do not claim:** that a snapshot is live, that a grounded fallback is a published Fabric Data
Agent, or that the mere existence of a Fabric workspace proves the current app can query it.

### Foundry IQ reference

**Request path:** authorized deal question → existing `get_deal` authorization → minimized
classification/stage/focus query → Azure AI Search knowledge-base retrieval → bounded answer and
citations → Deal Analyst composition against the separately governed deal record.

**Where to show it:** establish the connector in **Settings → Data sources → Approved diligence
knowledge**, then show Azure AI Search **Identity** and **IAM**. Return to an authorized deal and
ask one playbook question. End on the citations, not on the prose answer.

**Implementation anchors:** `app/lib/foundryIq.js` owns query minimization, managed-identity
authentication and citation normalization; `app/lib/dealAgent.js` dispatches the tool;
`app/lib/agentSovereignty.js` restricts it to internal agents; and
`app/scripts/provision_foundry_iq.py` provisions the index, source and knowledge base.

**Claims you can make:** no Search API key is stored in the runtime; the app identity has
Search Index Data Reader; confidential deal facts are excluded from the retrieval request;
citations are mandatory for a supported answer; a real retrieval is required for connected
status.

**Do not claim:** that Search stores the deal record, that Foundry IQ can bypass deal access,
or that a fluent uncited answer is acceptable evidence.

### Presenter decision rules

1. Start in the product unless the question is specifically about Azure ownership, identity or
    runtime. Product behavior proves the capability; the portal proves its deployment controls.
2. Show one bounded result, then its source or status. Do not browse broadly through customer
    data to make the demo feel live.
3. Name the active mode exactly: configured, connected, live, materialized, seed, grounded or
    disconnected.
4. For an access question, change seats or show IAM. Do not infer authorization from a successful
    result under an administrator account.
5. For a citation question, end on the source references. For a freshness question, end on the
    mode and timestamp. For a runtime question, end on revision health and telemetry.

### IQ fallback paths

- **Work IQ has no delegated token:** show connector status and explain the app-only/background
   boundary; do not open mailbox content to compensate.
- **Fabric is not live:** show the declared `materialized` or `seed` mode and lineage. Do not call
   it live; explain how `FABRIC_LIVE` and the workspace role enable direct SQL retrieval.
- **Fabric Data Agent is grounded:** show Market intelligence as the bounded source and say the
   answer uses the snapshot, not a published Data Agent endpoint.
- **Foundry IQ is disconnected:** show the required endpoint and knowledge-base fields, then use
   the backend request-path table. Do not claim live citations.
- **Portal access is denied:** return to [Architecture](../ARCHITECTURE.md) and this reference.
   Never elevate access during a shared-screen session.

## Failure handling

- **Portal asks for another sign-in:** stop the portal segment and continue with the
  [architecture diagrams](../ARCHITECTURE.md). Do not authenticate while screen sharing.
- **A blade returns Access denied:** say that the presenter identity is intentionally scoped,
  then use the diagram fallback. Do not elevate access during the meeting.
- **A resource name differs:** search inside the selected `rg-dealhub-*` group by resource
  type. Do not switch subscriptions until screen sharing is paused.
- **Application Map is empty:** skip it. The absence of recent telemetry is not evidence of a
  broken integration.
- **Foundry IQ is disconnected:** show the required endpoint and knowledge-base fields, explain
   that the status remains honest until a real retrieve call succeeds, and do not claim live
   citations for that environment.
- **Someone asks to see secrets or mailbox data:** decline and offer a separate, access-scoped
  review with audit logging enabled.

## Recorded-demo note

The standard `demo/capture.mjs` pipeline launches an isolated browser profile and intentionally
does not inherit Azure credentials. Keep this portal segment presenter-driven for one-off live
demos. A repeatable recording needs a dedicated, least-privilege capture identity, an approved
access plan, and a separate authenticated capture step; do not place portal credentials in a
scene manifest or environment committed to this repository.