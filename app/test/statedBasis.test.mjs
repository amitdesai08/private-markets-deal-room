// Numbers that were printed without a denominator, a rubric or a bridge.
//
// A demo narrator read "91" beside "87" on the screening desk, "11.2% / 24.6% / 15.8%"
// for one position against an LPA cap, and "1.62x" beside "1.46x" with nothing in
// between. Each of those is defensible arithmetic that had simply never been shown, so a
// reader had to either take it on trust or work it out. These guards keep the working
// on the page.
import test from 'node:test';
import assert from 'node:assert/strict';

import { fundOverview } from '../lib/fund.js';
import { explainScreenScore, scoreScreen } from '../lib/scoring.js';
import { creditSpreadFor } from '../lib/benchmarks.js';
import { buildDocumentDesk } from '../lib/dealDesk.js';
import { buildCockpit } from '../lib/cockpit.js';
import { buildHomeDesk } from '../lib/homeDesk.js';
import { computeICReadiness } from '../lib/icReadiness.js';
import { validateCitations } from '../lib/citations.js';
import { documentBrief } from '../lib/docOpen.js';
import { houseStyle } from '../lib/ai.js';
import { buildRiskRegister } from '../lib/diligence.js';
import { corpusForDeal } from '../lib/workiqCorpus.js';
import { laneLabel } from '../lib/cockpit.js';
import { buildDealCase } from '../lib/dealCase.js';
import { detectCommitments } from '../lib/dealDesk.js';
import { seedSourcing, seededDeals } from '../data/deals.js';
import { buildValueCreationPlan, figuresBlock, buildReturnsModel, dealGrowth, reconcileFindingText, enforceFigures, canonicalFigures } from '../lib/diligence.js';

test('a sourcing score is the sum of its stated components', () => {
  for (const s of seedSourcing) {
    const r = s.scoreRubric;
    assert.ok(r, `${s.id}: a score with no rubric behind it`);
    const sum = r.components.reduce((a, c) => a + c.points, 0);
    assert.equal(sum, s.score, `${s.id}: the components sum to ${sum} but the headline says ${s.score}`);
    assert.equal(r.total, s.score, `${s.id}: the rubric total disagrees with the headline`);
    for (const c of r.components) {
      assert.ok(c.points <= c.outOf, `${s.id}: ${c.label} scores above its own maximum`);
      assert.ok(c.why && c.why.length > 20, `${s.id}: ${c.label} has no reason against it`);
    }
  }
});

test('a screening score explains itself and the explanation adds up', () => {
  const screen = {
    id: 'test-screen', name: 'Test screen', sector: 'Software', regions: ['Nordics'],
    evMin: 100, evMax: 600, ownership: ['Founder-owned'], keywords: ['saas'],
    revenueMin: 20, ebitdaMin: 10, ebitdaMarginMin: 15, growthMin: 5,
  };
  const company = {
    sector: 'Software', region: 'Nordics', dealSize: 300, ownership: 'Founder-owned',
    keywords: ['saas'], revenue: 90, ebitda: 25, ebitdaMargin: 28, growth: 18,
  };
  const e = explainScreenScore(company, screen);
  assert.equal(e.score, scoreScreen(company, screen).score, 'the explanation is scoring differently from the scorer');
  const earned = e.components.filter((c) => c.applies).reduce((a, c) => a + c.points, 0);
  assert.equal(earned, e.earned, `applicable components sum to ${earned} but earned is ${e.earned}`);
  assert.equal(e.score, Math.round((e.earned / e.available) * 100), 'the score is not the earned share of what was tested');
  assert.match(e.basis, /worth \d+ points/, 'the basis does not say what the score is out of');
  assert.ok(e.components.every((c) => c.label && !/^[a-z]+$/.test(c.label)), 'a component is labelled with its field name');

  // A test the screen never sets must not be scored as a pass. This was awarding full
  // marks for criteria nobody had written, so a sparse screen printed six green ticks
  // against six blank fields.
  const sparse = { id: 's2', name: 'Sparse screen', sector: 'Software' };
  const se = explainScreenScore(company, sparse);
  const untested = se.components.filter((c) => !c.applies);
  assert.ok(untested.length >= 7, `only ${untested.length} criteria recognised as unset on a screen that sets one`);
  for (const c of untested) {
    assert.equal(c.points, 0, `${c.label}: awarded points for a criterion the screen never set`);
    assert.equal(c.met, false, `${c.label}: shown as met on a criterion that was never tested`);
    assert.match(c.note, /sets no criterion/i, `${c.label}: no explanation for the blank`);
  }

  // A criterion the screen DOES set but the company has no figure for scores nothing and
  // says why — it must never be silently treated as a pass or as a fail on merit.
  const blank = { sector: 'Software', region: 'Nordics', dealSize: 300, ownership: 'Founder-owned', keywords: ['saas'] };
  const be = explainScreenScore(blank, screen);
  const missing = be.components.filter((c) => c.applies && !c.hasInput);
  assert.ok(missing.length >= 4, `only ${missing.length} criteria recognised as having no input`);
  for (const c of missing) {
    assert.equal(c.points, 0, `${c.label}: scored on a figure that is not recorded`);
    assert.match(c.note, /not recorded/i, `${c.label}: no explanation for the missing figure`);
  }
  assert.ok(be.score < e.score, 'a company missing every financial figure scores as well as one that has them');

  // A company that misses everything must not quietly score the same as one that hits.
  const miss = { ...company, sector: 'Industrials', region: 'North America', revenue: 1, ebitda: 1, ebitdaMargin: 1, growth: -20, ownership: 'Sponsor-owned', keywords: [] };
  assert.ok(explainScreenScore(miss, screen).score < e.score, 'a candidate that fails every test scores as well as one that passes');
});

