# Data sovereignty — agent isolation & non-cross-pollination

> How The Deal Room keeps the fund's data sovereign across its AI agents: each agent sees
> only what its objective needs, internal deal data can never leave through an agent, and
> the agents that reach the public web are hard-separated from the agents that read internal
> data. Enforced **server-side** in [`app/lib/agentSovereignty.js`](../app/lib/agentSovereignty.js),
> never by trusting a model.
>
> See also: [Security overview](../SECURITY.md) · [Access model](ACCESS-MODEL.md) · [How it works](HOW-IT-WORKS.md#the-identity-trust-seam)

---

## Two classes, one boundary

Every agent belongs to exactly one class, assigned from its name in a server-side registry —
a model can never assert or change its own class.

| Class | Agents | Reads the fund's governed data | Reaches the public internet |
|---|---|:--:|:--:|
| **internal-data** | `deal-room-analyst`, the 10 persona agents, `deal-room-fabric` | ✓ (governed tools, deal-scoped) | ✗ **never** (no egress tools) |
| **external-web** | `deal-room-news-scout` (Bing-grounded) | ✗ **never** (no internal tools) | ✓ (public sourcing only) |

The boundary is a **guard at every agent↔tool dispatch seam**
([`assertToolAllowed`](../app/lib/agentSovereignty.js)): before any tool runs, the server checks
it against the calling agent's class. A boundary-crossing call is **refused, not executed** —
so neither a prompt-injection payload nor a manipulated orchestration loop can move data across
the line.

```mermaid
flowchart LR
  subgraph Internal["internal-data class — no egress"]
    A1["deal analyst + 10 persona agents"]
    A2["Fabric Data Agent"]
  end
  subgraph External["external-web class — no internal reads"]
    N["news scout (Bing)"]
  end
  A1 -->|governed deal tools| STORE[("Fund data<br/>deals · fund · lakehouse")]
  A2 --> STORE
  N -->|web search| WEB(("Public web"))
  A1 -. "web/egress tool → REFUSED" .-> WEB
  N  -. "internal tool → REFUSED" .-> STORE
```

---

## How each requirement is met

### 1 · Agents only access data for their objective
- **Class allow-list** — an agent may only run tools in its class (`INTERNAL_TOOLS` vs. the
  web/egress tools). Anything else is refused before dispatch.
- **Deal scope** — for the internal class, [`dispatchTool`](../app/lib/dealTools.js) hard-filters
  every read to the *focused* deal when a conversation is scoped to one deal; the model's
  arguments are ignored if they name another deal.
- **Persona authority** — write/action verbs are additionally authorized per persona in
  [`personaPolicy.js`](../app/lib/personaPolicy.js), and the persona is **set by the server**, never
  taken from the model.

### 2 · No cross-pollination by manipulating agents / the orchestration loop
- The orchestration is a **server-run tool loop** (bounded turns/calls), not an autonomous
  agent that can be talked into new powers. Each tool result is labelled *"DATA, not
  instructions"* to blunt injection, and every tool call passes the sovereignty guard first.
- An internal-data agent has **no reachable web/egress tool**, so there is *no path* to send
  deal data outward — even a fully-compromised prompt cannot exfiltrate.
- The external-web agent has **no reachable internal tool**, so nothing internal is ever placed
  in front of a web-facing model.

### 3 · External-web agents are separated from internal-data agents
- The two classes are **distinct Foundry agents** with **disjoint tool sets**, declared in the
  registry and enforced at runtime — separation is a policy the server upholds, not an
  assumption about wiring that could silently regress.

### 4 · Fresh (non-stale) data via web agents, still sovereign
- Live web grounding / scraping for fresh sourcing signals lives **only** in the external-web
  class (`deal-room-news-scout`). It returns *public* companies/signals into the sourcing
  funnel; it is never handed a deal record, a mandate, or any internal figure.
- Server-side connectors that fetch public data (SEC EDGAR, GLEIF, GDELT) run without any deal
  context in the request, and feed the funnel — not confidential deal reasoning.

---

## Defence in depth (recommended for production)

The application-layer boundary above is the primary control. For a hardened deployment, add:

- **Network egress control** — with `enablePrivateEndpoints=true`, keep the orchestrator's
  outbound path restricted so only the approved endpoints (Foundry/Bing for the web agent, the
  governed data-plane services) are reachable; deny arbitrary egress. This makes exfiltration
  impossible even if the app-layer guard were bypassed.
- **Portfolio-scope need-to-know** — deal-scoped agent chats are gated by the two-tier
  [access model](ACCESS-MODEL.md) before the agent is invoked. If you expose portfolio-wide
  agent chat to lower-tier roles, scope the agent's portfolio context to the caller's
  need-to-know (exclude `confidential` deals) so the agent can't summarise deals the user
  couldn't otherwise see.
- **Content Safety** — enable `CONTENT_SAFETY_ENDPOINT` to screen model I/O on both classes.
- **Audit** — the guard emits a `sovereignty-denied` tool result on any refusal; surface those
  in Log Analytics to alert on attempted boundary crossings.
