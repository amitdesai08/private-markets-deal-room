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
  return { roles: {}, assignments: {}, personas: {}, personaActions: {}, personaStages: {}, settings: {}, dealGroups: {}, regionGroups: {}, docTemplate: {}, actingAs: {} };
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

// Deal GROUPS (customizable tags): { [tagId]: { label, groupId, createdBy, createdAt } }.
// Each tag is backed by an Entra security group; membership in that group grants FULL
// access to every deal carrying the tag (resolved in userPolicy). Admin-authored.
export function getDealGroups() { return _cfg.dealGroups || {}; }
// Region GROUPS: { [entraGroupObjectId]: ['northeast', ...] } — which base regions an
// Entra security-group membership grants (a grouped region maps to several).
export function getRegionGroups() { return _cfg.regionGroups || {}; }

// Runtime platform settings (admin-editable, persisted). getDemoModeOverride returns
// the admin's demo-mode choice (true/false) or undefined when never set — in which case
// the deploy-time DEMO_PROFILES env default applies (resolved in userPolicy).
export function getRuntimeSettings() { return { ...(_cfg.settings || {}) }; }

// Document TEMPLATE / white-label branding (admin-editable, persisted). Applied by the
// document generators (officeRich.js) so a firm can brand and tweak the IC memo, deck
// and models WITHOUT a code change. Empty => the shipped defaults are used.
export const DOC_TEMPLATE_DEFAULTS = Object.freeze({
  fundName: 'The Deal Room',
  accentColor: '2E74B5',
  inkColor: '1F3864',
  confidentialLabel: 'CONFIDENTIAL',
  coverEyebrow: 'INVESTMENT COMMITTEE MEMORANDUM',
  disclaimer: 'This memorandum is generated from the live deal record, drawing on the returns model, value-creation plan, risk register and IC-readiness assessment. Figures reflect the state of diligence at generation time and are provided for committee discussion on a strictly confidential basis.',
  sections: { merits: true, financials: true, valuation: true, valueCreation: true, findings: true },
});
export function getDocTemplate() {
  const t = _cfg.docTemplate || {};
  return { ...DOC_TEMPLATE_DEFAULTS, ...t, sections: { ...DOC_TEMPLATE_DEFAULTS.sections, ...(t.sections || {}) } };
}
export async function setDocTemplate(patch) {
  const clean = { ...(patch || {}) };
  // hex colors: strip leading # and validate 6-hex; ignore bad values.
  for (const k of ['accentColor', 'inkColor']) {
    if (clean[k] != null) { const v = String(clean[k]).replace(/^#/, '').trim(); if (!/^[0-9a-fA-F]{6}$/.test(v)) delete clean[k]; else clean[k] = v.toUpperCase(); }
  }
  _cfg.docTemplate = { ...(_cfg.docTemplate || {}), ...clean };
  if (clean.sections) _cfg.docTemplate.sections = { ...((_cfg.docTemplate && _cfg.docTemplate.sections) || {}), ...clean.sections };
  await persist();
  return getDocTemplate();
}
export function getDemoModeOverride() { return _cfg.settings ? _cfg.settings.demoMode : undefined; }

// Demo "view as" — which showcase profile a REAL person is currently acting as, keyed by
// their own oid/upn: { 'amit@contoso.com': 'eleanor.bishop' }.
//
// It is stored here, on the orchestrator, rather than in the Teams app because the two
// callers are different processes: the tab sets it, the CHANNEL BOT reads it, and the
// Teams app scales to several replicas, so anything held in its memory would be set on
// one replica and missing on the next. The orchestrator is the single policy source and
// runs single-replica, so both paths see the same answer.
//
// Only ever consulted while demo mode is active (see actingAsFor in userPolicy.js).
export function getActingAs() { return { ...(_cfg.actingAs || {}) }; }
export async function setActingAs(key, profileId) {
  const k = String(key || '').trim().toLowerCase();
  if (!k) return null;
  _cfg.actingAs = _cfg.actingAs || {};
  if (profileId) _cfg.actingAs[k] = String(profileId).trim().toLowerCase();
  else delete _cfg.actingAs[k];
  await persist();
  return _cfg.actingAs[k] || null;
}
export async function setDemoMode(on) {
  _cfg.settings = { ...(_cfg.settings || {}), demoMode: !!on };
  await persist();
  return _cfg.settings.demoMode;
}

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

// Deal-group (tag) CRUD. `patch` = { label, groupId }. Tag id is a slug the UI/MD uses.
export async function upsertDealGroup(id, patch) {
  if (!id) return null;
  _cfg.dealGroups = _cfg.dealGroups || {};
  _cfg.dealGroups[id] = { ...(_cfg.dealGroups[id] || {}), ...(patch || {}) };
  await persist();
  return _cfg.dealGroups[id];
}
export async function deleteDealGroup(id) {
  if (_cfg.dealGroups) delete _cfg.dealGroups[id];
  await persist();
  return true;
}
// Map an Entra security group object id to the base regions it grants.
export async function setRegionGroup(groupId, regions) {
  if (!groupId) return null;
  _cfg.regionGroups = _cfg.regionGroups || {};
  _cfg.regionGroups[String(groupId).toLowerCase()] = Array.isArray(regions) ? regions.map((r) => String(r).toLowerCase()).filter(Boolean) : [];
  await persist();
  return _cfg.regionGroups[String(groupId).toLowerCase()];
}

// Bulk role assignment (e.g. from a CSV import). `rows` = [{ user, role }]. `mode`
// 'merge' adds to each role's existing assignments; 'replace' overwrites the roles
// present in the import. Returns a per-role count summary. One persist for the batch.
export async function importAssignments(rows, { mode = 'merge' } = {}) {
  const byRole = {};
  let skipped = 0;
  for (const r of rows || []) {
    const user = String(r?.user || '').trim();
    const role = String(r?.role || '').trim().toLowerCase();
    if (!user || !role) { skipped++; continue; }
    (byRole[role] ||= []).push(user);
  }
  const applied = {};
  for (const [role, users] of Object.entries(byRole)) {
    const existing = mode === 'replace' ? [] : (_cfg.assignments[role] || []);
    _cfg.assignments[role] = Array.from(new Set([...existing, ...users].map((s) => String(s).trim()).filter(Boolean)));
    applied[role] = _cfg.assignments[role].length;
  }
  await persist();
  return { applied, roles: Object.keys(byRole), skipped };
}