test('an LPA concentration row names the denominator its cap is tested on', () => {
  const ov = fundOverview();
  const rows = ov.concentration.bySector;
  assert.ok(rows.length > 1, 'no sector concentration to test');
  for (const r of rows) {
    if (r.limitPct == null) continue;
    assert.equal(r.testedOn, 'committed capital', `${r.name}: does not say which denominator the cap is tested on`);
    assert.match(r.basis, /commitments/i, `${r.name}: the basis does not name commitments`);
    // The status must follow the denominator it claims, not the other one.
    const expected = r.pctOfFund >= r.limitPct ? 'breach' : r.pctOfFund >= r.limitPct * 0.8 ? 'near' : 'ok';
    assert.equal(r.status, expected, `${r.name}: the status does not follow the stated denominator`);
  }
});

test('paid-in capital is on the record so the two multiples reconcile', () => {
  const ov = fundOverview();
  const c = ov.capital;
  assert.ok(c.paidIn > 0, 'no paid-in capital is published');
  assert.equal(Math.round(c.paidIn), Math.round(c.invested + c.feesDrawn), 'paid-in does not equal invested plus fees drawn');
  assert.ok(c.paidIn > c.invested, 'paid-in is not above invested, so the two multiples cannot differ');
  assert.match(c.paidInBasis, /\$/, 'the paid-in bridge prints figures without a currency');
  assert.match(c.paidInBasis, /TVPI/i, 'the bridge does not say which multiple is struck on paid-in');

  // The reason the bridge exists: the multiples are struck on different denominators.
  const p = ov.performance;
  assert.ok(p.tvpi < p.grossMoic, 'TVPI is not below gross MOIC — one of them is on the wrong denominator');
  assert.ok(Math.abs(p.dpi + p.rvpi - p.tvpi) < 0.02, 'DPI plus RVPI does not equal TVPI');

  // The dry-powder tile still has to work; it shares this object.
  assert.ok(c.deployedPct > 0 && c.dryPowder > 0, 'the capital tile lost its original fields');
});

test('a value-creation lever says where its quantum came from', () => {
  for (const d of seededDeals) {
    const p = buildValueCreationPlan(d);
    for (const l of p.levers) {
      assert.match(l.impactBasis, /% of the weight/, `${d.id}/${l.name}: the quantum is asserted without naming its weight`);
      // Three of four levers on one screen closed with the same twelve words, so the
      // caveat is now said once per plan. What every row must still do is describe
      // itself as an allocation rather than as something anybody built up.
      assert.match(l.impactBasis, /not yet sized bottom-up|not sized bottom-up|carved from|Top-down allocation|Carved top-down/i,
        `${d.id}/${l.name}: a top-down carve is presented as though it were built up`);
    }
  }
});

test('the hundred-day plan is not the same two verbs on every deal', () => {
  const openers = new Set();
  let lines = 0;
  for (const d of seededDeals) {
    const p = buildValueCreationPlan(d);
    for (const w of p.hundredDay.slice(1)) {
      for (const f of w.focus) {
        lines += 1;
        openers.add(String(f).split(' ')[0]);
        assert.doesNotMatch(f, /^(Validate|Mobilise):/, `${d.id}: the plan still reads as a template — "${f}"`);
      }
    }
  }
  assert.ok(lines > 40, `only ${lines} plan lines seen — this guard has gone inert`);
  assert.ok(openers.size >= 5, `only ${openers.size} distinct verbs across the whole book`);
});

// THE ASSISTANT MUST NOT DENY THE PRODUCT'S OWN ARITHMETIC.
//
// Asked what the hold costs, the assistant answered "the record does not report total
// interest paid, cash tax paid, maintenance capex, or how much debt is repaid vs
// outstanding at exit" — five figures printed on the returns card two clicks away. The
// cause was the grounding block, which had never carried them. Every agent surface
// composes from figuresBlock, so guarding it guards all three.
test('the grounding block carries what the hold costs', () => {
  let checked = 0;
  for (const d of seededDeals) {
    const block = figuresBlock(d);
    if (!block) continue;
    const r = buildReturnsModel(d);
    const base = (r.scenarios || []).find((s) => /base/i.test(s.name));
    if (!base || base.interestPaid == null) continue;
    checked += 1;
    assert.match(block, /What the hold costs/, `${d.id}: the financing is computed but never handed to the model`);
    assert.match(block, /Debt is priced at [\d.]+%/, `${d.id}: no cost of debt in the grounding block`);
    for (const phrase of ['of interest', 'of cash tax', 'of maintenance capex']) {
      assert.ok(block.includes(phrase), `${d.id}: "${phrase}" missing from the grounding block`);
    }
    assert.match(block, /outstanding at exit/, `${d.id}: debt at exit missing from the grounding block`);
    // The two multiples must be distinguishable, or the model calls the entry multiple
    // leverage — which it did, printing "Leverage (modelled): 14.1x EV/EBITDA".
    assert.match(block, /entry multiple is [\d.]+x/, `${d.id}: no entry multiple stated`);
    assert.match(block, /the leverage [\d.]+x/, `${d.id}: entry multiple and leverage are not separately labelled`);
  }
  assert.ok(checked > 10, `only ${checked} deals had financing to check — this guard has gone inert`);
});

