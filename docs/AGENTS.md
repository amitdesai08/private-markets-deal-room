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

## Purpose-based agents & orchestrator delegation (live in Foundry)

The persona roster above is **role-shaped** (one agent per person). The target topology is
**purpose-shaped**: a small set of task agents named for the *job*, with the **Deal Room
orchestrator** deciding which one to delegate to, threading the caller's **identity**, and
composing the answer. Personas become a *lens* (framing + which skills apply), not a separate
agent each. **The seven purpose agents are provisioned live in the Foundry project
`proj-dealhub-dev`** ([purpose-agents.env](../app/scripts/purpose-agents.env)) alongside the
personas — additive and non-destructive.

**This delegation is now wired and live.** The single assistant is driven by
[`purposeAgent.js`](../app/lib/purposeAgent.js): the orchestrator **routes** a request (answer
directly, or delegate to ≤2 stage specialists), the app **consults** the chosen `deal-room-*`
specialists in parallel, and the orchestrator **composes** one grounded answer (the response
reports which agents it used). It's gated by `ORCHESTRATION=purpose` (set on the `dev` backend)
with automatic fallback to the single-agent analyst chat, so it can never hard-fail — unset the
flag to revert instantly. The capabilities feature works against either topology.

| Purpose agent (`name`) | Job | Bundled skills | Stage |
|---|---|---|---|
| `deal-room-orchestrator` | Routes to the right purpose agent; answers "what can you do?" per role | *(routes to all)* | All |
| `deal-room-sourcing` | Find, map & qualify targets vs the mandate | `deal-sourcing`, `comps-analysis` | 1 |
| `deal-room-screening` | Screen vs mandate, comps & unit economics | `deal-screening`, `comps-analysis` | 1–2 |
| `deal-room-diligence` | Plan & drive diligence; red-flag risks | `dd-checklist` | 2 |
| `deal-room-modeling` | LBO / DCF / comps / returns, with sensitivity | `lbo-model`, `comps-analysis` | 2–3 |
| `deal-room-ic-memo` | IC memo + deck + citation audit | `ic-memo` | 3 |
| `deal-room-value-creation` | 100-day plan, EBITDA bridge, portfolio monitoring | `value-creation-plan`, `portfolio-monitoring` | 4 |

Each skill lives at `skills/<slug>/SKILL.md` (see [SKILLS.md](../SKILLS.md) for the format).
The scaffold script is [create_purpose_agents.py](../app/scripts/create_purpose_agents.py) —
it provisions the seven agents in **Foundry**, each reaching the fund's governed data through
the **same read-only MCP** (so RBAC + need-to-know stay enforced server-side), and bundling its
skills. Why purpose-shaped: less duplication (seven deal-team personas did overlapping work),
clearer skills ownership, and an orchestration seam that maps onto the Foundry Managed-Agents /
Cowork handoff model. Same governed tools, **same data-protection guarantees** below — only the
topology changes.

## "What can you do?" — role-aware capabilities

Any user can ask the assistant **"what can you do?"** (or "how can you help", "help me get
started") and get an answer **scoped to their Entra role and deal stage** — so someone can walk
in blind and discover what's available *to them*. It's deterministic (no model call): the
[capabilities.js](../app/lib/capabilities.js) module maps the role to the purpose agents,
skills, write-actions and limits it's allowed, and the chat endpoints short-circuit capability
questions before the deal gate. There's also a `GET /capabilities` endpoint returning the same,
role-scoped, for the UI. See [PERSONAS.md](PERSONAS.md) for the persona→role→access map and
[EXPLAINER.md](EXPLAINER.md) for the plain-English tour.

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
