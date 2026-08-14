// Connector enablement settings — the persisted on/off state behind the Data
// Sources config menu. A connector defaults to ENABLED; only an explicit "off"
// is stored, so new connectors light up automatically.
//
// Also persists a per-connector CONFIG object (e.g. a WorkIQ MCP endpoint URL set
// from Settings), so runtime-configurable connectors don't depend on redeploying env.
//
// Persisted as a single doc in the Cosmos `connectors` container (id
// 'connector-settings'); falls back to in-memory in demo/local mode. Loaded once
// at boot so isEnabled()/getConnectorConfig() are synchronous at any call site.

import { connectors } from './repo/index.js';
import { validateHttpUrlSync } from './ssrf.js';

const DOC_ID = 'connector-settings';

// id -> boolean (only explicit overrides stored; absence = enabled).
let _overrides = {};
// id -> config object (e.g. { mcpUrl }).
let _config = {};
// id -> user-added custom connector definition (e.g. a PitchBook / Morningstar
// source the fund adds itself when there is no built-in for it).
let _custom = {};
let _loaded = false;

export async function initConnectorSettings() {
  try {
    const doc = await connectors.get(DOC_ID);
    const rec = doc && doc.record && typeof doc.record === 'object' ? doc.record : {};
    // New shape: { enabled: {...}, config: {...} }. Old shape: flat { id: bool }.
    if (rec.enabled && typeof rec.enabled === 'object') {
      _overrides = { ...rec.enabled };
      _config = rec.config && typeof rec.config === 'object' ? { ...rec.config } : {};
    } else {
      _overrides = { ...rec };
      _config = {};
    }
    _custom = rec.custom && typeof rec.custom === 'object' ? { ...rec.custom } : {};
  } catch {
    _overrides = {};
    _config = {};
    _custom = {};
  }
  _loaded = true;
  return { ..._overrides };
}

// Default-on: enabled unless explicitly set to false.
export function isConnectorEnabled(id) {
  return _overrides[id] !== false;
}

export function connectorSettingsLoaded() {
  return _loaded;
}

export function allConnectorSettings() {
  return { ..._overrides };
}

// The persisted runtime config for a connector (e.g. { mcpUrl }). Always an object.
export function getConnectorConfig(id) {
  return { ...(_config[id] || {}) };
}

async function persist() {
  try {
    await connectors.upsert({ id: DOC_ID, record: { enabled: { ..._overrides }, config: { ..._config }, custom: { ..._custom } }, updatedAt: new Date().toISOString() });
  } catch {
    /* best-effort; in-memory holds for this process */
  }
}

// Persist an on/off decision (best-effort — the in-memory value always wins for
// this process so the toggle is immediate even if the datastore write fails).
export async function setConnectorEnabled(id, enabled) {
  _overrides[id] = !!enabled;
  await persist();
  return isConnectorEnabled(id);
}

// Merge a config patch for a connector (e.g. { mcpUrl }). Empty-string values clear
// the key so an operator can blank a URL from Settings. Any URL-typed value is
// SSRF-validated (https + no private/loopback host) before it is persisted.
export async function setConnectorConfig(id, patch = {}) {
  const next = { ...(_config[id] || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === '' || v === null || v === undefined) { delete next[k]; continue; }
    const val = typeof v === 'string' ? v.trim() : v;
    if (typeof val === 'string' && /url|endpoint|uri|mcp|webhook/i.test(k)) {
      validateHttpUrlSync(val); // throws on non-https / localhost / literal private IP
    }
    next[k] = val;
  }
  _config[id] = next;
  await persist();
  return getConnectorConfig(id);
}

// ---- user-added custom connectors -------------------------------------------
// The fund can register a data source we do not ship a built-in for (e.g.
// PitchBook, Morningstar Direct, an internal API). A custom connector is honest
// about connectivity: it is a declaration + optional endpoint, tested by a plain
// reachability probe — never faked as "connected".
const CUSTOM_ROLES = ['discover', 'confirm', 'quality', 'context', 'system'];

