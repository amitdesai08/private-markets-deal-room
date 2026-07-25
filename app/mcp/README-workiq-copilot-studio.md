# Work IQ MCP server — connecting Copilot / Copilot Studio

The **Work IQ MCP server** is The Deal Room's Microsoft-native window onto the fund's
Microsoft 365 work data — SharePoint/OneDrive documents, Teams channel messages and
Outlook mail — exposed to **Microsoft 365 Copilot**, a **Copilot Studio** agent, or any
MCP client over the Model Context Protocol. It is **read-only by construction** and backed
directly by **Microsoft Graph** (no third-party service): the Deal Room app *is* the Work
IQ server.

## Endpoint

```
POST https://<MCP_HOST>/workiq-mcp
```

Transport: **Streamable HTTP** (`x-ms-agentic-protocol: mcp-streamable-1.0`) — the transport
Copilot Studio supports. Stateless, so it scales across replicas. `<MCP_HOST>` is the
orchestrator FQDN (e.g. `ca-dealhub-orch-dev-swc.<region>.azurecontainerapps.io`).

## What it exposes (tools)

| Tool | Args | Returns |
|---|---|---|
| `search_files` | `query`, `size?` | SharePoint/OneDrive documents matching the query — name, web URL, last-modified, summary |
| `search` | `query`, `size?` | Broad search across files, list items and sites |
| `search_mail` | `query`, `user`, `top?` | Messages in a target mailbox — subject, sender, received, preview |
| `read_channel_messages` | `team_id`, `channel_id`, `top?` | Recent messages in a specific Teams channel — sender, time, preview |

All tools are **read-only**. Every result is bounded and compact (never a raw Graph blob).

## How it authenticates to Microsoft 365 (Graph, app-only)

The server calls Microsoft Graph with the **M365 connector app**'s client credentials
(`M365_CLIENT_ID` / `M365_CLIENT_SECRET` / `M365_TENANT_ID`). It needs these **application**
permissions, admin-consented (already granted in the dev tenant):

| Permission (application) | Powers |
|---|---|
| `Sites.Read.All` + `Files.Read.All` | `search_files`, `search` |
| `Mail.Read` | `search_mail` |
| `ChannelMessage.Read.All` | `read_channel_messages` |

Because reads are app-only they are tenant-wide. Keep them read-only, and scope which
mailboxes `search_mail` can reach with an **Exchange Application Access Policy** (mirrors
[app/graph/README.md](../graph/README.md)) so mailbox reads are limited to, e.g., the deal
team's shared mailboxes.

## Client authentication (how Copilot reaches the endpoint)

`/workiq-mcp` uses the **same auth as the read-only deal MCP** (`entraAuth.mcpReadonlyAuthMiddleware`):
present **either** the static read-only key (header `x-mcp-key`, the Container App secret
`mcp-readonly-key`) **or** a valid Entra token for the deal MCP app. For a Copilot Studio
connection, use the Entra OAuth path exactly as in
[README-copilot-studio.md](README-copilot-studio.md).

## Add it to a Copilot Studio agent

1. Open your agent → **Tools** → **Add a tool** → **New tool** → **Model Context Protocol**.
2. Fill in:
   - **Server name**: `Deal Room — Work IQ`
   - **Server description**: `Search the fund's Microsoft 365 work data — SharePoint/OneDrive files, Teams channel messages and Outlook mail — to ground answers in the deal team's real documents and discussions.`
   - **Server URL**: the `/workiq-mcp` endpoint above.
3. **Authentication** → OAuth 2.0 (Entra), same app + `deals.read` scope as the deal MCP
   ([README-copilot-studio.md](README-copilot-studio.md)), or a static key for a machine agent.
4. Save. The four tools appear on the agent; pair it with the **Deal MCP** (`/mcp`) so one
   Copilot agent reads both the governed pipeline *and* the M365 work data behind it.

## Add it to Microsoft 365 Copilot (declarative agent)

Microsoft 365 Copilot consumes the same MCP server. Declare it as a tool/connector in the
agent's manifest ([workiq-mcp-openapi.yaml](workiq-mcp-openapi.yaml) is provided for the
API-plugin path), point it at `/workiq-mcp`, and grant the connection the read-only key or
the Entra app. The Deal Room's own hosted agents already use this Work IQ backend in-process
(no round-trip) — this endpoint is what lets **Copilot** use the exact same governed tools.

## Governance

- **Read-only** — no write tools exist on this surface.
- **Same guardrails as the rest of Work IQ** — the tools are internal-data
  ([agentSovereignty.js](../lib/agentSovereignty.js) `INTERNAL_TOOLS`); the external-web
  news scout can never call them.
- **Least privilege at the data layer** — scope `Mail.Read` with an Exchange Application
  Access Policy; the app never requests write scopes for Work IQ reads.
