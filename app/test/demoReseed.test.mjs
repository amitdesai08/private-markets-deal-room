// The demo fixture is a one-time initialiser, and closing that gap is destructive.
//
// hydrate() inserts a seeded deal only when its id is absent and otherwise leaves the
// persisted record exactly as it is. That is the correct rule — a redeploy must never reset
// work in flight — but it means that on any environment which has booted once, every later
// edit to app/data/deals.js is invisible. Beta ran for weeks on a seed several revisions
// old while the whole suite certified a distribution no deployed instance exhibited.
//
// resyncSeededDeals() closes it, and it OVERWRITES deal records. These tests are about the
// limits on that, not about the copying.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrate, listDeals, getDealRaw, resyncSeededDeals, advanceDeal, createDealFromIntake } from '../lib/store.js';
import { seededDeals } from '../data/deals.js';

await hydrate();

test('a deal that is not in the fixture survives the overwrite untouched', () => {
  // The one safety property that matters. A deal created through intake has no fixture
  // entry, and a destructive resync must leave it exactly as it was.
  const made = createDealFromIntake({ company: 'Locally Created Holdings', sector: 'Industrials', dealSize: 120 });
  const id = made?.id || made?.deal?.id;
  assert.ok(id, `intake returned no id: ${JSON.stringify(made).slice(0, 200)}`);
  assert.ok(!seededDeals.some((d) => d.id === id), 'the sentinel collided with a fixture id');

  const before = JSON.stringify(getDealRaw(id));
  const out = resyncSeededDeals({ persona: 'admin' });

  assert.ok(getDealRaw(id), 'resync deleted a deal that was not in the fixture');
  assert.equal(JSON.stringify(getDealRaw(id)), before, 'resync modified a deal that was not in the fixture');

  const fixtureIds = new Set(seededDeals.map((d) => d.id));
  for (const rid of out.ids) assert.ok(fixtureIds.has(rid), `${rid} was rewritten but is not in the fixture`);
  assert.equal(out.applied, seededDeals.length, 'resync did not cover the whole fixture');
});

test('the overwrite is written to the activity log, with an actor', () => {
  // An operator replacing a deal record with fabricated fixture content is exactly the
  // event that has to leave a trace. This release was spent making the log say who did
  // what; a route that silently discards a deal's history would undo it.
  resyncSeededDeals({ persona: 'admin' });
  const d = getDealRaw('atlas-coldchain');
  const top = d.activity[0];
  assert.match(top.actor, /Administrator/, 'the overwrite names no operator');
  assert.match(top.action, /demo fixture/i, 'the log does not say what happened');
  assert.ok(top.when, 'no timestamp');
});

test('resync discards state recorded against a showcase deal — that is the point, and it is visible', () => {
  const id = 'demo-cascadia';
  const before = getDealRaw(id).activity.length;
  advanceDeal(id, { persona: 'partner', reason: 'test movement' });
  const moved = getDealRaw(id).activity.length;
  assert.ok(moved > before, 'setup failed: the advance recorded nothing');

  resyncSeededDeals({ persona: 'admin' });
  const after = getDealRaw(id);
  assert.match(after.activity[0].action, /discarded/i,
    'the log must state that prior state was discarded, not just that a resync happened');
});

test('after a resync the served deals match the fixture the tests assert against', () => {
  resyncSeededDeals({ persona: 'admin' });
  const served = listDeals();
  const dist = {};
  for (const d of served) dist[d.icVerdict.state] = (dist[d.icVerdict.state] || 0) + 1;
  assert.ok(dist.READY >= 1, `no READY deal after resync: ${JSON.stringify(dist)}`);
  assert.ok(dist.CONDITIONAL >= 1, `no CONDITIONAL deal after resync: ${JSON.stringify(dist)}`);
  assert.ok(dist['NOT-READY'] >= 1, `no NOT-READY deal after resync: ${JSON.stringify(dist)}`);
});
