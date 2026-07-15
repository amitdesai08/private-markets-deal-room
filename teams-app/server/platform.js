// Platform power control — the Teams app acts as the control plane that can put the
// orchestrator (the data plane) to sleep and wake it, so an idle demo/PoC costs
// almost nothing. The Teams app itself stays up (cheap) to serve the "offline" gate.
//
// How it works:
//   • The orchestrator's power state IS its Azure Container App state (Running/Stopped).
//   • The "lease" (how long it should stay awake) lives as TAGS on the orchestrator
//     resource, so it is durable and survives a Teams-app restart — the resource is
//     the single source of truth, no extra datastore.
//   • A background enforcer stops the orchestrator when a temporary (1-hour) lease
//     expires. An "indefinite" lease never auto-stops.
//
// All Azure control is done with the Teams app's managed identity (AZURE_CLIENT_ID),
// which is granted rights on the orchestrator container app by infra/modules/app.bicep.

import { ManagedIdentityCredential, DefaultAzureCredential } from '@azure/identity';
import { config } from './config.js';

const ARM = 'https://management.azure.com';
const APP_API = '2024-03-01';
const TAGS_API = '2021-04-01';

// Lease tag keys on the orchestrator container app.
const TAG_MODE = 'dealroom-lease-mode';      // temporary | indefinite | asleep
const TAG_EXPIRES = 'dealroom-lease-expires'; // epoch ms (string) for temporary leases
const TAG_BY = 'dealroom-lease-by';

export function platformControlEnabled() {
  const p = config.platform;
  return !!(p.enabled && p.subscriptionId && p.resourceGroup && p.appName);
}

// The "indefinite" wake path is gated to admins. The gate is only active when an
// admin list is configured (PLATFORM_ADMIN_IDS / ADMIN_IDS) — otherwise anyone may,
// matching the app's open-mode default. Identity comes from the Teams SSO token.
const localPart = (u) => String(u || '').split('@')[0].toLowerCase();
export function platformAdminGated() {
  return (config.platform.adminIds || []).length > 0;
}
export function isPlatformAdmin(identity) {
  if (!platformAdminGated()) return true;
  if (!identity) return false;
  const ids = new Set(config.platform.adminIds);
  return (
    ids.has(String(identity.oid || '').toLowerCase()) ||
    ids.has(String(identity.upn || '').toLowerCase()) ||
    ids.has(localPart(identity.upn))
  );
}

