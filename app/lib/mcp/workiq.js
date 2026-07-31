// Work IQ (M365 work-data intelligence) MCP client — SCAFFOLD.
//
// Gives the fund's INTERNAL-DATA agents governed, delegated access to Microsoft 365
// work data — SharePoint/OneDrive files, Teams channel messages and Outlook mail —
// over an MCP server ("WorkIQ MCP"), reusing the generic MCP client + OAuth seam that
// already powers the Morningstar/LSEG connectors (lib/mcp/morningstar.js, oauth.js).
//
// This is a SCAFFOLD: it is inert until (a) a WorkIQ MCP endpoint URL is configured
// (Settings → Data Sources, persisted via connectorSettings, or WORKIQ_MCP_URL), and
// (b) a delegated sign-in is completed (the 'workiq' OAuth provider, same Connect flow
// as the other MCP connectors). Until both are true every call returns a structured
// 'workiq-not-configured' result so an agent degrades gracefully rather than throwing.
//
// GOVERNANCE: all four tools below are INTERNAL-DATA (registered in
// lib/agentSovereignty.js INTERNAL_TOOLS). The external-web news scout can never call
// them (the sovereignty guard refuses it). Reads run as the SIGNED-IN USER whenever an
// On-Behalf-Of token is supplied (see dispatchWorkiq), so results honour that user's
// M365 permissions as well as the deal need-to-know model.

import { McpSession } from './morningstar.js';
import { hasLogin } from './oauth.js';
import { getConnectorConfig } from '../connectorSettings.js';
import { config } from '../config.js';
import { workIqGraphConfigured, wiSearchFiles, wiSearch, wiSearchMail, wiReadChannel } from '../m365/workIqGraph.js';
import { seedFilesResult, seedSearchResult, seedMailResult, seedChannelResult } from '../../data/workiqSeed.js';

export const WORKIQ_PROVIDER = 'workiq';

// The Microsoft-native backend: map each governed tool to its Graph function. When the
// M365 app is configured this is used directly (app-only, no per-user login), so Work IQ
// is LIVE for in-app agents without a separate MCP endpoint. The Streamable-HTTP MCP
// server (lib/mcp/workiqServer.js) exposes the same functions to Copilot / Copilot Studio.
const GRAPH_BACKEND = Object.freeze({
  workiq_search_files: (a) => wiSearchFiles(a.query, a),
  workiq_search:       (a) => wiSearch(a.query, a),
  workiq_search_mail:  (a) => wiSearchMail(a),
  workiq_read_channel: (a) => wiReadChannel(a),
});

// Governed tool names the agents call (see agentSovereignty INTERNAL_TOOLS). Each maps
// to a WorkIQ MCP tool name — overridable per deployment because the MCP's tool schema
// is server-defined; these are the sensible defaults.
export const WORKIQ_TOOLS = Object.freeze({
  workiq_search_files:   process.env.WORKIQ_TOOL_SEARCH_FILES   || 'search_files',
  workiq_read_channel:   process.env.WORKIQ_TOOL_READ_CHANNEL   || 'read_channel_messages',
  workiq_search_mail:    process.env.WORKIQ_TOOL_SEARCH_MAIL    || 'search_mail',
  workiq_search:         process.env.WORKIQ_TOOL_SEARCH         || 'search',
});

// The MCP endpoint: runtime Settings config wins, else the WORKIQ_MCP_URL seed.
export function workiqUrl() {
  return (getConnectorConfig(WORKIQ_PROVIDER).mcpUrl || config.connectors.workiqMcpUrl || '').trim();
}

// Configured = the Microsoft Graph backend is available OR an external MCP endpoint is set.
// Connected = the Graph backend is configured (app-only, no login), or the external
// endpoint has a delegated sign-in.
export function workiqConfigured() {
  return workIqGraphConfigured() || !!workiqUrl();
}
export function workiqConnected() {
  if (workIqGraphConfigured()) return true;
  return !!workiqUrl() && hasLogin(WORKIQ_PROVIDER);
}
export function workiqBackend() {
  return workIqGraphConfigured() ? 'graph' : (workiqUrl() ? 'mcp' : 'none');
}

