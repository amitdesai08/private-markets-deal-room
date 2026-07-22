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
import { personaForUser, stageAccessFor } from './sharedLib.js';
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
function ssoIdentity(req) {
  const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.ssoToken || '';
  return identityFromSsoToken(tok);
}
app.get('/api/platform/status', async (req, res) => {
  try { res.json(await platformStatus(ssoIdentity(req))); }
  catch (e) { res.status(502).json({ control: platformControlEnabled(), online: false, error: String(e?.message || e) }); }
});
app.post('/api/platform/wake', async (req, res) => {
  const mode = req.body?.mode === 'indefinite' ? 'indefinite' : 'hour';
  const identity = ssoIdentity(req);
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
  })
);

// Per-user context: Teams SSO token -> identity -> Deal Room persona + stage access.
app.post('/api/teams/context', async (req, res) => {
  const ssoToken = req.body?.ssoToken || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const identity = identityFromSsoToken(ssoToken);
  const asOverride = String(req.body?.as || '').trim();               // demo "view as USER"
  const viewAsRole = String(req.body?.viewAsRole || '').trim() || null; // hierarchy "view as ROLE"
  const persona = await personaForUser(identity || {});
  // Authoritative access profile from the orchestrator (single policy source): which
  // agents this user may use + the roles they can view-as. The requesting identity is
  // the demo override (by name) or the SSO identity, trusted via the shared bot key.
  const requestingUser = asOverride
    ? { name: asOverride }
    : (identity ? { oid: identity.oid, upn: identity.upn, name: identity.name } : null);
  let acc = null;
  if (isBackendLive()) {
    try {
      const headers = { 'content-type': 'application/json' };
      if (config.backend.botKey) headers['x-bot-key'] = config.backend.botKey;
      const r = await fetch(`${config.backend.url}/api/me/access`, {
        method: 'POST', headers, body: JSON.stringify({ requestingUser, viewAsRole }),
      });
      if (r.ok) acc = await r.json();
    } catch { /* fall back to local stage access below */ }
  }
  const fallback = stageAccessFor(asOverride || identity?.upn || '');
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
    viewingAs: asOverride || identity?.upn || null,
    demoMode: acc?.demoMode ?? false,
    demoUsers: await getDemoProfiles(),
  });
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
  const identity = identityFromSsoToken(ssoToken);
  const dest = String(req.query.dest || req.body?.dest || 'download').toLowerCase();

  let userToken = null;
  if (dest === 'sharepoint') {
    try { userToken = await exchangeOnBehalfOf(ssoToken, GRAPH_DOC_SCOPES); } catch { userToken = null; }
    if (!userToken) return res.status(409).json({ notConnected: true, reason: 'Sign in to Microsoft 365 in Teams to publish to the shared data room.' });
  }

  const headers = { 'content-type': 'application/json' };
  if (config.backend.botKey) headers['x-bot-key'] = config.backend.botKey;
  if (userToken) headers['x-user-graph-token'] = userToken;
  const body = JSON.stringify({ dest, requestingUser: identity ? { oid: identity.oid, upn: identity.upn, name: identity.name } : undefined });

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

// Admin (role builder / persona designer) — inject the resolved requesting identity
// (SSO or demo "view as") so the orchestrator can enforce administrator-only access.
// Registered before the generic proxy so it wins for /api/admin/*.
app.use('/api/admin', async (req, res) => {
  if (!isBackendLive()) return res.status(502).json({ error: 'shared-backend-not-configured' });
  const ssoToken = req.body?.ssoToken || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const identity = identityFromSsoToken(ssoToken);
  const asOverride = String(req.body?.as || '').trim();
  const requestingUser = asOverride
    ? { name: asOverride }
    : (identity ? { oid: identity.oid, upn: identity.upn, name: identity.name } : null);
  const body = { ...(req.body || {}) };
  delete body.ssoToken; delete body.as;
  body.requestingUser = requestingUser;
  const headers = { 'content-type': 'application/json' };
  if (config.backend.botKey) headers['x-bot-key'] = config.backend.botKey;
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
app.use('/api/deals', async (req, res) => {
  if (!isBackendLive()) return proxyToBackend(req, res);
  const ssoToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.ssoToken || '';
  const identity = identityFromSsoToken(ssoToken);
  const asOverride = String(req.headers['x-dr-as'] || req.body?.as || req.query.as || '').trim();
  const viewAsRole = String(req.headers['x-dr-view-as'] || req.body?.viewAsRole || req.query.viewAsRole || '').trim();
  const requestingUser = asOverride
    ? { name: asOverride }
    : (identity ? { oid: identity.oid, upn: identity.upn, name: identity.name } : null);
  const headers = { 'content-type': 'application/json' };
  if (config.backend.botKey) headers['x-bot-key'] = config.backend.botKey;
  if (requestingUser) headers['x-dr-user'] = JSON.stringify(requestingUser);
  if (viewAsRole) headers['x-dr-view-as'] = viewAsRole;
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
});

// Everything else under /api forwards to the shared backend (single data source).
app.use('/api', proxyToBackend);

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
  app.use(express.static(tabDist));
  app.get('*', (_req, res) => res.sendFile(join(tabDist, 'index.html')));
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
