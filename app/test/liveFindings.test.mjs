// The demo narrator asked the running product where a figure came from. It named the page,
// quoted the page verbatim, and the page has never shown that figure. Everything here is a
// regression pinned from live behaviour, not from reading the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalFigures, figuresBlock, buildReturnsModel, buildRiskRegister } from '../lib/diligence.js';
import { seededDeals } from '../data/deals.js';

const byId = (id) => seededDeals.find((d) => d.id === id);

test('a revenue nobody recorded is never presented as the deal\u2019s own number', () => {
  // Lumen records ARR and no revenue. The model was handed 1.2x enterprise value under
  // the words "AUTHORITATIVE FIGURES - these are the deal's own numbers", and told a
  // partner "Revenue: $288M", then produced a verbatim quotation to support it.
  const lumen = byId('lumen-analytics');
  const c = canonicalFigures(lumen);
  assert.equal(c.revenueRecorded, false, 'fixture assumption: Lumen records no revenue line');
  const block = figuresBlock(lumen);
  assert.match(block, /NO REVENUE FIGURE IS RECORDED/);
  assert.doesNotMatch(block, /Revenue: /, 'a derived revenue reached the model as authoritative');
});

test('a recorded revenue is still stated', () => {
  const nordic = byId('nordic-grocery');
  assert.equal(canonicalFigures(nordic).revenueRecorded, true);
  assert.match(figuresBlock(nordic), /Revenue: /);
});

test('the sensitivity grid contains the case it is sensitising', () => {
  // The base read 33.3% IRR while the LOWEST of nine cells read 38.6%. The grid took
  // revenue growth clamped at 25% and a hardcoded 5x leverage, neither of which the base
  // case used.
  for (const d of seededDeals.slice(0, 10)) {
    const r = buildReturnsModel(d);
    const base = (r.scenarios || []).find((s) => s.name === 'Base');
    const cells = (r.sensitivity?.rows || []).flatMap((row) => row.irr);
    if (!base || !cells.length) continue;
    const lo = Math.min(...cells);
    const hi = Math.max(...cells);
    assert.ok(base.irr >= lo - 0.1 && base.irr <= hi + 0.1,
      `${d.company}: base ${base.irr}% sits outside its own grid (${lo}%..${hi}%)`);
  }
});

test('sources and uses balance, and the equity note reconciles to the line above it', () => {
  for (const d of seededDeals.slice(0, 10)) {
    const r = buildReturnsModel(d);
    const su = r.sourcesUses;
    if (!su) continue;
    assert.ok(Math.abs(su.totalSources - su.totalUses) <= 1, `${d.company}: sources ${su.totalSources} vs uses ${su.totalUses}`);
    const sponsor = su.sources.find((s) => /sponsor equity/i.test(s.label))?.amount;
    const roll = su.sources.find((s) => /rollover/i.test(s.label))?.amount;
    const fees = su.uses.find((u) => /fees/i.test(u.label))?.amount;
    const base = (r.scenarios || []).find((s) => s.name === 'Base');
    if (sponsor == null || roll == null || fees == null || !base) continue;
    // The note claims: sponsor line = equity struck on + fees - rollover.
    assert.ok(Math.abs(sponsor - (base.equityIn + fees - roll)) <= 1,
      `${d.company}: the equity note does not reconcile (${sponsor} vs ${base.equityIn} + ${fees} - ${roll})`);
  }
});

test('a deal that only meets the hurdle is not described as clearing it', () => {
  for (const d of seededDeals) {
    const r = buildReturnsModel(d);
    const base = (r.scenarios || []).find((s) => s.name === 'Base');
    if (!base || !r.headline) continue;
    if (base.irr < 20.6 && /clears the/.test(r.headline)) {
      assert.fail(`${d.company}: "${r.headline}" claims to clear on a ${base.irr}% base`);
    }
  }
});

test('the risk register is not the same register on every deal', () => {
  // Four different companies returned eight risks each, five of them word-for-word
  // identical, with top-customer concentration at "~31% of revenue" on all four.
  const ids = ['lumen-analytics', 'nordic-grocery', 'atlas-coldchain', 'baltic-precision'].map(byId).filter(Boolean);
  const concs = ids.map((d) => {
    const reg = buildRiskRegister(d);
    const rows = reg.risks || [];
    const row = rows.find((x) => /concentration/i.test(x.risk || ''));
    return (String(row?.risk || '').match(/~(\d+)% of revenue/) || [])[1];
  }).filter(Boolean);
  assert.ok(concs.length >= 3, 'expected a concentration row on most deals');
  assert.ok(new Set(concs).size > 1, `every deal reports the same concentration: ${concs.join(', ')}`);
});

test('the register does not assert diligence nobody has done', () => {
  for (const d of seededDeals.slice(0, 6)) {
    const reg = buildRiskRegister(d);
    const text = JSON.stringify(reg);
    assert.doesNotMatch(text, /Voice-of-customer \(20\+ calls\)/, 'asserts twenty reference calls that never happened');
    assert.doesNotMatch(text, /identifies no Recognized Environmental Conditions/, 'reports a Phase I assessment nobody commissioned');
  }
});


