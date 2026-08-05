// THE CASE — the contract that keeps the composed committee page honest.
//
// The page exists because an IC member found the memo's recommendation section stored
// as an empty string an hour before a vote. Composing one from the record is the fix;
// composing one that reads like an approved paper would be a worse problem than the
// empty string was, because an empty string does not mislead anybody. These are the
// guards that keep the two apart.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDealCase } from '../lib/dealCase.js';
import { seededDeals } from '../data/deals.js';

const CASES = seededDeals.map((d) => [d.id, buildDealCase(d)]);

test('every deal composes a case, and none of them throws', () => {
  for (const [id, c] of CASES) assert.ok(c && c.kind === 'deal-case', `${id}: no case composed`);
});

test('the page declares itself composed and unapproved, on every deal', () => {
  for (const [id, c] of CASES) {
    assert.equal(c.composed, true, `${id}: composed flag missing`);
    assert.match(c.composedNote, /not the analyst's memo/i, `${id}: does not disclaim the memo`);
    assert.match(c.composedNote, /nobody has approved it/i, `${id}: does not say it is unapproved`);
  }
});

test('no figure is published without saying where it came from', () => {
  for (const [id, c] of CASES) {
    for (const f of c.figures) {
      assert.ok(f.basis && f.basis.length > 12, `${id}: "${f.label}" published with no basis`);
    }
  }
});

// The sharpest thing this page does. A committee voting on an entry multiple is
// entitled to know when the denominator under it was assumed rather than diligenced,
// and the deal record holds no EBITDA on most deals at this stage. Weakening this
// assertion would let the page quote a screening default as if it were a QoE figure.
test('a derived EBITDA is disclosed as derived, in the figures and in the gaps', () => {
  let checked = 0;
  for (const [id, c] of CASES) {
    const ebitda = c.figures.find((f) => /EBITDA/.test(f.label));
    if (!/Not recorded/i.test(ebitda.basis)) continue;
    checked += 1;
    // Two honest derivations exist: the screening default, and dividing enterprise
    // value by a multiple the record states. Both must name the arithmetic; neither
    // may simply say "not recorded" and leave it there.
    assert.match(ebitda.basis, /screening default|Implied by dividing/i, `${id}: derived EBITDA does not say how it was derived`);
    // The gap list is for figures the case RESTS on that nobody produced. An EBITDA
    // implied by a multiple the record states is not one of those — the multiple is
    // the recorded figure and the case rests on it, so only the screening-default
    // path belongs here.
    if (/screening default/i.test(ebitda.basis)) {
      assert.ok(
        c.notOnRecord.some((n) => /no EBITDA has been recorded/i.test(n)),
        `${id}: derived EBITDA is not listed among what is not on the record`,
      );
    }
  }
  assert.ok(checked > 0, 'no deal exercised the derived-EBITDA path — the guard would be inert');
});

test('what could kill it is at most three rows and never a monitor', () => {
  for (const [id, c] of CASES) {
    assert.ok(c.againstIt.length <= 3, `${id}: ${c.againstIt.length} rows under "what could kill it"`);
    for (const r of c.againstIt) assert.notEqual(r.severity, 'monitor', `${id}: a monitor is presented as a killer`);
  }
});

test('a deal-stopper on the register forces the call to DECLINE', () => {
  for (const [id, c] of CASES) {
    if (c.againstIt.some((r) => r.severity === 'stopper')) {
      assert.equal(c.recommendation.call, 'DECLINE', `${id}: stopper on the register but the call is ${c.recommendation.call}`);
    }
  }
});

test('the call always carries its reason', () => {
  for (const [id, c] of CASES) {
    assert.ok(c.recommendation.call, `${id}: no call`);
    assert.ok(c.recommendation.because && c.recommendation.because.length > 10, `${id}: call with no stated reason`);
  }
});

test('the ask names an amount, so nobody votes on an unstated number', () => {
  for (const [id, c] of CASES) {
    if (!c.ask) continue;
    assert.ok(Number.isFinite(c.ask.enterpriseValue), `${id}: ask has no enterprise value`);
    assert.ok(Number.isFinite(c.ask.equityCheque), `${id}: ask has no equity cheque`);
    assert.match(c.ask.headline, /Authorise up to/, `${id}: the ask does not read as an authorisation`);
  }
});
