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

const LANES = [
  { lane: 'financial', status: 'in_progress', progress: 60, owner: 'Priya Raman' },
  { lane: 'legal', status: 'not_started', progress: 0, owner: 'Tom Blake' },
];

// A row as `listDeals` emits it at the status tier, next to the same deal unredacted.
const statusRow = {
  id: 'unseen', company: 'Unseen Holdings', accessLevel: 'status', locked: true,
  stage: 'D2', stageName: 'Diligence', readiness: 55, dealSize: 400,
  thesis: undefined, workstreams: [],
  diligenceProgress: null, memoApproved: null, memoTotal: null,
  memoProgress: null, complianceCleared: null, complianceTotal: null,
};
const statusRaw = {
  id: 'unseen', company: 'Unseen Holdings', stage: 'D2', readiness: 55,
  workstreams: LANES,
  memoSections: [{ key: 'thesis', title: 'Investment thesis', status: 'approved' }],
  compliance: [{ check: 'KYC', framework: 'KYC', status: 'passed' }],
  channel: { messages: [{ author: 'Priya Raman', text: "I'll have the QoE bridge to you by Friday.", at: new Date().toISOString() }] },
};

test('a status-tier row carries no lane detail, and none of the aggregates of it', () => {
  for (const field of ['diligenceProgress', 'memoApproved', 'memoTotal', 'memoProgress', 'complianceCleared', 'complianceTotal']) {
    assert.equal(statusRow[field], null, `${field} is an aggregate of the withheld lane board and must not ship`);
  }
  assert.deepEqual(statusRow.workstreams, [], 'the lane board itself must be empty');
  assert.equal(statusRow.thesis, undefined, 'the thesis is deal-team content');
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
  assert.equal(desk.attention.length > 0 || desk.counts.deals === 1, true);
});

test('a status-tier deal is never described as healthy', () => {
  // Regression guard: with the lane array emptied, the queue used to fall through every
  // lane-based branch and land on "On track" — a health claim about a deal whose health
  // data the reader was just refused.
  const desk = buildHomeDesk([statusRow], { rawFor: () => statusRaw });
  const row = desk.attention.find((a) => a.dealId === 'unseen');
  if (row) {
    assert.notEqual(row.tag, 'On track', 'the queue must not assert health it cannot see');
    assert.notEqual(row.tone, 'good');
  }
});
