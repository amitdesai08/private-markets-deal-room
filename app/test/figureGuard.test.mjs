// The assistant told a partner the entry multiple on a deal was 9.4x when that deal's
// own Returns, plan & risk page says 8.3x. Her verdict: "That is a memo going to a
// committee with a wrong number in it." The prompt asks the model to quote the record;
// this is the check that makes it true rather than likely.
//
// The first version of the guard was itself a bug: it captured a number, then did a
// plain string replace of that number inside the matched text. The regex engine had
// backtracked into the middle of "22.5", matched "2.5", and the replace found "2.5"
// inside "22.5" -- so a correct 22.5% IRR came out as 222.5%. A guard that corrupts
// the figure it is guarding is worse than no guard, so the regression is pinned here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalFigures, enforceFigures, figuresBlock } from '../lib/diligence.js';
import { seededDeals } from '../data/deals.js';

function anyDeal() {
  const d = seededDeals.find((x) => {
    const c = canonicalFigures(x);
    return c && c.entryMultiple && c.irr != null && c.moic != null;
  });
  assert.ok(d, 'expected at least one seeded deal to carry figures');
  return d;
}

test('canonicalFigures returns one value per figure, from the returns model', () => {
  const c = canonicalFigures(anyDeal());
  assert.ok(c, 'expected figures');
  for (const k of ['entryMultiple', 'irr', 'moic', 'ebitda', 'revenue', 'currencyCode']) {
    assert.ok(c[k] != null, `expected ${k}`);
  }
});

test('a correct figure is left exactly as written', () => {
  const deal = anyDeal();
  const c = canonicalFigures(deal);
  const md = `Base case ${c.irr}% IRR, ${c.moic}x MOIC, entry at ${c.entryMultiple}x EV/EBITDA.`;
  assert.equal(enforceFigures(md, deal), md);
});

test('22.5% IRR does not become 222.5% (the guard must not corrupt a correct figure)', () => {
  const deal = anyDeal();
  const c = canonicalFigures(deal);
  const md = `Returns page: Entry multiple ${c.entryMultiple}x EV/EBITDA; Leverage ${c.leverage}; Base case ${c.irr}% IRR, ${c.moic}x MOIC.`;
  const out = enforceFigures(md, deal);
  assert.equal(out, md);
  assert.ok(!/\d{3,}\.\d%/.test(out), `a three-digit IRR appeared: ${out}`);
});

test('an entry multiple that disagrees with the record is corrected', () => {
  const deal = anyDeal();
  const c = canonicalFigures(deal);
  const wrong = +(c.entryMultiple + 1.1).toFixed(1);
  const out = enforceFigures(`We are paying ${wrong}x EV/EBITDA for this business.`, deal);
  assert.match(out, new RegExp(`${String(c.entryMultiple).replace('.', '\\.')}\\s*x`));
  assert.ok(!out.includes(`${wrong}x`), `the wrong multiple survived: ${out}`);
});

test('an IRR and a MOIC that disagree with the record are corrected', () => {
  const deal = anyDeal();
  const c = canonicalFigures(deal);
  const badIrr = Math.round(c.irr) + 7;
  const badMoic = +(c.moic + 0.6).toFixed(2);
  const out = enforceFigures(`Base case ${badIrr}% IRR and ${badMoic}x MOIC.`, deal);
  assert.ok(!out.includes(`${badIrr}%`), `the wrong IRR survived: ${out}`);
  assert.ok(!out.includes(`${badMoic}x`), `the wrong MOIC survived: ${out}`);
});

test('a figure the guard does not own is never touched', () => {
  const deal = anyDeal();
  const md = 'Top-customer concentration is 31% of revenue and the NWC peg is $34M.';
  assert.equal(enforceFigures(md, deal), md);
});

// A rule that reaches too far is the same fault as no rule: the partner still gets a
// wrong number, and now the product put it there. "...MOIC, entry at 5.5x EV/EBITDA"
// once matched as MOIC-then-5.5 and overwrote the entry multiple with the MOIC.
test('one figure is never rewritten with another figure standing next to it', () => {
  const deal = anyDeal();
  const c = canonicalFigures(deal);
  const md = `Base case ${c.irr}% IRR, ${c.moic}x MOIC, entry at ${c.entryMultiple}x EV/EBITDA, leverage ${c.leverage}.`;
  assert.equal(enforceFigures(md, deal), md);
});

test('the figures block states the record as the answer, not as background', () => {
  const deal = anyDeal();
  const c = canonicalFigures(deal);
  const block = figuresBlock(deal);
  assert.match(block, /AUTHORITATIVE FIGURES/);
  assert.ok(block.includes(`${c.entryMultiple}x EV/EBITDA`));
  assert.ok(block.includes(`${c.irr}% IRR`));
  assert.ok(block.includes(`${c.moic}x MOIC`));
  assert.ok(block.includes(c.currencyCode));
});

// Compare deals put two companies side by side with no entry multiple, no leverage and
// no return on either -- "the three things I would actually compare on", as the partner
// put it. Every deal on the seed has to be able to answer them.
test('every seeded deal can state its own figures', () => {
  const missing = seededDeals
    .map((d) => ({ id: d.id, c: canonicalFigures(d) }))
    .filter((x) => !x.c || !x.c.entryMultiple || x.c.irr == null || x.c.moic == null || !x.c.currencyCode)
    .map((x) => x.id);
  assert.deepEqual(missing, [], `deals with no figures: ${missing.join(', ')}`);
});
