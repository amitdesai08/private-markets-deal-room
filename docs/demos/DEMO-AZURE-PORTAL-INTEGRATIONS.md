# Azure Portal integration proof

An optional seven-minute companion to the
[technical walkthrough](DEMO-WALKTHROUGH-TECHNICAL.md). It replaces the diagram-only Azure
footprint segment with a live, read-only click-through of the deployed resources.

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
| Application Insights | Both runtime tiers feed the customer's own operational telemetry. |
| Deal Room Data sources | Foundry IQ and Work IQ are configured at the governed application boundary, not as browser plug-ins. |

This is a proof path, not a general Azure tour. Do not open data explorers, secret values,
mailbox contents, raw traces, access tokens, or the account/tenant switcher while presenting.

## Before the meeting

1. Use a clean browser profile and sign in to the Azure portal with an account that has
   read-only visibility of the deployment. Collapse the account menu before sharing.
2. Choose the environment. The examples below use `<env>` and `<loc>` rather than fixed names;
   the current development deployment uses `dev` and `swc`.
3. Resolve the backend Container App resource ID, then verify the current session without
   changing Azure:

   ```powershell
   $resourceId = az containerapp show `
     --name ca-dealhub-orch-beta `
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
   - `appi-dealhub-<env>-<loc>`
   - Deal Room **Settings → Data sources**
5. Confirm the Container Apps and Application Insights pages show healthy data. If telemetry
   is empty, skip that stop rather than generating synthetic traffic during the meeting.

## Safety rails

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

## The click path

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

Open `rg-dealhub-app-<env>-<loc>` and select the backend Container App. For the current beta
environment that is `ca-dealhub-orch-beta`.

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

Return to the Deal Room → **Settings → Data sources**. Point first to **Approved diligence
knowledge**, then to **Work IQ**.

> "Foundry IQ and Work IQ answer different questions. Foundry IQ retrieves reusable, approved
> firm knowledge with citations. Work IQ reads the live files, Teams messages and mail that a
> user or background process is permitted to access. The Deal Room keeps both behind the same
> connector status, agent-sovereignty and deal-authorization boundaries."

> "Azure proves where the workloads, identity, models and telemetry live. Work IQ completes
> the integration story at the application boundary: Microsoft Graph supplies files, Teams
> messages and mail under delegated user permissions where available, with a read-only
> app-only path for background work. The configured shared mailbox is a target for that
> app-only search path, not a source of authority for the user-facing session."

Point to the connector's real status. Say **configured** unless a live round trip on that
screen has succeeded; do not use **connected** as a synonym.

## Close

> "What we have just shown is the same request path from both sides: governed Foundry IQ and
> Work IQ connectors in the product, two independently deployed runtime tiers, managed
> identities with scoped Azure roles, customer-owned model and knowledge deployments, and
> customer-owned telemetry. The integration is inspectable without exposing a key or opening
> a data record."

Return to the technical walkthrough for **Deploy, extend, jumpstart**.

## Short path (three minutes)

When time is tight, show only:

1. `rg-dealhub-app-<env>-<loc>` → backend Container App → **Revision management**.
2. `id-dealhub-<env>-<loc>` → **Azure role assignments**.
3. Azure AI Search → **Identity** and **Access control (IAM)**.
4. Deal Room → **Settings → Data sources → Approved diligence knowledge → Work IQ**.

This preserves the runtime, authorization, cited-knowledge and live-work integration proof
without opening data or telemetry surfaces.

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