// EVERY DEAL FINANCED AT THE SAME RATE.
//
// Nineteen deals were priced at 9.5% with one 56-word sentence beneath each — a Nordic
// grocer at 2.8x of leverage beside a vertical SaaS asset at 5.8x, financed identically.
// A lender does not do that, and a room notices by the third deal.
test('the paper is priced to the credit, not to a constant', () => {
  const rates = new Map();
  for (const d of seededDeals) {
    const r = buildReturnsModel(d);
    const cod = r.financing?.costOfDebtPct;
    assert.ok(Number.isFinite(cod), `${d.id}: no cost of debt on the returns model`);
    assert.ok(cod >= 8 && cod <= 12, `${d.id}: ${cod}% is outside anything the mid-market has traded at`);
    rates.set(d.id, cod);
  }
  assert.ok(new Set(rates.values()).size >= 6, `only ${new Set(rates.values()).size} distinct rates across the whole book`);

  // And the spread has to be BUILT, not asserted: the sentence must show the base, the
  // leverage adjustment and the sector adjustment adding to the rate quoted.
  for (const d of seededDeals.slice(0, 8)) {
    const basis = buildReturnsModel(d).financing.basis;
    assert.match(basis, /a [\d.]+% reference rate plus a \d+bps spread/, `${d.id}: the spread is asserted, not built`);
    assert.match(basis, /mid-market base/, `${d.id}: the base spread is not named`);
  }

  // More leverage must cost more. Compared across the book this is not a clean
  // relationship — a timber deal at 4.1x is financed more cheaply than a marine one at
  // 3.9x because the sector adjustment is doing the work, and that is correct. The
  // invariant is per credit: hold the business fixed and ask for another turn.
  for (const d of seededDeals.slice(0, 8)) {
    let last = -Infinity;
    for (const turns of [2.5, 3.5, 4.5, 5.5]) {
      const pct = creditSpreadFor(d, turns).pct;
      assert.ok(pct >= last, `${d.id}: asking ${turns}x costs less than the turn below it`);
      last = pct;
    }
    assert.ok(
      creditSpreadFor(d, 5.5).pct > creditSpreadFor(d, 2.5).pct,
      `${d.id}: three extra turns of leverage are priced identically`,
    );
  }
});


// ONE RATE, ONE LEVERAGE, ONE GROWTH RATE PER DEAL.
//
// Pricing the paper per credit was right and its presentation was wrong three ways on the
// tab a partner opens on every deal: the assumptions box still quoted the old constant
// while the card beside it quoted the new rate; the spread was built from the leverage
// REQUESTED rather than the leverage the enterprise-value ceiling actually let the model
// fund; and the growth rate came from an internal field while the Brief printed a
// different one with a source against it.
test('a deal quotes one cost of debt, on the leverage it actually funded', () => {
  for (const d of seededDeals) {
    const r = buildReturnsModel(d);
    const cod = r.financing.costOfDebtPct;

    // Every rate printed anywhere on the returns payload must be this one.
    const surfaces = [r.financing.basis, r.scenarioBasis, ...(r.assumptions || [])].filter(Boolean).join(' ');
    for (const m of surfaces.matchAll(/priced at ([\d.]+)%|debt at ([\d.]+)%/g)) {
      const quoted = Number(m[1] ?? m[2]);
      assert.ok(Math.abs(quoted - cod) < 0.02, `${d.id}: the page quotes ${quoted}% and the model charged ${cod}%`);
    }

    // And the spread must be built on the turns the page says are funded — compared
    // against the STRING the reader sees, not the float behind it. The first version of
    // this compared floats and passed while Aurora printed "5.7x leverage" beside "1.8
    // turns above the 4.0x pivot", which is 5.8x, beside "Modelled at 5.75x EBITDA":
    // three leverage numbers in one paragraph.
    const modelled = /Modelled at ([\d.]+)x/.exec(r.leverageBasis || '');
    if (modelled) {
      assert.equal(
        modelled[1],
        String(parseFloat(String(r.entry.leverage))),
        `${d.id}: "Modelled at ${modelled[1]}x" beside a headline of ${r.entry.leverage}`,
      );
    }
    // And the spread must be built on the turns the page says are funded.
    const funded = parseFloat(String(r.entry.leverage));
    const m = /([\d.]+) turns? (above|below) the ([\d.]+)x pivot/.exec(r.financing.basis);
    if (m && Number.isFinite(funded)) {
      const delta = Number(m[1]);
      const pivot = Number(m[3]);
      const expected = Math.abs(funded - pivot);
      assert.ok(
        Math.abs(delta - expected) < 0.15,
        `${d.id}: funds ${funded}x but is priced ${delta} turns ${m[2]} the ${pivot}x pivot`,
      );
      assert.equal(
        m[2],
        funded >= pivot ? 'above' : 'below',
        `${d.id}: funds ${funded}x against a ${pivot}x pivot and the sentence says ${m[2]}`,
      );
    }
  }
});

test('the growth the model underwrites is the growth the brief prints', () => {
  let checked = 0;
  for (const d of seededDeals) {
    const kf = (d.keyFigures || []).find((k) => /^growth/i.test(k.label));
    if (!kf) continue;
    checked += 1;
    const shown = Number(String(kf.value).replace(/[^0-9.]/g, ''));
    assert.equal(dealGrowth(d), shown, `${d.id}: the brief prints ${shown}% and the model underwrites ${dealGrowth(d)}%`);
  }
  assert.ok(checked > 8, `only ${checked} deals record a growth figure — this guard has gone inert`);
});

