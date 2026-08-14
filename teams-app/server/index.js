// The Deal Room — Teams app server.
//
// A THIN interface over the shared Deal Room backend (single data source):
//   • serves the Channel Tab bundle (tab/dist),
//   • exposes per-user context (Teams SSO -> OBO -> persona),
//   • hosts the bot messaging endpoint for Adaptive Card notifications, and
//   • forwards every other /api/* call to the shared backend.
// No deal data is stored here.

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

import { config, validateConfig, isBackendLive, isSsoConfigured, isBotConfigured, isDemoMode } from './config.js';
import { proxyToBackend } from './proxy.js';
import { exchangeOnBehalfOf, identityFromSsoToken } from './sso.js';
import { personaRecord, stageAccessFor } from './sharedLib.js';
import { initBot } from './bot.js';
import { postDealEvent } from './notifications.js';
import { TEAMS_BOOTSTRAP_JS, TEAMS_CONFIG_HTML } from './siteProxy.js';
import { startEventPoller } from './eventPoller.js';
import { platformStatus, platformWake, platformSleep, startPlatformEnforcer, platformControlEnabled } from './platform.js';

validateConfig();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ---- Platform power control ------------------------------------------------
// These are served by the Teams app itself (NOT proxied) so they work even when
// the orchestrator is asleep. The tab uses /status to render an "offline" gate and
// /wake to bring the orchestrator back (for 1 hour, or indefinitely — admin only).
async function ssoIdentity(req) {
  const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.ssoToken || '';
  return identityFromSsoToken(tok);
}
app.get('/api/platform/status', async (req, res) => {
  try { res.json(await platformStatus(await ssoIdentity(req))); }
  catch (e) { res.status(502).json({ control: platformControlEnabled(), online: false, error: String(e?.message || e) }); }
});
app.post('/api/platform/wake', async (req, res) => {
  const mode = req.body?.mode === 'indefinite' ? 'indefinite' : 'hour';
  const identity = await ssoIdentity(req);
  const by = String(req.body?.by || identity?.name || '').trim() || 'teams';
  try {
    const result = await platformWake(mode, { by, identity });
    if (result?.error === 'admin-required') return res.status(403).json(result);
    res.json(result);
  } catch (e) { res.status(502).json({ error: 'wake-failed', detail: String(e?.message || e) }); }
});
app.post('/api/platform/sleep', async (_req, res) => {
  try { res.json(await platformSleep()); }
  catch (e) { res.status(502).json({ error: 'sleep-failed', detail: String(e?.message || e) }); }
});

// Demo showcase roster (one identity per role) sourced from the orchestrator, which
// only returns it when demo mode is active (deploy-time DEMO_PROFILES + the runtime
// admin toggle). Short TTL cache so an admin toggling demo mode off is reflected quickly.
let _demoProfiles = null;
let _demoProfilesAt = 0;
const DEMO_TTL_MS = 15000;
async function getDemoProfiles() {
  if (_demoProfiles && Date.now() - _demoProfilesAt < DEMO_TTL_MS) return _demoProfiles;
  if (!isBackendLive()) return [];
  try {
    const headers = {};
    if (config.backend.botKey) headers['x-bot-key'] = config.backend.botKey;
    const r = await fetch(`${config.backend.url}/api/demo-profiles`, { headers });
    if (r.ok) { _demoProfiles = await r.json(); _demoProfilesAt = Date.now(); return _demoProfiles; }
  } catch { /* backend not ready — return empty, retry next request */ }
  return _demoProfiles || [];
}

// Invalidate on a demo-mode toggle so the next request reflects it immediately,
// not up to fifteen seconds later.
app.use((req, _res, next) => {
  if (req.method === 'POST' && /^\/api\/(admin\/)?demo-mode$/.test(req.path || '')) {
    _demoProfiles = null;
    _demoProfilesAt = 0;
  }
  next();
});

// Teams app status (interface-level; data status comes from the shared backend).
app.get('/api/teams/config', (_req, res) =>
  res.json({
    app: 'deal-room-teams',
    demoMode: isDemoMode(),
    backend: isBackendLive() ? 'configured' : 'demo',
    backendUrl: config.backend.url || null,
    appBaseUrl: config.server.appBaseUrl || null,
    sso: isSsoConfigured(),
    bot: isBotConfigured(),
    // Which parallel instance this is, for support and telemetry only.
    channel: process.env.DEAL_ROOM_CHANNEL || 'main',
    // Defaults on: this is now how a deal is read, not a beta-only feature flag.
    cockpit: process.env.DEAL_ROOM_COCKPIT !== 'false',
  })
);

