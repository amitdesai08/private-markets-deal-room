// Minimal MCP client over the Streamable HTTP transport (JSON-RPC 2.0), plus a
// Morningstar convenience wrapper. Uses the OAuth refresh_token seam in
// lib/mcp/oauth.js to attach a bearer token, so the Deal Room server can call
// the Morningstar MCP headlessly once the one-time browser login has run.
//
// This is what fulfils the "Morningstar quality check" that the O1 news desk
// currently marks as pending (see lib/newsAgent.js toDeskCompany.quality).

import { getAccessToken, hasLogin } from './oauth.js';

const MCP_URL = process.env.MORNINGSTAR_MCP_URL || 'https://mcp.morningstar.com/mcp';
const PROTOCOL_VERSION = '2025-06-18';

export function morningstarConfigured() {
  return hasLogin('morningstar');
}

// Parse a Streamable-HTTP response that may be application/json or an SSE
// (text/event-stream) body carrying `data: {json}` lines.
async function parseRpc(resp) {
  const ct = resp.headers.get('content-type') || '';
  const text = await resp.text();
  if (ct.includes('text/event-stream')) {
    let last = null;
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^data:\s*(.*)$/);
      if (m && m[1].trim()) {
        try { last = JSON.parse(m[1]); } catch { /* skip keep-alives */ }
      }
    }
    return last;
  }
  try { return JSON.parse(text); } catch { return null; }
}

// One MCP session: initialize -> notifications/initialized -> tools. Carries the
// Mcp-Session-Id header the server returns on initialize across later calls.
export class McpSession {
  constructor(provider = 'morningstar', url = MCP_URL) {
    this.provider = provider;
    this.url = url;
    this.sessionId = null;
    this.nextId = 1;
    this.token = null;
  }

  async #rpc(method, params, { notify = false } = {}) {
    if (!this.token) this.token = await getAccessToken(this.provider);
    const body = { jsonrpc: '2.0', method, ...(params ? { params } : {}) };
    if (!notify) body.id = this.nextId++;
    const headers = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': PROTOCOL_VERSION
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;

    const resp = await fetch(this.url, { method: 'POST', headers, body: JSON.stringify(body) });
    const sid = resp.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    if (resp.status === 401) throw new Error('Morningstar MCP 401 — token rejected; re-run the login.');
    if (notify) return null;
    if (!resp.ok) throw new Error(`MCP ${method} failed (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    const data = await parseRpc(resp);
    if (data?.error) throw new Error(`MCP ${method} error ${data.error.code}: ${data.error.message}`);
    return data?.result ?? null;
  }

  async initialize() {
    const result = await this.#rpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'the-deal-room', version: '0.12.0' }
    });
    await this.#rpc('notifications/initialized', {}, { notify: true }).catch(() => {});
    return result;
  }

  listTools() {
    return this.#rpc('tools/list', {});
  }

  callTool(name, args = {}) {
    return this.#rpc('tools/call', { name, arguments: args });
  }
}

// Open + initialize a session in one call.
export async function connect(provider = 'morningstar') {
  const s = new McpSession(provider);
  await s.initialize();
  return s;
}

// List the tools Morningstar exposes (verifies end-to-end access).
export async function listMorningstarTools() {
  const s = await connect('morningstar');
  const tools = await s.listTools();
  return tools?.tools || [];
}
