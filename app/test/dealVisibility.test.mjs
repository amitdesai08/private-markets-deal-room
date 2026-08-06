// What this file is for.
//
// The product used to answer "is there a deal for this company?" for everyone in the
// firm, whether or not they were cleared for it. A restricted deal you were not on was
// listed with its detail stripped and a padlock on it — which still disclosed that the
// deal existed, what the target was called and roughly what it was worth. For an
// unannounced transaction those three facts ARE the confidential part; the diligence
// findings underneath them are almost beside the point.
//
// The default is now the other way round: a restricted deal is absent unless it opts
// into being known, via `pipelineVisible`. These tests pin the flip in both directions,
// because a visibility rule that is only tested in one direction tends to be discovered
// by the wrong person.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dealAccessLevel, accessFor } from '../lib/userPolicy.js';
import { hydrate, listDeals } from '../lib/store.js';
import { seededDeals } from '../data/deals.js';

await hydrate();

const outsider = { oid: 'u-nobody', groups: [] };
const restricted = { id: 'x1', company: 'Unannounced Target', stage: 'D2', hq: 'Dallas, Texas' };

// A caller with no identity resolves to the deal-team default, which IS cleared. Passing
// a view-as role can only ever take that DOWN. Written out because it caught me while
// writing these tests: `dealAccessLevel(someMember, deal, 'partner')` does not test a
// partner, it tests a member who asked nicely.
const asAnalyst = (deal) => dealAccessLevel(null, deal, 'analyst');
const asCleared = (deal) => dealAccessLevel(null, deal, 'deal-team');

test('a restricted deal you are not cleared for is not listed at all', () => {
  assert.equal(asAnalyst(restricted), 'none');
  assert.equal(dealAccessLevel(outsider, restricted), 'none');
});

test('opting into firm-wide awareness makes it listed, but not openable', () => {
  assert.equal(asAnalyst({ ...restricted, pipelineVisible: true }), 'status');
});

test('confidential overrides the awareness flag, so a deal cannot be exposed by accident', () => {
  assert.equal(asAnalyst({ ...restricted, pipelineVisible: true, confidential: true }), 'none');
});

test('being on the deal team beats the flag — you get the workspace, not a listing', () => {
  const mine = { ...restricted, team: ['u-nobody'] };
  assert.equal(dealAccessLevel({ oid: 'u-nobody' }, mine, 'analyst'), 'full');
});

test('origination is open to the firm only when the firm says so', () => {
  // Sourcing is a firm-wide activity and hiding it would defeat the point of the
  // pipeline — but that used to be inferred from the stage prefix, /^[dev]/i, so every
  // deal at O1–O4 was FULL for every seat including the anonymous floor. Live and
  // unauthenticated, GET /stage1/cohort/O2 returned a named target and its size, and a
  // target added tomorrow was exposed by default until it reached diligence. That is
  // backwards: origination is the stage at which nobody is supposed to know yet.
  //
  // This is deliberately STRICTER than the assertion it replaces. Awareness is a
  // decision the deal records, at every stage, and the seed now carries it on the
  // origination deals the firm genuinely wants known — so the behaviour a reader sees is
  // unchanged and the reason for it is on the record instead of in a regex.
  const o2 = { id: 'o1', stage: 'O2', hq: 'Dallas, Texas' };
  assert.equal(asAnalyst(o2), 'none');
  assert.equal(asAnalyst({ ...o2, pipelineVisible: true }), 'status');
  // And the flag never promotes a stranger to the workspace.
  assert.notEqual(asAnalyst({ ...o2, pipelineVisible: true }), 'full');
});

test('a cleared role is unaffected by the flag in either state', () => {
  assert.equal(asCleared(restricted), 'full');
  assert.equal(asCleared({ ...restricted, pipelineVisible: true }), 'full');
});

test('asking to view as a senior role does not grant that role', () => {
  // The flag decides what an UNCLEARED person sees. It must not become a way to get
  // cleared: a member who requests the partner view is still a member.
  assert.equal(accessFor(outsider, 'partner').role, 'member');
  assert.equal(dealAccessLevel(outsider, restricted, 'partner'), 'none');
});

test('nothing an analyst cannot see reaches the list the API serves', () => {
  const rows = listDeals(null, 'analyst');
  assert.ok(rows.length > 0, 'fixture must return rows, or this asserts nothing');
  assert.ok(rows.every((r) => r.accessLevel !== 'none'), 'a none-level deal must never be serialised');

  // Every status-tier row the analyst can see is one the deal opted into. If this ever
  // fails, the default has quietly gone back to listing things.
  const byId = new Map(seededDeals.map((d) => [d.id, d]));
  for (const r of rows.filter((x) => x.accessLevel === 'status')) {
    assert.equal(byId.get(r.id)?.pipelineVisible, true, `${r.company} is listed without opting in`);
  }
});

test('the seed exercises both outcomes, or the rest of this file proves nothing', () => {
  const analystIds = new Set(listDeals(null, 'analyst').map((r) => r.id));
  const clearedIds = new Set(listDeals(null, 'deal-team').map((r) => r.id));
  const hidden = [...clearedIds].filter((id) => !analystIds.has(id));
  assert.ok(hidden.length > 0, 'at least one seeded deal must be invisible to an analyst');
  assert.ok(
    listDeals(null, 'member').some((r) => r.accessLevel === 'status'),
    'at least one seeded deal must be listed-but-locked',
  );
});
