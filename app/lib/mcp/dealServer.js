// Deal MCP server — exposes the fund's deals to Copilot Studio (or any MCP client)
// over the Streamable HTTP transport, the only transport Copilot Studio supports.
//
// The three tools REUSE the analyst tool contracts (lib/dealTools.js) verbatim, so a
// partner-MD Copilot Studio agent sees exactly the same bounded, size-capped deal
// views as the in-app Foundry analyst — reading from the same Cosmos-backed store:
//   • list_deals            — every deal as a compact summary
//   • get_deal(deal_id,...)  — one deal as a bounded analyst view (optional sections)
//   • search_deals(query)    — keyword filter across company / sector / thesis
//
// Stateless by design: a fresh server + transport is created per request (no session
// affinity), so it scales cleanly across the Container App's replicas. Auth is applied
// separately by lib/mcp/entraAuth.js on the /mcp route.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { dispatchTool, TOOL_DESCRIPTIONS, DEAL_SECTIONS } from '../dealTools.js';

const SERVER_INFO = { name: 'deal-room-mcp', version: '1.0.0' };
const TOOL_NAMES = ['list_deals', 'get_deal', 'search_deals'];

function toContent(result) {
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}

// Build a fresh MCP server with the three deal tools registered. The Copilot Studio
// agent orchestrates these tools itself, so they run in portfolio scope (any deal is
// reachable by id); per-deal focus is expressed by the agent's own instructions.
export function buildDealMcpServer() {
  const server = new McpServer(SERVER_INFO, { capabilities: { tools: {} } });

  server.registerTool(
    'list_deals',
    { title: 'List deals', description: TOOL_DESCRIPTIONS.list_deals, inputSchema: {} },
    async () => toContent(dispatchTool('list_deals', {}, { scope: 'portfolio' }))
  );

  server.registerTool(
    'get_deal',
    {
      title: 'Get deal',
      description: TOOL_DESCRIPTIONS.get_deal,
      inputSchema: {
        deal_id: z.string().describe('The deal id (from list_deals or search_deals), e.g. "screened-1-cand-new-1".'),
        sections: z
          .array(z.enum(DEAL_SECTIONS))
          .optional()
          .describe('Optional subset of the deal view to return (summary, financials, workstreams, memo, compliance, risks, activity). Omit for the default analyst view.')
      }
    },
    async ({ deal_id, sections }) => toContent(dispatchTool('get_deal', { deal_id, sections }, { scope: 'portfolio' }))
  );

  server.registerTool(
    'search_deals',
    {
      title: 'Search deals',
      description: TOOL_DESCRIPTIONS.search_deals,
      inputSchema: { query: z.string().describe('Keywords, e.g. a company name or a sector.') }
    },
    async ({ query }) => toContent(dispatchTool('search_deals', { query }, { scope: 'portfolio' }))
  );

  return server;
}

// Express handler for POST /mcp — stateless Streamable HTTP.
export async function dealMcpHandler(req, res) {
  const server = buildDealMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: `Internal server error: ${String(err?.message || err)}` },
        id: null
      });
    }
  }
}

// GET/DELETE aren't used in stateless mode — reply with a JSON-RPC "method not allowed".
export function dealMcpMethodNotAllowed(_req, res) {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. Use POST for the streamable MCP transport.' },
    id: null
  });
}

export function dealMcpInfo() {
  return { server: SERVER_INFO.name, version: SERVER_INFO.version, tools: TOOL_NAMES };
}