test('a margin is only called the sector\'s when the company has nothing to strike one on', () => {
  for (const d of seededDeals) {
    const basis = buildReturnsModel(d).growthBasis || '';
    if (!/is the sector's margin/.test(basis)) continue;
    const hasRevenue = (d.keyFigures || []).some((k) => /revenue|turnover/i.test(k.label));
    const hasMargin = (d.keyFigures || []).some((k) => /margin/i.test(k.label));
    assert.ok(
      !hasRevenue && !hasMargin,
      `${d.id}: disowns its margin as the sector's while its own record carries ${hasRevenue ? 'a revenue' : 'a margin'}`,
    );
  }
});

// A FOLLOW-UP THE DESK CANNOT MINE IS NOT A FOLLOW-UP.
//
// Widening the phrasing pool once produced eight variants with no first-person promise
// verb in them. They rendered as channel messages and never reached "what's outstanding",
// so the variety was bought by quietly deleting the feature. Every phrasing has to carry
// a promise, a delivery verb and a date — which is also how people actually write these.
test('every commitment phrasing survives the detector', () => {
  let promises = 0;
  let mined = 0;
  for (const d of seededDeals) {
    const msgs = corpusForDeal(d).channel?.messages || [];
    promises += msgs.filter((m) => /\bI'll\b|\bI will\b|\bI've\b|happy to|let me/i.test(m.preview || '')).length;
    mined += detectCommitments(msgs, { source: 'Teams' }).length;
  }
  assert.ok(promises > 8, `only ${promises} promise messages across the book — this guard has gone inert`);
  assert.ok(mined >= promises, `${promises} messages read as promises and only ${mined} were mined into follow-ups`);
});

// The same opening on four cards told a reader the book was generated. Openings are
// keyed on the deal AND the lane, so two lanes on one deal cannot collide either.
test('the follow-up book does not repeat one opening', () => {
  const openings = new Map();
  let total = 0;
  for (const d of seededDeals) {
    for (const m of corpusForDeal(d).channel?.messages || []) {
      const p = String(m.preview || '');
      if (!/\bI'll\b|\bI will\b|\bI've\b|happy to|let me/i.test(p)) continue;
      total += 1;
      const open = p.split(/\s+/).slice(0, 5).join(' ').toLowerCase();
      openings.set(open, (openings.get(open) || 0) + 1);
    }
  }
  assert.ok(total > 8, `only ${total} follow-ups seen — this guard has gone inert`);
  for (const [open, n] of openings) {
    assert.ok(n <= 2, `"${open}..." opens ${n} of the ${total} follow-ups in the book`);
  }
});

// ARITHMETIC A READER DOES BY EYE MUST LAND.
//
// The bridge said "EBITDA goes from $47M to $96M; at 15.3x that is worth $743M" and
// 49 x 15.3 is 750. The bar carries a reconciliation to the equity gain that the sentence
// never mentioned. Every figure a sentence invites you to multiply or divide has to be
// the figure it was derived from.
test('every stated derivation works on the figures it prints', () => {
  let checked = 0;
  for (const d of seededDeals) {
    const bar = (buildValueCreationPlan(d).valueBridge || []).find((b) => /EBITDA growth/.test(b.source));
    if (!bar) continue;
    checked += 1;
    const m = /from \$([\d.]+)M to \$([\d.]+)M .*? of ([\d.]+)x that is \$([\d,]+)M/.exec(bar.basis);
    assert.ok(m, `${d.id}: the growth bar states no derivation`);
    const implied = (Number(m[2]) - Number(m[1])) * Number(m[3]);
    const stated = Number(m[4].replace(/,/g, ''));
    assert.ok(Math.abs(implied - stated) <= 1, `${d.id}: the page says ${stated} and its own figures give ${implied.toFixed(0)}`);
    // Where the bar differs from that derivation, the sentence must say why.
    const visible = Math.max(2, Math.abs(bar.value) * 0.01);
    if (Math.abs(Math.abs(bar.value) - stated) > visible) {
      assert.match(bar.basis, /reconciled to/i, `${d.id}: the bar is ${bar.value} and the sentence derives ${stated} without explaining the gap`);
    }
  }
  assert.ok(checked > 10, `only ${checked} bridges checked — this guard has gone inert`);
});

// A LANE CLOSED AT COMMITTEE IS NOT A LANE NOBODY OPENED.
//
// The channel said "Legal DD is still at zero. Give me the folder and an owner" on a deal
// whose own narrative said four lanes closed at IC, two clicks from the Legal DD report
// in Papers. The progress field is 0 because nobody kept it after committee.
test('a lane closed at committee is never described as unstarted', () => {
  const base = seededDeals.find((d) => (d.workstreams || []).length >= 3);
  const deal = JSON.parse(JSON.stringify(base));
  const w = deal.workstreams[0];
  w.status = 'closed_at_ic';
  w.progress = 0;
  w.findings = [];
  const label = laneLabel(w.lane);
  const text = (corpusForDeal(deal).channel?.messages || []).map((m) => m.preview || '').join(' ');
  assert.ok(text.includes(label), `the channel says nothing about ${label} at all`);
  for (const phrase of ['still at zero', 'has not started', 'is not open yet', 'no work done', 'no work has begun', 'unstarted']) {
    assert.ok(
      !new RegExp(`${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[^.]{0,60}${phrase}`, 'i').test(text),
      `${label} closed at committee and the channel calls it "${phrase}"`,
    );
  }
  // And it must say what IS true, so a reader is not left with silence either.
  assert.match(text, /closed at committee|signed off at IC|records gap|closed\./i, 'a lane closed at committee is not described at all');
});


// A DELTA IS NOT A LEVEL.
//
// The figure guard re-anchored "would raise the entry multiple by roughly 0.7x" to the
// entry multiple itself, so the assistant quoted the register as saying "raise the entry
// multiple by roughly 14.1x against the recorded entry multiple of 14.1x" — in quotation
// marks, three runs out of three, on the question the room actually asks.
test('a stated shift is never rewritten as the level it shifts from', () => {
  for (const d of seededDeals) {
    const entry = canonicalFigures(d)?.entryMultiple;
    if (entry == null) continue;
    const cases = [
      `Expensing them would raise the entry multiple by roughly 0.7x against the figure on the returns page.`,
      `A $3.0M adjustment moves the entry multiple from 9.4x to 10.1x.`,
    ];
    for (const raw of cases) {
      const out = enforceFigures(reconcileFindingText(raw, d), d);
      const shift = /by roughly ([\d.]+)x/.exec(out);
      if (!shift) continue;
      assert.notEqual(
        Number(shift[1]),
        entry,
        `${d.id}: a shift is stated as ${shift[1]}x, which is the entry multiple itself`,
      );
      assert.ok(Number(shift[1]) < entry, `${d.id}: a shift of ${shift[1]}x is not smaller than the ${entry}x it shifts`);
    }
  }
});

// The bridge chart has two bars. The sentence explaining the reconciliation said three.
test('the bridge prose does not assert a bar count', () => {
  for (const d of seededDeals) {
    const p = buildValueCreationPlan(d);
    for (const b of p.valueBridge || []) {
      assert.doesNotMatch(String(b.basis || ''), /\b(two|three|four|\d+) bars\b/i, `${d.id}: the bridge counts its own bars in prose (there are ${p.valueBridge.length})`);
    }
  }
});

// THE BADGE AND THE SENTENCE ARE ONE FACT.
//
// A row was labelled "Deal-stopper" because its text matched a regulatory pattern, while
// the sentence eight inches below counted only what the register graded — so the page
// carried a Deal-stopper chip above "nothing on this deal is named as a thing that could
// kill it". Both directions of that mismatch have shipped; grade once.
test('the killers sentence counts exactly what the badges say', () => {
  const FATAL = new Set(['stopper']);
  for (const d of seededDeals) {
    const c = buildDealCase(d);
    const badged = (c.againstIt || []).filter((r) => /deal-stopper/i.test(String(r.severityLabel || '')) || FATAL.has(String(r.severity || '').toLowerCase()));
    const note = c.outstandingNote || '';
    const m = /(\d+) of the rows listed under what could kill it|One of the rows listed under what could kill it|None of the \d+ rows? listed under what could kill it|The single row listed under what could kill it is not graded a deal-stopper|Nothing is listed under what could kill it/.exec(note);
    assert.ok(m, `${d.id}: the outstanding note never states a killer count`);
    const onRegister = m[1] ? Number(m[1]) : (/^One of the rows/.test(m[0]) ? 1 : 0);
    // A row this paper raises is fatal too, and the sentence names it separately.
    const badgedFatal = (c.againstIt || []).filter((r) => FATAL.has(String(r.severity || '').toLowerCase())).length;
    if (!onRegister && badgedFatal) { assert.match(note, /graded/, `${d.id}: fatal rows are not enumerated`); continue; }
    const extra = /(\d+) more are raised by this paper/.exec(note);
    const stated = onRegister + (extra ? Number(extra[1]) : (/one more is raised by this paper/.test(note) ? 1 : 0));
    assert.equal(stated, badged.length, `${d.id}: ${badged.length} rows are graded fatal and the sentence says ${stated}`);
    // And a row must never wear a harder label than its own severity.
    for (const r of c.againstIt || []) {
      if (/deal-stopper/i.test(String(r.severityLabel || ''))) {
        assert.ok(FATAL.has(String(r.severity || '').toLowerCase()), `${d.id}: a row labelled Deal-stopper is graded ${r.severity}`);
      }
    }
  }
});

// A GAP THE RECORD DISPROVES IS WORSE THAN NO GAP LIST.
//
// Papers listed "Workstream owners assigned" and "Tech / AI findings" as not yet
// produced on a deal whose Brief names four owners and whose case page quotes a recorded
// Tech/AI finding. The detector matched artefact names against the data room only, so
// anything that is a STATE rather than a FILE always read as missing.
test('the papers desk never reports a gap the deal record fills', () => {
  let checked = 0;
  for (const d of seededDeals) {
    const desk = buildDocumentDesk(d, {});
    for (const g of desk.gaps || []) {
      checked += 1;
      const a = String(g.artefact || '').toLowerCase();
      const lanes = d.workstreams || [];
      if (/owner|assign/.test(a) && lanes.length) {
        assert.ok(!lanes.every((w) => w.owner), `${d.id}: says owners are unassigned and every workstream has one`);
      }
      if (/workspace|teams|sharepoint|data ?room/.test(a)) {
        assert.ok(!(d.teamsChannel || d.dataRoomUrl || d.dataRoomSeeded), `${d.id}: says the workspace is missing and the record carries one`);
      }
      if (/tech|ai/.test(a) && /finding/.test(a)) {
        assert.ok(!lanes.some((w) => w.lane === 'techai' && (w.findings || []).length), `${d.id}: says Tech/AI findings are missing and the lane has them`);
      }
    }
  }
  assert.ok(checked > 0, 'no deal reported a gap — this guard has gone inert');
});

// The brief printed the top attention card's title, reason AND consequence directly
// above the same card, and the clock paragraph repeated the whole gating list a third
// time. Six copies of two facts above the fold on the first screen of the demo.
test('the briefing points at the attention cards rather than reprinting them', () => {
  let checked = 0;
  for (const d of seededDeals) {
    const c = buildCockpit(d, computeICReadiness(d), { role: 'partner' });
    const top = (c.attention || [])[0];
    if (!top) continue;
    checked += 1;
    const prose = (c.briefing?.paragraphs || c.briefing || []).map((p) => (typeof p === 'string' ? p : p.text)).join(' ');
    if (top.why && top.why.length > 40) {
      assert.ok(!prose.includes(top.why), `${d.id}: the briefing reprints the top card's reason verbatim`);
    }
    if (top.impact && top.impact.length > 40) {
      assert.ok(!prose.includes(top.impact), `${d.id}: the briefing reprints the top card's consequence verbatim`);
    }
  }
  assert.ok(checked > 8, `only ${checked} deals compared — this guard has gone inert`);
});

// TWO UNRELATED DEALS CANNOT PRICE IDENTICALLY, BECAUSE THERE IS A COMPARE SCREEN.
//
// A Swiss diagnostics business and a listed payments processor both published 13.3x, and
// a Nordic grocer and a packaging carve-out both published 8.4x — an artefact of deriving
// EBITDA from enterprise value over a sector multiple, which lands the ratio on the same
// number. "Why do those two price the same?" has no answer on screen.
test('no two deals publish the same entry multiple', () => {
  const seen = new Map();
  for (const d of seededDeals) {
    const kf = (d.keyFigures || []).find((k) => /entry multiple/i.test(k.label));
    if (!kf) continue;
    const v = String(kf.value).trim();
    if (!seen.has(v)) seen.set(v, []);
    seen.get(v).push(d.id);
  }
  assert.ok(seen.size > 10, `only ${seen.size} deals publish a multiple — this guard has gone inert`);
  for (const [v, ids] of seen) {
    assert.equal(ids.length, 1, `${ids.join(' and ')} both publish ${v}`);
  }
});

// And each published multiple must be the enterprise value over the EBITDA printed
// beside it, or separating them just moved the problem.
test('a published entry multiple is the figures printed beside it', () => {
  const num = (s) => { const v = Number(String(s).replace(/[^0-9.]/g, '')); return /b\b/i.test(String(s)) ? v * 1000 : v; };
  let checked = 0;
  for (const d of seededDeals) {
    const mu = (d.keyFigures || []).find((k) => /entry multiple/i.test(k.label));
    const eb = (d.keyFigures || []).find((k) => /^EBITDA \(LTM\)/i.test(k.label));
    if (!mu || !eb) continue;
    checked += 1;
    const implied = d.dealSize / num(eb.value);
    assert.ok(Math.abs(implied - num(mu.value)) <= 0.06,
      `${d.id}: publishes ${mu.value} over ${d.dealSize} on ${eb.value}, which is ${implied.toFixed(1)}x`);
  }
  assert.ok(checked > 10, `only ${checked} deals checked — this guard has gone inert`);
});

// TWO SURFACES, ONE ANSWER.
//
// The sourcing audit was computed twice: the Analysis tab published a green 100 while
// the case tab two clicks away said "No score — the figures cannot be relied on", on the
// same deal. Every round of review found another pair like this, so the rule is now a
// test: where two screens answer one question, they read from one composer.
test('the sourcing audit gives one answer, not one per screen', () => {
  let checked = 0;
  for (const d of seededDeals) {
    const api = validateCitations(d);
    const kase = buildDealCase(d).citations;
    checked += 1;
    assert.equal(
      api.score == null,
      kase.score == null,
      `${d.id}: the audit endpoint ${api.score == null ? 'withholds' : `publishes ${api.score}`} and the case tab ${kase.score == null ? 'withholds' : `publishes ${kase.score}`}`,
    );
    assert.equal(api.clean === true, api.score != null, `${d.id}: reports clean=${api.clean} beside a ${api.score == null ? 'withheld' : 'published'} score`);
    // And the prose must not contradict the counters it sits beside.
    if (/Every claim tested traces to a source/.test(api.summary || '')) {
      assert.equal(api.sourcedClaims, api.totalClaims,
        `${d.id}: says every claim traces to a source with ${api.sourcedClaims} of ${api.totalClaims} sourced`);
    }
  }
  assert.ok(checked > 10, `only ${checked} deals compared — this guard has gone inert`);
});

// The value-creation plan multiplies the same EBITDA the case page calls unusable out
// over five years, and carried no caveat while the returns card beside it did.
test('a plan built on an unevidenced figure carries the same caveat the returns do', () => {
  let flagged = 0;
  for (const d of seededDeals) {
    const r = buildReturnsModel(d);
    const p = buildValueCreationPlan(d);
    assert.equal(!!p.indicative, !!r.indicative, `${d.id}: the returns say indicative=${!!r.indicative} and the plan says ${!!p.indicative}`);
    if (r.indicative) { flagged += 1; assert.ok(p.indicativeNote, `${d.id}: flagged indicative with nothing said`); }
  }
  assert.ok(flagged > 0, 'no deal is indicative — this guard has gone inert');
});

// A count on screen has to count the thing it names. The brief counted GATING SENTENCES
// and called them things, so a deal whose one gating line reads "4 required items
// outstanding" was summarised as "1 thing outstanding" directly above it.
test('the brief never puts a number on a population it has not counted', () => {
  let checked = 0;
  for (const d of seededDeals) {
    const c = buildCockpit(d, computeICReadiness(d), { role: 'partner' });
    const prose = (c.briefing?.paragraphs || c.briefing || []).map((p) => (typeof p === 'string' ? p : p.text)).join(' ');
    checked += 1;
    assert.doesNotMatch(prose, /\b\d+ things? outstanding\b/i, `${d.id}: the briefing counts things it has not counted`);
  }
  assert.ok(checked > 10, `only ${checked} deals checked — this guard has gone inert`);
});

// ONE DEAL, ONE CURRENCY, ON EVERY SCREEN.
//
// The same QoE sentence read "$4.1M of ARR" in the risk register and "EUR 4.1M of ARR"
// on Papers, two clicks apart, on a deal whose header chip says USD. Each surface that
// quotes recorded text has to quote it through the same normaliser, so the guard covers
// all of them rather than the one that was reported.
test('no surface quotes a deal in a currency the deal is not denominated in', () => {
  const FOREIGN = /\b(EUR|GBP|USD|CHF|SEK|NOK|DKK)\s?[\d.]/g;
  let checked = 0;
  for (const d of seededDeals) {
    const own = d.currency || 'USD';
    const surfaces = {
      'the case': buildDealCase(d),
      'papers': buildDocumentDesk(d, {}),
      'the risk register': buildRiskRegister(d),
      'the value plan': buildValueCreationPlan(d),
    };
    for (const [name, payload] of Object.entries(surfaces)) {
      checked += 1;
      const found = [...new Set([...JSON.stringify(payload).matchAll(FOREIGN)].map((m) => m[1]))].filter((c) => c !== own);
      assert.deepEqual(found, [],
        `${d.id} is denominated in ${own} and ${name} quotes ${found.join('/')}`);
    }
  }
  assert.ok(checked > 40, `only ${checked} surfaces checked — this guard has gone inert`);
});

// THE LANDING SCREEN CANNOT READ AS ONE TEMPLATE RUN THIRTEEN TIMES.
//
// Five of thirteen rows opened on one of two verbatim clauses, and one lane's name and
// owner -- "ESG / Environmental (Rachel Nguyen) -- not started" -- appeared in six of
// them. The reader needs the fact once and a count after that.
test('the attention queue does not repeat an opening clause or a lane', () => {
  for (const who of ['partner', 'analyst', 'legal-gc', 'fund-cfo', 'deal-team']) {
    const hd = buildHomeDesk(seededDeals.map((d) => ({ ...d, accessLevel: 'full' })), {
      role: who,
      rawFor: (d) => seededDeals.find((x) => x.id === d.id) || d,
    });
    const rows = hd.attention || [];
    if (rows.length < 4) continue;
    const heads = new Map();
    const lanes = new Map();
    for (const r of rows) {
      const why = String(r.why || '');
      const head = why.split(';')[0].trim();
      if (head.length > 25) heads.set(head, (heads.get(head) || 0) + 1);
      for (const m of why.matchAll(/([A-Z][\w &/]+) \(([^)]+)\) — /g)) lanes.set(m[0], (lanes.get(m[0]) || 0) + 1);
      assert.doesNotMatch(why, /\b1 workstreams\b/, `${who}: "1 workstreams" on ${r.company}`);
    }
    for (const [h, n] of heads) assert.ok(n <= 2, `${who}: ${n} rows open with "${h.slice(0, 55)}"`);
    for (const [l, n] of lanes) assert.ok(n <= 2, `${who}: "${l.trim()}" appears in ${n} rows`);
  }
});

