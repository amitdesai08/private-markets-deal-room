// The IC-readiness gate is only a fair question to ask of a deal that has not yet been to
// committee. Asked of anything else it returns a confident falsehood in one of two
// directions:
//
//   before diligence — "not IC-ready, diligence plan outstanding" against a target nobody
//     has asked to take to committee. True, useless, and it buries the deals where the
//     same sentence means something.
//   after committee  — either "not ready to table" about a deal that has been signed, or,
//     if you force the inputs to clear the gate, "ready to table" about the same deal.
//     An earlier revision did the latter by overwriting `compliance` to `passed` on every
//     Execution deal, which cleared the gate by deleting the evidence.
//
// So the phase decides which question is asked. These tests pin that down, and pin down
// that the seed data does not quietly reintroduce the overwrite.

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeICReadiness, dealPhase } from '../lib/icReadiness.js';
import { seededDeals } from '../data/deals.js';

const byId = (id) => seededDeals.find((d) => d.id === id);

test('phase is derived from the stage, and screened deals are origination whatever their stage says', () => {
  assert.equal(dealPhase({ stage: 'O2' }), 'origination');
  assert.equal(dealPhase({ stage: 'D3' }), 'diligence');
  assert.equal(dealPhase({ stage: 'E1' }), 'post-committee');
  assert.equal(dealPhase({ stage: 'V2' }), 'post-committee');
  assert.equal(dealPhase({ stage: 'D1', status: 'screened' }), 'origination');
  assert.equal(dealPhase({ stage: 'D1', stageId: 'screened' }), 'origination');
});

test('a deal past committee is not re-measured against the readiness gate', () => {
  // Great Lakes is E1 and carries a genuinely in-progress compliance check. Under the
  // gate that would read "1 required item outstanding: KYC / compliance cleared" — a deal
  // that is already signed reported as not ready to be tabled.
  const gl = byId('demo-greatlakes');
  assert.equal(dealPhase(gl), 'post-committee');
  const v = computeICReadiness(gl).verdict;
  assert.deepEqual(v.gating, [], 'the readiness gate does not apply to a deal that has already been to committee');
  assert.equal(v.state, 'CONDITIONAL', 'what remains live is whether its conditions are closed');
  assert.equal(v.openConditions, 2);
});

test('the seed does not clear a post-committee gate by overwriting the evidence', () => {
  // The substantive fact the record tracks: an EU merger-control filing does not complete
  // because a committee approved the deal. A previous pass mapped every compliance check
  // to `passed` and every memo section to `approved` on these deals.
  const post = seededDeals.filter((d) => dealPhase(d) === 'post-committee');
  assert.ok(post.length >= 2);
  const stillOpen = post.flatMap((d) => (d.compliance || []).filter((c) => c.status !== 'passed'));
  assert.ok(stillOpen.length > 0, 'at least one post-committee compliance check must still read as in progress');
  const forcedMemo = post.flatMap((d) => (d.memoSections || []).filter((m) => m.key !== 'recommendation' && m.status === 'approved'));
  const originallyOpen = post.flatMap((d) => (d.memoSections || []).filter((m) => m.status === 'in_progress'));
  assert.ok(originallyOpen.length > 0, 'post-committee memo sections keep the status the record gave them');
  assert.ok(forcedMemo.length === 0 || originallyOpen.length > 0);
});

test('every verdict state is reachable across the seeded record', () => {
  const seen = new Set(seededDeals.map((d) => computeICReadiness(d).verdict.state));
  for (const state of ['NOT-READY', 'CONDITIONAL', 'READY']) {
    assert.ok(seen.has(state), `${state} must be reachable — a verdict with one reachable state is a constant`);
  }
});

test('gating discriminates between deals rather than repeating one sentence', () => {
  const inDiligence = seededDeals.filter((d) => dealPhase(d) === 'diligence');
  const notReady = inDiligence.map((d) => computeICReadiness(d).verdict).filter((v) => v.state === 'NOT-READY');
  assert.ok(notReady.length > 2);
  const distinct = new Set(notReady.map((v) => v.gating.join('|')));
  assert.ok(distinct.size > 1, 'if every not-ready deal reads identically the verdict carries no information');
  // And the strings name what is outstanding rather than counting it.
  assert.ok(notReady.every((v) => /outstanding: \w|blocking: \w|unresolved/.test(v.gating.join(' '))), 'gating must name the outstanding items');
});
