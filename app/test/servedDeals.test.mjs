// What the STORE serves, not what the seed declares.
//
// Every check in dealPhase.test.mjs reads `seededDeals` from ../data/deals.js. That is the
// wrong object, and the difference is not cosmetic: `ensureFirstClassLanes` in store.js
// backfills the four first-class lanes (financial / legal / tax / ESG) onto any deal whose
// seed omits them, as `not_started / 0`. A seed listing three lanes is therefore a deal
// with SEVEN, four of which have no work recorded and each of which blocks the IC gate.
//
// Measured against the seed, Atlas Cold Chain read READY and the distribution read 11/3/5.
// Measured against the store — which is what the API returns and what the screen renders —
// it read NOT-READY and the distribution was 12 NOT-READY / 7 CONDITIONAL / 0 READY. READY
// was unreachable in the entire demo and every check we had passed anyway, because they all
// asked the seed. These tests ask listDeals().
//
// KNOW WHAT THIS DOES NOT CERTIFY. There is no datastore configured under the test runner,
// so hydrate() takes the memory branch and listDeals() serves the fixture. A DEPLOYED
// environment has Cosmos, where hydrate() inserts a seeded deal only if its id is absent
// and otherwise leaves the persisted record untouched — so a deployed instance can serve
// something these tests never see. That is not hypothetical: beta served Atlas as NOT-READY
// after this file was green, because its Cosmos record predated the fixture fix. The
// closing move is POST /admin/reseed-demo-deals, covered in demoReseed.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrate, listDeals } from '../lib/store.js';

await hydrate();

// listDeals() with NO argument is the unredacted system view — the same payload an
// operator with full access to every deal would receive.
const served = listDeals();

test('every deal the store serves carries the full lane roster', () => {
  const LANES = ['commercial', 'financial', 'legal', 'tax', 'techai', 'operations', 'esg'];
  for (const d of served) {
    const have = (d.workstreams || []).map((w) => w.lane).sort();
    assert.deepEqual(have, [...LANES].sort(), `${d.id}: served ${have.length} lanes, not ${LANES.length}`);
  }
});

test('the verdict on the served summary is the same verdict the engine computed', async () => {
  const { computeICReadiness } = await import('../lib/icReadiness.js');
  const { getDeal } = await import('../lib/store.js');
  for (const d of served) {
    const direct = computeICReadiness(getDeal(d.id));
    assert.equal(d.icVerdict?.state, direct.verdict.state, `${d.id}: summary and engine disagree`);
    assert.equal(d.icVerdict?.phase, direct.verdict.phase, `${d.id}: phase disagrees`);
  }
});

test('all three verdict states are reachable in the deals the API actually returns', () => {
  const seen = new Set(served.map((d) => d.icVerdict?.state));
  for (const s of ['READY', 'CONDITIONAL', 'NOT-READY']) {
    assert.ok(seen.has(s), `${s} does not occur on any served deal — the state exists in code and dies on the screen`);
  }
});

test('a READY verdict is reachable in BOTH the diligence and the post-committee phase', () => {
  // The two render differently: pre-committee READY means "ready to table", post-committee
  // READY means "in execution, nothing outstanding". If either has no example, half the
  // chip logic in the Deals list is never exercised by anyone looking at the product.
  const ready = served.filter((d) => d.icVerdict?.state === 'READY');
  const phases = new Set(ready.map((d) => d.icVerdict?.phase));
  assert.ok(phases.has('diligence'), 'no deal is ready to table');
  assert.ok(phases.has('post-committee'), 'no deal is past the committee with nothing outstanding');
});

test('no served deal claims an obligation it calls a never-started lane', () => {
  // A lane nobody opened is not an obligation the firm accepted at committee. Both hold the
  // deal off clean; only one is a promise. Saying "4 obligations still outstanding" about a
  // signed and archived deal states something untrue about a closed transaction.
  for (const d of served) {
    const h = d.icVerdict?.headline || '';
    const m = /(\d+) obligations? still outstanding/.exec(h);
    if (!m) continue;
    const gating = d.icVerdict?.gating || [];
    const lanes = gating.filter((g) => / — (not started|no work recorded)/.test(g)).length;
    assert.equal(Number(m[1]), gating.length - lanes,
      `${d.id}: headline "${h}" counts ${gating.length - Number(m[1])} lane(s) as obligations`);
  }
});

test('the status tier strips the reason but keeps the state', () => {
  // The gating strings NAME the outstanding lanes and compliance checks — that is the
  // diligence substance in prose, and it must not travel to a seat that cannot open the
  // deal. The bare state may: you are entitled to know a deal is not ready without being
  // told why.
  const scoped = listDeals({ upn: 'stranger@contoso.com', roles: [] });
  const locked = scoped.filter((d) => d.accessLevel === 'status');
  assert.ok(locked.length, 'no status-tier deal in this scope — the barrier is untested');
  for (const d of locked) {
    assert.ok(d.icVerdict?.state, `${d.id}: state should survive the strip`);
    assert.equal(d.icVerdict.headline, null, `${d.id}: headline leaked to a status-tier seat`);
    assert.deepEqual(d.icVerdict.gating, [], `${d.id}: gating leaked to a status-tier seat`);
    assert.equal(d.icVerdict.basis, null, `${d.id}: basis leaked to a status-tier seat`);
  }
});
