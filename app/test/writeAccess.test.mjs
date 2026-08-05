// Advisor hardening (approve-to-apply): prove the write gate that governs the assistant's
// apply path is a real, server-side policy — a read-only role can never mutate, and view-as
// can only ever narrow (never widen) write capability. The route
// POST /api/deals/:id/assistant-actions refuses when `accessFor(...).canWrite` is false.

import test from 'node:test';
import assert from 'node:assert/strict';
import { accessFor } from '../lib/userPolicy.js';

// A caller who proves nothing and asks for nothing is a MEMBER, not the deal team.
//
// This test used to assert the opposite — `accessFor(null).canWrite === true` — because
// an absent identity fell through to DEFAULT_ROLE, which deploys as 'deal-team'. An
// access review drove the public ingress with no token and no header and was answered as
// a cleared member of every deal team: 24 deals including the confidential ones, and the
// assistant reading out a confidential carve-out's enterprise value. `confidential` is
// the strongest flag in this model and it was defeated by omitting a header.
//
// The contract is deliberately changed, and only ever narrows: previewing a seat in demo
// mode still works, it just has to be asked for out loud instead of arriving by default.
test('a caller who proves nothing and asks for nothing gets the floor', () => {
  const a = accessFor(null);
  assert.equal(a.role, 'member', 'an unidentified caller must not inherit the deal-team default');
  assert.equal(a.canWrite, false, 'an unidentified caller must never be able to apply a write');
  assert.equal(a.canViewStage2, false, 'an unidentified caller must not see past screening');
});

test('naming a seat still works, and still cannot exceed the ceiling', () => {
  assert.equal(accessFor(null, 'deal-team').canWrite, true, 'the demo preview must still reach a cleared seat');
  assert.equal(accessFor(null, 'analyst').role, 'analyst');
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
