// Agent data-sovereignty policy — the ENFORCED boundary between agents that touch the
// fund's internal data and agents that reach the public web. It answers, on every tool
// call, one question the server (never the model) decides: "is this agent allowed to run
// this tool?".
//
// Two hard classes, and an agent's class is set HERE from its name — never self-asserted
// by a model:
//
//   • internal-data  — the deal analyst + the 10 persona agents. They read/act on the
//                      fund's governed store through the deal tools (lib/dealTools.js).
//                      They have **no egress**: they can never call a web/scrape tool, so
//                      confidential deal data cannot leave the tenant through an agent.
//
//   • external-web   — the news scout (Bing-grounded). It searches the PUBLIC web for
//                      fresh sourcing signals. It has **no internal deal tools**: it can
//                      never read the fund's data, so nothing internal is ever sent to a
//                      web-facing model.
//
// Why this exists (maps to the security requirements):
//   1. Objective scoping — each agent only runs tools in its class's allow-list.
//   2. No cross-pollination — the guard refuses any boundary-crossing tool BEFORE
//      dispatch, so neither prompt-injection nor a manipulated orchestration loop can
//      make an internal agent egress data or a web agent read internal data.
//   3. Separation of external-web from internal-data agents — this registry is that
//      separation, enforced server-side rather than assumed from wiring.
//   4. Fresh (non-stale) data via web agents — the external-web class is where web
//      search / scraping lives, isolated from every internal record.

export const AGENT_CLASS = Object.freeze({ INTERNAL: 'internal-data', EXTERNAL: 'external-web' });

// Every governed INTERNAL tool the agents may call (reads + the write/action verbs).
// A tool NOT in here is unknown; a web tool (below) is a hard boundary violation.
export const INTERNAL_TOOLS = new Set([
  // core deal reads (deal-scoped server-side)
  'list_deals', 'get_deal', 'search_deals',
  // funnel + artifact + fund reads
  'list_pipeline', 'get_candidate', 'get_candidate_artifact', 'get_deal_artifact',
  'get_ic_readiness', 'get_returns', 'get_value_creation', 'get_risk_register',
  'get_fund_overview', 'get_portfolio', 'get_fund_value', 'get_market_intel',
  'get_citation_audit', 'get_companies', 'get_company', 'get_next_actions',
  // write/action verbs (each ADDITIONALLY authorized per-persona in personaPolicy.js)
  'send_to_screening', 'screen_candidate', 'triage_candidate', 'gate_candidate',
  'launch_deal', 'advance_deal', 'run_step', 'assign_swimlane', 'record_finding',
  'record_contribution', 'record_issue', 'resolve_issue', 'set_condition', 'snapshot_assumptions',
]);

// Web / egress tool names. Internal-data agents may NEVER call any of these — the guard
// refuses them before dispatch. (None are wired to internal agents today; this is the
// backstop that keeps it that way even if an agent is later mis-provisioned.)
export const EGRESS_TOOLS = new Set([
  'web_search', 'bing_search', 'bing_grounding', 'browse', 'browse_url', 'open_url',
  'fetch_url', 'http_get', 'http_request', 'scrape', 'crawl', 'download', 'code_interpreter',
]);

// agent name -> class + objective. Names match lib/dealAgent.js, lib/personaAgent.js and
// scripts/create_persona_agents.py / lib/newsAgent.js.
const REGISTRY = {
  'deal-room-analyst':          { class: AGENT_CLASS.INTERNAL, objective: 'read-only deal & portfolio analysis' },
  'deal-room-partner':          { class: AGENT_CLASS.INTERNAL, objective: 'deal sponsorship & IC' },
  'deal-room-retail-md':        { class: AGENT_CLASS.INTERNAL, objective: 'commercial diligence' },
  'deal-room-ai-md':            { class: AGENT_CLASS.INTERNAL, objective: 'tech / AI diligence' },
  'deal-room-supply-md':        { class: AGENT_CLASS.INTERNAL, objective: 'operations diligence' },
  'deal-room-principal':        { class: AGENT_CLASS.INTERNAL, objective: 'deal lead / orchestration' },
  'deal-room-operating-partner':{ class: AGENT_CLASS.INTERNAL, objective: 'value creation' },
  'deal-room-fund-cfo':         { class: AGENT_CLASS.INTERNAL, objective: 'returns & financing' },
  'deal-room-legal-gc':         { class: AGENT_CLASS.INTERNAL, objective: 'legal & execution' },
  'deal-room-ir-lp':            { class: AGENT_CLASS.INTERNAL, objective: 'LP / fund reporting' },
  // The Fabric Data Agent queries the fund's OWN OneLake lakehouse (internal data), not the web.
  'deal-room-fabric':           { class: AGENT_CLASS.INTERNAL, objective: 'NL Q&A over the fund lakehouse' },
  // External-web: the ONLY agent allowed to reach the public internet.
  'deal-room-news-scout':       { class: AGENT_CLASS.EXTERNAL, objective: 'public web sourcing signals' },
};

export class SovereigntyError extends Error {
  constructor(message) { super(message); this.name = 'SovereigntyError'; this.code = 'sovereignty-violation'; }
}

// An agent's class (defaults to the most-restrictive INTERNAL: no egress) for any
// unregistered name, so an unknown agent can never reach the web by omission.
export function classOf(agentName) {
  return REGISTRY[agentName]?.class || AGENT_CLASS.INTERNAL;
}
export function objectiveOf(agentName) { return REGISTRY[agentName]?.objective || 'unspecified'; }
export function isInternalAgent(agentName) { return classOf(agentName) === AGENT_CLASS.INTERNAL; }
export function isExternalAgent(agentName) { return classOf(agentName) === AGENT_CLASS.EXTERNAL; }
// Only the external-web class may reach the public internet.
export function mayEgress(agentName) { return classOf(agentName) === AGENT_CLASS.EXTERNAL; }

// THE GUARD — called at every agent<->tool dispatch seam, before the tool runs.
// Throws SovereigntyError on any boundary-crossing call so it is refused, not executed.
export function assertToolAllowed(agentName, toolName) {
  const cls = classOf(agentName);
  if (cls === AGENT_CLASS.INTERNAL) {
    // An internal-data agent may never touch a web/egress tool — no exfiltration path.
    if (EGRESS_TOOLS.has(toolName)) {
      throw new SovereigntyError(`internal-data agent "${agentName}" is not permitted to call the web/egress tool "${toolName}"`);
    }
    return; // internal tools are further scoped by dispatchTool (deal scope) + persona policy (writes)
  }
  // An external-web agent may never read the fund's internal data.
  if (INTERNAL_TOOLS.has(toolName)) {
    throw new SovereigntyError(`external-web agent "${agentName}" is not permitted to read internal data via "${toolName}"`);
  }
}

// Convenience for the internal tool loops: returns a refusal payload to hand back to the
// model as the tool result when the guard trips (so the conversation continues, denied).
export function guardInternalToolCall(agentName, toolName) {
  try {
    assertToolAllowed(agentName, toolName);
    return null;
  } catch (e) {
    if (e instanceof SovereigntyError) {
      return { error: 'sovereignty-denied', tool: toolName, reason: e.message };
    }
    throw e;
  }
}