// Per-user context: Teams SSO token -> identity -> Deal Room persona + stage access.
app.post('/api/teams/context', async (req, res) => {
  const ssoToken = req.body?.ssoToken || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const identity = await identityFromSsoToken(ssoToken);
  const asOverride = await resolveDemoOverride(req, identity);                       // demo "view as USER", roster-checked
  const viewAsRole = (String(req.body?.viewAsRole || '').trim() || null); // hierarchy "view as ROLE"
  // requestingUser identifies by id (oid/upn), never by display name — display names
  // are public on the sign-in list, so a name alone must never grant deal-team membership.
  const requestingUser = asOverride
    ? { oid: asOverride, upn: asOverride, name: asOverride }
    : (identity ? { oid: identity.oid, upn: identity.upn, name: identity.name, roles: identity.roles, groups: identity.groups } : null);
  let acc = null;
  if (isBackendLive()) {
    try {
      // Must use the same auth contract as every other forwarded call (backendAuth), or
      // the orchestrator answers 401 and the caller falls back to the `member` default.
      const headers = backendAuth({ identity, ssoToken, asOverride, requestingUser });
      const r = await fetch(`${config.backend.url}/api/me/access`, {
        method: 'POST', headers, body: JSON.stringify({ requestingUser, viewAsRole }),
      });
      if (r.ok) acc = await r.json();
    } catch { /* fall back to local stage access below */ }
  }
  const fallback = stageAccessFor(asOverride || identity?.upn || '');
  // No policy to consult without the orchestrator, so no persona is given — the page
  // falls back to the untailored view rather than inventing a seat.
  const persona = await personaRecord(acc?.persona);
  let graphLinked = false;
  try { graphLinked = !!(await exchangeOnBehalfOf(ssoToken)); } catch { graphLinked = false; }
  res.json({
    identity, persona, graphLinked,
    role: acc?.role || fallback.role,
    actualRole: acc?.actualRole || fallback.role,
    roleLabel: acc?.roleLabel || null,
    isAdmin: !!acc?.isAdmin,
    allowedPersonas: acc?.allowedPersonas || null,
    viewAsRoles: acc?.viewAsRoles || [],
    viewingAsRole: acc?.viewingAs || null,
    canViewStage2: acc?.canViewStage2 ?? fallback.canViewStage2,
    canWrite: acc?.canWrite ?? true,
    viewingAs: asOverride || identity?.upn || null,
    demoMode: acc?.demoMode ?? false,
    demoUsers: await getDemoProfiles(),
  });
});

// Records which showcase profile the signed-in person is acting as, so the CHANNEL BOT
// answers as that seat too (the tab's per-request switcher header never reaches a bot
// message). Uses the SSO identity only, not x-dr-as, so the switch is keyed by the real
// person and stays reversible.
app.post('/api/teams/acting-as', async (req, res) => {
  if (!isBackendLive()) return res.status(503).json({ error: 'backend not configured' });
  const ssoToken = req.body?.ssoToken || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const identity = await identityFromSsoToken(ssoToken);
  if (!identity || !(identity.oid || identity.upn)) return res.status(401).json({ error: 'sign-in required' });
  try {
    const headers = { 'content-type': 'application/json' };
    if (config.backend.botKey) headers['x-bot-key'] = config.backend.botKey;
    const r = await fetch(`${config.backend.url}/api/demo/acting-as`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requestingUser: { oid: identity.oid, upn: identity.upn }, as: req.body?.as || '' }),
    });
    res.status(r.status).json(await r.json().catch(() => ({})));
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
});

// Internal seam to post a notification card (Phase 2 / testing).
app.post('/internal/notify', async (req, res) => {
  const result = await postDealEvent(req.body || {});
  res.json(result);
});

// Bot messaging endpoint (Adaptive Card notifications).
app.post('/api/messages', async (req, res) => {
  const b = await initBot();
  if (!b) return res.status(200).json({ note: 'bot-not-configured' });
  await b.adapter.process(req, res, (context) => b.botHandler.run(context));
});

