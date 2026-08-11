// THE BOOK HAS TO PRICE LIKE A BOOK.
//
// Nine of nineteen deals priced between 3.7x and 6.8x EBITDA — a listed payments processor
// at 3.7x, a specialty chemicals carve-out at 4.3x. Those are distressed prints, and a room
// of private-equity buyers does that division in their heads on the first screen. A vertical
// SaaS business carried a 6.9% EBITDA margin against a sector that earns 36%.
//
// The figures now come from lib/benchmarks.js, which derives them from published sector
// data (Damodaran, January 2026) anchored to mid-market buyout pricing. These tests hold
// the result inside the band a practitioner would recognise, and — more importantly — hold
// the three figures consistent with each other, because the failure that cost the most was
// never a single wrong number. It was EV, EBITDA and the multiple disagreeing on one page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededDeals } from '../data/deals.js';
import { canonicalFigures, buildReturnsModel, statedMultipleOf } from '../lib/diligence.js';
import { sectorEntryMultiple, sectorMargin, MULTIPLE_FLOOR, MULTIPLE_CEILING, underwrittenEbitdaCagr } from '../lib/benchmarks.js';

test('no deal prices outside the mid-market band', () => {
  const offences = [];
  for (const d of seededDeals) {
    const c = canonicalFigures(d);
    if (!c.ebitda) continue;
    const mult = +(c.ev / c.ebitda).toFixed(1);
    if (mult < MULTIPLE_FLOOR || mult > MULTIPLE_CEILING) offences.push(`${d.company}: ${mult}x`);
  }
  assert.deepEqual(offences, [], `deals priced outside ${MULTIPLE_FLOOR}x-${MULTIPLE_CEILING}x:\n${offences.join('\n')}`);
});

test('enterprise value, EBITDA and the published multiple always agree', () => {
  let checked = 0;
  for (const d of seededDeals) {
    const c = canonicalFigures(d);
    const stated = statedMultipleOf(d);
    if (!c.ebitda || stated == null) continue;
    checked += 1;
    const actual = +(c.ev / c.ebitda).toFixed(1);
    assert.ok(
      Math.abs(stated - actual) <= 0.1,
      `${d.company}: the record states ${stated}x and its own EV over EBITDA is ${actual}x`,
    );
  }
  assert.ok(checked > 10, `only ${checked} deals compared — this test has gone inert`);
});

test('every EBITDA margin is within reach of the sector that earns it', () => {
  const offences = [];
  for (const d of seededDeals) {
    const c = canonicalFigures(d);
    if (!c.ebitda || !c.revenue) continue;
    const margin = (c.ebitda / c.revenue) * 100;
    const sector = sectorMargin(d).margin;
    // Half to double the sector is generous on purpose: a real company can be well off its
    // sector's average. A vertical SaaS business at a fifth of it is a data-entry error.
    if (margin < sector * 0.5 || margin > sector * 2) {
      offences.push(`${d.company}: ${margin.toFixed(1)}% against ${sector.toFixed(1)}% for ${sectorMargin(d).benchmark.label}`);
    }
  }
  assert.deepEqual(offences, [], `margins nowhere near their sector:\n${offences.join('\n')}`);
});

test('the entry multiple a sector defaults to can always cite where it came from', () => {
  for (const d of seededDeals) {
    const b = sectorEntryMultiple(d);
    assert.ok(b.multiple >= MULTIPLE_FLOOR && b.multiple <= MULTIPLE_CEILING, `${d.company}: ${b.multiple}x is outside the band`);
    assert.match(b.basis, /Damodaran/, `${d.company}: the screening default does not name its source`);
    assert.match(b.basis, /EV\/EBITDA/, `${d.company}: the basis does not say what was compared`);
  }
});

