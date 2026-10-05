# Agents and Microsoft IQ

The current solution separates policy, evidence, and deal work. The Node orchestrator owns every
handoff and applies caller identity, deal scope, and sovereignty rules before an agent or IQ
capability runs.

## Runtime topology

| Layer | Components | Responsibility |
|---|---|---|
| **Policy** | `deal-room-hosted-iq-router:2` | Returns a bounded route from prompt text; has no source tools |
| **Evidence** | `deal-room-iq` toolbox | Exposes the four official Microsoft IQ capability paths |
| **Deal work** | Six purpose specialists | Performs sourcing through value-creation work on caller-scoped context |
| **Execution** | Node orchestrator | Validates routes, enforces boundaries, performs A2A handoffs, and synthesizes |

## Four IQ paths

| Path | Toolbox capability | Evidence boundary |
|---|---|---|
| **Foundry IQ** | Azure AI Search knowledge-base MCP | Approved internal knowledge only |
| **Fabric IQ** | `fabric_iq_preview` | Governed Fabric and OneLake data only |
| **Work IQ** | `work_iq_preview` | Signed-in user's Microsoft 365 permissions |
| **Web IQ** | `web_search` | Public web only; no internal context |

Foundry IQ uses Microsoft's supported knowledge-base MCP contract; Web IQ is native Foundry web
search. Deal Room prompt-agent wrappers add bounded instructions and A2A collaboration without
replacing those official capabilities.

## Purpose specialists

| Purpose agent (`name`) | Job | Bundled skills | Stage |
|---|---|---|---|
| `deal-room-orchestrator` | Routes to the right purpose agent; answers "what can you do?" per role | *(routes to all)* | All |
| `deal-room-sourcing` | Find, map & qualify targets vs the mandate | `deal-sourcing`, `comps-analysis` | 1 |
| `deal-room-screening` | Screen vs mandate, comps & unit economics | `deal-screening`, `comps-analysis` | 1–2 |
| `deal-room-diligence` | Plan & drive diligence; red-flag risks | `dd-checklist` | 2 |
| `deal-room-modeling` | LBO / DCF / comps / returns, with sensitivity | `lbo-model`, `comps-analysis` | 2–3 |
| `deal-room-ic-memo` | IC memo + deck + citation audit | `ic-memo` | 3 |
| `deal-room-value-creation` | 100-day plan, EBITDA bridge, portfolio monitoring | `value-creation-plan`, `portfolio-monitoring` | 4 |

Skills live in [`skills/`](../../skills/) and are attached by job rather than by demo character.

## Bounded collaboration

The orchestrator selects at most two specialists per turn. A specialist may request one peer
from an explicit allow-list; the runtime validates the edge, disables recursion, and caps total
peer reviews. Findings are treated as untrusted data and cannot widen identity, scope, or tools.

## Sovereignty and actions

- Internal agents cannot access the public web.
- Web IQ cannot receive deal records, private documents, correspondence, or Work IQ output.
- Mixed internal/public requests are refused before either evidence source runs.
- Work IQ retains the signed-in user's Microsoft 365 permissions.
- Agent writes remain proposals until an authorized user approves them; accepted changes are
  attributed in the audit trail.

The optional **Agent activity** view reports routes, handoffs, peer review, source use,
refusals, and synthesis. It reports completed operations, not chain-of-thought.

## Sources of truth

| Concern | Implementation |
|---|---|
| IQ registry and precedence | [`iqRegistry.js`](../../app/lib/iqRegistry.js) |
| Hosted route client and fallback | [`hostedIqRouter.js`](../../app/lib/hostedIqRouter.js) |
| Handoffs and collaboration | [`purposeAgent.js`](../../app/lib/purposeAgent.js) |
| Sovereignty enforcement | [`agentSovereignty.js`](../../app/lib/agentSovereignty.js) |
| IQ and toolbox provisioning | [`create_iq_a2a_agents.py`](../../app/scripts/create_iq_a2a_agents.py) |
| Hosted router | [`hosted-agents/iq-router/`](../../hosted-agents/iq-router/) |
| Full flow | [Agent and IQ orchestration](../diagrams/agent-iq-a2a.md) |
