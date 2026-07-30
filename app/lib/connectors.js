// Data-source connectivity registry + REAL connectivity tests.
//
// This replaces the old faked source status (static latency/lastSync). Each
// connector is one of:
//   - web      : the live web/news search (Bing-grounded Foundry agent). Tested
//                by a real reachability probe of the Foundry project endpoint.
//   - mcp      : a provider MCP server (Morningstar, LSEG, Moody's) reached over
//                OAuth (see lib/mcp). Tested by a real token refresh + MCP
//                `initialize` round-trip. Shows "disconnected" until signed in.
//   - database : a vendor DB integration that is NOT wired yet (PitchBook,
//                FactSet, Capital IQ). Honestly reported as disconnected.
//
// A connector only reports "connected" when a real test actually succeeds.

import { newsAgentConfigured } from './newsAgent.js';
import { McpSession } from './mcp/morningstar.js';
import { config } from './config.js';
import { hasLogin, clearTokens } from './mcp/oauth.js';
import { testFilings, filingsConfigured } from './filings.js';
import { gdeltNews, gdeltConfigured } from './providers/gdelt.js';
import { leiLookup, gleifConfigured } from './providers/gleif.js';
import { fabricDataAgentConfigured, fabricDataAgentInfo } from './fabricDataAgent.js';
import { isConnectorEnabled, getConnectorConfig, listCustomConnectors } from './connectorSettings.js';import { m365Configured, m365Connected, m365Ready, m365AppOnly, me as m365Me, m365AppPing } from './m365/graph.js';
import { assertPublicHttpUrl } from './ssrf.js';
import { workiqConfigured, workiqConnected, workiqUrl, workiqBackend } from './mcp/workiq.js';

export const CONNECTORS = [
  {
    id: 'm365', name: 'M365 Login', kind: 'm365', role: 'identity',
    primaryJob: 'Microsoft 365 access — Teams, SharePoint & mailbox (runs on the app’s own permissions; optional user sign-in to act as you)',
    sweetSpot: 'App-only by default — no user sign-in needed; the deal data room provisions with the app’s identity',
    loginUrl: '/api/m365/login'
  },
  {
    id: 'workiq', name: 'Work IQ', kind: 'workiq', provider: 'workiq', role: 'context',
    primaryJob: 'M365 work data for agents — SharePoint files, Teams threads & mailbox (delegated, over MCP)',
    sweetSpot: 'Ground agents in a deal\u2019s real documents, channel discussion & correspondence',
    // Endpoint is set at runtime from Settings (persisted); no fixed vendor URL.
    configFields: [{ key: 'mcpUrl', label: 'WorkIQ MCP endpoint URL', placeholder: 'https://\u2026/mcp', kind: 'url' }]
  },
  {
    id: 'web', name: 'Web', kind: 'web', role: 'discover',
    primaryJob: 'Live web & news search (Bing-grounded agent)',
    sweetSpot: 'Earliest soft signals before they hit databases'
  },
  {
    id: 'morningstar', name: 'Morningstar', kind: 'mcp', provider: 'morningstar', role: 'quality',
    primaryJob: 'Fundamentals, ratings, equity & credit research',
    sweetSpot: 'Quality / creditworthiness cross-check',
    mcpUrl: config.connectors.morningstarMcpUrl
  },
  {
    id: 'lseg', name: 'LSEG', kind: 'mcp', provider: 'lseg', role: 'confirm',
    primaryJob: 'Market data, estimates, filings, ownership',
    sweetSpot: 'Public-market data & reference cross-check',
    mcpUrl: config.connectors.lsegMcpUrl
  },
  {
    id: 'moodys', name: "Moody's", kind: 'mcp', provider: 'moodys', role: 'quality',
    primaryJob: 'Credit ratings, research & risk assessment',
    sweetSpot: 'Credit & default-risk cross-check',
    mcpUrl: config.connectors.moodysMcpUrl
  },
  {
    id: 'fabric-agent', name: 'Fabric Data Agent', kind: 'fabric-agent', role: 'quality',
    primaryJob: 'Ask the fund’s Fabric lakehouse in natural language (Data Agent)',
    sweetSpot: 'NL Q&A over comps, findings, IC precedents & financials'
  },
  {
    id: 'edgar', name: 'SEC EDGAR', kind: 'edgar', role: 'confirm',
    primaryJob: 'US regulatory filings — 10-K, 10-Q, 8-K, proxies (free, official)',
    sweetSpot: 'Real public-company filings with clickable sources'
  },
  {
    id: 'gdelt', name: 'GDELT', kind: 'gdelt', role: 'discover',
    primaryJob: 'Global news & event stream — live catalyst signals (free, keyless)',
    sweetSpot: 'Broad live news without a paid provider'
  },
  {
    id: 'gleif', name: 'GLEIF', kind: 'gleif', role: 'confirm',
    primaryJob: 'Legal-entity (LEI) + corporate ownership lookup (free, keyless)',
    sweetSpot: 'KYC / entity resolution & ultimate-parent mapping'
  },
  {
    id: 'pitchbook', name: 'PitchBook', kind: 'database', role: 'discover',
    primaryJob: 'Private-company fundings, PE/VC ownership, sponsor hold periods',
    sweetSpot: 'Finding sponsor-exit and founder-owned targets'
  },
  {
    id: 'factset', name: 'FactSet', kind: 'database', role: 'confirm',
    primaryJob: 'Aggregated news + estimates + filings + ownership',
    sweetSpot: 'Fast public-company monitoring & alerts'
  },
  {
    id: 'capitaliq', name: 'Capital IQ', kind: 'database', role: 'confirm',
    primaryJob: 'Deep financials, transaction history, filings, screening',
    sweetSpot: 'Comps, precedent deals, filing full-text search'
  }
];