test('the downside case can actually lose money', () => {
  let fell = 0;
  for (const d of seededDeals) {
    const m = buildReturnsModel(d);
    const down = (m.scenarios || []).find((s) => /down/i.test(s.name));
    const base = (m.scenarios || []).find((s) => /base/i.test(s.name));
    if (!down || !base) continue;
    // The downside used to be floored at zero EBITDA growth, so across the whole book the
    // worst case was "grows more slowly" and no deal ever lost a pound.
    assert.ok(down.irr < base.irr, `${d.company}: the downside returns as much as the base`);
    if (down.moic < 1) fell += 1;
  }
  assert.ok(fell > 0, 'no deal loses money in its downside — the recession case is not a recession case');
});

test('EBITDA is underwritten to grow faster than revenue, and only in the base', () => {
  // Compounding revenue growth and calling it EBITDA growth is what made a realistically
  // priced book return 7-15%. The plan's margin expansion is the difference.
  const up = underwrittenEbitdaCagr(0.05, 10);
  assert.ok(up > 0.05, 'margin expansion should lift EBITDA growth above revenue growth');
  const down = underwrittenEbitdaCagr(0.05, 10, { bps: -100 });
  assert.ok(down < 0.05, 'margin compression should pull EBITDA growth below revenue growth');
  // A thinner-margin business gets more operating leverage from the same points of margin.
  assert.ok(underwrittenEbitdaCagr(0.05, 10) > underwrittenEbitdaCagr(0.05, 30));
});

test('debt is repaid out of cash, so a worse year repays less', () => {
  // The sweep replaced a fixed share of the opening balance. Before that, Atlas retired the
  // same debt in a year EBITDA fell as in a year it grew — which needs more than 100% cash
  // conversion and charges nothing for the money.
  let checked = 0;
  for (const d of seededDeals) {
    const m = buildReturnsModel(d);
    const base = (m.scenarios || []).find((s) => /base/i.test(s.name));
    const down = (m.scenarios || []).find((s) => /down/i.test(s.name));
    if (!base || !down || base.debtRepaid == null) continue;
    checked += 1;
    assert.ok(down.debtRepaid < base.debtRepaid, `${d.company}: the downside repays as much debt as the base`);
  }
  assert.ok(checked > 10, `only ${checked} deals compared — this test has gone inert`);
});

test('the hold is charged for its debt', () => {
  for (const d of seededDeals) {
    const m = buildReturnsModel(d);
    const base = (m.scenarios || []).find((s) => /base/i.test(s.name));
    if (!base || !base.debt) continue;
    assert.ok(base.interestPaid > 0, `${d.company}: borrows ${base.debt} and pays no interest`);
    // Five years of interest on a real structure is a material number, not a rounding.
    assert.ok(base.interestPaid > base.debt * 0.2, `${d.company}: interest of ${base.interestPaid} on ${base.debt} of debt is implausibly cheap`);
  }
});

test('the downside is materially worse than the base, and the book is not uniform', () => {
  // This used to demand `down.moic < 1` on every deal, and got it: nineteen of nineteen
  // downside cases destroyed capital, seven of them on deals the committee had already
  // approved. "You underwrote seven deals whose downside returns 76 cents?" had no
  // answer on screen. A downside has to be a real step down from the base; it does not
  // have to be a wipeout, and a book in which every single one is a wipeout is a
  // template rather than a portfolio.
  let abovePar = 0;
  let seen = 0;
  for (const d of seededDeals) {
    const m = buildReturnsModel(d);
    const down = (m.scenarios || []).find((s) => /down/i.test(s.name));
    const base = (m.scenarios || []).find((s) => /base/i.test(s.name));
    if (!down || !base) continue;
    seen += 1;
    assert.ok(down.moic < base.moic * 0.8, `${d.company}: the downside returns ${down.moic}x against a base of ${base.moic}x — that is not a downside`);
    assert.ok(down.irr < base.irr, `${d.company}: the downside out-returns the base`);
    if (down.moic >= 1) abovePar += 1;
  }
  assert.ok(seen > 10, `only ${seen} downside cases seen — this guard has gone inert`);
  assert.ok(abovePar >= 2, `only ${abovePar} downside cases in the whole book return above par — that is one model, not nineteen deals`);
  assert.ok(abovePar < seen, 'no downside in the book loses money — the compression is not biting');
});
