# Deal Room MCP server — connecting a Copilot Studio agent

This is the **Deal MCP server**: it exposes the fund's deals to a Copilot Studio agent
(e.g. a partner-MD decision copilot) over the Model Context Protocol, secured with
**Microsoft Entra ID**. Only the `/mcp` endpoint is Entra-protected; the rest of The
Deal Room (`/api/*`) stays anonymous by design.

## What it exposes (tools)

The tools reuse the in-app analyst's exact contracts (`lib/dealTools.js`), so a Copilot
Studio agent sees the same bounded, size-capped views as the in-app analyst — and can
**move deals forward** under a per-persona governance policy.

### Read tools (all personas)

| Tool | Args | Returns |
|---|---|---|
| `list_deals` | — | Every Stage-2 deal as a compact summary |
| `get_deal` | `deal_id`, `sections?` | One deal as a bounded analyst view (`sections` ⊆ `summary, financials, workstreams, memo, compliance, risks, activity`) |
| `search_deals` | `query` | Matching deal summaries (company / sector / thesis) |
| `list_pipeline` | — | The Stage-1 origination funnel: every candidate (O2/O3/O4) + funnel counts |
| `get_candidate` | `candidate_id` | One Stage-1 candidate: financials, fit score, stage, screening assessment |
| `get_candidate_artifact` | `candidate_id` | The candidate's deliverable — O2 Investment-Criteria Scorecard, O3 Triage Scorecard, or O4 IC Pre-Screen Memo |
| `get_deal_artifact` | `deal_id`, `step` (D1–D5) | The diligence-step deliverable — D1 Plan, D2 Findings, D3 Final IC Memo, D4 Execution Pack, D5 Close-out & 100-Day Plan |
| `get_ic_readiness` | `deal_id` | The IC-readiness board — seven questions + a READY / CONDITIONAL / NOT-READY verdict |
| `get_returns` | `deal_id` | LBO / returns model — IRR & MOIC, sources & uses, sensitivity vs the hurdle |
| `get_value_creation` | `deal_id` | Value-creation plan — EBITDA bridge, quantified levers, 100-day plan |
| `get_risk_register` | `deal_id` | Consolidated risk register — open risks by severity × likelihood |
| `get_market_intel` | `sector?` | Fabric / OneLake comparables, benchmark findings, IC voting precedents |
| `get_citation_audit` | `deal_id` | Every IC number mapped to a source, with unsourced figures flagged |
| `get_companies` | `in_funnel?` | The canonical, entity-resolved Company records across the sourcing feeds |
| `get_company` | `id` | One canonical Company record — identity, financials, provenance, funnel state |
| `get_fund_overview` | — | Fund / LP performance — capital deployed vs dry powder, MOIC / IRR, DPI / TVPI / RVPI, concentration vs the LPA limits |
| `get_portfolio` | — | Owned-company monitoring — hold period, current MOIC / IRR, value-creation progress, KPIs vs plan, status |
| `get_fund_value` | — | Executive value dashboard — pipeline acceleration + the fund headline |
| `get_next_actions` | `persona`, `deal_id?` / `candidate_id?` | The actions **your persona** may take right now on that entity — call this before acting |

### Action tools (persona-governed writes)

Every action takes a **`persona`** argument and is authorization-checked server-side, so a
tool call can never exceed the caller's persona powers.

| Tool | Args | Allowed personas |
|---|---|---|
| `send_to_screening` | `target_id` | analyst, partner |
| `screen_candidate` | `candidate_id`, `action` (advance/pass/park), `reason?` | analyst, partner |
| `triage_candidate` | `candidate_id`, `action`, `reason?` | analyst, partner |
| `gate_candidate` | `candidate_id`, `action` (advance = **PURSUE**), `reason?` | **partner only** |
| `launch_deal` | `deal_id` | analyst, partner |
| `advance_deal` | `deal_id` | analyst, partner |
| `approve_ic` | `deal_id` | **partner only** |
| `run_step` | `deal_id`, `step` | analyst, partner, sector MDs |
| `assign_lane` | `deal_id`, `lane`, `md` | analyst, partner |
| `record_finding` | `deal_id`, `lane?`, `text`, `severity?`, `source?` | any — but **sector MDs only into their own lane** |

