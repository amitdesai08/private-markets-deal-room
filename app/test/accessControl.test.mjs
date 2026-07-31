// What this file is for.
//
// Two things that looked enforced in the source and were not enforced in fact. Both were
// found by review, not by the suite, which is the point of writing them down here: a
// control with no test is a comment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrate, listDeals, advanceDeal, getDeal } from '../lib/store.js';

// Real store, real seed data, no datastore configured — so these run against the same
// functions the HTTP routes call, not a fixture shaped to look like them.
await hydrate();

// ---------------------------------------------------------------------------
// 1. The status tier is actually applied on the path the HTTP layer uses.
//
// `applyStatusTier` had a test. Its CALL SITE did not: you could delete
// `if (level === 'status') applyStatusTier(s)` from `listDeals` and the whole suite still
// passed, because nothing in the suite ever called `listDeals`. A redaction function that
// is never reached redacts nothing.
// ---------------------------------------------------------------------------
test('listDeals redacts status-tier rows on the path the API actually calls', () => {
  const rows = listDeals(null, 'analyst');
  const status = rows.filter((r) => r.accessLevel === 'status');
  assert.ok(status.length > 0, 'fixture must produce at least one status-tier row, or this asserts nothing');

  for (const r of status) {
    assert.equal(r.diligenceProgress, null, `${r.company}: lane progress is the mean of the lane array and leaks the same substance`);
    assert.equal(r.memoApproved, null, `${r.company}: memo counts leak IC progress`);
    assert.equal(r.complianceCleared, null, `${r.company}: compliance counts leak the sensitive part`);
    assert.ok(!Array.isArray(r.workstreams) || r.workstreams.length === 0, `${r.company}: per-lane detail must not ship`);
    assert.ok(!r.thesis, `${r.company}: the thesis is the deal`);
    assert.equal(r.locked, true);
  }
});

test('a full-tier row on that same path is NOT redacted', () => {
  // Guards the inverse mistake: a redaction so broad that the test above would pass with
  // `applyStatusTier` applied to everything.
  const rows = listDeals(null, 'analyst');
  const full = rows.filter((r) => r.accessLevel === 'full');
  assert.ok(full.length > 0);
  assert.ok(full.some((r) => r.thesis), 'full-tier rows keep the substance');
});

// ---------------------------------------------------------------------------
// 2. The IC-gate override is partner-only, and fails SHUT.
//
// The check read `if (persona && persona !== 'partner')`. A caller that did not identify
// itself fell straight through it — and the HTTP route passed no persona at all, so the
// restriction was unreachable over HTTP while reading as enforced in the source. Any
// caller could post any `overrideReason` and walk an IC gate.
// ---------------------------------------------------------------------------
const GATED = 'lumen-analytics'; // D3 → D4 crosses the `ic-entry` gate; NOT-READY on the seed.

test('the seeded gate fixture is genuinely gated', async () => {
  const d = getDeal(GATED);
  assert.equal(d.stage, 'D3', 'if this deal moves, the test below stops testing anything');
  const r = await advanceDeal(GATED, { persona: 'analyst' });
  assert.equal(r.error, 'ic-not-ready', 'without an override reason the gate itself must hold');
});

test('an unidentified caller cannot override an IC gate', async () => {
  const r = await advanceDeal(GATED, { persona: null, overrideReason: 'partner said it was fine' });
  assert.equal(r.error, 'override-forbidden', 'an unknown caller is not a partner');
  assert.equal(getDeal(GATED).stage, 'D3', 'and the deal must not have moved');
});

test('a non-partner cannot override an IC gate', async () => {
  for (const persona of ['analyst', 'associate', 'principal', 'admin']) {
    const r = await advanceDeal(GATED, { persona, overrideReason: 'in a hurry' });
    assert.equal(r.error, 'override-forbidden', `${persona} must not be able to override`);
  }
  assert.equal(getDeal(GATED).stage, 'D3');
});