// Low-level: open a session and call a WorkIQ MCP tool by its server-side name.
export async function callWorkiqTool(mcpToolName, args = {}) {
  if (!workiqConfigured()) return { error: 'workiq-not-configured', reason: 'No WorkIQ MCP endpoint set (Settings → Data Sources).' };
  if (!hasLogin(WORKIQ_PROVIDER)) return { error: 'workiq-not-connected', reason: 'Sign in to Work IQ (Data Sources → Connect) to enable M365 reads.' };
  const session = new McpSession(WORKIQ_PROVIDER, workiqUrl());
  await session.initialize();
  const result = await session.callTool(mcpToolName, args);
  return result ?? { content: [] };
}

// ---- Agent-facing dispatch (the seam the tool loop calls) -------------------
// Maps a GOVERNED tool name (workiq_*) to its backend. Prefers the Microsoft Graph
// backend (live) when the M365 app is configured; otherwise falls back to an external
// WorkIQ MCP endpoint. Returns a structured error (never throws) so the agent
// conversation continues if Work IQ is unavailable.
//
// PER-USER READS: pass `userToken` — a delegated Graph token obtained by the Teams
// server via the On-Behalf-Of flow — and the Graph backend runs the read AS THAT USER,
// so Microsoft 365 enforces their own permissions on top of our deal need-to-know
// model. Without it the read is app-only and therefore tenant-wide; the result carries
// `asUser` so callers can state which actually happened instead of assuming.
export async function dispatchWorkiq(governedName, args = {}) {
  const graphFn = GRAPH_BACKEND[governedName];
  if (!graphFn) return { error: 'unknown-workiq-tool', name: governedName };
  let result;
  if (workIqGraphConfigured()) {
    try { result = await graphFn(args); }
    catch (e) { result = { error: 'workiq-call-failed', tool: governedName, detail: String(e?.message || e).slice(0, 200) }; }
  } else {
    // Fallback: external WorkIQ MCP endpoint (delegated sign-in). The OBO token is a
    // Graph credential and has no meaning to a third-party MCP server — never send it.
    const { userToken, ...mcpArgs } = args;
    void userToken;
    const mcpTool = WORKIQ_TOOLS[governedName];
    try { result = await callWorkiqTool(mcpTool, mcpArgs); }
    catch (e) { result = { error: 'workiq-call-failed', tool: governedName, detail: String(e?.message || e).slice(0, 200) }; }
  }
  // Demo corpus fallback: when live Work IQ is unavailable, not signed in, or returns
  // nothing, surface the seeded Teams/SharePoint/mailbox content so the capability always
  // has realistic material to show. Marked `demo: true` so it's transparent.
  if (isEmptyOrError(result)) {
    const seed = seedFor(governedName, args);
    if (seed) return seed;
  }
  return result;
}

function isEmptyOrError(r) {
  if (!r || r.error) return true;
  if (Array.isArray(r.results) && r.results.length === 0) return true;
  return false;
}
function seedFor(governedName, args = {}) {
  switch (governedName) {
    case 'workiq_search_files': return seedFilesResult(args.query, args.size);
    case 'workiq_search': return seedSearchResult(args.query, args.size);
    case 'workiq_search_mail': return seedMailResult(args);
    case 'workiq_read_channel': return seedChannelResult(args);
    default: return null;
  }
}

// Convenience wrappers (used by non-agent call sites / future ingestion).
export const searchFiles = (query, opts = {}) => dispatchWorkiq('workiq_search_files', { query, ...opts });
export const readChannelMessages = (opts = {}) => dispatchWorkiq('workiq_read_channel', opts);
export const searchMail = (query, opts = {}) => dispatchWorkiq('workiq_search_mail', { query, ...opts });
export const workIqSearch = (query, opts = {}) => dispatchWorkiq('workiq_search', { query, ...opts });
