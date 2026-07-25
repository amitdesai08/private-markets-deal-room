// Work IQ MCP server — exposes the fund's Microsoft 365 work data (SharePoint/OneDrive
// files, Teams channel messages, Outlook mail) to Copilot, Copilot Studio, or any MCP
// client over the Streamable HTTP transport (the transport Copilot Studio supports).
//
// This is the MICROSOFT-NATIVE Work IQ surface: the tools are backed directly by
// Microsoft Graph (lib/m365/workIqGraph.js, app-only) — the app itself IS the Work IQ
// MCP server, no third-party endpoint. It is READ-ONLY by construction (no write tools),
// and reuses the same auth as the deal MCP read surface (static read-only key or Entra),
// applied in server.js before the handler.
//
// Tools (governed names mirror lib/mcp/agentSovereignty.js INTERNAL_TOOLS):
//   search_files          — SharePoint/OneDrive documents matching a query
//   search                — broad search across files, list items and sites
//   search_mail           — messages in a target mailbox matching a query
//   read_channel_messages — recent messages in a specific Teams channel

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { wiSearchFiles, wiSearch, wiSearchMail, wiReadChannel } from '../m365/workIqGraph.js';

const SERVER_INFO = { name: 'deal-room-workiq-mcp', version: '1.0.0' };

function toContent(result) {
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}

export function buildWorkiqMcpServer() {
  const server = new McpServer(SERVER_INFO, { capabilities: { tools: {} } });

  server.registerTool('search_files',
    {
      title: 'Search files',
      description: 'Search the fund\'s Microsoft 365 SharePoint / OneDrive documents (data rooms, memos, models) for a query. Returns matching files with name, web URL, last-modified and a summary. Read-only.',
      inputSchema: {
        query: z.string().describe('Keywords, e.g. a company name, a document type ("CIM", "SPA"), or a topic.'),
        size: z.number().int().optional().describe('Max results (default 10, max 25).'),
      },
    },
    async ({ query, size }) => toContent(await wiSearchFiles(query, { size })));

  server.registerTool('search',
    {
      title: 'Work IQ search',
      description: 'Broad Work IQ search across the fund\'s Microsoft 365 files, list items and SharePoint sites for a query. Use when you don\'t know which surface the answer is on. Read-only.',
      inputSchema: {
        query: z.string().describe('Keywords to search across M365 work content.'),
        size: z.number().int().optional().describe('Max results (default 10, max 25).'),
      },
    },
    async ({ query, size }) => toContent(await wiSearch(query, { size })));

  server.registerTool('search_mail',
    {
      title: 'Search mail',
      description: 'Search a specific mailbox for messages matching a query. Requires the mailbox user (UPN or id). Returns subject, sender, received time and a preview. Read-only; mailbox access is governed by an Exchange Application Access Policy.',
      inputSchema: {
        query: z.string().describe('Keywords to search the mailbox for.'),
        user: z.string().describe('The target mailbox UPN or user id (e.g. deal-team@fund.com).'),
        top: z.number().int().optional().describe('Max messages (default 10, max 25).'),
      },
    },
    async ({ query, user, top }) => toContent(await wiSearchMail({ query, user, top })));

  server.registerTool('read_channel_messages',
    {
      title: 'Read channel messages',
      description: 'Read the most recent messages in a specific Microsoft Teams channel (e.g. a deal channel). Requires the team id and channel id. Returns sender, time and a preview. Read-only.',
      inputSchema: {
        team_id: z.string().describe('The Teams team (group) id.'),
        channel_id: z.string().describe('The channel id within that team.'),
        top: z.number().int().optional().describe('Max messages (default 15, max 30).'),
      },
    },
    async ({ team_id, channel_id, top }) => toContent(await wiReadChannel({ team_id, channel_id, top })));

  return server;
}

// Express handler for POST /workiq-mcp — stateless Streamable HTTP, read-only.
export async function workiqMcpHandler(req, res) {
  const server = buildWorkiqMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
}
