// What this file is for.
//
// Two things that looked enforced in the source and were not enforced in fact. Both were
// found by review, not by the suite, which is the point of writing them down here: a
// control with no test is a comment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrate, listDeals, advanceDeal, regressDeal, getDeal } from '../lib/store.js';

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
  // Probed as a member, not an analyst. The analyst is now named on the team of the five
  // deals in their book, so they resolve to 'full' and would make this fixture vacuous —
  // which the assertion below would have caught anyway. A member is on no deal team and
  // is the seat the status tier actually exists for.
  const rows = listDeals(null, 'member');
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

// ---------------------------------------------------------------------------
// 3. An outstanding obligation stops something.
//
// An IC chair moved Project Onyx from E2 straight into E3 (Closing) as an analyst, with
// its EU merger-control filing open, no reason recorded and no error returned. The board
// had already named that filing as an outstanding obligation. Naming it and then letting
// the deal walk into Closing makes the obligation a badge.
// ---------------------------------------------------------------------------
test('a deal with outstanding obligations cannot walk into Closing', async () => {
  const onyx = getDeal('onyx');
  assert.equal(onyx.stage, 'E2', 'if this deal moves, the test below stops testing anything');
  assert.ok((onyx.compliance || []).some((c) => c.status !== 'passed'), 'fixture must carry an uncleared check');

  const r = await advanceDeal('onyx', { persona: 'analyst' });
  assert.equal(r.error, 'obligations-outstanding');
  assert.match(r.detail, /outstanding/i);
  assert.equal(getDeal('onyx').stage, 'E2', 'and the deal must not have moved');

  const forged = await advanceDeal('onyx', { persona: 'analyst', overrideReason: 'the MD said it was fine' });
  assert.equal(forged.error, 'override-forbidden', 'a written reason from a non-partner is not an override');
  assert.equal(getDeal('onyx').stage, 'E2');
});

test('a partner CAN proceed, and the override is written down', async () => {
  // The gate is not a wall. It is a signature. This asserts the signature is recorded,
  // because an override with no record is the same as no gate.
  const before = getDeal('onyx').stage;
  const r = await advanceDeal('onyx', { persona: 'partner', overrideReason: 'Filing acknowledged verbally by counsel; proceeding at risk.' });
  assert.ok(!r.error, `partner override should proceed, got ${r && r.error}`);
  const after = getDeal('onyx');
  assert.notEqual(after.stage, before);
  const ov = (after.icOverrides || []).at(-1);
  assert.equal(ov.by, 'partner');
  assert.match(ov.reason, /proceeding at risk/);
  assert.ok(ov.gating.length, 'the override records WHAT was overridden, not just that it was');
  assert.ok(!after.activity.some((a) => a.actor === 'Investment Committee'), 'no activity line may be attributed to a body that never sat');
});

// ---------------------------------------------------------------------------
// 4. Moving a deal BACKWARDS leaves a trace.
//
// `regressDeal` wrote no activity entry at all, so walking a deal back and forward left
// two "Advanced to ..." lines with nothing between them — which is worse than no log,
// because it reads as one clean progression.
// ---------------------------------------------------------------------------
test('a backwards move is written to the activity log, with an actor', async () => {
  const id = 'cascadia';
  const before = getDeal(id);
  const startStage = before.stage;
  const startLines = before.activity.length;

  const after = await regressDeal(id, { persona: 'principal', reason: 'QoE reopened after the vendor restated Q3.' });
  assert.notEqual(after.stage, startStage, 'the deal must actually have moved');
  assert.equal(after.activity.length, startLines + 1, 'a backwards move that leaves no trace is an untracked write');

  const line = after.activity[0];
  assert.match(line.actor, /principal/, 'the log must name who did it');
  assert.match(line.action, /Moved back/i);
  assert.match(line.action, /QoE reopened/, 'and why');
});