### Personas & their write powers

The platform has **ten** personas; the **five** below are the ones with *write*
powers on the pipeline. The other five (principal, operating-partner, fund-cfo,
legal-gc, ir-lp) are **read-focused** — they answer through the read tools above
(including the fund / portfolio lens) and act only where their persona grants.

| Persona (`persona` arg) | Role | Can do |
|---|---|---|
| `analyst` | Deal Associate | Run the funnel (screen/triage), launch diligence, run steps, record findings (any lane), advance deals |
| `partner` | Deal Sponsor | Everything the analyst can, **plus** the O4 gate PURSUE and the D4 IC approval |
| `retail-md` | Commercial-lane MD | Record findings + run steps in the **commercial** lane |
| `ai-md` | Tech/AI-lane MD | Record findings + run steps in the **techai** lane |
| `supply-md` | Operations-lane MD | Record findings + run steps in the **operations** lane |

Separation of duties (grounded in the real fund): only the **partner** may PURSUE a deal at
the Screening Gate and approve it at the IC; each **sector MD** may only touch its own
diligence lane; the **analyst** runs the top of the funnel.

Data lives behind a **pluggable store** (`DEALROOM_STORE`): a lean **blob-per-document**
backend (the default — no Cosmos), **Azure Cosmos DB for NoSQL** (database `dealroom`,
containers `deals` + `companies`), or in-memory for local dev. The server reads/writes
via the Container App's managed identity (RBAC-only); the agent never touches the store
directly. Durable backends use ETag / optimistic concurrency so the persona agents + the
dashboard stay consistent under concurrent writes.

## Endpoint

```
POST https://<MCP_HOST>/mcp
```

Transport: **Streamable HTTP** (`x-ms-agentic-protocol: mcp-streamable-1.0`) — the only
transport Copilot Studio supports (SSE was retired Aug 2025). Stateless: no session
affinity, so it scales across replicas.

## Entra ID app registration (create in your tenant)

| Field | Value |
|---|---|
| Application (client) ID | `<MCP_CLIENT_ID>` |
| Directory (tenant) ID | `<ENTRA_TENANT_ID>` |
| Application ID URI | `api://<MCP_CLIENT_ID>` |
| Delegated scope | `deals.read` → `api://<MCP_CLIENT_ID>/deals.read` |
| App role (app-only) | `deals.read.app` |

The server validates every bearer token against this app: signature (tenant JWKS),
issuer (`login.microsoftonline.com/<tenant>/v2.0` **or** `sts.windows.net/<tenant>/`),
audience (the client ID or the App ID URI), and tenant. If `MCP_REQUIRED_SCOPE` is set,
the token must also carry that delegated scope (`scp`) or app role (`roles`).

## Add it in Copilot Studio (MCP onboarding wizard — recommended)

1. Open your agent → **Tools** → **Add a tool** → **New tool** → **Model Context Protocol**.
2. Fill in:
   - **Server name**: `Deal Room`
   - **Server description**: `Read the fund's deals — thesis, key figures, diligence, memo, compliance and risks — to advise on a deal.`
   - **Server URL**: the `/mcp` endpoint above.
3. **Authentication** → **OAuth 2.0** → **Manual**, then supply:
   - **Client ID**: `<MCP_CLIENT_ID>`
   - **Client secret**: *(create one — see below; do not commit it)*
   - **Authorization URL**: `https://login.microsoftonline.com/<ENTRA_TENANT_ID>/oauth2/v2.0/authorize`
   - **Token URL template**: `https://login.microsoftonline.com/<ENTRA_TENANT_ID>/oauth2/v2.0/token`
   - **Refresh URL**: same as the Token URL
   - **Scopes**: `api://<MCP_CLIENT_ID>/deals.read`
