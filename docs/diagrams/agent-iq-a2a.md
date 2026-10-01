# Agent and IQ orchestration

![The Deal Room governed agent and IQ architecture](agent-iq-orchestration.svg)

The editable source is page 5 of [deal-room-architecture.drawio](deal-room-architecture.drawio). Regenerate the committed SVG with `pwsh scripts/build-diagrams.ps1`.

The hosted router is policy-only: it receives the prompt, returns a bounded route, and has no access to deal records, Microsoft 365, Fabric, search, or the public web. The Node orchestrator restores canonical metadata, applies identity and deal scope, enforces the internal/public boundary, and owns every capability or A2A handoff.

## Deployment truth

- `deal-room-hosted-iq-router:1` is the active hosted policy router in `proj-dealhub-dev`.
- Foundry IQ and Fabric IQ are governed capability paths, not dedicated A2A peers.
- Work IQ and Web IQ are the two live A2A peers. Work IQ retains the signed-in user's Microsoft 365 permissions; Web IQ is public-only.
- `deal-room-orchestrator` can fan out over A2A to at most two purpose specialists per turn, then synthesizes their grounded findings into one response.
- Mixed internal-data and public-web requests are refused before either evidence system is called.
- Visible traces contain route, handoff, source, refusal, and synthesis events, never private model reasoning.

## Purpose-agent A2A flow

| Agent | Work performed |
|---|---|
| `deal-room-sourcing` | Sourcing and target discovery |
| `deal-room-screening` | Initial screening and fit assessment |
| `deal-room-diligence` | Commercial, operational, and risk diligence |
| `deal-room-modeling` | Valuation, returns, and scenario modeling |
| `deal-room-ic-memo` | Investment Committee memo preparation |
| `deal-room-value-creation` | Post-close value-creation planning |

## Source references

| Concern | Source of truth |
|---|---|
| IQ names, precedence, and metadata | [iqRegistry.js](../../app/lib/iqRegistry.js) |
| Hosted route client and local fallback | [hostedIqRouter.js](../../app/lib/hostedIqRouter.js) |
| Handoffs and operational traces | [purposeAgent.js](../../app/lib/purposeAgent.js) |
| Agent and tool sovereignty | [agentSovereignty.js](../../app/lib/agentSovereignty.js) |
| Work IQ and Web IQ provisioning | [create_iq_a2a_agents.py](../../app/scripts/create_iq_a2a_agents.py) |
| Hosted policy implementation | [hosted-agents/iq-router](../../hosted-agents/iq-router/) |