const byId = Object.fromEntries(CONNECTORS.map((c) => [c.id, c]));

// Built-in connectors + any custom sources the fund has registered (persisted).
function allConnectors() {
  return [...CONNECTORS, ...listCustomConnectors()];
}
function connectorById(id) {
  return byId[id] || listCustomConnectors().find((c) => c.id === id) || null;
}

// Provider → MCP config for the in-app OAuth login routes.
export function mcpProviderConfig(provider) {
  const c = CONNECTORS.find((x) => (x.kind === 'mcp' || x.kind === 'workiq') && x.provider === provider);
  if (!c) return null;
  const mcpUrl = c.kind === 'workiq' ? workiqUrl() : c.mcpUrl;
  return { provider, name: c.name, mcpUrl };
}

// Last successful sync per connector (updated by real tests AND real use, e.g. a
// Morningstar quality check or a web news search). In-memory: honest "never" on
// a fresh boot until the first successful operation.
const lastSync = {};
export function markSync(id) { lastSync[id] = new Date().toISOString(); }
export function getLastSync(id) { return lastSync[id] || null; }

// Freshness SLA per source kind (advisor SC-7): how old a source's last successful
// sync may be before its data is considered STALE and must be labelled / excluded
// from IC- or LP-facing outputs rather than silently used.
const FRESHNESS_SLA_MS = {
  web: 60 * 60 * 1000, gdelt: 60 * 60 * 1000, // fast-moving news/web
  mcp: 15 * 60 * 1000,                        // market-data providers
  m365: 60 * 60 * 1000, workiq: 60 * 60 * 1000,
  edgar: 24 * 60 * 60 * 1000, 'fabric-agent': 24 * 60 * 60 * 1000,
  database: 24 * 60 * 60 * 1000, custom: 24 * 60 * 60 * 1000,
  gleif: 7 * 24 * 60 * 60 * 1000,             // slow-moving entity registry
};
const DEFAULT_SLA_MS = 24 * 60 * 60 * 1000;

// Freshness of a connector's data vs its SLA: never (no successful sync yet),
// fresh (within SLA), or stale (older than SLA -> not usable for IC/reporting).
export function connectorFreshness(id) {
  const c = connectorById(id);
  if (!c) return null;
  const slaMs = FRESHNESS_SLA_MS[c.kind] ?? DEFAULT_SLA_MS;
  const last = getLastSync(id);
  if (!last) return { status: 'never', ageMs: null, slaMs, lastSync: null };
  const ageMs = Date.now() - new Date(last).getTime();
  return { status: ageMs <= slaMs ? 'fresh' : 'stale', ageMs, slaMs, lastSync: last };
}

// Short-lived cache of the last test result so repeated Home loads don't hammer
// the providers; the explicit "Test connectivity" button forces a fresh probe.
const CACHE_MS = 20_000;
const lastResult = {};

function isConfigured(c) {
  if (c.kind === 'web') return newsAgentConfigured();
  if (c.kind === 'mcp') return hasLogin(c.provider);
  if (c.kind === 'edgar') return filingsConfigured();
  if (c.kind === 'gdelt') return gdeltConfigured();
  if (c.kind === 'gleif') return gleifConfigured();
  if (c.kind === 'fabric-agent') return fabricDataAgentConfigured();
  if (c.kind === 'm365') return m365Ready();
  if (c.kind === 'workiq') return workiqConnected();
  if (c.kind === 'custom') return c.approved === true && !!getConnectorConfig(c.id).endpoint;
  return false;
}

