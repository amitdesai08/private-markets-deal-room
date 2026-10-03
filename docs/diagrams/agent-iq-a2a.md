# Agent and IQ orchestration

![The Deal Room governed agent and IQ architecture](agent-iq-orchestration.svg)

The editable source is [agent-iq-high-level-flow.drawio](agent-iq-high-level-flow.drawio). Regenerate the committed SVG with `pwsh scripts/build-diagrams.ps1`.

The hosted router is policy-only: it receives the prompt, returns a bounded route, and has no access to deal records, Microsoft 365, Fabric, search, or the public web. The Node orchestrator restores canonical metadata, applies identity and deal scope, enforces the internal/public boundary, and owns every capability or A2A handoff.

## Deployment truth

- `deal-room-hosted-iq-router:2` is the single active policy router in `proj-dealhub-dev`.
- Four visible IQ prompt agents are deployed for bounded Deal Room collaboration. Separately, the `deal-room-iq` toolbox exposes Microsoft's native `work_iq_preview`, `fabric_iq_preview`, Foundry IQ knowledge-base MCP, and `web_search` capabilities through one reusable managed surface.
- Foundry IQ retrieves cited firm playbooks from an Azure AI Search knowledge base.
- Fabric IQ keeps three governed capabilities distinct: a Fabric Data Agent over the five bounded lakehouse tables, a Direct Lake semantic model for trusted KPIs, and an Ontology whose managed GraphModel enables relationship traversal.
- Work IQ retains the signed-in user's Microsoft 365 permissions; Web IQ is public-only.
- Microsoft Agent 365 is the registry, identity, compliance, security, and observability control plane. It is not a grounded-evidence route. Foundry activity logging is enabled, but this tenant currently reports `NotLicensed`, so Agent 365 ingestion and registry verification remain blocked until licensing and agent publication are complete.
- `deal-room-orchestrator` can fan out over A2A to at most two purpose specialists per turn. A specialist may then request one allow-listed peer review before synthesis.
- Mixed internal-data and public-web requests are refused before either evidence system is called.
- Visible traces contain route, handoff, collaboration, source, refusal, and synthesis events, never private model reasoning.

## Purpose-agent A2A flow

| Agent | Work performed |
|---|---|
| `deal-room-sourcing` | Sourcing and target discovery |
| `deal-room-screening` | Initial screening and fit assessment |
| `deal-room-diligence` | Commercial, operational, and risk diligence |
| `deal-room-modeling` | Valuation, returns, and scenario modeling |
| `deal-room-ic-memo` | Investment Committee memo preparation |
| `deal-room-value-creation` | Post-close value-creation planning |

### Bounded collaboration

Specialists request peer evidence with a structured `PEER_REQUEST` control line. The Node orchestrator validates the edge against an explicit allow-list; agents cannot select arbitrary peers or invoke one another directly. Sourcing can ask screening or diligence to challenge target fit, while diligence, modeling, IC-memo, and value-creation agents can request the adjacent disciplines needed to test assumptions and decision impact.

Each originating finding receives at most one peer round. If the requested peer already ran in the initial fan-out, its grounded finding is reused. Otherwise the orchestrator invokes that peer once with the same caller-scoped context, then asks the originating specialist to revise its recommendation and state how the peer evidence influenced it. Peer prompts disable further delegation, total collaboration requests are capped at two, and an unavailable peer leaves the original specialist finding intact.

The peer question and both agent findings are treated as untrusted data. They cannot alter identity, deal scope, tool access, or the internal/public sovereignty boundary. Each trace edge records the requesting agent, reviewing agent, A2A protocol, and running, complete, or blocked status.

## Source references

| Concern | Source of truth |
|---|---|
| IQ names, precedence, and metadata | [iqRegistry.js](../../app/lib/iqRegistry.js) |
| Hosted route client and local fallback | [hostedIqRouter.js](../../app/lib/hostedIqRouter.js) |
| Handoffs and operational traces | [purposeAgent.js](../../app/lib/purposeAgent.js) |
| Agent and tool sovereignty | [agentSovereignty.js](../../app/lib/agentSovereignty.js) |
| Four-IQ agent and A2A toolbox provisioning | [create_iq_a2a_agents.py](../../app/scripts/create_iq_a2a_agents.py) |
| Fabric semantic model and ontology definitions | [generate-fabric-iq-definitions.mjs](../../app/scripts/generate-fabric-iq-definitions.mjs) |
| Fabric Data Agent definition | [generate-fabric-data-agent-definition.mjs](../../app/scripts/generate-fabric-data-agent-definition.mjs) |
| Native IQ connection metadata and Agent 365 opt-in | [ai.bicep](../../infra/modules/ai.bicep) |
| Hosted policy implementation | [hosted-agents/iq-router](../../hosted-agents/iq-router/) |