// One critical path per deal. The blocking row already names the lane to start with; a
// second card crowned the slowest in-flight lane, which is a different population, and on
// four deals the two named different lanes on adjacent cards.
test('a deal names one critical path, not two', () => {
  let checked = 0;
  for (const d of seededDeals) {
    const c = buildCockpit(d, computeICReadiness(d), { role: 'partner' });
    const rows = c.attention || [];
    const crowned = rows.find((a) => /is the critical path/.test(String(a.title || '')));
    const startWith = rows.find((a) => /^Start with /.test(String(a.impact || '')));
    checked += 1;
    assert.ok(!(crowned && startWith), `${d.id}: crowns ${crowned?.title} while another card says ${startWith?.impact}`);
  }
  assert.ok(checked > 10, `only ${checked} deals checked — this guard has gone inert`);
});

// The readiness board states the entry multiple, and it is the screen a partner
// photographs. Where the case and the returns caveat that multiple, so must it.
test('the readiness board caveats a price the rest of the product caveats', () => {
  let flagged = 0;
  for (const d of seededDeals) {
    const r = buildReturnsModel(d);
    const ask = computeICReadiness(d).icAsk;
    if (!r.indicative) continue;
    flagged += 1;
    assert.ok(ask.caveat, `${d.id}: the returns are indicative and the readiness board states the multiple flat`);
  }
  assert.ok(flagged > 0, 'no deal is indicative — this guard has gone inert');
});

