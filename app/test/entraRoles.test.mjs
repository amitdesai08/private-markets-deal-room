// Entra-native application roles: an app role (token 'roles' claim) or security group
// (token 'groups' claim) must map to the application role WITHOUT any id-list config.
// The admin app role defaults to 'DealRoom.Admin' so it works once assigned in Entra.
// Crucially, nothing should ever grant admin by accident.

import test from 'node:test';
import assert from 'node:assert/strict';
import { roleForUser, accessFor } from '../lib/userPolicy.js';

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
