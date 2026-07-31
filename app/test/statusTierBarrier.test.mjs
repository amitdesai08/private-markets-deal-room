// Information barrier: prove that the "status" access tier is metadata only, and that it
// stays metadata only once the home page has finished composing itself.
//
// `listDeals` deliberately returns deals the caller is NOT on, so that a deal's existence
// is not itself a secret. Those rows come back at the `status` tier. Two escalations were
// live in this codebase and both are asserted against here:
//
//   1. `summarize` shipped the per-lane diligence board on every row, plus the memo and
//      compliance counts derived from it — the aggregate of a withheld array is the same
//      substance at one remove.
//   2. `portfolioCommitments` on the home desk iterated every row `listDeals` returned and
//      resolved each one back to the UNREDACTED record to mine its Teams channel, which
//      turned a metadata-only seat into named individuals and verbatim quotes.
//
// These are the two claims the "what you can and cannot see" card makes to the user, so
// they are tested rather than asserted.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHomeDesk } from '../lib/homeDesk.js';
import { applyStatusTier } from '../lib/store.js';

const LANES = [
  { lane: 'financial', status: 'in_progress', progress: 60, owner: 'Priya Raman' },
  { lane: 'legal', status: 'not_started', progress: 0, owner: 'Tom Blake' },
];

// A summary as `summarize` emits it BEFORE the barrier is applied — i.e. carrying every
// field the leak shipped. The test then runs the production strip over it. Asserting
// against a hand-written "already stripped" literal would only prove the literal.
const unstrippedSummary = () => ({
  id: 'unseen', company: 'Unseen Holdings', stage: 'D2', stageName: 'Diligence',
  readiness: 55, dealSize: 400, locked: false,
  thesis: 'Consolidate a fragmented regional installed base and re-price the service book.',
  workstreams: LANES.map((w) => ({ ...w })),
  diligenceProgress: 30, memoApproved: 2, memoTotal: 9, memoProgress: 22,
  complianceCleared: 3, complianceTotal: 4,
});

const statusRow = Object.assign(applyStatusTier(unstrippedSummary()), { accessLevel: 'status' });
const statusRaw = {
  id: 'unseen', company: 'Unseen Holdings', stage: 'D2', readiness: 55,
  workstreams: LANES,
  memoSections: [{ key: 'thesis', title: 'Investment thesis', status: 'approved' }],
  compliance: [{ check: 'KYC', framework: 'KYC', status: 'passed' }],
  channel: { messages: [{ author: 'Priya Raman', text: "I'll have the QoE bridge to you by Friday.", at: new Date().toISOString() }] },
};

test('the production strip removes the lane board and every aggregate of it', () => {
  const before = unstrippedSummary();
  // Guard the fixture itself: if `summarize` stops emitting these, this test would pass
  // vacuously and the barrier would be untested.
  for (const field of ['diligenceProgress', 'memoApproved', 'memoTotal', 'memoProgress', 'complianceCleared', 'complianceTotal']) {
    assert.notEqual(before[field], null, `fixture must carry ${field} for the strip to be worth testing`);
  }
  assert.ok(before.workstreams.length > 0 && before.thesis);

  const after = applyStatusTier(before);
  for (const field of ['diligenceProgress', 'memoApproved', 'memoTotal', 'memoProgress', 'complianceCleared', 'complianceTotal']) {
    assert.equal(after[field], null, `${field} is an aggregate of the withheld lane board and must not ship`);
  }
  assert.deepEqual(after.workstreams, [], 'the lane board itself must be empty');
  assert.equal(after.thesis, undefined, 'the thesis is deal-team content');
  assert.equal(after.locked, true);
  assert.equal(after.readiness, 55, 'the single overall progress figure survives on purpose, and the UI says so');
});

test('a status-tier deal contributes no commitments, even though it is in the list', () => {
  // rawFor is the resolver that reaches the unredacted record. If the barrier holds it is
  // never called for this deal at all — so failing loudly here is the strongest assertion.
  const desk = buildHomeDesk([statusRow], {
    rawFor: (d) => {
      assert.fail(`rawFor must never be called for a ${d.accessLevel}-tier deal (${d.id})`);
    },
  });
  assert.equal(desk.workiq.total, 0, 'no commitment may be mined from a deal the reader cannot open');
  assert.equal(desk.counts.commitments, 0);
});

test('an absent accessLevel is refused, not trusted', () => {
  // `listAgentDeals` stamps accessLevel:'full' on everything it returns with no identity
  // argument at all, so "missing" is an unknown caller, not a privileged internal one.
  const anonymous = { ...statusRow, accessLevel: undefined };
  const desk = buildHomeDesk([anonymous], {
    rawFor: () => { assert.fail('rawFor must not be reached for a row with no access level'); },
  });
  assert.equal(desk.workiq.total, 0);
});

test('a full-access deal is still assessed and still mined', () => {
  const fullRow = { ...statusRow, id: 'seen', company: 'Seen Industries', accessLevel: 'full', locked: false, workstreams: LANES };
  let resolved = 0;
  const desk = buildHomeDesk([fullRow], { rawFor: () => { resolved += 1; return { ...statusRaw, id: 'seen', company: 'Seen Industries' }; } });
  assert.ok(resolved > 0, 'a deal the reader is on must still resolve to the full record');
  assert.ok(desk.workiq.total > 0, 'commitments in the deal channel must still be mined');
  // The point of the barrier is what these items contain: a named individual and their
  // verbatim words out of a private deal channel.
  assert.ok(
    desk.workiq.items.every((i) => i.author && i.quote),
    'each mined item names a person and quotes them \u2014 which is exactly why a status-tier deal must never reach this code path',
  );
  assert.equal(desk.counts.deals, 1);
});

test('a status-tier deal is never described as healthy', () => {
  // Regression guard: with the lane array emptied, the queue used to fall through every
  // lane-based branch and land on "On track" — a health claim about a deal whose health
  // data the reader was just refused. `assess` now returns rank 7 for it, which the
  // attention filter drops — so the assertion is that it is absent, not that it is
  // present and merely worded differently. Wrapping this in `if (row)` would make it
  // pass whether or not the barrier held.
  const desk = buildHomeDesk([statusRow], { rawFor: () => statusRaw });
  const row = desk.attention.find((a) => a.dealId === 'unseen');
  assert.equal(row, undefined, 'a deal whose health data was withheld must not appear in the health queue at all');
  for (const a of desk.attention) {
    assert.notEqual(a.tag, 'On track', 'the queue must not assert health it cannot see');
  }
});