// A DOCUMENT PANEL THAT NAMES A WORKSTREAM MUST FIND IT.
//
// The classifier emitted lane keys the workstreams do not use -- 'operational' against a
// lane called 'operations', 'tech' against 'techai' -- so the lookup missed while
// laneLabel still confidently printed "Operations DD" over an empty panel. And the
// company's own name was matched as a keyword: "Atlas Cold Chain Logistics -- Information
// Memorandum.pdf" was filed under Operations because the company is called Logistics.
test('a document is filed under a lane the deal actually has', () => {
  const lanesInUse = new Set(seededDeals.flatMap((d) => (d.workstreams || []).map((w) => w.lane)));
  const papers = ['Information Memorandum.pdf', 'Quality of Earnings.pdf', 'Legal DD Report.pdf',
    'Operations & Supply Risk Memo.docx', 'AI & Data Readiness Scorecard.xlsx', 'Tax Structuring Paper.pdf'];
  let checked = 0;
  for (const d of seededDeals) {
    for (const p of papers) {
      const b = documentBrief({ name: `${d.company} — ${p}` }, d);
      checked += 1;
      if (!b.lane) {
        assert.ok(b.unattributedNote, `${d.id}/${p}: no lane and nothing said about why`);
        continue;
      }
      assert.ok(lanesInUse.has(b.lane), `${d.id}/${p}: filed under "${b.lane}", which is not a lane any deal has`);
      const has = (d.workstreams || []).some((w) => w.lane === b.lane);
      assert.ok(has || b.unattributedNote, `${d.id}/${p}: names ${b.laneName} and the deal has no such workstream`);
    }
  }
  assert.ok(checked > 80, `only ${checked} papers checked — this guard has gone inert`);
});

