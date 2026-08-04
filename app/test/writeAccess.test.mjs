// Advisor hardening (approve-to-apply): prove the write gate that governs the assistant's
// apply path is a real, server-side policy — a read-only role can never mutate, and view-as
// can only ever narrow (never widen) write capability. The route
// POST /api/deals/:id/assistant-actions refuses when `accessFor(...).canWrite` is false.

import test from 'node:test';
import assert from 'node:assert/strict';
import { accessFor } from '../lib/userPolicy.js';

test('the default (deal-team) caller is write-capable', () => {
  const a = accessFor(null);
  assert.equal(a.canWrite, true, 'default deal-team role must be able to apply');
});

test('view-as ANALYST is read-only — the apply gate closes', () => {
  const a = accessFor(null, 'analyst');
  assert.equal(a.role, 'analyst');
  assert.equal(a.canWrite, false, 'an analyst can never apply a write');
});

test('view-as MEMBER is the guardrail floor — read-only, no personas', () => {
  const a = accessFor(null, 'member');
  assert.equal(a.role, 'member');
  assert.equal(a.canWrite, false);
  assert.deepEqual(a.allowedPersonas, []);
});

test('view-as can only narrow: it never elevates write capability', () => {
  // A caller viewing "as" a role is downgraded to that role. An unknown viewAs used to be
  // IGNORED, which meant asking to be seen as "guest" was answered with the caller's own
  // default seat -- more access than the role they named, and a probe that reads as a
  // no-op. A seat we do not recognise now falls to the floor instead.
  const asAnalyst = accessFor(null, 'analyst');
  const asBogus = accessFor(null, 'not-a-role');
  assert.equal(asAnalyst.canWrite, false, 'downgrade removes write');
  assert.equal(asBogus.role, 'member', 'an unrecognised seat falls to the floor');
  assert.equal(asBogus.canWrite, false, 'and the floor is read-only');
});