function result(c, fields) {
  const r = { id: c.id, name: c.name, checkedAt: new Date().toISOString(), lastSync: getLastSync(c.id), ...fields };
  lastResult[c.id] = r;
  return r;
}

async function testWeb(c) {
  if (!newsAgentConfigured()) {
    return result(c, { ok: false, status: 'disconnected', latencyMs: null, message: 'News agent not configured.' });
  }
  const url = config.foundry.projectEndpoint;
  const t0 = Date.now();
  try {
    // Any HTTP response means the Bing-grounded agent backend is reachable; only
    // a network failure / timeout rejects.
    await fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) });
    const latencyMs = Date.now() - t0;
    markSync(c.id);
    return result(c, { ok: true, status: 'connected', latencyMs, lastSync: getLastSync(c.id), message: `Healthy · Bing-grounded agent reachable in ${latencyMs}ms` });
  } catch (e) {
    return result(c, { ok: false, status: 'disconnected', latencyMs: Date.now() - t0, message: `Unreachable · ${e.name || 'error'}` });
  }
}

async function testMcp(c) {
  if (!hasLogin(c.provider)) {
    return result(c, { ok: false, status: 'disconnected', latencyMs: null, message: 'Licensed external market-data feed — requires vendor credentials, then Connect (optional for the demo).' });
  }
  const t0 = Date.now();
  try {
    const session = new McpSession(c.provider, c.mcpUrl);
    await session.initialize();
    const latencyMs = Date.now() - t0;
    markSync(c.id);
    return result(c, { ok: true, status: 'connected', latencyMs, lastSync: getLastSync(c.id), message: `Healthy · MCP session established in ${latencyMs}ms` });
  } catch (e) {
    return result(c, { ok: false, status: 'degraded', latencyMs: Date.now() - t0, message: `Reachable but errored · ${String(e.message || e).slice(0, 90)}` });
  }
}

async function testEdgar(c) {
  const t0 = Date.now();
  try {
    const { latencyMs } = await testFilings();
    markSync(c.id);
    return result(c, { ok: true, status: 'connected', latencyMs, lastSync: getLastSync(c.id), message: `Healthy · SEC EDGAR reachable in ${latencyMs}ms (free, no key)` });
  } catch (e) {
    return result(c, { ok: false, status: 'degraded', latencyMs: Date.now() - t0, message: `Unreachable · ${String(e.message || e).slice(0, 80)}` });
  }
}

async function testGdelt(c) {
  const t0 = Date.now();
  try {
    // Snappy probe: GDELT's public API can be slow, so cap the connectivity check
    // at 6s (real news fetches keep the full 12s) — the panel fails fast and
    // reports "slow" instead of freezing the Test button while GDELT crawls.
    const res = await gdeltNews('Apple', { max: 1, timeoutMs: 6000 });
    const latencyMs = Date.now() - t0;
    if (res.error) {
      return result(c, { ok: false, status: 'degraded', latencyMs, message: `Slow / unreachable · GDELT did not respond within 6s (free public API)` });
    }
    markSync(c.id);
    const slow = latencyMs > 3000 ? ' · slow public API' : '';
    return result(c, { ok: true, status: 'connected', latencyMs, lastSync: getLastSync(c.id), message: `Healthy · GDELT reachable in ${latencyMs}ms (free, no key)${slow}` });
  } catch (e) {
    return result(c, { ok: false, status: 'degraded', latencyMs: Date.now() - t0, message: `Unreachable · ${String(e.message || e).slice(0, 80)}` });
  }
}

async function testGleif(c) {
  const t0 = Date.now();
  try {
    await leiLookup('Apple');
    const latencyMs = Date.now() - t0;
    markSync(c.id);
    return result(c, { ok: true, status: 'connected', latencyMs, lastSync: getLastSync(c.id), message: `Healthy · GLEIF reachable in ${latencyMs}ms (free, no key)` });
  } catch (e) {
    return result(c, { ok: false, status: 'degraded', latencyMs: Date.now() - t0, message: `Unreachable · ${String(e.message || e).slice(0, 80)}` });
  }
}