// The information memorandum is the seller's; no workstream produces it. Filing it under
// one because the company is called "Logistics" sends a reader to the wrong colleague.
test('the company name is not read as a workstream keyword', () => {
  for (const d of seededDeals) {
    const b = documentBrief({ name: `${d.company} — Information Memorandum.pdf` }, d);
    assert.equal(b.lane, null, `${d.id}: the IM was filed under ${b.laneName}`);
  }
});

// ONE PAPER, ONE ROW.
//
// Merging the deal's own document list into the Papers desk deduplicated on the exact
// filename, so "Quality of Earnings.pdf" and "Atlas Cold Chain Logistics — Quality of
// Earnings (Draft).pdf" both listed, returning byte-identical briefs.
test('the papers desk lists each paper once', () => {
  const key = (n) => String(n).split('—').pop()
    .replace(/\([^)]*\)/g, '')
    .replace(/\bv\d+\b|\bdraft\b|\bfinal\b|\bapproved\b|\bconfidential\b/gi, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
  let checked = 0;
  for (const d of seededDeals) {
    const desk = buildDocumentDesk(d, { files: (corpusForDeal(d).files || []) });
    const seen = new Map();
    for (const doc of desk.docs || []) {
      checked += 1;
      const k = key(doc.name);
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    for (const [k, n] of seen) assert.equal(n, 1, `${d.id}: "${k}" is listed ${n} times`);
  }
  assert.ok(checked > 40, `only ${checked} papers checked — this guard has gone inert`);
});

// And every document the sourcing audit cites has to be findable on the Papers tab.
test('a cited document is on the papers tab', () => {
  let cited = 0;
  for (const d of seededDeals) {
    const rows = buildDocumentDesk(d, { files: (corpusForDeal(d).files || []) }).docs || [];
    const names = rows.flatMap((x) => [String(x.name), String(x.recordName || '')]);
    for (const c of validateCitations(d).documents || []) {
      cited += 1;
      assert.ok(names.some((n) => n.includes(c)), `${d.id}: the audit cites "${c}" and Papers does not list it`);
    }
  }
  assert.ok(cited > 8, `only ${cited} citations checked — this guard has gone inert`);
});

// THE ASSISTANT MUST NOT PRINT ITS OWN SCAFFOLDING.
//
// The model echoed the instruction to quote the record as a literal "(quote)" tag -- up
// to nine times in one answer -- and opened replies with "Final answer:". Spelling the
// readiness enum out in lower case with no sentence-initial handling then produced
// answers that began mid-sentence: "not ready for committee: the board records...".
test('house style strips scaffolding and opens a sentence properly', () => {
  const cases = [
    'Committee-readiness status (quote): NOT-READY — 4 required items outstanding.',
    'Final answer: the deal is IC-READY.',
    'Answer: not ready for committee.',
    'not ready for committee: the board records three failures.',
    '- not ready for committee because outputs are incomplete.',
    'Status (verbatim) is IC-READY.',
  ];
  for (const c of cases) {
    const out = houseStyle(c);
    assert.doesNotMatch(out, /\((?:quote|verbatim|from the record|source)\)/i, `scaffolding survived: ${out}`);
    assert.doesNotMatch(out, /^\s*(?:final answer|answer)\s*:/i, `label survived: ${out}`);
    assert.doesNotMatch(out, /\s[:;,.!?]/, `space before punctuation: ${out}`);
    assert.match(out, /^[A-Z\-*•>]/, `opens in lower case: ${out}`);
  }

  // And it must leave ordinary prose alone.
  const plain = 'The entry multiple is 14.1x; the hurdle is 20%.';
  assert.equal(houseStyle(plain), plain, 'house style rewrote a sentence that was already fine');
});

// THE MODEL MUST NOT BE THE ONE COUNTING, AND MUST NOT BE GIVEN A CHOICE.
//
// Asked the same question three times the assistant answered nine, then eight, then
// one. Handing it four populations did not fix it -- it picked a different one each
// time, and once closed on a number no screen shows. Then, given ONE number written as
// "THE ANSWER IS 9.", it put that sentence in quotation marks and attributed it to the
// returns page. So: one field, and nothing in the data half that reads like prose.
test('the grounding block gives one outstanding number, and it is the case page\'s', () => {
  let checked = 0;
  for (const d of seededDeals) {
    const block = figuresBlock(d);
    if (!block || !/How many things are outstanding/.test(block)) continue;
    checked += 1;
    const kase = buildDealCase(d);
    const n = kase.outstanding.length;
    const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
    assert.match(block, new RegExp(`The answer is ${WORDS[n] || n}\\.`), `${d.id}: the block does not carry the case page's count`);
    assert.equal((block.match(/The answer is /g) || []).length, 1, `${d.id}: more than one count offered`);
    assert.match(block, /Give that number and no other/, `${d.id}: the model is not told to stick to it`);
    assert.match(block, /Do not count the items yourself/, `${d.id}: nothing forbids the model deriving its own count`);
    assert.match(block, /do not add any two of these numbers together/, `${d.id}: nothing forbids summing`);
    assert.match(block, /never the answer to "how many things are outstanding"/, `${d.id}: the register total is not fenced off`);
    // The page's own sentence is handed over, so there is something correct to quote.
    if (n) {
      const opener = String(kase.outstandingNote || '').split('. ')[0];
      assert.ok(opener.includes(String(n)), `${d.id}: the page's own opener does not carry the count`);
      assert.ok(block.includes(`"${opener}"`), `${d.id}: the quotable page sentence is not supplied`);
      assert.doesNotMatch(block, /THE CASE/, `${d.id}: a shouted screen name is handed to the model`);
    }
    // AND NO MACHINE TOKEN. `outstanding_count=12` was pasted straight into an answer,
    // in quotation marks, against a screen that has never shown it.
    assert.doesNotMatch(block, /^[a-z][a-z0-9_]*=/m, `${d.id}: a machine token is still being handed to the model`);
    // A DIRECTIVE IS NOT A QUOTATION. Every earlier wording of this block was quoted at
    // a partner verbatim and attributed to a page one click away.
    assert.match(block, /Never present one as a quotation/, `${d.id}: the block does not disclaim itself as page text`);
    assert.match(block, /the screen is right/, `${d.id}: the model is not told the screen wins`);
    // The list is one granularity. An aggregate row in it ('4 required items
    // outstanding: ...') makes the count disagree with the list it sits above.
    for (const row of kase.outstanding) {
      // Any row that OPENS with a number is a count of things rather than a thing. The
      // first version of this named the two aggregates it knew about and duly missed
      // "1 unresolved risk-level issue", which is a pure count with no row behind it.
      assert.doesNotMatch(row.text, /^\d+\s/, `${d.id}: an aggregate is in the outstanding list — "${row.text.slice(0, 60)}"`);
    }
    const board = kase.outstanding.filter((r) => r.from === 'committee readiness').length;
    const reg = kase.outstanding.filter((r) => r.from === 'risk register').length;
    assert.equal(board + reg, n, `${d.id}: the breakdown does not account for every row`);
  }
  assert.ok(checked > 10, `only ${checked} deals carried counts — this guard has gone inert`);
});