// Deal documents — per-user Word/Excel export. Built AS the signed-in Teams user
// (SSO -> OBO Graph token): 'download' streams a personal working copy; 'sharepoint'
// publishes into the shared deal data room authored as the requester. Intercepted
// before the generic proxy so the OBO token + identity are attached.
const GRAPH_DOC_SCOPES = [
  'https://graph.microsoft.com/Files.ReadWrite',
  'https://graph.microsoft.com/Sites.ReadWrite.All',
  'https://graph.microsoft.com/User.Read',
];
app.post('/api/deals/:id/documents/:kind', async (req, res) => {
  if (!isBackendLive()) return res.status(502).json({ error: 'shared-backend-not-configured' });
  const ssoToken = req.body?.ssoToken || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const identity = await identityFromSsoToken(ssoToken);
  // Must resolve the demo override here too, or a walkthrough seat reaches the backend
  // as nobody and the deal it's standing on comes back "not found".
  const asOverride = await resolveDemoOverride(req, identity);
  const dest = String(req.query.dest || req.body?.dest || 'download').toLowerCase();

  let userToken = null;
  if (dest === 'sharepoint') {
    try { userToken = await exchangeOnBehalfOf(ssoToken, GRAPH_DOC_SCOPES); } catch { userToken = null; }
    if (!userToken) return res.status(409).json({ notConnected: true, reason: 'Sign in to Microsoft 365 in Teams to publish to the shared data room.' });
  }

  const requestingUser = asOverride
    ? { oid: asOverride, upn: asOverride, name: asOverride }
    : (identity ? { oid: identity.oid, upn: identity.upn, name: identity.name, roles: identity.roles, groups: identity.groups } : null);
  const headers = backendAuth({ identity, ssoToken, asOverride, requestingUser });
  if (userToken) headers['x-user-graph-token'] = userToken;
  const body = JSON.stringify({ dest, requestingUser: requestingUser || undefined });

  try {
    const live = req.query.live ? `&live=${encodeURIComponent(req.query.live)}` : '';
    const url = `${config.backend.url}/api/deals/${encodeURIComponent(req.params.id)}/documents/${encodeURIComponent(req.params.kind)}?dest=${encodeURIComponent(dest)}${live}`;
    const upstream = await fetch(url, { method: 'POST', headers, body });
    res.status(upstream.status);
    const cd = upstream.headers.get('content-disposition');
    if (cd) res.setHeader('Content-Disposition', cd);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) {
    res.status(502).json({ error: 'backend-unreachable', detail: String(e?.message || e) });
  }
});

// Power BI "Deal Room Report" embed — returns the report's embed config plus a
// user-owns-data access token (Teams SSO -> OBO Power BI). If OBO isn't available
// (Power BI delegated permission not yet consented, or demo mode), returns
// available:false with the webUrl so the tab links out instead of embedding.
const POWERBI_SCOPES = ['https://analysis.windows.net/powerbi/api/Report.Read.All'];
app.post('/api/powerbi/embed', async (req, res) => {
  const pbi = config.powerbi;
  const webUrl = `https://app.powerbi.com/groups/${pbi.workspaceId}/reports/${pbi.reportId}`;
  const embedUrl = `https://app.powerbi.com/reportEmbed?reportId=${pbi.reportId}&groupId=${pbi.workspaceId}`;
  const base = { reportId: pbi.reportId, workspaceId: pbi.workspaceId, name: pbi.reportName, embedUrl, webUrl };
  const ssoToken = req.body?.ssoToken || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  let token = null;
  try { token = await exchangeOnBehalfOf(ssoToken, POWERBI_SCOPES); } catch { token = null; }
  if (!token) return res.json({ ...base, available: false, reason: 'powerbi-not-connected' });
  res.json({ ...base, available: true, token, tokenType: 'Aad' });
});

// Agent chat — inject the resolved requesting identity (SSO or demo "view as") + the
// shared bot key so the orchestrator gates every agent read by the caller's need-to-know
// (an agent can't be used to reach a deal the caller can't see). Registered BEFORE the
// generic proxy so it wins for the chat endpoints.
// The one place a forwarded request's credentials are assembled — every proxy route
// must call this rather than build its own headers, or the rules drift between routes.
function backendAuth({ identity, ssoToken, asOverride, requestingUser }) {
  const h = { 'content-type': 'application/json' };
  // The app's proof, only when we can say who is asking.
  if (config.backend.botKey && requestingUser) h['x-bot-key'] = config.backend.botKey;
  if (requestingUser) h['x-dr-user'] = JSON.stringify(requestingUser);
  // The proof itself, and the seat chosen to look through — two different facts.
  if (identity && ssoToken) h.authorization = `Bearer ${ssoToken}`;
  if (identity && asOverride) h['x-dr-demo-as'] = asOverride;
  // A walkthrough visitor has no directory account, so the deployment's own credential
  // stands in — and it must reach the assistant as well as the deal list.
  if (DEMO_ACCESS_KEY && asOverride && !identity) {
    delete h['x-dr-user'];
    delete h['x-bot-key'];
    h['x-dr-demo-key'] = DEMO_ACCESS_KEY;
    h['x-dr-demo-as'] = asOverride;
  }
  return h;
}