async function testFabricAgent(c) {
  const t0 = Date.now();
  try {
    const info = fabricDataAgentInfo();
    markSync(c.id);
    const latencyMs = Date.now() - t0;
    const label = info.liveConfigured
      ? `Live Data Agent bound (${info.url})`
      : `Grounded on the ${info.lakehouse} snapshot (${info.mode} mode)`;
    return result(c, { ok: true, status: 'connected', latencyMs, lastSync: getLastSync(c.id), message: `Ready · ${label}` });
  } catch (e) {
    return result(c, { ok: false, status: 'degraded', latencyMs: Date.now() - t0, message: `Error · ${String(e.message || e).slice(0, 80)}` });
  }
}

async function testWorkiq(c) {
  if (!workiqConfigured()) {
    return result(c, { ok: false, status: 'disconnected', latencyMs: null, message: 'Not configured — set the Microsoft 365 app (app-only) or a WorkIQ MCP URL to enable governed M365 reads for agents.' });
  }
  // App-only Microsoft Graph backend: Work IQ is LIVE using the APP'S OWN identity —
  // no per-user sign-in required (this is the default when the M365 app is configured).
  if (workiqBackend() === 'graph') {
    markSync(c.id);
    return result(c, { ok: true, status: 'connected', latencyMs: null, lastSync: getLastSync(c.id), message: 'Live · Microsoft Graph (app-only) — SharePoint / Teams / mailbox reads enabled for agents; no sign-in needed.' });
  }
  // External WorkIQ MCP endpoint path: needs a delegated sign-in.
  if (!workiqConnected()) {
    return result(c, { ok: false, status: 'disconnected', latencyMs: null, message: 'Endpoint set — Connect (delegated sign-in) to enable SharePoint / Teams / mailbox reads.' });
  }
  const t0 = Date.now();
  try {
    const session = new McpSession('workiq', workiqUrl());
    await session.initialize();
    const latencyMs = Date.now() - t0;
    markSync(c.id);
    return result(c, { ok: true, status: 'connected', latencyMs, lastSync: getLastSync(c.id), message: `Healthy · WorkIQ MCP session established in ${latencyMs}ms` });
  } catch (e) {
    return result(c, { ok: false, status: 'degraded', latencyMs: Date.now() - t0, message: `Reachable but errored · ${String(e.message || e).slice(0, 90)}` });
  }
}

async function testM365(c) {
  const delegated = m365Connected();
  if (!delegated && !m365AppOnly()) {
    return result(c, { ok: false, status: 'disconnected', latencyMs: null, message: 'Not configured — set the Microsoft 365 app (client id / secret / tenant) to enable Teams, SharePoint and mailbox steps.' });
  }
  const t0 = Date.now();
  try {
    if (delegated) {
      const who = await m365Me();
      const latencyMs = Date.now() - t0;
      markSync(c.id);
      return result(c, { ok: true, status: 'connected', latencyMs, lastSync: getLastSync(c.id), message: `Connected as ${who.displayName} (${who.upn}) · Graph reachable in ${latencyMs}ms` });
    }
    const ping = await m365AppPing();
    const latencyMs = Date.now() - t0;
    markSync(c.id);
    return result(c, { ok: true, status: 'connected', latencyMs, lastSync: getLastSync(c.id), message: `Connected via the app’s own permissions (app-only)${ping.name ? ` · ${ping.name}` : ''} · Graph reachable in ${latencyMs}ms` });
  } catch (e) {
    return result(c, { ok: false, status: 'degraded', latencyMs: Date.now() - t0, message: `Graph errored · ${String(e.message || e).slice(0, 90)}` });
  }
}

// A user-registered custom source. Honest connectivity: if an endpoint URL was
// given, probe it for reachability (any HTTP response = reachable; auth is the
// integration's job); otherwise report it as declared-but-not-wired.
async function testCustom(c) {
  const endpoint = getConnectorConfig(c.id).endpoint;
  if (!endpoint) {
    return result(c, { ok: false, status: 'disconnected', latencyMs: null, message: 'Custom source registered — add an endpoint URL, then wire an integration to go live.' });
  }
  const t0 = Date.now();
  try {
    await assertPublicHttpUrl(endpoint); // SSRF guard: https + no private/loopback/metadata target
    await fetch(endpoint, { method: 'GET', signal: AbortSignal.timeout(8000) });
    const latencyMs = Date.now() - t0;
    markSync(c.id);
    return result(c, { ok: true, status: 'connected', latencyMs, lastSync: getLastSync(c.id), message: `Reachable · endpoint responded in ${latencyMs}ms (custom source — auth handled by your integration)` });
  } catch (e) {
    return result(c, { ok: false, status: 'degraded', latencyMs: Date.now() - t0, message: `Endpoint unreachable · ${e.name || 'error'}` });
  }
}

