// SC-3 (finance correctness) — deterministic regression guard for the paper-LBO
// returns engine (lib/screening.js). Proves the model is reproducible and
// financially sane: debt is capped, equity never collapses, MOIC/IRR stay in a
// plausible band, scenarios are ordered, and the hurdle rule is exact. This is the
// permanent guard against the "591x MOIC" bug (uncapped debt → $1 equity check).

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReturns } from '../lib/screening.js';

const CASES = [
  { name: 'entry≈leverage (the 591x-bug case)', c: { ebitda: 50, dealSize: 250, growth: 8 } },
  { name: 'typical mid-market ~9x', c: { ebitda: 40, dealSize: 360, growth: 10 } },
  { name: 'above-ceiling ask', c: { ebitda: 30, dealSize: 600, growth: 12 } },
  { name: 'no-growth defensive', c: { ebitda: 25, dealSize: 175, growth: 0 } },
];

test('buildReturns is deterministic (same input → identical output)', () => {
  for (const { c } of CASES) assert.deepEqual(buildReturns(c), buildReturns(c));
});

test('debt is capped at ≤60% of entry EV; equity never collapses; MOIC/IRR stay sane', () => {
  for (const { name, c } of CASES) {
    const r = buildReturns(c);
    for (const k of ['downside', 'base', 'upside']) {
      const s = r.scenarios[k];
      assert.ok(s.debt <= Math.round(s.entryEV * 0.6) + 1, `${name}/${k}: debt ${s.debt} exceeds 60% of EV ${s.entryEV}`);
      assert.ok(s.equityIn >= 1, `${name}/${k}: equity check collapsed to <1`);
      assert.ok(s.moic >= 0 && s.moic < 20, `${name}/${k}: MOIC ${s.moic} outside a sane band`);
      assert.ok(s.irr > -100 && s.irr < 200, `${name}/${k}: IRR ${s.irr}% outside a sane band`);
    }
  }
});

test('scenarios are ordered downside ≤ base ≤ upside (MOIC)', () => {
  for (const { name, c } of CASES) {
    const r = buildReturns(c);
    assert.ok(r.scenarios.downside.moic <= r.scenarios.base.moic + 1e-9, `${name}: downside > base`);
    assert.ok(r.scenarios.base.moic <= r.scenarios.upside.moic + 1e-9, `${name}: base > upside`);
  }
});

test('meetsHurdle is exactly the 20% IRR / 2.0x MOIC rule (and false above the entry ceiling)', () => {
  for (const { c } of CASES) {
    const r = buildReturns(c);
    const expected = !r.entryAboveCeiling && r.scenarios.base.irr >= 20 && r.scenarios.base.moic >= 2.0;
    assert.equal(r.meetsHurdle, expected);
  }
});
