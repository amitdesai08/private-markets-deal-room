// The demo narrator asked the running product where a figure came from. It named the page,
// quoted the page verbatim, and the page has never shown that figure. Everything here is a
// regression pinned from live behaviour, not from reading the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalFigures, figuresBlock, buildReturnsModel, buildRiskRegister, dealGrowth } from '../lib/diligence.js';
import { computeICReadiness } from '../lib/icReadiness.js';
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



test('the register never reports an opinion on a lane nobody has started', () => {
  // Two reviewers, independently, opened the workstream board and the findings report on
  // the same deal and found "no material undisclosed litigation identified" beside a
  // legal lane reading NOT STARTED. Same defect class as the QoE and Phase I lines that
  // were already fixed: the register was describing work rather than reading it.
  const LANE_OF = { 'Legal DD': 'legal', 'Tax DD & structuring': 'tax', 'Technology / IT / Cyber DD': 'techai' };
  const ASSERTS_WORK = /identified|no material|adequate|positive|verified|confirmed|scales to/i;

  let checked = 0;
  for (const deal of seededDeals) {
    const rows = (buildRiskRegister(deal) || {}).risks || [];
    for (const [reportLane, wsLane] of Object.entries(LANE_OF)) {
      const ws = (deal.workstreams || []).find((w) => String(w.lane) === wsLane);
      if (!ws || String(ws.status) !== 'not_started') continue;
      checked++;
      for (const r of rows.filter((x) => x.workstream === reportLane)) {
        assert.doesNotMatch(String(r.risk), ASSERTS_WORK,
          `${deal.company}: ${reportLane} lane is not started, but the register says "${r.risk}"`);
        assert.match(String(r.risk), /has not started|not been commissioned/i,
          `${deal.company}: ${reportLane} lane is not started and the register does not say so`);
      }
    }
  }
  assert.ok(checked > 0, 'no seeded deal has a not-started legal/tax/tech lane, so this asserts nothing');
});

test('the same sentence does not appear on every deal in the fund', () => {
  // A room comparing two deals saw a byte-identical risk register and stopped believing
  // both. Any single finding shared by more than four-fifths of the book is a template
  // showing through.
  const counts = new Map();
  const deals = seededDeals.filter((d) => (d.workstreams || []).length);
  for (const d of deals) {
    for (const r of new Set(((buildRiskRegister(d) || {}).risks || []).map((x) => String(x.risk)))) {
      counts.set(r, (counts.get(r) || 0) + 1);
    }
  }
  const cap = Math.ceil(deals.length * 0.8);
  const everywhere = [...counts.entries()].filter(([, n]) => n > cap).map(([t]) => t.slice(0, 70));
  assert.deepEqual(everywhere, [], `these sentences appear on more than ${cap} of ${deals.length} deals`);
});

test('the book does not underwrite to one answer', () => {
  // Every deal but one came back between 20% and 22% IRR on entry multiples spanning
  // 3.7x to 8.4x. The cause was not the model: eighteen of nineteen deals carried no
  // growth rate, so the model applied one default and the differences between the deals
  // cancelled. A compare screen where every row agrees is not a compare screen.
  const base = [];
  for (const d of seededDeals) {
    const r = buildReturnsModel(d);
    const b = (r?.scenarios || []).find((s) => /base/i.test(s.name));
    if (b && Number.isFinite(Number(b.irr))) base.push(Number(b.irr));
  }
  assert.ok(base.length >= 15, 'fixture must model most of the book, or this asserts nothing');

  const distinct = new Set(base).size;
  assert.ok(distinct >= Math.ceil(base.length * 0.7),
    `only ${distinct} distinct IRRs across ${base.length} deals — the model is not reading the deals`);

  const clustered = base.filter((v) => v >= 20 && v <= 22).length;
  assert.ok(clustered <= Math.ceil(base.length * 0.5),
    `${clustered} of ${base.length} deals land in a two-point IRR band`);

  assert.ok(Math.max(...base) - Math.min(...base) >= 8,
    'the whole book fits inside eight points of IRR');
});

test('a deal that does not clear the hurdle is allowed to say so', () => {
  // The corollary. If every deal clears, the hurdle is decoration and the readiness
  // verdict means nothing.
  const verdicts = seededDeals.map((d) => buildReturnsModel(d)).filter(Boolean);
  assert.ok(verdicts.some((r) => r.meetsHurdle === false), 'every deal in the fund clears its hurdle');
  assert.ok(verdicts.some((r) => r.meetsHurdle === true), 'no deal in the fund clears its hurdle');
});

test('the readiness board never says there are no open risks over a register holding some', () => {
  // Atlas Cold Chain read "IC-ready — required papers complete, no blocking workstreams or
  // unresolved risks" over a register carrying ten live entries, three of them closing
  // conditions, including change-of-control consents on two material contracts. A partner
  // who discovers that in the room does not open the product again.
  let checked = 0;
  for (const deal of seededDeals) {
    let ic, reg;
    try { ic = computeICReadiness(deal); reg = buildRiskRegister(deal); } catch { continue; }
    const material = ((reg && reg.risks) || []).filter((r) => ['stopper', 'reprice', 'condition'].includes(r.severity));
    if (!material.length) continue;
    checked++;
    assert.ok(ic.unresolvedRisks.length > 0,
      `${deal.company}: the register holds ${material.length} open items and the board lists none`);
    assert.doesNotMatch(String(ic.verdict?.headline || ''), /no blocking workstreams or unresolved risks/i,
      `${deal.company}: headline claims no unresolved risks over ${material.length} open register items`);
  }
  assert.ok(checked > 0, 'no seeded deal has material register rows, so this asserts nothing');
});

test('the two screens grade the same risk with the same word', () => {
  // The register graded R1 "Price-adjuster" while the board graded the same row "caution".
  // Those are not the same sentence to a committee.
  for (const deal of seededDeals) {
    let ic, reg;
    try { ic = computeICReadiness(deal); reg = buildRiskRegister(deal); } catch { continue; }
    const byTitle = new Map(((reg && reg.risks) || []).map((r) => [String(r.risk), r.severityLabel]));
    for (const row of ic.unresolvedRisks.filter((r) => r.from === 'risk register')) {
      const label = byTitle.get(String(row.title));
      if (!label) continue;
      assert.equal(row.severityLabel, label,
        `${deal.company}: register says "${label}", board says "${row.severityLabel}"`);
    }
  }
});

test('returns that run on a default say so', () => {
  // Five deals returned byte-identical IRR and MOIC — a cinema-advertising business and a
  // clinical-stage biotech among them — because none carried a growth rate. Nothing on the
  // page said the figures were a placeholder.
  for (const deal of seededDeals) {
    let r;
    try { r = buildReturnsModel(deal); } catch { continue; }
    if (!r) continue;
    if (dealGrowth(deal) === null) {
      assert.equal(r.indicative, true, `${deal.company}: no growth on the record and the returns do not say they are indicative`);
      assert.match(String(r.indicativeNote || ''), /placeholder|indicative/i);
    } else {
      assert.notEqual(r.indicative, true, `${deal.company}: growth IS recorded but the returns claim to be indicative`);
    }
  }
});
