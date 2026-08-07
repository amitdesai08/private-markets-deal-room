// THE NUMBERS ARE COMPUTED, NOT REMEMBERED.
//
// Answering from the record instead of from a model is only safe if the record is read
// every time. The moment any of this becomes a cache, a deal whose EBITDA was corrected an
// hour ago starts being described with yesterday's multiple — and it will be described
// confidently, in under a second, which is worse than the twenty seconds it replaced.
//
// So the guarantee is: change the record, ask again, get the new answer, with nothing to
// invalidate and no staleness window. This holds across the whole deterministic plane —
// the figures, the readiness verdict, the credit view and the answers built on them — and
// it is what makes it safe to put that plane in front of the model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalFigures, buildValueCreationPlan, buildReturnsModel } from '../lib/diligence.js';
import { computeICReadiness } from '../lib/icReadiness.js';
import { answerFromRecord } from '../lib/knownAnswers.js';

const deal = (over = {}) => ({
  id: 'd1', company: 'Testco', sector: 'Industrials', subSector: 'Precision Components',
  accessLevel: 'full', locked: false, dealSize: 400, currency: 'USD', daysToIC: 5,
  workstreams: [], keyFigures: [], memoSections: [], compliance: [], conditions: [], issues: [],
  activity: [], documents: [],
  ...over,
});
const kf = (label, value) => ({ label, value, source: 'test', confidence: 'high' });

test('a corrected EBITDA moves the multiple on the next read, with nothing to invalidate', () => {
  const before = canonicalFigures(deal({ keyFigures: [kf('EBITDA (LTM)', '$50M')] }));
  const after = canonicalFigures(deal({ keyFigures: [kf('EBITDA (LTM)', '$40M')] }));
  assert.ok(before && after);
  assert.notEqual(before.entryMultiple, after.entryMultiple, 'the multiple did not move when the denominator did');
  assert.equal(before.entryMultiple, 8, `$400M over $50M should be 8x, got ${before.entryMultiple}x`);
  assert.equal(after.entryMultiple, 10, `$400M over $40M should be 10x, got ${after.entryMultiple}x`);
});

test('a changed enterprise value moves the price the model funds', () => {
  const a = buildReturnsModel(deal({ dealSize: 400, keyFigures: [kf('EBITDA (LTM)', '$50M')] }));
  const b = buildReturnsModel(deal({ dealSize: 500, keyFigures: [kf('EBITDA (LTM)', '$50M')] }));
  const evOf = (r) => (r.scenarios || []).find((s) => /base/i.test(s.name))?.entryEV;
  assert.equal(evOf(a), 400);
  assert.equal(evOf(b), 500);
});

// The credit view is derived from what the business is and how it converts cash. A margin
// correction has to reach it, or the leverage on the page stops describing the deal.
test('a changed margin moves the leverage the deal is modelled at', () => {
  const thin = buildReturnsModel(deal({ keyFigures: [kf('EBITDA (LTM)', '$50M'), kf('EBITDA margin', '5%')] }));
  const fat = buildReturnsModel(deal({ keyFigures: [kf('EBITDA (LTM)', '$50M'), kf('EBITDA margin', '30%')] }));
  assert.notEqual(thin.debtToEv, fat.debtToEv, 'a 5%-margin and a 30%-margin business carry identical debt');
  assert.ok(thin.debtToEv < fat.debtToEv, 'the thinner-margin business is the more heavily levered');
});

test('the value-creation plan re-apportions when the target moves', () => {
  const a = buildValueCreationPlan(deal({ keyFigures: [kf('EBITDA (LTM)', '$50M')] }));
  const b = buildValueCreationPlan(deal({ keyFigures: [kf('EBITDA (LTM)', '$80M')] }));
  assert.notEqual(a.ebitdaBridge.delta, b.ebitdaBridge.delta, 'the uplift target did not move');
  for (const p of [a, b]) {
    assert.equal(p.levers.reduce((s, l) => s + l.impact, 0), p.ebitdaBridge.delta, 'the plan stopped adding up after the change');
  }
});

// The readiness verdict is the one a committee reads. It is recomputed from the lanes and
// the papers every time it is asked for. Note what closing a lane means here: recording
// work against it, not typing "complete" — `blockingWorkstreams` deliberately refuses to
// treat a status field as evidence.
test('recording work against a blocking lane changes the verdict on the next read', () => {
  const lane = (findings) => [{ lane: 'legal', label: 'Legal DD', status: 'in_progress', progress: findings.length ? 100 : 10, findings }];
  const open = computeICReadiness(deal({ workstreams: lane([]) }));
  const worked = computeICReadiness(deal({ workstreams: lane([{ text: 'SPA mark-up returned; no change-of-control consents outstanding.', severity: 'clear' }]) }));
  const blockingLine = (b) => (b.verdict.gating || []).find((g) => /workstream/i.test(g)) || '';
  assert.match(blockingLine(open), /1 workstream blocking/, 'an unworked lane is not reported as blocking');
  assert.notEqual(
    blockingLine(worked),
    blockingLine(open),
    'the verdict is identical before and after work was recorded against the lane',
  );
});

// And the answers built on top inherit it, because they hold no state of their own.
test('the record answers reflect a change with no cache to clear', () => {
  const one = [deal()];
  const two = [deal(), deal({ id: 'd2', company: 'Secondco', daysToIC: 9 })];
  const count = (list) => answerFromRecord({ message: 'How many deals do I have in view?', deals: list, rawFor: (id) => list.find((d) => d.id === id) }).reply;
  assert.match(count(one), /\b1 deal\b/);
  assert.match(count(two), /\b2 deals\b/);

  // And a date change moves the answer to the committee question.
  const near = [deal({ daysToIC: 2 })];
  const far = [deal({ daysToIC: 30 })];
  const when = (list) => answerFromRecord({ message: 'When is the next investment committee?', deals: list, rawFor: (id) => list.find((d) => d.id === id) }).reply;
  assert.match(when(near), /\b2 days\b/);
  assert.match(when(far), /\b30 days\b/);
});

// The point of the whole arrangement: the deterministic plane is cheap enough that there
// is no reason to cache it, which is why there is no staleness to reason about.
test('recomputing the whole book stays far cheaper than one model call', () => {
  const book = Array.from({ length: 20 }, (_, i) => deal({ id: `d${i}`, company: `Co${i}`, keyFigures: [kf('EBITDA (LTM)', `$${40 + i}M`)] }));
  const t0 = process.hrtime.bigint();
  for (const d of book) { canonicalFigures(d); computeICReadiness(d); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 250, `recomputing 20 deals took ${ms.toFixed(0)}ms; if this ever approaches a model call the argument for computing fresh weakens`);
});