async function forwardChat(path, req, res) {
  if (!isBackendLive()) return res.status(502).json({ error: 'shared-backend-not-configured' });
  const ssoToken = req.body?.ssoToken || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const identity = await identityFromSsoToken(ssoToken);
  const asOverride = await resolveDemoOverride(req, identity);                                          // demo "view as USER", roster-checked
  const viewAsRole = (String(req.headers['x-dr-view-as'] || req.body?.viewAsRole || '').trim() || null);
  const requestingUser = asOverride
    ? { oid: asOverride, upn: asOverride, name: asOverride }
    : (identity ? { oid: identity.oid, upn: identity.upn, name: identity.name } : null);
  const headers = backendAuth({ identity, ssoToken, asOverride, requestingUser });
  const body = { ...(req.body || {}) };
  delete body.ssoToken; delete body.as;
  body.requestingUser = requestingUser;
  body.viewAsRole = viewAsRole;
  try {
    const upstream = await fetch(`${config.backend.url}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    res.status(upstream.status);
    const ct = upstream.headers.get('content-type') || 'application/json';
    res.setHeader('content-type', ct);
    // arrayBuffer() waits for the last byte before writing anything — buffering here
    // defeats an event stream.
    if (/text\/event-stream/i.test(ct) && upstream.body?.getReader) {
      res.setHeader('cache-control', 'no-cache, no-transform');
      res.setHeader('x-accel-buffering', 'no');
      if (res.flushHeaders) res.flushHeaders();
      const reader = upstream.body.getReader();
      // A reader who closes the panel should stop the copy, not keep a socket writing.
      let closed = false;
      res.on('close', () => { closed = true; try { reader.cancel(); } catch { /* already gone */ } });
      for (;;) {
        const { done, value } = await reader.read();
        if (done || closed) break;
        res.write(Buffer.from(value));
      }
      return res.end();
    }
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) {
    if (res.headersSent) return res.end();
    return res.status(502).json({ error: 'backend-unreachable', detail: String(e?.message || e) });
  }
}
app.post('/api/deal-agent/chat', (req, res) => forwardChat('/api/deal-agent/chat', req, res));
app.post('/api/deal-agent/stream', (req, res) => forwardChat('/api/deal-agent/stream', req, res));
app.post('/api/persona-agents/:persona/chat', (req, res) => forwardChat(`/api/persona-agents/${encodeURIComponent(req.params.persona)}/chat`, req, res));

// Admin (role builder / persona designer) — inject the resolved requesting identity
// (SSO or demo "view as") so the orchestrator can enforce administrator-only access.
// Registered before the generic proxy so it wins for /api/admin/*.
app.use('/api/admin', async (req, res) => {
  if (!isBackendLive()) return res.status(502).json({ error: 'shared-backend-not-configured' });
  const ssoToken = req.body?.ssoToken || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const identity = await identityFromSsoToken(ssoToken);
  const asOverride = await resolveDemoOverride(req, identity);
  const requestingUser = asOverride
    ? { oid: asOverride, upn: asOverride, name: asOverride }
    : (identity ? { oid: identity.oid, upn: identity.upn, name: identity.name, roles: identity.roles, groups: identity.groups } : null);
  const body = { ...(req.body || {}) };
  delete body.ssoToken; delete body.as;
  body.requestingUser = requestingUser;
  const headers = backendAuth({ identity, ssoToken, asOverride, requestingUser });
  try {
    const upstream = await fetch(`${config.backend.url}${req.originalUrl}`, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    res.status(upstream.status);
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) {
    res.status(502).json({ error: 'backend-unreachable', detail: String(e?.message || e) });
  }
});

// Deal list / detail / subresources — inject the resolved requesting identity (SSO or
// demo "view as USER") so the orchestrator can enforce two-tier access + deal-team
// need-to-know. Registered before the generic proxy so it wins for /api/deals/*.
//
// PER-USER WORK IQ: the deal desks read Microsoft 365 work data (Teams channel, files,
// mail). Those reads must run as the SIGNED-IN USER, not as the application, so M365
// enforces that person's own permissions on top of our deal need-to-know model —
// otherwise an app-only read is tenant-wide and the Deal Room could surface a document
// the viewer has no right to open. We exchange the Teams SSO token On-Behalf-Of for a
// Graph token here (the only place that holds the user's assertion) and forward it to
// the orchestrator over the trusted bot-key channel.
const GRAPH_WORKIQ_SCOPES = [
  'https://graph.microsoft.com/Files.Read.All',
  'https://graph.microsoft.com/Sites.Read.All',
  'https://graph.microsoft.com/ChannelMessage.Read.All',
  'https://graph.microsoft.com/Mail.Read',
];

// Sending is a SEPARATE exchange, on purpose. Reads happen on every deal interaction;
// sending happens only when a person presses send. Folding ChannelMessage.Send into the
// read scope set would mean every routine read carried a token that could post as the
// user — a standing capability nobody asked for. Least privilege costs one extra
// round-trip on an action that is already deliberate.
const GRAPH_SEND_SCOPES = ['https://graph.microsoft.com/ChannelMessage.Send'];
const isSendRequest = (req) => req.method === 'POST' && /\/threads\/message$/.test(req.path || '');

// The OBO exchange is a network round-trip to Entra; doing it on every deal request
// would add latency to each tab interaction. Cache per user until shortly before the
// token expires. Keyed by oid AND scope set, so one user's token can never be handed to
// another, and a read token is never mistaken for a send token.
const _oboCache = new Map();
const OBO_SKEW_MS = 120000;
async function workIqUserToken(ssoToken, identity, scopes = GRAPH_WORKIQ_SCOPES) {
  if (!ssoToken || !identity?.oid || !isSsoConfigured()) return null;
  const key = `${identity.oid}|${scopes.join(' ')}`;
  const hit = _oboCache.get(key);
  if (hit && hit.exp > Date.now() + OBO_SKEW_MS) return hit.token;
  try {
    const token = await exchangeOnBehalfOf(ssoToken, scopes);
    if (!token) return null;
    // Trust the token's own expiry rather than guessing; fall back to 30 minutes.
    let exp = Date.now() + 1800000;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      if (payload?.exp) exp = payload.exp * 1000;
    } catch { /* keep the conservative default */ }
    _oboCache.set(key, { token, exp });
    return token;
  } catch {
    // Consent not granted, or the user has no M365 licence. Work IQ degrades to the
    // app-only/demo path rather than failing the whole request; the send path refuses
    // outright rather than degrading, which the orchestrator enforces.
    return null;
  }
}

// The demo "view as USER" switcher — validated against the roster, never trusted from
// the caller. It replaces the identity outright, so an unvalidated value would be an
// impersonation primitive, and it must arrive in a header or body, never a query string
// (query strings persist in browser history, referrer headers and access logs).
//
// Narrowing an identity that already exists is fine; asserting one from nothing is not
// identity. So the override only applies when the caller already has an identity, or the
// deployment has explicitly opted in via DEMO_OPEN_SIGN_IN — never from a bare header on
// an anonymous request.
const DEMO_ACCESS_KEY = String(process.env.DEMO_ACCESS_KEY || '').trim() === 'unset' ? '' : String(process.env.DEMO_ACCESS_KEY || '').trim();
const OPEN_SIGN_IN = /^(1|true|yes|on)$/i.test(String(process.env.DEMO_OPEN_SIGN_IN || ''));
// DEMO_OPEN_SIGN_IN is an explicit, off-by-default deployment decision — not something a
// browser can trigger for itself. Within it, personas must still differ (a walkthrough that
// shows every seat the same thing proves nothing), but every write is refused from a
// walkthrough credential regardless of which seat it holds.
async function resolveDemoOverride(req, identity = null) {
  const raw = String(req.headers['x-dr-as'] || req.body?.as || '').trim();
  if (!raw) return '';
  if (!identity && !OPEN_SIGN_IN) return '';
  const roster = await getDemoProfiles();
  if (!Array.isArray(roster) || !roster.length) return '';
  const hit = roster.find((p) => String(p.id || p.upn || '').toLowerCase() === raw.toLowerCase());
  return hit ? String(hit.id || hit.upn) : '';
}

// Routes that must resolve identity server-side, forwarded with a trusted bot-key header.
// Anything not registered here falls through to the blind proxy with no identity attached,
// which answers as the default role regardless of who is actually asking — so any route
// that composes a personalized answer (e.g. the home briefing) belongs here, not on the
// blind proxy.
async function forwardWithIdentity(req, res) {
  if (!isBackendLive()) return proxyToBackend(req, res);
  const ssoToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.ssoToken || '';
  const identity = await identityFromSsoToken(ssoToken);
  const asOverride = await resolveDemoOverride(req, identity);
  const viewAsRole = (String(req.headers['x-dr-view-as'] || req.body?.viewAsRole || '').trim());

  const requestingUser = asOverride
    ? { oid: asOverride, upn: asOverride, name: asOverride }
    : (identity ? { oid: identity.oid, upn: identity.upn, name: identity.name, roles: identity.roles, groups: identity.groups } : null);
  const headers = backendAuth({ identity, ssoToken, asOverride, requestingUser });
  if (viewAsRole) headers['x-dr-view-as'] = viewAsRole;
  // Only attach the delegated Graph token when the caller is genuinely that user —
  // under a demo "view as" override the seat on screen is not the signed-in person, so
  // their token must not read another seat's mail or post under their real name.
  if (!asOverride) {
    const graphToken = await workIqUserToken(ssoToken, identity, isSendRequest(req) ? GRAPH_SEND_SCOPES : GRAPH_WORKIQ_SCOPES);
    if (graphToken) headers['x-dr-graph-token'] = graphToken;
  }
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const body = hasBody
    ? JSON.stringify({ ...(req.body || {}), requestingUser, viewAsRole: viewAsRole || undefined })
    : undefined;
  try {
    const upstream = await fetch(`${config.backend.url}${req.originalUrl}`, { method: req.method, headers, body });
    res.status(upstream.status);
    const cd = upstream.headers.get('content-disposition');
    if (cd) res.setHeader('Content-Disposition', cd);
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) {
    res.status(502).json({ error: 'backend-unreachable', detail: String(e?.message || e) });
  }
}

// Every route under /api goes through the identity forwarder — one rule, not a maintained
// list of prefixes. A hand-kept list goes stale in both directions: it either leaves a
// route on the blind proxy (identity silently dropped) or misses a new route entirely
// (wrongly refused). The forwarder resolves who is asking; the orchestrator decides what
// they may have. That split is the only place the decision belongs.
app.use('/api', forwardWithIdentity);

// Teams bootstrap injected into the embedded dashboard (theme sync + SSO notify).
app.get('/teams-bootstrap.js', (_req, res) => {
  res.setHeader('content-type', 'application/javascript; charset=utf-8');
  res.send(TEAMS_BOOTSTRAP_JS);
});

// Channel-tab configuration page (required to add the tab to a channel).
app.get('/config', (_req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.send(TEAMS_CONFIG_HTML);
});

// The Channel/personal Tab is the Deal Room console (tab/dist). It talks to the
// shared backend through this origin's /api proxy (single data source), and the
// SAME build is served here as a standalone web console (the "Open web console"
// link in the tab opens this origin outside Teams).
const tabDist = join(__dirname, '..', 'tab', 'dist');
if (existsSync(tabDist)) {
  app.use(express.static(tabDist, {
    setHeaders: (res, filePath) => {
      // Content-hashed assets are immutable; everything else (incl. index.html) must revalidate.
      if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else res.setHeader('Cache-Control', 'no-cache');
    }
  }));
  app.get('*', (_req, res) => {
    // Never cache the SPA shell, so a new deploy's hashed bundle is picked up immediately.
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(join(tabDist, 'index.html'));
  });
} else {
  app.get('*', (_req, res) =>
    res
      .status(200)
      .send('<h1>The Deal Room — Teams</h1><p>Run <code>npm run build:tab</code> to build the native agent console.</p>')
  );
}

const port = config.server.port;
app.listen(port, () => {
  console.log(`Deal Room Teams app listening on :${port} — mode: ${isDemoMode() ? 'demo' : 'live'}`);
  if (startEventPoller()) console.log('[teams] deal-event notifier active (polling shared backend signals).');
  if (startPlatformEnforcer()) console.log('[teams] platform power control active (orchestrator sleep/wake + auto-stop).');
});
