// Entra-native application roles: an app role (token 'roles' claim) or security group
// (token 'groups' claim) must map to the application role WITHOUT any id-list config.
// The admin app role defaults to 'DealRoom.Admin' so it works once assigned in Entra.
// Crucially, nothing should ever grant admin by accident.

import test from 'node:test';
import assert from 'node:assert/strict';
import { roleForUser, accessFor, personaForIdentity, rolesView } from '../lib/userPolicy.js';
import { upsertRole, deleteRole } from '../lib/accessConfig.js';

test('an Entra APP ROLE claim (DealRoom.Admin) maps to application admin', () => {
  assert.equal(roleForUser({ oid: 'u1', roles: ['DealRoom.Admin'] }), 'admin');
  const a = accessFor({ oid: 'u1', upn: 'u1@contoso.com', name: 'U1', roles: ['DealRoom.Admin'] });
  assert.equal(a.isAdmin, true);
  assert.equal(a.canWrite, true);
});

test('app-role matching is case-insensitive', () => {
  assert.equal(roleForUser({ oid: 'u2', roles: ['dealroom.admin'] }), 'admin');
});

test('an unrelated app role does NOT grant admin', () => {
  assert.equal(roleForUser({ oid: 'u3', roles: ['Some.Other.Role'] }), 'member');
});

test('no app role / group / id-list match -> member (no accidental elevation)', () => {
  assert.equal(roleForUser({ oid: 'nobody', upn: 'nobody@contoso.com', roles: [], groups: [] }), 'member');
});

test('a groups claim alone is member unless a group id is configured (env)', () => {
  // GROUP_IDS default to empty; groups only elevate when ADMIN_GROUP_IDS etc. are set.
  assert.equal(roleForUser({ oid: 'u4', groups: ['00000000-0000-0000-0000-000000000000'] }), 'member');
});

// ---- admin-authored Entra binding -------------------------------------------------
// A tenant ties an Entra app role or security group to a Deal Room role, and the role
// decides both what the holder may do and which seat their home page is built around.
// That binding used to be env-only, so adding a group meant a redeploy.

const GID = '11111111-2222-3333-4444-555555555555';

test('an admin-authored security group grants its role, and the role confers the seat', async () => {
  try {
    await upsertRole('partner', { groupIds: [GID], persona: 'fund-cfo' });
    const identity = { oid: 'u5', upn: 'u5@contoso.com', groups: [GID] };
    assert.equal(roleForUser(identity), 'partner', 'group membership must grant the configured role');
    assert.equal(personaForIdentity(identity), 'fund-cfo', 'the role must confer its seat');
    // Someone who is NOT in the group is untouched by either half of the binding.
    const outsider = { oid: 'u6', upn: 'u6@contoso.com', groups: [] };
    assert.equal(roleForUser(outsider), 'member');
    assert.equal(personaForIdentity(outsider), null, 'a role nobody holds must not hand out its seat');
  } finally {
    await upsertRole('partner', { groupIds: [], persona: null });
  }
});

test('an admin-authored app role value grants its role, matched case-insensitively', async () => {
  try {
    await upsertRole('analyst', { appRoles: ['DealRoom.Analyst'] });
    assert.equal(roleForUser({ oid: 'u7', roles: ['dealroom.analyst'] }), 'analyst');
    assert.equal(roleForUser({ oid: 'u8', roles: ['DealRoom.Analyst.Other'] }), 'member', 'a near-miss must not match');
  } finally {
    await upsertRole('analyst', { appRoles: [] });
  }
});

test('an explicit per-user seat still beats the one the role confers', async () => {
  const prev = process.env.PERSONA_ASSIGNMENTS;
  try {
    process.env.PERSONA_ASSIGNMENTS = JSON.stringify({ 'supply-md': ['u9@contoso.com'] });
    const { personaForIdentity: p, roleForUser: r } = await import(`../lib/userPolicy.js?seatorder=${Date.now()}`);
    const { upsertRole: up } = await import('../lib/accessConfig.js');
    await up('partner', { groupIds: [GID], persona: 'fund-cfo' });
    const identity = { oid: 'u9', upn: 'u9@contoso.com', groups: [GID] };
    assert.equal(r(identity), 'partner');
    assert.equal(p(identity), 'supply-md', 'moving one person must not require redefining their role');
    await up('partner', { groupIds: [], persona: null });
  } finally {
    if (prev === undefined) delete process.env.PERSONA_ASSIGNMENTS; else process.env.PERSONA_ASSIGNMENTS = prev;
  }
});

test('the admin view reports the seat and both halves of the Entra binding', async () => {
  try {
    await upsertRole('partner', { groupIds: [GID], appRoles: ['DealRoom.Partner'], persona: 'fund-cfo' });
    const row = rolesView().find((x) => x.id === 'partner');
    assert.deepEqual(row.groupIds, [GID]);
    assert.deepEqual(row.appRoles, ['DealRoom.Partner']);
    assert.equal(row.persona, 'fund-cfo');
    // The env-configured half is reported as a count so the screen cannot imply the
    // list it shows is everything that grants the role.
    assert.equal(typeof row.envGroupCount, 'number');
    assert.equal(typeof row.envAppRoleCount, 'number');
    const admin = rolesView().find((x) => x.id === 'admin');
    assert.ok(admin.envAppRoleCount >= 1, 'the built-in DealRoom.Admin app role must still be counted');
  } finally {
    await upsertRole('partner', { groupIds: [], appRoles: [], persona: null });
  }
});

test('a custom role can be deleted without leaving its binding behind', async () => {
  await upsertRole('esg', { label: 'ESG', rank: 30, groupIds: [GID], persona: 'legal-gc' });
  assert.equal(roleForUser({ oid: 'u10', groups: [GID] }), 'esg');
  await deleteRole('esg');
  assert.equal(roleForUser({ oid: 'u10', groups: [GID] }), 'member', 'deleting a role must revoke what it granted');
});
