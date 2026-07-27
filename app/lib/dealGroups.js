// Deal groups (customizable tags) — an admin-authored tag, each backed by an Entra
// security GROUP. Membership in that group grants FULL access to every deal carrying
// the tag (resolved in userPolicy via effectiveDealGroupIds). MDs tag deals; the
// tag's Entra group is auto-created via Microsoft Graph when M365 is connected, and
// marked 'pending' (retried later) if the connector isn't ready — so tagging never
// blocks on directory provisioning.
//
// This is the runtime engine for the "admin defines the groups deals fall into, and
// Entra security groups are auto-created to match" requirement.

import { ensureSecurityGroup } from './m365/graph.js';
import { getDealGroups, upsertDealGroup, deleteDealGroup } from './accessConfig.js';

export const tagSlug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

export function listDealGroups() {
  const dg = getDealGroups() || {};
  return Object.entries(dg).map(([id, v]) => ({
    id, label: v.label || id, groupId: v.groupId || null,
    groupPending: !v.groupId, createdBy: v.createdBy || null, createdAt: v.createdAt || null,
  }));
}

// Create (or refresh) a deal group. Auto-provisions the Entra security group when
// possible; otherwise persists the tag with the group marked pending. Idempotent.
export async function createDealGroup({ label, id, createdBy } = {}) {
  const tagId = tagSlug(id || label);
  if (!tagId) throw new Error('a tag label is required');
  const existing = getDealGroups()[tagId] || {};
  let groupId = existing.groupId || null;
  let groupStatus = groupId ? 'exists' : 'pending';
  if (!groupId) {
    try {
      const g = await ensureSecurityGroup(`DealRoom-Deal-${label || tagId}`, `Deal Room deal group / tag '${tagId}'. Members get full access to deals tagged with it.`);
      groupId = g.id;
      groupStatus = g.created ? 'created' : 'exists';
    } catch {
      groupStatus = 'pending'; // M365 not connected or scope not yet in the token — retry on next call
    }
  }
  const rec = await upsertDealGroup(tagId, {
    label: label || existing.label || tagId,
    ...(groupId ? { groupId } : {}),
    createdBy: existing.createdBy || createdBy || null,
    createdAt: existing.createdAt || new Date().toISOString(),
  });
  return { id: tagId, ...rec, groupPending: !rec.groupId, groupStatus };
}

// Retry Entra group creation for any tags still pending (e.g. after M365 connect).
export async function reconcileDealGroups() {
  const out = [];
  for (const [tagId, v] of Object.entries(getDealGroups() || {})) {
    if (v.groupId) continue;
    try {
      const g = await ensureSecurityGroup(`DealRoom-Deal-${v.label || tagId}`, `Deal Room deal group / tag '${tagId}'.`);
      await upsertDealGroup(tagId, { groupId: g.id });
      out.push({ id: tagId, groupId: g.id, status: g.created ? 'created' : 'exists' });
    } catch { out.push({ id: tagId, status: 'pending' }); }
  }
  return out;
}

export async function removeDealGroup(id) {
  await deleteDealGroup(tagSlug(id));
  return true;
}
