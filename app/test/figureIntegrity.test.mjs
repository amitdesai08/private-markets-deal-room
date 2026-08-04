// An IC member read this product cold, the way they read a case the night before a
// committee, and scored "one version of each number" at 2 out of 10. They were right,
// and every fault below was a silent one -- nothing threw, nothing looked broken, the
// figures were simply wrong in ways only somebody who reads these for a living would
// catch. Their words: "I would not repeat six of the eight numbers I would be asked
// about in the room."
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalFigures, dealGrowth } from '../lib/diligence.js';
import { computeICReadiness } from '../lib/icReadiness.js';
import { seededDeals } from '../data/deals.js';

const byId = (id) => seededDeals.find((d) => d.id === id);

test('a figure recorded in billions is not read as millions', () => {
  // "$1.94B" was stripped to 1.94 in a units convention of $M, so a $1.94bn grocer was
  // modelled as a $1.94m one. Downstream that produced a $0M working-capital peg and
  // four $0M value-creation levers, each with a method attached.
  const nordic = byId('nordic-grocery');
  const c = canonicalFigures(nordic);
  assert.ok(c.revenue > 1000, `revenue read as ${c.revenue}, expected roughly 1940`);
  assert.ok(c.revenue > c.ebitda, 'revenue must exceed EBITDA');
});

test('no seeded deal reports revenue below its own EBITDA', () => {
  const bad = seededDeals
    .map((d) => ({ id: d.id, c: canonicalFigures(d) }))
    .filter((x) => x.c && x.c.revenue != null && x.c.ebitda != null && x.c.revenue < x.c.ebitda)
    .map((x) => x.id);
  assert.deepEqual(bad, [], `deals whose revenue is below their EBITDA: ${bad.join(', ')}`);
});

// The one that mattered most. The debt cap makes EBITDA and entry multiple cancel out of
// the MOIC, so returns were decided entirely by growth and a flat deleveraging rate --
// both of which were constants. Nineteen deals therefore reported an identical 22.5% IRR
// and 2.76x MOIC, on a comparison table whose whole purpose is to tell them apart.
test('deals with different economics do not all return the same IRR', () => {
  const rows = seededDeals.map((d) => canonicalFigures(d)).filter(Boolean);
  assert.ok(rows.length >= 4, 'need several deals for this to prove anything');
  const irrs = new Set(rows.map((c) => c.irr));
  const moics = new Set(rows.map((c) => c.moic));
  assert.ok(irrs.size > 1, `every deal returned the same IRR: ${[...irrs]}`);
  assert.ok(moics.size > 1, `every deal returned the same MOIC: ${[...moics]}`);
});

test('the recorded growth rate is what gets modelled', () => {
  // Lumen records 41% growth and was being modelled at the same 7% default as a grocer.
  assert.ok(dealGrowth(byId('lumen-analytics')) > 20, 'a recorded growth rate must reach the model');
  assert.equal(dealGrowth({ keyFigures: [] }), 7, 'absent a rate, the default still applies');
  assert.equal(dealGrowth({ growth: 12 }), 12, 'an explicit field wins');
  // NRR of 118% means 18% net expansion, not 118% growth.
  assert.equal(dealGrowth({ keyFigures: [{ label: 'NRR', value: '118%' }] }), 18);
});

test('no deal underwrites more growth than the stated cap', () => {
  // A 41%-growth asset compounded for five straight years is not a screening assumption,
  // it is a sales pitch. The cap is 15% and the assumptions say so.
  for (const d of seededDeals) {
    const c = canonicalFigures(d);
    if (!c) continue;
    assert.ok(c.irr < 60, `${d.company} returns ${c.irr}% IRR, which reads as a modelling fault`);
  }
});

test('the IC ask quotes the same base case as the returns page', () => {
  // The readiness board defaulted growth to 6 while every other caller used 7, so the
  // board and the Returns page gave a committee two different base cases for one deal.
  for (const d of seededDeals.slice(0, 8)) {
    const c = canonicalFigures(d);
    const ask = computeICReadiness(d)?.ask;
    if (!c || !ask || ask.baseCase === '—') continue;
    assert.ok(
      ask.baseCase.includes(String(c.irr)) && ask.baseCase.includes(String(c.moic)),
      `${d.company}: the ask says "${ask.baseCase}" but the record says ${c.irr}% / ${c.moic}x`,
    );
  }
});

test('the IC ask states a real equity cheque, not a flat share of enterprise value', () => {
  // It read `scenarios.base.equity`, a field the returns engine has never returned, so
  // the "exact IC ask" was always the silent fallback of 45% of EV.
  const offenders = [];
  for (const d of seededDeals.slice(0, 8)) {
    const ask = computeICReadiness(d)?.ask;
    if (!ask || !d.dealSize || ask.equityCheck === '—') continue;
    const cheque = Number(String(ask.equityCheck).replace(/[^0-9.]/g, ''));
    if (Math.abs(cheque - Math.round(d.dealSize * 0.45)) < 0.5) offenders.push(d.company);
  }
  assert.ok(offenders.length < 4, `these deals still fall back to 45% of EV: ${offenders.join(', ')}`);
});

test('the equity cheque is a plausible share of the enterprise value', () => {
  // A deal recording no EBITDA line had its cheque computed off a floored EBITDA of 1,
  // so a committee was asked to approve $3M of equity against a $240M enterprise value.
  for (const d of seededDeals) {
    const ask = computeICReadiness(d)?.ask;
    if (!ask || !d.dealSize || ask.equityCheck === '—') continue;
    const cheque = Number(String(ask.equityCheck).replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(cheque)) continue;
    const share = cheque / d.dealSize;
    assert.ok(share > 0.15 && share < 0.9, `${d.company}: ${ask.equityCheck} equity on ${d.dealSize}M EV is ${Math.round(share * 100)}% of EV`);
  }
});

test('MOIC is spelled one way', () => {
  for (const d of seededDeals.slice(0, 5)) {
    const ask = computeICReadiness(d)?.ask;
    if (!ask) continue;
    assert.doesNotMatch(`${ask.hurdle} ${ask.baseCase}`, /MoIC/, 'the house style is MOIC');
  }
});
