// ONE EQUITY CHEQUE PER DEAL.
//
// The committee ask said $160M, the returns page said $140M of equity in, and sources &
// uses said $135M of sponsor equity — two clicks apart, on one deal. The 140/135 gap is
// explained on screen (fees, management rollover); the $160M was explained nowhere and
// appeared in no scenario, because the readiness board built its OWN returns model from a
// different set of inputs rather than reading the one the Papers page renders.
//
// "So what cheque are we writing?" is the first question a partner asks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededDeals } from '../data/deals.js';
import { computeICReadiness } from '../lib/icReadiness.js';
import { buildReturnsModel } from '../lib/diligence.js';

const baseOf = (model) => (model?.scenarios || []).find((s) => /base/i.test(s.name)) || null;

test('the committee ask quotes the same equity cheque as the returns model', () => {
  let checked = 0;
  for (const deal of seededDeals) {
    let ask, base;
    try {
      ask = computeICReadiness(deal).icAsk;
      base = baseOf(buildReturnsModel(deal));
    } catch { continue; }
    if (!ask || !base) continue;
    checked++;
    assert.equal(
      ask.equityCheck,
      `$${base.equityIn}M`,
      `${deal.company}: the ask says ${ask.equityCheck} and the base scenario says $${base.equityIn}M`,
    );
  }
  assert.ok(checked > 10, `only ${checked} deals compared — this test has gone inert`);
});

test('the committee ask quotes the same base IRR and MOIC as the returns model', () => {
  for (const deal of seededDeals) {
    let ask, base;
    try {
      ask = computeICReadiness(deal).icAsk;
      base = baseOf(buildReturnsModel(deal));
    } catch { continue; }
    if (!ask || !base || ask.baseCase === '—') continue;
    assert.equal(
      ask.baseCase,
      `${base.irr}% IRR · ${base.moic}x MOIC`,
      `${deal.company}: the ask says "${ask.baseCase}" and the model says ${base.irr}% / ${base.moic}x`,
    );
  }
});
