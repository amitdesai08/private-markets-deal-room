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
// them (the sovereignty guard refuses it). Reads should run as the SIGNED-IN USER so
// results honour that user's M365 permissions + the deal need-to-know model.

import { McpSession } from './morningstar.js';
import { hasLogin } from './oauth.js';
import { getConnectorConfig } from '../connectorSettings.js';
import { config } from '../config.js';

export const WORKIQ_PROVIDER = 'workiq';

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

// Configured = an endpoint URL is set. Connected = a delegated sign-in exists too.
export function workiqConfigured() {
  return !!workiqUrl();
}
export function workiqConnected() {
  return workiqConfigured() && hasLogin(WORKIQ_PROVIDER);
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
// Maps a GOVERNED tool name (workiq_*) to its WorkIQ MCP tool. Returns a structured
// error (never throws) so the agent conversation continues if WorkIQ is unavailable.
// NOTE: these run with the shared delegated connection today; thread the requesting
// user's OBO token here when per-user WorkIQ reads are wired (see analysis).
export async function dispatchWorkiq(governedName, args = {}) {
  const mcpTool = WORKIQ_TOOLS[governedName];
  if (!mcpTool) return { error: 'unknown-workiq-tool', name: governedName };
  try {
    return await callWorkiqTool(mcpTool, args);
  } catch (e) {
    return { error: 'workiq-call-failed', tool: governedName, detail: String(e?.message || e).slice(0, 200) };
  }
}

// Convenience wrappers (used by non-agent call sites / future ingestion).
export const searchFiles = (query, opts = {}) => dispatchWorkiq('workiq_search_files', { query, ...opts });
export const readChannelMessages = (opts = {}) => dispatchWorkiq('workiq_read_channel', opts);
export const searchMail = (query, opts = {}) => dispatchWorkiq('workiq_search_mail', { query, ...opts });
export const workIqSearch = (query, opts = {}) => dispatchWorkiq('workiq_search', { query, ...opts });
