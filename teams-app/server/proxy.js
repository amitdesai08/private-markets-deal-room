// Reverse proxy to the shared Deal Room backend — enforces ONE data source.
//
// Every /api/* (and /mcp) call the tab makes is forwarded here to the shared
// backend so the Teams interface never holds its own copy of deal data. An
// optional per-user bearer token (from SSO/OBO) can be attached upstream.

import { config, isBackendLive } from './config.js';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'host',
]);

// Headers the backend TRUSTS to name the caller and the seat they are wearing.
// They are meaningful only when the sender has already proved it is the Teams
// server (x-bot-key), so a browser must never be able to supply them: forwarding
// a client-set x-dr-user verbatim would let anyone with the tab URL assert
// `{"upn":"admin"}` and be treated as an administrator. Today the backend's
// bot-key gate happens to reject that, but "safe because a second control is
// configured" is not the same as safe — if BOT_BACKEND_KEY is ever blank the
// gate short-circuits and this becomes a one-header privilege escalation.
// The proxy is the trust boundary, so the stripping belongs here: identity is
// something the server DERIVES from a validated SSO token (see index.js), never
// something the client states about itself.
const CLIENT_MUST_NOT_SET = new Set(['x-bot-key', 'x-dr-user', 'x-dr-as', 'x-dr-graph-token']);

export async function proxyToBackend(req, res) {
  if (!isBackendLive()) {
    return res.status(502).json({
      error: 'shared-backend-not-configured',
      hint: 'Set SHARED_BACKEND_URL to the Deal Room backend (e.g. the ca-dealhub-orch Container App).',
    });
  }

  const target = `${config.backend.url}${req.originalUrl}`;
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const key = k.toLowerCase();
    if (HOP_BY_HOP.has(key) || CLIENT_MUST_NOT_SET.has(key)) continue;
    headers[k] = v;
  }

  const init = { method: req.method, headers };
  if (!['GET', 'HEAD'].includes(req.method)) {
    headers['content-type'] = headers['content-type'] || 'application/json';
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  }

  try {
    const upstream = await fetch(target, init);
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase()) && key.toLowerCase() !== 'content-encoding') {
        res.setHeader(key, value);
      }
    });
    // Proxied API/MCP responses are always live data — never let the browser or any
    // intermediary cache them, so a mutation (advance/back/run) is reflected on the
    // very next read. (Express would otherwise regenerate an ETag and allow caching.)
    res.setHeader('Cache-Control', 'no-store');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (e) {
    res.status(502).json({ error: 'backend-unreachable', detail: String(e?.message || e) });
  }
}