// A 'sor' (system of record) connector is the same governed lifecycle as a plain
// custom source, but for the firm's own CRM / deal database (DealCloud, Salesforce
// FSC, Allvue/eFront, or an internal system) — see docs/integration/DATA-INTEGRATION.md.
// It gets a richer config schema (base URL + API key OR OAuth client-credentials +
// a health-check path) so its probe is a REAL authenticated round-trip, not just a
// bare reachability check.
const SOR_CONFIG_FIELDS = [
  { key: 'baseUrl', label: 'API base URL', placeholder: 'https://your-instance.example.com', kind: 'url' },
  { key: 'healthPath', label: 'Health-check path (appended to base URL)', placeholder: '/services/data/v60.0/limits', kind: 'text' },
  { key: 'dealsPath', label: 'Deals-list path (for pulling your pipeline in)', placeholder: '/api/v2/deals', kind: 'text' },
  { key: 'writeBackPath', label: 'Write-back path (for pushing IC decisions out)', placeholder: '/api/v2/deals/decisions', kind: 'text' },
  { key: 'authType', label: 'Authentication', kind: 'select', options: ['apiKey', 'oauthClientCredentials'] },
  { key: 'apiKey', label: 'API key / bearer token', kind: 'secret' },
  { key: 'tokenUrl', label: 'OAuth token URL', placeholder: 'https://login.example.com/services/oauth2/token', kind: 'url' },
  { key: 'clientId', label: 'OAuth client ID', kind: 'text' },
  { key: 'clientSecret', label: 'OAuth client secret', kind: 'secret' },
];
const SOR_CONFIG_KEYS = SOR_CONFIG_FIELDS.map((f) => f.key);
const SOR_SECRET_KEYS = new Set(SOR_CONFIG_FIELDS.filter((f) => f.kind === 'secret').map((f) => f.key));

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export function listCustomConnectors() {
  return Object.values(_custom).map((d) => ({ ...d }));
}

export function isCustomConnector(id) {
  return !!_custom[id];
}

export function isSorConnector(id) {
  return _custom[id]?.kind === 'sor';
}

// Config as safe to hand to any authenticated client: secret-typed fields (API key,
// OAuth client secret) are reported as present/absent, never in the clear.
export function getConnectorConfigRedacted(id) {
  const cfg = getConnectorConfig(id);
  const out = {};
  for (const [k, v] of Object.entries(cfg)) {
    out[k] = SOR_SECRET_KEYS.has(k) ? (v ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : '') : v;
  }
  return out;
}

// Add a custom connector. Returns the created definition, or { error } on bad input.
// `taken` is the set of existing (built-in + custom) ids/names to de-dupe against.
// input.kind === 'sor' registers a CRM / system-of-record connector instead of a
// plain custom source (see SOR_CONFIG_FIELDS above).
export async function addCustomConnector(input = {}, taken = { ids: [], names: [] }) {
  const name = String(input.name || '').trim();
  if (!name) return { error: 'name-required' };
  if (name.length > 60) return { error: 'name-too-long' };
  const lc = name.toLowerCase();
  if ((taken.names || []).some((n) => String(n).toLowerCase() === lc)) return { error: 'already-exists' };
  const isSor = input.kind === 'sor';
  const role = CUSTOM_ROLES.includes(input.role) ? input.role : (isSor ? 'system' : 'confirm');
  const primaryJob = String(input.primaryJob || '').trim().slice(0, 200) || (isSor
    ? 'Pull your firm\u2019s pipeline and push IC decisions back to your CRM / system of record.'
    : 'Custom data source (added by the fund).');
  const sweetSpot = String(input.sweetSpot || '').trim().slice(0, 200) || (isSor
    ? 'DealCloud, Salesforce, Allvue/eFront, or any REST API your firm already uses.'
    : 'Registered as a custom provider.');
  const takenIds = new Set([...(taken.ids || []), ...Object.keys(_custom)]);
  const base = (isSor ? 'sor-' : 'custom-') + (slugify(name) || 'source');
  let id = base;
  let n = 2;
  while (takenIds.has(id)) id = `${base}-${n++}`;
  const def = {
    id,
    name,
    kind: isSor ? 'sor' : 'custom',
    role,
    primaryJob,
    sweetSpot,
    custom: true,
    // Governance: a custom source is PENDING until an admin approves it; it cannot be
    // used (tested/enabled) in production until then (advisor SC-5).
    approved: false,
    configFields: isSor ? SOR_CONFIG_FIELDS : [{ key: 'endpoint', label: 'Endpoint / API URL (optional)', placeholder: 'https://\u2026/api or /mcp', kind: 'url' }],
  };
  _custom[id] = def;
  await persist();
  if (isSor) {
    const patch = {};
    for (const k of SOR_CONFIG_KEYS) {
      const v = input[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') patch[k] = String(v).trim();
    }
    if (Object.keys(patch).length) await setConnectorConfig(id, patch);
  } else {
    const endpoint = String(input.endpoint || '').trim();
    if (endpoint) await setConnectorConfig(id, { endpoint });
  }
  return { ...def };
}

// Admin approval gate for a custom connector (advisor SC-5). Only an approved source
// may be enabled/tested for production use.
export async function approveCustomConnector(id, approver = null) {
  if (!_custom[id]) return { error: 'not-custom' };
  _custom[id] = { ..._custom[id], approved: true, approvedBy: approver || null, approvedAt: new Date().toISOString() };
  await persist();
  return { ...(_custom[id]) };
}

export function isCustomApproved(id) {
  return _custom[id] ? _custom[id].approved === true : false;
}

export async function removeCustomConnector(id) {
  if (!_custom[id]) return { error: 'not-custom' };
  delete _custom[id];
  delete _overrides[id];
  delete _config[id];
  await persist();
  return { ok: true, id };
}
