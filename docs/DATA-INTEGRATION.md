# Data integration — external market data & system-of-record fit

> How [The Deal Room](../README.md) **ingests external market data** (PitchBook, Capital IQ,
> Bloomberg, FactSet, Morningstar, LSEG, Moody's) and **fits alongside a firm's system of
> record** (DealCloud, Allvue/eFront, Salesforce Financial Services Cloud). It is a governed
> **decision & collaboration layer** over the deal lifecycle — not a replacement CRM or
> fund-accounting book of record.
>
> See also: [Access model](ACCESS-MODEL.md) · [Data sovereignty](DATA-SOVEREIGNTY.md) ·
> connector registry in [`app/lib/connectors.js`](../app/lib/connectors.js).

---

## The connector model

Every data source is a **connector** in one registry ([`connectors.js`](../app/lib/connectors.js)),
each with a **role** in the lifecycle and a **kind** that determines how it's reached. A connector
only ever reports **`connected`** when a **real reachability test actually succeeds** — there is no
faked status; unwired vendors are honestly reported as **disconnected** until entitled and tested.

| Role | Lifecycle job | Example connectors |
|---|---|---|
| `identity` | Sign-in substrate | M365 Login |
| `context` | Ground agents in the firm's own work | Work IQ (SharePoint/Teams/mail over MCP) |
| `discover` | Earliest soft signals | Web (Bing-grounded), GDELT, **PitchBook** |
| `confirm` | Cross-check facts & filings | SEC EDGAR, GLEIF, LSEG, **FactSet**, **Capital IQ** |
| `quality` | Fundamentals / credit / risk | Morningstar, Moody's, Fabric Data Agent |

**Kinds** map to an ingestion pattern:

| `kind` | Pattern | Auth | In registry today |
|---|---|---|---|
| `web` | Bing-grounded Foundry agent | Foundry project identity | Web |
| `edgar` / `gleif` / `gdelt` | **Free / official** REST, keyless | none | SEC EDGAR, GLEIF, GDELT |
| `mcp` | **Provider MCP server** over OAuth | per-provider OAuth (see [`lib/mcp`](../app/lib/mcp)) | Morningstar, LSEG, Moody's |
| `fabric-agent` | NL Q&A over the fund's OneLake lakehouse | managed identity | Fabric Data Agent |
| `workiq` | Governed M365 tools over MCP | Graph app-only / OBO | Work IQ |
| `database` | **Vendor DB / API** (entitlement-gated) | vendor key / SSO | PitchBook, FactSet, Capital IQ |
| `custom` | **User-registered source** (added in Settings, no code) | your integration | *(any the fund adds)* |

---

## Part A — External market-data ingestion

### What each provider is for

| Provider | Registry id · kind | Primary job | Sweet spot |
|---|---|---|---|
| **PitchBook** | `pitchbook` · `database` | Private-company fundings, PE/VC ownership, sponsor hold periods | Finding sponsor-exit and founder-owned **targets** |
| **Capital IQ** (S&P) | `capitaliq` · `database` | Deep financials, transaction history, filings, screening | **Comps**, precedent deals, filing full-text |
| **FactSet** | `factset` · `database` | Aggregated news + estimates + filings + ownership | Fast public-company monitoring & alerts |
| **Bloomberg** | *(add as `database`)* | Market data, reference data, news, fixed income | Real-time pricing, credit & rates for the financing case |
| **Morningstar** | `morningstar` · `mcp` | Fundamentals, ratings, equity & credit research | Quality / creditworthiness cross-check |
| **LSEG** (Refinitiv) | `lseg` · `mcp` | Market data, estimates, filings, ownership | Public-market reference cross-check |
| **Moody's** | `moodys` · `mcp` | Credit ratings, research & risk | Credit & default-risk cross-check |
| **SEC EDGAR** | `edgar` · free | 10-K/10-Q/8-K/proxies (official) | Real filings with clickable sources |
| **GLEIF** | `gleif` · free | Legal-entity (LEI) + ownership | KYC / entity resolution / ultimate parent |
| **GDELT** | `gdelt` · free | Global news & event stream | Broad live catalysts, no paid provider |

> The three **`database`** vendors (PitchBook, FactSet, Capital IQ) are **subscription-gated**
> placeholders today — the registry entry, role and UI exist, but they stay **disconnected**
> until a real credential is supplied and a live probe succeeds. This keeps the demo honest.

### Register a custom provider (no code)

When the platform ships no built-in for a provider you use, register it yourself in
**Settings → Data Sources → Add a data source** (or `POST /api/connectors`): give it a **name**,
a sourcing **role** (`discover`/`confirm`/`quality`/`context`) and an optional **endpoint URL**.
It appears immediately as a governed **`custom`** connector with an honest **reachability** probe
of the endpoint (any HTTP response = reachable; authentication is your integration's job — status
is never faked as `connected` without a real round-trip). The registry **rejects a name that
duplicates a built-in** ("if we don't already have one, add it"), and a custom source can be
toggled, tested and **removed** like any other. This is the runtime counterpart to the developer
**checklist** below — declare a source now, then wire a full provider module when you're ready.

### Ingestion patterns (how to wire a paid provider)

1. **Prefer a provider MCP server** (`kind: 'mcp'`) when the vendor offers one — it reuses the
   existing OAuth login routes and the `McpSession` `initialize` round-trip test
   ([`app/lib/mcp`](../app/lib/mcp)). This is how Morningstar / LSEG / Moody's connect.
2. **Otherwise wrap the vendor API** behind a `kind: 'database'` connector: a small provider
   module (mirror [`providers/gdelt.js`](../app/lib/providers/gdelt.js)) that authenticates with
   the vendor key/SSO, normalises the response, and returns `{ found, source, ... }`. Add a real
   `test<Provider>` probe in `connectors.js` so status is truthful.
   - **Bloomberg** specifically: use **Data License (DLWS/Per-Security)** or **B-PIPE** for
     entitled server-side data; the desktop **BLPAPI/Terminal** feed is **per-user
     entitlement-bound** and generally **not** redistributable to a shared backend — model it
     as a per-user connector, not a tenant-wide one.
3. **Entity-resolve into the canonical model.** Every feed is deduped into one governed
   **Company** record ([`model/company.js`](../app/lib/model/company.js)) by
   **domain → registry (LEI) → name**, so PitchBook, EDGAR and the news desk collapse to a
   single entity with tracked provenance — no double-counting across providers.
4. **Timeouts & fail-fast.** Connectivity **probes** must be snappy (fail fast, report *slow*)
   even when the underlying fetch allows a longer timeout — see the GDELT `timeoutMs` split in
   [`providers/gdelt.js`](../app/lib/providers/gdelt.js) and `testGdelt` in `connectors.js`.

### Governance

- **Sovereignty boundary.** External providers are **external-data**; the data-sovereignty guard
  ([DATA-SOVEREIGNTY.md](DATA-SOVEREIGNTY.md)) prevents internal deal context from leaking to a
  web/external agent and audit-logs any refusal.
- **Licensing / entitlement.** Paid feeds are gated by the firm's subscription and, where the
  vendor requires it, by **per-user** entitlement (Bloomberg, some FactSet/CapIQ seats). The
  connector's `configFields` capture the endpoint/credential; nothing is hard-coded.
- **Need-to-know.** Provider results surfaced inside a deal inherit the deal's access tier — an
  analyst never sees confirmatory data on a confidential deal they aren't named on.

### Adding a connector — checklist

1. Add an entry to `CONNECTORS` in [`connectors.js`](../app/lib/connectors.js) (`id`, `name`,
   `kind`, `role`, `primaryJob`, `sweetSpot`, and `configFields` for any runtime credential).
2. Implement a provider module (auth + fetch + normalise) or reuse the MCP path.
3. Add a **real** `test<Id>` probe and register it so status reflects an actual round-trip.
4. Map its output into the canonical **Company**/deal model for entity resolution.
5. Classify it (`internal` vs `external`) for the sovereignty guard.

---

## Part B — System-of-record (SoR) fit

The Deal Room is the **decision layer** — lifecycle stages, decision artifacts (LBO/returns,
value creation, risk register, IC memo), IC readiness and post-close monitoring. It **complements**
rather than replaces the firm's books of record:

| System of record | What it owns (the source of truth) | The Deal Room's relationship |
|---|---|---|
| **DealCloud** (Intapp) | Deal CRM — pipeline, contacts, relationships, mandates | **Pull** pipeline & entities in; **push** decisions/artifacts/IC outcomes back |
| **Salesforce Financial Services Cloud** | Relationship & pipeline CRM (LP + deal) | Same bi-directional pattern via Salesforce REST/Bulk API |
| **Allvue / eFront** | Portfolio monitoring, fund accounting, LP/ILPA reporting | **Feed** decision artifacts & post-close plans; **read** marks/NAV for the fund lens |

### Integration principles

- **One canonical id.** The Deal Room's governed **Company**/deal ids are the join key; map each
  to the SoR's native id (DealCloud entry id, Salesforce record id, Allvue entity id) so records
  reconcile deterministically. Reuse the same **domain → LEI → name** resolution as the data feeds.
- **Directional ownership.** The SoR remains authoritative for **pipeline stage, relationships and
  fund accounting**; the Deal Room is authoritative for **decision artifacts and IC governance**.
  Define, per field, who wins on conflict rather than syncing everything both ways.
- **Bi-directional sync.**
  - *Inbound:* import active deals, mandate/fund context and named teams — hydrating access
    (`deal.team` need-to-know) and the funnel.
  - *Outbound / write-back:* on IC decision, push the **IC memo link**, **returns summary**,
    **risk register** and **conditions** back to the deal record so the SoR carries the outcome.
- **Same connector framework.** Model each SoR as a connector (`kind: 'sor'`, `role: 'system'`)
  with a real probe (token refresh + a lightweight `GET`), so status is honest and credentials
  live in `configFields` — identical to the market-data providers above.
- **Cadence & idempotency.** Sync on a schedule + on decision events; make write-backs
  **idempotent** (keyed on the canonical id + artifact version) so a retry never duplicates.
- **Governance carries over.** Inbound records inherit the access model; outbound writes run under
  a scoped service identity with least privilege on the SoR side.

### Suggested sequencing

1. **Read-only inbound** from the primary deal CRM (DealCloud or Salesforce FSC) → hydrate the
   pipeline + named teams. Lowest risk, immediate value.
2. **Write-back of IC outcomes** (memo link, returns, conditions) once the id mapping is proven.
3. **Portfolio feed** to Allvue/eFront for the post-close monitoring + LP-reporting loop.
4. **Add the paid market-data providers** (Part A) behind entitlement, deepest first
   (Capital IQ / PitchBook for comps & sourcing, Bloomberg for the financing case).
