// A BOOK OF DEALS, NOT ONE FORMULA RUN NINETEEN TIMES.
//
// Two constants were doing all the work. Debt was `min(EBITDA x 5, EV x 0.6)` and the
// screening default for a missing EBITDA was a flat 12% of enterprise value — and
// 5/8.33 is 0.60 exactly, so the turns and the cap agreed to the decimal and ALL NINETEEN
// deals came out at 60.0% debt, while every deal without a diligenced EBITDA priced at
// 8.3x. A demo narrator clicked four consecutive deals — renewables, marine services,
// vertical SaaS and specialty foods — and read 8.3x with 5x leverage on all four.
//
// His words: "put Lumen and Harborlight side by side and the room sees one spreadsheet
// with the company name changed. There is no financing decision anywhere in this
// product." That is a judgement about the whole book, so it is tested over the whole book
// rather than deal by deal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seededDeals } from '../data/deals.js';
import { canonicalFigures, buildReturnsModel } from '../lib/diligence.js';
import { creditProfile, screeningMultiple } from '../lib/screening.js';

const priced = seededDeals
  .map((d) => ({ deal: d, canon: canonicalFigures(d), returns: buildReturnsModel(d) }))
  .filter((x) => x.canon && x.returns);

test('the fixture is large enough for this to mean anything', () => {
  assert.ok(priced.length >= 15, `only ${priced.length} deals produce figures`);
});

test('the book is not financed by one constant', () => {
  const ratios = priced.map((x) => x.returns.debtToEv).filter((r) => r != null);
  assert.ok(ratios.length >= 15, `only ${ratios.length} deals report a debt/EV ratio`);
  const distinct = new Set(ratios.map((r) => r.toFixed(3)));
  assert.ok(
    distinct.size >= 6,
    `${ratios.length} deals produce only ${distinct.size} distinct debt/EV ratio(s) — leverage is a constant again`,
  );
  // And no single value may account for the book.
  const counts = new Map();
  for (const r of ratios) counts.set(r.toFixed(3), (counts.get(r.toFixed(3)) || 0) + 1);
  const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
  assert.ok(
    n <= ratios.length * 0.5,
    `${n} of ${ratios.length} deals are financed at exactly ${(Number(top) * 100).toFixed(1)}% of enterprise value`,
  );
});

test('the entry price is not one number wearing different company names', () => {
  const mults = priced.map((x) => x.canon.entryMultiple).filter((m) => m != null);
  const counts = new Map();
  for (const m of mults) counts.set(m, (counts.get(m) || 0) + 1);
  const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
  assert.ok(
    n <= 3,
    `${n} of ${mults.length} deals price at exactly ${top}x — the screening default is sector-blind again`,
  );
  assert.ok(
    counts.size >= 10,
    `${mults.length} deals produce only ${counts.size} distinct entry multiples`,
  );
});

// Leverage is the largest single driver of the IRR being voted on. The paper used to
// attribute it to "the financeable ceiling for the sector" while there was no sector
// input anywhere in the calculation.
test('every deal says why it carries the leverage it does', () => {
  for (const { deal, returns } of priced) {
    const basis = returns.leverageBasis || (returns.entry || {}).leverageBasis;
    assert.ok(basis, `${deal.company}: leverage is stated with no reasoning behind it`);
    assert.ok(basis.length > 40, `${deal.company}: the leverage basis says nothing useful — "${basis}"`);
    assert.ok(
      !/there is no sector input/i.test(basis),
      `${deal.company}: the paper still admits leverage was decided without reference to the business`,
    );
  }
});

// Two businesses that are genuinely different must be financed differently, or the
// sector table is decorative.
test('a defensive grocer and a software business are not financed alike', () => {
  const grocer = creditProfile({ sector: 'Consumer & Retail', subSector: 'Grocery / Convenience', ebitdaMargin: 7.6 });
  const saas = creditProfile({ sector: 'Software', subSector: 'Vertical SaaS', ebitdaMargin: 30 });
  assert.notEqual(grocer.turns, saas.turns, 'both carry the same turns of EBITDA');
  assert.ok(grocer.why && saas.why && grocer.why !== saas.why, 'both are given the same reason');
});

test('sectors that trade apart get different screening defaults', () => {
  const saas = screeningMultiple({ sector: 'Software', subSector: 'Vertical SaaS' });
  const marine = screeningMultiple({ sector: 'Industrials', subSector: 'Marine Infrastructure Services' });
  assert.ok(saas > marine + 2, `vertical SaaS defaults to ${saas}x and marine services to ${marine}x`);
});
