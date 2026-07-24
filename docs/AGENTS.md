# Agents & skills

Every AI agent in The Deal Room, its **objective**, its data-sovereignty **class**, the
**tools/skills** it uses, and where it fits the deal lifecycle. The class is enforced
server-side by [agentSovereignty.js](../app/lib/agentSovereignty.js) — an *internal-data*
agent can never reach the public web, and the *external-web* scout can never read internal
deal data (see [DATA-SOVEREIGNTY.md](DATA-SOVEREIGNTY.md)).

> Character names are the demo personas ([app/data/personas.js](../app/data/personas.js));
> the RBAC "view-as" roster is a separate, minimal set ([demoProfiles.js](../app/data/demoProfiles.js)).

## Classes

| Class | Reaches internal deal data | Reaches the public web |
|---|:--:|:--:|
| **internal-data** | ✓ (governed, deal-scoped, need-to-know) | ✗ never |
| **external-web** | ✗ never | ✓ (public sourcing only) |

## The roster

| Agent (`name`) | Persona | Class | Objective | Serves |
|---|---|---|---|---|
| `deal-room-analyst` | Maya Olsen — Analyst | internal-data | Read-only deal & portfolio analysis; runs the origination funnel | Stage 1–2 |
| `deal-room-partner` | Eleanor Bishop — Partner | internal-data | Deal sponsorship, go/no-go, IC gatekeeping | All stages |
| `deal-room-principal` | Principal — Deal Lead | internal-data | Deal lead / orchestration, IOI/LOI into IC | Stage 1–3 |
| `deal-room-retail-md` | Retail MD | internal-data | Commercial diligence (market, customer, share) | Stage 2 |
| `deal-room-ai-md` | AI / Tech MD | internal-data | Tech / AI diligence & digital value | Stage 2 |
| `deal-room-supply-md` | Supply-Chain MD | internal-data | Operations & supply-chain diligence | Stage 2 |
| `deal-room-operating-partner` | Operating Partner | internal-data | Value creation — 100-day plan, EBITDA bridge | Stage 3–4 |
| `deal-room-fund-cfo` | Fund CFO | internal-data | Returns & financing — LBO / IRR / MOIC, sources & uses | Stage 2–4 |
| `deal-room-legal-gc` | General Counsel | internal-data | Legal diligence & execution — SPA, R&W, KYC/AML | Stage 2–3 |
| `deal-room-ir-lp` | Sofia Marchetti — IR / LP | internal-data | LP lens — exposure, ILPA/SFDR reporting, concentration | All stages |
| `deal-room-fabric` | Fabric Data Agent | internal-data | NL Q&A over the fund's OneLake lakehouse | Cross-cutting |
| `deal-room-news-scout` | News Scout | **external-web** | Public web sourcing signals (Bing-grounded) | Stage 1 (sourcing) |

## Direction — purpose-based agents & orchestrator delegation

The roster above is **persona-based** (one agent per role). We are moving to a
**purpose-based** model: a small set of task agents named for the *job* — **Sourcing**,
**Screening**, **Diligence**, **Modeling**, **IC-Memo**, **Portfolio-Monitoring** — with the
**Deal Room Analyst as the orchestrator** that decides which task agent to delegate to,
threads the request **plus the caller's identity**, and composes the answer. Personas become
a *lens* (framing + which skills apply), not a separate agent each.

Why: less duplication (seven deal-team personas did overlapping work), clearer skills
ownership, and an orchestration seam that maps onto the Foundry Managed-Agents / Cowork
handoff model (see [ACTION-ITEMS.md](ACTION-ITEMS.md) H). The migration keeps the same
governed tools and the **same data-protection guarantees** below — only the agent topology
changes. Rebuilt agents are provisioned in **Foundry**, integrate with **Cowork** for
document authoring, and each ships a **[SKILLS.md](../SKILLS.md)** so customers can extend
them.

## Tools

**Governed deal tools** (internal-data agents, via [dealTools.js](../app/lib/dealTools.js) and the
read-only MCP [dealServer.js](../app/lib/mcp/dealServer.js)):
`list_deals` · `get_deal` · `search_deals` · `list_pipeline` · `get_candidate` ·
`get_candidate_artifact` · `get_deal_artifact` · `get_ic_readiness` · `get_returns` ·
`get_value_creation` · `get_risk_register` · `get_market_intel` · `get_citation_audit` ·
`get_companies` · `get_company` · `get_next_actions`. Write/action verbs
(`launch_deal`, `advance_deal`, `record_finding`, …) are additionally authorised **per
persona** in [personaPolicy.js](../app/lib/personaPolicy.js).

**Work IQ tools** (M365 work data — internal-data only; governed + delegated;
[workiq.js](../app/lib/mcp/workiq.js)): `workiq_search_files` (SharePoint/OneDrive) ·
`workiq_read_channel` (Teams) · `workiq_search_mail` (Outlook) · `workiq_search`
(cross-M365). Inert until an endpoint is set in **Settings → Data Sources → Work IQ** and a
delegated sign-in is completed.

**Web tools** (external-web only): Bing-grounded search — never available to internal agents.

## Skills (per stage)

The quick-actions each stage/persona exposes ([flow.js](../app/data/flow.js) `skills`,
[personas.js](../app/data/personas.js) `actions`):

| Stage | Skills |
|---|---|
| **1 · Origination & Screening** | `@deal-screening` · `@comps-analysis` |
| **2 · Diligence & Approval** | `@diligence-planner` · `@ic-memo` |
| **3 · Execution & Closing** | SPA review · KYC/AML clearance · funds-flow |
| **4 · Value Creation & Exit** | value-creation plan · returns bridge · LP reporting |

Persona quick-actions (examples): Analyst — *draft screening one-pager*, *generate comps*,
*summarize the CIM*; Retail MD — *synthesize commercial DD*, *assess customer concentration*;
Fund CFO — *build the LBO case*, *run a returns sensitivity*; GC — *summarize SPA / R&W issues*,
*run KYC/regulatory check*.

## Governance & data protection

Agents can **never** be a side-channel around the access model — an answer is always bounded
by *who is asking*:

- **Identity-gated tool dispatch (enforced)** — the requesting user's identity + view-as role
  are threaded into every agent read ([dispatchTool](../app/lib/dealTools.js),
  [dealAgent.js](../app/lib/dealAgent.js), [personaAgent.js](../app/lib/personaAgent.js)).
  `get_deal` **refuses** a deal the caller can't see (`access-denied`) and **redacts** restricted
  ones to status-only; `list_deals` / `search_deals` return only the caller's visible deals. A
  user cannot ask an agent to fetch a confidential deal they'd be blocked from in the UI.
- **HTTP gate** — deal-scoped chat is authorised (`authorizeDealContent`) before the agent runs;
  read-only roles are routed to the read-only analyst; write verbs require the role.
- **Class guard** — every agent↔tool call is checked against the agent's class; boundary
  crossings are refused and **audit-logged** (`sovereignty-denied`).
- **Deal scope** — a deal-scoped conversation hard-filters every read to the focused deal.
- **Need-to-know** — portfolio agent context excludes `confidential` deals; Work IQ reads run as
  the signed-in user, so an agent only sees what that user is entitled to.
- **Persona authority** — write verbs are set by the server per persona, never by the model.