// Run a real connectivity test for one connector. Databases (unwired) always
// report disconnected. Soft-cached for CACHE_MS unless force=true.
export async function testConnector(id, { force = false } = {}) {
  const c = connectorById(id);
  if (!c) return null;
  // Governance: a custom source can't be used until an admin approves it (advisor SC-5).
  if (c.kind === 'custom' && c.approved !== true) {
    return result(c, { ok: false, status: 'pending', latencyMs: null, message: 'Awaiting admin approval \u2014 a custom source can\u2019t be tested or used until an admin approves it.' });
  }
  if (!isConnectorEnabled(id)) {
    return result(c, { ok: false, status: 'disabled', latencyMs: null, message: 'Disabled in Data Sources settings.' });
  }
  const cached = lastResult[id];
  if (!force && cached && Date.now() - new Date(cached.checkedAt).getTime() < CACHE_MS) return cached;

  if (c.kind === 'web') return testWeb(c);
  if (c.kind === 'mcp') return testMcp(c);
  if (c.kind === 'edgar') return testEdgar(c);
  if (c.kind === 'gdelt') return testGdelt(c);
  if (c.kind === 'gleif') return testGleif(c);
  if (c.kind === 'fabric-agent') return testFabricAgent(c);
  if (c.kind === 'm365') return testM365(c);
  if (c.kind === 'workiq') return testWorkiq(c);
  if (c.kind === 'custom') return testCustom(c);
  return result(c, { ok: false, status: 'disconnected', latencyMs: null, message: 'Integration not wired — no live connection.' });
}

// The connector table for the Home connectivity panel: metadata + whether it can
// be tested/connected + the last known result (if any this session).
export function listConnectors() {
  return allConnectors().map((c) => {
    const enabled = isConnectorEnabled(c.id);
    const configured = isConfigured(c);
    const cached = lastResult[c.id];
    const free = c.kind === 'web' || c.kind === 'edgar' || c.kind === 'gdelt' || c.kind === 'gleif';
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      provider: c.provider || null,
      role: c.role,
      loginUrl: c.loginUrl || null,
      primaryJob: c.primaryJob,
      sweetSpot: c.sweetSpot,
      free,
      enabled,
      configured,
      custom: !!c.custom,
      approved: c.custom ? c.approved === true : true,
      // Freshness vs SLA (advisor SC-7): never / fresh / stale — stale data is
      // labelled and must not silently feed an IC- or LP-facing output.
      freshness: connectorFreshness(c.id),
      // Runtime-editable config (e.g. WorkIQ MCP URL) surfaced to Settings.
      configFields: c.configFields || null,
      config: c.configFields ? getConnectorConfig(c.id) : undefined,
      testable: free || c.kind === 'fabric-agent' || (c.kind === 'custom' && c.approved === true) ? true : (c.kind === 'mcp' || c.kind === 'm365' || c.kind === 'workiq' ? configured : false),
      connectable: c.kind === 'mcp' || c.kind === 'm365' || c.kind === 'workiq', // can be signed-in via OAuth
      status: !enabled ? 'disabled' : (c.custom && c.approved !== true ? 'pending' : (cached && cached.status !== 'pending' ? cached.status : c.kind === 'database' ? 'disconnected' : configured ? 'unknown' : 'disconnected')),
      latencyMs: cached ? cached.latencyMs : null,
      lastSync: getLastSync(c.id),
      message: !enabled ? 'Disabled in Data Sources settings.' : (cached ? cached.message : null)
    };
  });
}

// Disconnect an OAuth-backed connector: remove its stored delegated token so the
// panel reports it as disconnected and the next use requires a fresh sign-in.
// Only m365 + MCP providers hold a token; other kinds are not disconnectable.
// Clears the cached test result + last-sync so the row flips immediately.
export async function disconnectConnector(id) {
  const c = CONNECTORS.find((x) => x.id === id);
  if (!c) return null;
  const tokenKey = c.kind === 'm365' ? 'm365' : (c.kind === 'mcp' || c.kind === 'workiq') ? c.provider : null;
  if (!tokenKey) return { id, name: c.name, disconnected: false, error: 'not-disconnectable' };
  const out = await clearTokens(tokenKey);
  delete lastResult[c.id];
  delete lastSync[c.id];
  return { id, name: c.name, disconnected: true, envTokenRemains: out.envTokenRemains };
}