4. Select **Create**. Copilot Studio shows a **callback (redirect) URL** — copy it.
5. In Entra (this app registration) → **Authentication** → add that callback URL as a
   **Web** redirect URI. (Copilot Studio's global redirect is
   `https://global.consent.azure-apim.net/redirect`; the wizard shows the exact one.)
6. Back in Copilot Studio, **Create a new connection**, sign in, consent to `deals.read`,
   then **Add to agent**. Turn on **generative orchestration** (required for MCP tools).

> Alternative (Option 2): import `mcp/deal-mcp-openapi.yaml` as a **custom connector**
> in Power Apps (Tools → Add a tool → New tool → Custom connector → Import OpenAPI file).

## Create the client secret (for the manual OAuth config)

```powershell
az ad app credential reset --id <MCP_CLIENT_ID> `
  --display-name "copilot-studio" --years 1 --query password -o tsv
```

Paste the value into the Copilot Studio **Client secret** field. Store it in Key Vault;
never commit it.

## Server config (env)

Set on the Container App (already wired in `infra/main.bicep`):

| Env | Value | Purpose |
|---|---|---|
| `ENTRA_TENANT_ID` | `<ENTRA_TENANT_ID>` | Issuer + JWKS |
| `MCP_AUDIENCE` | `<MCP_CLIENT_ID>,api://<MCP_CLIENT_ID>` | Accepted audiences |
| `MCP_REQUIRED_SCOPE` | *(optional)* `deals.read` | Extra gate: require the delegated scope on every `/mcp` call |
| `MCP_WRITE_SCOPE` | *(optional)* `deals.act` | Extra gate: require this scope/role specifically for the **action** tools |
| `MCP_DEFAULT_PERSONA` | *(optional)* e.g. `analyst` | Fallback persona when a call omits one |
| `MCP_PERSONA_BY_APPID` | *(optional)* `appid1=partner,appid2=supply-md` | Bind persona to the calling app registration (Option 2 hardening) |
| `MCP_AUTH_DISABLED` | *(local dev only)* `true` | Bypass validation for local testing |

Fail-closed: if auth isn't explicitly disabled and tenant/audience aren't configured,
`/mcp` returns **503** rather than serving deals unauthenticated.

## Persona identity — how each agent proves who it is

Each of the five agents declares its persona via the **`persona` tool argument** (Option 1:
fastest to wire up — one connection config, the persona is set in the agent's instructions).
This is a **governance guardrail** among trusted first-party agents, not a hard security
boundary. Instruct each agent to always pass its own persona, e.g. the Supply-Chain MD agent
always sends `persona: "supply-md"`.

To **harden** later without changing any tools, use the `resolvePersona()` seam
(`lib/personaPolicy.js`):
- **Option 2** — give each agent its own app registration and set
  `MCP_PERSONA_BY_APPID` so the server binds persona to the verified `appid` claim (persona
  no longer self-asserted).
- **Option 3** — delegated user identity + a user→persona directory for true attribution.

Add a **`deals.act`** delegated scope (or app role) to the app registration and set
`MCP_WRITE_SCOPE=deals.act` to require agents to hold write consent before any action tool
runs — reads stay available with only `deals.read`.

## How agents move deals forward (recommended agent loop)

1. `list_pipeline` / `list_deals` (or `search_deals`) to find the entity.
2. `get_candidate_artifact` / `get_deal_artifact` to read the current deliverable.
3. `get_next_actions(persona, deal_id|candidate_id)` — the allowed, stage-valid moves.
4. Call the chosen action tool (e.g. `record_finding`, `gate_candidate`, `advance_deal`)
   with the agent's `persona`. Denied moves return `{ "error": "forbidden", "detail": … }`
   explaining why — surface that to the user rather than retrying.

## Scoping the agent to one deal

The read tools run in portfolio scope (any deal reachable by id) — the natural contract
for an orchestrated agent. To focus a Copilot Studio conversation on a single deal, do it
in the **agent's instructions/topic** (resolve the deal via `search_deals`/`list_deals`,
then pin `get_deal(<that id>)`). The in-app Foundry analyst's hard per-deal lock
(`lib/dealTools.js` `dispatchTool` with `scope:'deal'`) remains available for UI chat.
