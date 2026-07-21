// Admin-authored access configuration — persisted overrides that let an
// administrator define custom RBAC roles and personas, data-sovereignty regions,
// access levels, and workflow-management rights WITHOUT a code change. It is layered
// OVER the built-in defaults in userPolicy.js / personaPolicy.js; an empty config
// leaves the shipped behavior exactly as-is (additive, non-breaking).
//
// Persisted as one doc in the Cosmos `connectors` container (id 'access-config'),
// loaded once at boot so the policy accessors below stay synchronous.

import { connectors } from './repo/index.js';

const DOC_ID = 'access-config';

// Shape:
//   roles:          { [roleId]: { label, rank, personas[], write, stage2,
//                                 advanceWorkflow, allowedStages[], regions[] } }
//   assignments:    { [roleId]: [userIds] }          // augments env ADMIN_IDS etc.
//   personas:       { [personaId]: { label, name, title, lane } }  // meta override/add
//   personaActions: { [personaId]: [actionIds] }     // authoritative workflow allowlist
//   personaStages:  { [personaId]: [stageIds] }      // restrict acting to these stages
let _cfg = emptyCfg();
let _loaded = false;

function emptyCfg() {
  return { roles: {}, assignments: {}, personas: {}, personaActions: {}, personaStages: {} };
}
function normalize(rec) {
  const e = emptyCfg();
  if (!rec || typeof rec !== 'object') return e;
  for (const k of Object.keys(e)) if (rec[k] && typeof rec[k] === 'object') e[k] = rec[k];
  return e;
}

export async function initAccessConfig() {
  try {
    const doc = await connectors.get(DOC_ID);
    _cfg = normalize(doc && doc.record);
  } catch {
    _cfg = emptyCfg();
  }
  _loaded = true;
  return _cfg;
}

export function accessConfigLoaded() { return _loaded; }
export function getAccessConfig() { return JSON.parse(JSON.stringify(_cfg)); }
export function getRoleOverrides() { return _cfg.roles; }
export function getRoleAssignments() { return _cfg.assignments; }
export function getPersonaOverrides() { return _cfg.personas; }
export function getPersonaActionOverrides() { return _cfg.personaActions; }
export function getPersonaStageOverrides() { return _cfg.personaStages; }

async function persist() {
  try {
    await connectors.upsert({ id: DOC_ID, record: _cfg, updatedAt: new Date().toISOString() });
  } catch {
    /* best-effort; in-memory holds for this process */
  }
}

export async function upsertRole(id, patch) {
  if (!id) return null;
  _cfg.roles[id] = { ...(_cfg.roles[id] || {}), ...(patch || {}) };
  await persist();
  return _cfg.roles[id];
}
export async function deleteRole(id) {
  delete _cfg.roles[id];
  delete _cfg.assignments[id];
  await persist();
  return true;
}
export async function setRoleAssignments(id, ids) {
  _cfg.assignments[id] = Array.isArray(ids) ? ids.map((s) => String(s).trim()).filter(Boolean) : [];
  await persist();
  return _cfg.assignments[id];
}
export async function upsertPersona(id, patch) {
  if (!id) return null;
  _cfg.personas[id] = { ...(_cfg.personas[id] || {}), ...(patch || {}) };
  await persist();
  return _cfg.personas[id];
}
export async function deletePersona(id) {
  delete _cfg.personas[id];
  delete _cfg.personaActions[id];
  delete _cfg.personaStages[id];
  await persist();
  return true;
}
export async function setPersonaActions(id, actions) {
  _cfg.personaActions[id] = Array.isArray(actions) ? actions : [];
  await persist();
  return _cfg.personaActions[id];
}
export async function setPersonaStages(id, stages) {
  _cfg.personaStages[id] = Array.isArray(stages) ? stages : [];
  await persist();
  return _cfg.personaStages[id];
}
