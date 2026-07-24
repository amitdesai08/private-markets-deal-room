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

const DOC_ID = 'connector-settings';

// id -> boolean (only explicit overrides stored; absence = enabled).
let _overrides = {};
// id -> config object (e.g. { mcpUrl }).
let _config = {};
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
  } catch {
    _overrides = {};
    _config = {};
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
    await connectors.upsert({ id: DOC_ID, record: { enabled: { ..._overrides }, config: { ..._config } }, updatedAt: new Date().toISOString() });
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
// the key so an operator can blank a URL from Settings.
export async function setConnectorConfig(id, patch = {}) {
  const next = { ...(_config[id] || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === '' || v === null || v === undefined) delete next[k];
    else next[k] = typeof v === 'string' ? v.trim() : v;
  }
  _config[id] = next;
  await persist();
  return getConnectorConfig(id);
}