// ---- Azure Resource Manager helpers (managed-identity bearer token) ---------
let _cred = null;
let _tok = null;
function credential() {
  if (!_cred) {
    _cred = config.platform.clientId
      ? new ManagedIdentityCredential(config.platform.clientId)
      : new DefaultAzureCredential();
  }
  return _cred;
}
async function armToken() {
  if (_tok && _tok.expiresOnTimestamp - Date.now() > 60_000) return _tok.token;
  _tok = await credential().getToken('https://management.azure.com/.default');
  return _tok.token;
}
function appBase() {
  const p = config.platform;
  return `${ARM}/subscriptions/${p.subscriptionId}/resourceGroups/${p.resourceGroup}/providers/Microsoft.App/containerApps/${p.appName}`;
}
async function armFetch(url, init = {}) {
  const token = await armToken();
  const r = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  return r;
}
async function armGetApp() {
  const r = await armFetch(`${appBase()}?api-version=${APP_API}`);
  if (!r.ok) throw new Error(`ARM get ${r.status}`);
  return r.json();
}
async function armAction(action) {
  const r = await armFetch(`${appBase()}/${action}?api-version=${APP_API}`, { method: 'POST' });
  if (!r.ok && r.status !== 202) throw new Error(`ARM ${action} ${r.status}`);
  return true;
}
async function armMergeTags(tags) {
  const r = await armFetch(`${appBase()}/providers/Microsoft.Resources/tags/default?api-version=${TAGS_API}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'Merge', properties: { tags } }),
  });
  if (!r.ok) throw new Error(`ARM tags ${r.status}`);
  return true;
}

// ---- lease projection -------------------------------------------------------
function leaseFromTags(tags = {}) {
  const mode = tags[TAG_MODE] || null;
  if (!mode || mode === 'asleep') return null;
  const expires = tags[TAG_EXPIRES] ? Number(tags[TAG_EXPIRES]) : null;
  const minutesRemaining =
    mode === 'temporary' && expires ? Math.max(0, Math.round((expires - Date.now()) / 60_000)) : null;
  return {
    mode,
    expiresAt: expires ? new Date(expires).toISOString() : null,
    minutesRemaining,
    setBy: tags[TAG_BY] || null,
  };
}

// online = the orchestrator answers its health probe (works regardless of ARM).
async function backendReachable() {
  if (!config.backend.url) return false;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2500);
  try {
    const r = await fetch(`${config.backend.url}/api/health`, { signal: ctl.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

// ---- public API -------------------------------------------------------------
// Status is safe to call even when the orchestrator is asleep (it never proxies).
// `identity` (from the Teams SSO token) determines whether the caller may use the
// admin-only "keep online indefinitely" path.
export async function platformStatus(identity = null) {
  const control = platformControlEnabled();
  const online = await backendReachable();
  const isAdmin = isPlatformAdmin(identity);
  const adminGated = platformAdminGated();
  const base = { control, online, isAdmin, adminGated, appName: config.platform.appName || null, leaseHours: config.platform.leaseHours };
  if (!control) return { ...base, running: online ? 'Running' : 'Unknown', lease: null };
  try {
    const app = await armGetApp();
    return {
      ...base,
      running: app?.properties?.runningStatus || (online ? 'Running' : 'Unknown'),
      lease: leaseFromTags(app?.tags || {}),
    };
  } catch {
    return { ...base, running: online ? 'Running' : 'Unknown', lease: null };
  }
}

// Wake for `mode` = 'hour' (temporary, auto-stops) or 'indefinite' (stays up).
// 'indefinite' is admin-only (see isPlatformAdmin).
export async function platformWake(mode = 'hour', { by = 'teams', identity = null } = {}) {
  if (!platformControlEnabled()) return { control: false, error: 'platform-control-not-configured' };
  if (mode === 'indefinite' && !isPlatformAdmin(identity)) {
    return { control: true, error: 'admin-required', ...(await platformStatus(identity)) };
  }
  const tags =
    mode === 'indefinite'
      ? { [TAG_MODE]: 'indefinite', [TAG_EXPIRES]: '', [TAG_BY]: by }
      : { [TAG_MODE]: 'temporary', [TAG_EXPIRES]: String(Date.now() + config.platform.leaseHours * 3_600_000), [TAG_BY]: by };
  // Set the lease BEFORE starting so the enforcer never races a fresh boot.
  await armMergeTags(tags);
  await armAction('start');
  return platformStatus(identity);
}

// Put the orchestrator back to sleep now (used by the enforcer and the scripts).
export async function platformSleep() {
  if (!platformControlEnabled()) return { control: false };
  await armMergeTags({ [TAG_MODE]: 'asleep', [TAG_EXPIRES]: '' });
  await armAction('stop');
  return platformStatus();
}

// Background enforcer: stop the orchestrator when a temporary lease has expired.
let _enforcer = null;
export function startPlatformEnforcer() {
  if (!platformControlEnabled() || _enforcer) return false;
  const tick = async () => {
    try {
      const app = await armGetApp();
      if (app?.properties?.runningStatus === 'Stopped') return;
      const tags = app?.tags || {};
      if (tags[TAG_MODE] !== 'temporary') return;
      const expires = Number(tags[TAG_EXPIRES] || 0);
      if (expires && Date.now() > expires) {
        console.log('[platform] temporary lease expired — putting the orchestrator to sleep.');
        await platformSleep();
      }
    } catch {
      /* transient ARM error — try again next tick */
    }
  };
  _enforcer = setInterval(tick, 60_000);
  _enforcer.unref?.();
  return true;
}
