// The demo narrator asked the running product where a figure came from. It named the page,
// quoted the page verbatim, and the page has never shown that figure. Everything here is a
// regression pinned from live behaviour, not from reading the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalFigures, figuresBlock, buildReturnsModel, buildRiskRegister, dealGrowth } from '../lib/diligence.js';
import { computeICReadiness } from '../lib/icReadiness.js';
import { validateCitations } from '../lib/citations.js';
import { seededDeals } from '../data/deals.js';

const byId = (id) => seededDeals.find((d) => d.id === id);

test('a revenue nobody recorded is never presented as the deal\u2019s own number', () => {
  // Lumen records ARR and no revenue. The model was handed 1.2x enterprise value under
  // the words "AUTHORITATIVE FIGURES - these are the deal's own numbers", and told a
  // partner "Revenue: $288M", then produced a verbatim quotation to support it.
  //
  // The first fix said "NO REVENUE FIGURE IS RECORDED for this company", which the model
  // then quoted back in quotation marks and attributed to the Returns page — a page that
  // has never carried that sentence — and which was refuted one tab away by the ARR the
  // Brief prints at high confidence. The rule is now: never state a derived revenue, name
  // the top line that IS recorded, and forbid the attribution.
  // Lumen has since had a diligenced revenue and EBITDA put on its record, which is the
  // right answer to the underlying problem. The rule it exposed still has to hold, so the
  // fixture is now a record shaped the way Lumen's was: a top line and nothing else.
  const lumen = { ...byId('lumen-analytics'), keyFigures: (byId('lumen-analytics').keyFigures || []).filter((k) => /\barr\b|growth|nrr/i.test(k.label)) };
  const c = canonicalFigures(lumen);
  assert.equal(c.revenueRecorded, false, 'fixture assumption: Lumen records no revenue line');
  const block = figuresBlock(lumen);
  assert.match(block, /No total revenue is on this company's record/, 'the missing revenue is not declared');
  assert.doesNotMatch(block, /(?<!TOTAL )Revenue: /, 'a derived revenue reached the model as authoritative');
  // The record's own top line has to be named rather than denied along with the rest.
  assert.match(block, /ARR of \$42M/, 'the recorded top line is not named, so the denial is refuted by the Brief tab');
  // And the directive must not be quotable as though it were page text.
  assert.match(block, /Never present one as a quotation/i, 'the directive does not forbid being quoted back as a citation');
  assert.doesNotMatch(block, /^[a-z][a-z0-9_]*=/m, 'a machine token is still being handed to the model');
});

test('a recorded revenue is still stated', () => {
  const nordic = byId('nordic-grocery');
  assert.equal(canonicalFigures(nordic).revenueRecorded, true);
  assert.match(figuresBlock(nordic), /revenue \$[\d.]+/);
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
  // The check is on the CLAIM, not the word. "below hurdle" used to be printed beside a
  // stated "20% / 2x" for four deals that clear the MOIC leg and miss only the IRR, which
  // a room full of partners catches in one line — so the headline now names the leg that
  // fails, and saying "the 2.04x clears the 2x hurdle; the 15.3% IRR does not reach 20%"
  // is the honest sentence, not a violation.
  const CLAIMS_CLEAR = /clears the [\d.]+% \/ [\d.]+x hurdle/i;
  for (const d of seededDeals) {
    const r = buildReturnsModel(d);
    const base = (r.scenarios || []).find((s) => s.name === 'Base');
    if (!base || !r.headline) continue;
    // "meets … with nothing to spare" is the deliberate wording for the band just above
    // the hurdle; only an unqualified claim to CLEAR it is forbidden there.
    if (base.irr < 20.6 && CLAIMS_CLEAR.test(r.headline)) {
      assert.fail(`${d.company}: "${r.headline}" claims to clear on a ${base.irr}% base`);
    }
    // And where it does fall short, it must say which half.
    if (!r.meetsHurdle && !r.entryAboveCeiling) {
      assert.match(r.headline, /does not reach|below the/i, `${d.company}: falls short and does not say how`);
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
    return (String(row?.risk || '').match(/~([\d.]+)% of revenue/) || [])[1];
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
        // The register now says this in several phrasings, because one sentence on
        // nineteen deals is what makes a room decide the record is generated. The rule is
        // that it says the work has not happened, not that it says so in one way.
        assert.match(String(r.risk), /has not started|not been commissioned|has not been (?:done|scoped|instructed)|nobody has (?:opened|scoped|looked|spoken)|is unstarted|is unscoped|no \w+ work has been|no basis on the record|is outstanding/i,
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
  //
  // A defaulted EBITDA is the same failure and was not covered: with none recorded the model
  // infers one from enterprise value at the sector screening multiple, so the entry multiple
  // it reports is that default restated. Both count as indicative.
  for (const deal of seededDeals) {
    let r;
    try { r = buildReturnsModel(deal); } catch { continue; }
    if (!r) continue;
    const preLaunch = /^O/i.test(String(deal.stage || ''));
    const ebitdaKf = (deal.keyFigures || []).find((k) => /\bebitda\b/i.test(String(k.label || '')) && !/margin|growth|cagr/i.test(String(k.label || '')));
    const untested = !ebitdaKf?.source || /draft|preliminary|teaser|\bcim\b|information memorandum|broker|analyst|research|management accounts?/i.test(String(ebitdaKf.source));
    const defaulted = preLaunch || untested || dealGrowth(deal) === null || canonicalFigures(deal)?.ebitdaSource === 'derived';
    if (defaulted) {
      assert.equal(r.indicative, true, `${deal.company}: runs on a default and the returns do not say they are indicative`);
      assert.match(String(r.indicativeNote || ''), /placeholder|indicative/i);
    } else {
      assert.notEqual(r.indicative, true, `${deal.company}: every input is on the record but the returns claim to be indicative`);
    }
  }
});

test('one entry multiple per deal, across every surface that prints one', () => {
  // An IC member read three for Lumen: 8.3x on the returns page, 9.2x in the register's
  // QoE row, and "9.4x to 10.1x" in a workstream finding. Nothing on any screen reconciled
  // the third. They said they would not repeat any of the four numbers, which is the
  // correct response and the end of the product's usefulness.
  const MULT = /\b(\d{1,2}\.\d)x\b/g;
  for (const deal of seededDeals) {
    let r;
    try { r = buildReturnsModel(deal); } catch { continue; }
    if (!r?.entry?.evEbitda) continue;
    const shown = Number(r.entry.evEbitda);
    const text = (deal.workstreams || [])
      .flatMap((w) => (w.findings || []).map((f) => String(f.text || '')))
      .join(' \u0001 ');
    for (const m of text.matchAll(MULT)) {
      const n = Number(m[1]);
      // Only entry multiples. A finding may legitimately quote an exit or a peer multiple,
      // so this looks at the words around it.
      const around = text.slice(Math.max(0, m.index - 60), m.index + 60);
      if (!/entry multiple/i.test(around)) continue;
      if (/\bby (roughly |about |around )?$/i.test(text.slice(Math.max(0, m.index - 20), m.index))) continue;
      assert.ok(Math.abs(n - shown) < 0.05,
        `${deal.company}: a finding prints ${n}x as the entry multiple, the returns page prints ${shown}x`);
    }
  }
});

test('a capped growth rate says it was capped', () => {
  // The model runs at 15% while the front page says 41%, and asked where 15% came from the
  // assistant answered "not recorded... no sign-off". The cap had silently replaced the
  // recorded rate.
  let checked = 0;
  for (const deal of seededDeals) {
    let r;
    try { r = buildReturnsModel(deal); } catch { continue; }
    if (!r) continue;
    assert.ok(r.growthBasis, `${deal.company}: the returns do not say what growth they were struck on`);
    const recorded = dealGrowth(deal);
    if (recorded != null && recorded > 15) {
      checked++;
      assert.match(String(r.growthBasis), /not the/i, `${deal.company}: growth was capped and the page does not say so`);
      assert.match(String(r.growthBasis), new RegExp(String(recorded)), `${deal.company}: the recorded rate is not named`);
    }
  }
  assert.ok(checked > 0, 'no seeded deal exceeds the cap, so this asserts nothing');
});

test('an unsourced base cannot produce a comfortable score', () => {
  // 83 out of 100 on a pack whose own summary reads "IC ask derived from unsourced Revenue
  // & EBITDA". Revenue and EBITDA are the denominator of the enterprise value, the entry
  // multiple, the equity cheque and the IRR — nothing above an unsourced base is sourced.
  let checked = 0;
  for (const deal of seededDeals) {
    let a;
    try { a = validateCitations(deal); } catch { continue; }
    if (!a || a.icAsk?.baseSourced !== false) continue;
    checked++;
    assert.ok(a.score <= 40, `${deal.company}: base is unsourced and the audit still scores ${a.score}`);
  }
  assert.ok(checked > 0, 'no seeded deal has an unsourced base, so this asserts nothing');
});
