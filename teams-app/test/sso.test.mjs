import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { identityFromEasyAuthPrincipal } from '../server/sso.js';

function principal(claims, extra = {}) {
  return Buffer.from(JSON.stringify({ auth_typ: 'aad', claims, ...extra })).toString('base64');
}

test('resolves the Easy Auth principal into the Teams identity contract', () => {
  const identity = identityFromEasyAuthPrincipal(principal([
    { typ: 'http://schemas.microsoft.com/identity/claims/objectidentifier', val: 'user-123' },
    { typ: 'name', val: 'Ada Partner' },
    { typ: 'preferred_username', val: 'ada@example.com' },
    { typ: 'tid', val: 'tenant-456' },
    { typ: 'roles', val: 'DealRoom.Admin' },
    { typ: 'groups', val: 'group-a' },
    { typ: 'groups', val: 'group-b' },
  ]));

  assert.deepEqual(identity, {
    oid: 'user-123',
    name: 'Ada Partner',
    upn: 'ada@example.com',
    tid: 'tenant-456',
    roles: ['DealRoom.Admin'],
    groups: ['group-a', 'group-b'],
    verified: true,
  });
});

test('uses Easy Auth principal fallbacks and rejects malformed or unidentified values', () => {
  assert.equal(identityFromEasyAuthPrincipal('not-base64-json'), null);
  assert.equal(identityFromEasyAuthPrincipal(principal([])), null);
  assert.equal(identityFromEasyAuthPrincipal(principal([], { user_id: 'fallback-id', user_details: 'ada@example.com' }))?.oid, 'fallback-id');
});

test('deployment protects web APIs and registers the Easy Auth callback', async () => {
  const repo = resolve(import.meta.dirname, '..', '..');
  const [bicep, powershell, shell] = await Promise.all([
    readFile(resolve(repo, 'infra/modules/app.bicep'), 'utf8'),
    readFile(resolve(repo, 'scripts/provision-entra.ps1'), 'utf8'),
    readFile(resolve(repo, 'scripts/provision-entra.sh'), 'utf8'),
  ]);

  assert.match(bicep, /Microsoft\.App\/containerApps\/authConfigs@/);
  assert.match(bicep, /unauthenticatedClientAction:\s*'Return401'/);
  assert.match(bicep, /'\/api\/messages'/);
  assert.match(bicep, /WEB_AUTH_ENABLED/);
  for (const script of [powershell, shell]) {
    assert.match(script, /\.auth\/login\/aad\/callback/);
    assert.match(script, /enableIdTokenIssuance/);
  }
});