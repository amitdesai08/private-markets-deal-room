// Connector enablement settings — the persisted on/off state behind the Data
// Sources config menu. A connector defaults to ENABLED; only an explicit "off"
// is stored, so new connectors light up automatically.
//
// Persisted as a single doc in the Cosmos `connectors` container (id
// 'connector-settings'); falls back to in-memory in demo/local mode. Loaded once
// at boot so isEnabled() is a synchronous check usable at any provider call site.

import { connectors } from './repo/index.js';

const DOC_ID = 'connector-settings';

// id -> boolean. Only explicit overrides are stored; absence means "enabled".
let _overrides = {};
let _loaded = false;

export async function initConnectorSettings() {
  try {
    const doc = await connectors.get(DOC_ID);
    _overrides = doc && doc.record && typeof doc.record === 'object' ? { ...doc.record } : {};
  } catch {
    _overrides = {};
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

// Persist an on/off decision (best-effort — the in-memory value always wins for
// this process so the toggle is immediate even if the datastore write fails).
export async function setConnectorEnabled(id, enabled) {
  _overrides[id] = !!enabled;
  try {
    await connectors.upsert({ id: DOC_ID, record: { ..._overrides }, updatedAt: new Date().toISOString() });
  } catch {
    /* best-effort; in-memory holds for this process */
  }
  return isConnectorEnabled(id);
}
