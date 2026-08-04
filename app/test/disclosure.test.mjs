// An access reviewer probed the running service seat by seat and scored disclosure at
// 3.6 out of 10. The deal LIST was scoped correctly and almost nothing else was: six
// sub-resources under the same id answered 200 on a deal the caller 404s on, and the
// assistant read out seven hidden company names with their cheque sizes when asked to
// name every deal in the fund.
//
// Everything below is pinned from an observed leak, not from reading the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { accessFor, dealAccessLevel } from '../lib/userPolicy.js';
import { listDeals, hydrate, applyStatusTier } from '../lib/store.js';
import { seededDeals } from '../data/deals.js';

await hydrate();

const analystIds = () => new Set(listDeals(null, 'analyst').map((d) => d.id));

test('a deal the analyst cannot list is not reachable by any other name', () => {
  const hidden = seededDeals.filter((d) => dealAccessLevel(null, d, 'analyst') === 'none');
  assert.ok(hidden.length, 'fixture must hide at least one deal from an analyst');
  const visible = analystIds();
  for (const d of hidden) {
    assert.ok(!visible.has(d.id), `${d.company} is listed to a seat that cannot open it`);
  }
});

test('an unrecognised seat falls to the floor rather than the default', () => {
  // "guest" and "bogus" are not roles, and they were being answered as the caller's own
  // default seat -- which sees every deal.
  for (const bogus of ['guest', 'not-a-role', 'Partner ', 'admin!']) {
    const a = accessFor(null, bogus);
    assert.equal(a.role, 'member', `"${bogus}" resolved to ${a.role}`);
    assert.equal(a.canWrite, false);
    assert.equal(a.canViewStage2, false);
  }
});

test('an unrecognised seat sees no more than the lowest real seat', () => {
  const floor = listDeals(null, 'member').length;
  const bogus = listDeals(null, 'not-a-role').length;
  assert.ok(bogus <= floor, `an unknown seat saw ${bogus} deals against a floor of ${floor}`);
});

test('a status-tier row cannot be used to reconstruct what it masks', () => {
  // The row nulled dealSize and then shipped entryMultiple 8.3 and ebitda 29 in the same
  // object. 8.3 x 29 is the figure above it.
  const withFigures = seededDeals.find((d) => d.keyFigures?.length);
  const rows = listDeals(null, 'analyst').filter((r) => r.accessLevel === 'status');
  assert.ok(withFigures, 'fixture needs a deal carrying key figures');
  for (const r of rows) {
    assert.equal(r.dealSize, null, `${r.company} still publishes its size`);
    assert.ok(!r.figures, `${r.company} ships a returns model beside a masked size`);
    assert.ok(!r.keyFigures?.length, `${r.company} ships its key figures`);
  }
});

test('applyStatusTier keeps the one figure it is meant to keep', () => {
  // The overall readiness percentage survives on purpose: a metadata seat is entitled to
  // know a deal is not ready without being told why.
  const s = applyStatusTier({ company: 'X', dealSize: 400, readiness: 55, figures: { entryMultiple: 8 }, keyFigures: [{ label: 'EBITDA', value: '$50M' }] });
  assert.equal(s.readiness, 55);
  assert.equal(s.dealSize, null);
  assert.equal(s.figures, null);
  assert.deepEqual(s.keyFigures, []);
});
