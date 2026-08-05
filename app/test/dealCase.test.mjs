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
import { buildReturnsModel, buildRiskRegister } from '../lib/diligence.js';

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

// $288M of estimated revenue printed beside a recorded ARR of $58M on the same page,
// implying a 50% EBITDA margin on a 41%-growth software asset. Two lines of one page
// that cannot both be true is the thing that makes a reader stop and ask who checked it.
test('an estimated revenue is never printed beside a recorded recurring-revenue figure', () => {
  let checked = 0;
  for (const [id, c] of CASES) {
    const d = seededDeals.find((x) => x.id === id);
    const arr = (d.keyFigures || []).find((k) => /\barr\b|recurring revenue/i.test(k.label));
    const revRecorded = (d.keyFigures || []).some((k) => /revenue/i.test(k.label) && !/\barr\b|recurring/i.test(k.label));
    if (!arr || revRecorded) continue;
    checked += 1;
    const row = c.figures.find((f) => /revenue/i.test(f.label));
    assert.match(row.label, /Recurring revenue/i, `${id}: an estimated revenue is shown where only ARR is on the record`);
    assert.match(row.basis, /No total revenue figure is on the record/i, `${id}: the missing total revenue is not stated`);
  }
  assert.ok(checked > 0, 'no deal exercised the ARR-only path — the guard would be inert');
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

// Every register row on every deal is stamped `basis: templated`, and among them are
// rows reading "historic VAT exposure identified" and "cyber posture is adequate". A
// template cannot identify an exposure or pronounce a posture adequate. The API was
// honest about it; the first version of this page dropped the one field that told a
// reader whether anybody had looked.
test('a risk carries the basis it was written on', () => {
  for (const [id, c] of CASES) {
    for (const r of c.againstIt) {
      assert.ok('basis' in r, `${id}: a risk is published with its basis stripped`);
      if (r.basis === 'templated') {
        assert.match(r.basisNote, /No named author/i, `${id}: a templated risk does not say so in words`);
      }
    }
  }
});

// The single worst line on the first version of this page read, under the heading "the
// case for it": "Base case returns 2.32x on 18.3% IRR — Does not clear the fund hurdle."
test('nothing that fails the hurdle is filed under the case FOR the deal', () => {
  for (const [id, c] of CASES) {
    for (const p of c.forIt) {
      assert.doesNotMatch(p.basis, /does not clear|breaks the hurdle|below the/i, `${id}: a hurdle failure is filed as a point in favour — "${p.point}"`);
    }
  }
});

// "Downside holds at 1.19x / 3.5% IRR" printed against a 2x / 20% hurdle on twenty of
// twenty-four deals. The one question asked of a downside is whether it breaks.
test('the downside is tested against the hurdle before it is described', () => {
  let broken = 0;
  for (const [id, c] of CASES) {
    if (!c.downside) continue;
    const h = { irr: 20, moic: 2 };
    const clears = c.downside.moic >= h.moic && c.downside.irr >= h.irr;
    assert.equal(c.downside.clearsHurdle, clears, `${id}: downside verdict disagrees with its own figures`);
    if (!clears) {
      broken += 1;
      assert.match(c.downside.text, /breaks the hurdle/i, `${id}: a sub-hurdle downside is not described as one`);
      assert.ok(!c.forIt.some((p) => /Downside/i.test(p.point)), `${id}: a sub-hurdle downside appears in the case for`);
    }
  }
  assert.ok(broken > 0, 'no deal exercised the sub-hurdle downside path — the guard would be inert');
});

// "Modelled on ... a larger $256M equity cheque" where base and downside were both
// $256M. A comparative that is not true of the two numbers beside it.
test('the downside only calls its equity cheque larger when it is larger', () => {
  for (const [id, c] of CASES) {
    if (!c.downside) continue;
    if (/larger/i.test(c.downside.basis)) {
      assert.match(c.downside.basis, /larger .* than the base case/i, `${id}: "larger" with nothing to compare against`);
    }
  }
});

// Eight deals past the committee decision — including one whose own record reads "IC
// approved; deal archived" — were told DO NOT PROCEED and asked to authorise money that
// had already gone out of the door.
test('a deal past the committee decision is not asked for authorisation', () => {
  let decided = 0;
  for (const [id, c] of CASES) {
    if (!c.decided) continue;
    decided += 1;
    assert.equal(c.recommendation.call, 'ALREADY DECIDED', `${id}: past the decision but the call is ${c.recommendation.call}`);
    assert.doesNotMatch(c.ask.headline, /Authorise up to/i, `${id}: asks a committee to authorise a deal that has signed`);
    assert.match(c.ask.headline, /Committed:/, `${id}: does not state the commitment as a commitment`);
  }
  assert.ok(decided > 0, 'no deal exercised the past-decision path — the guard would be inert');
});

// "Returns clear the hurdle and the register carries nothing outstanding", ten lines
// above a register with two conditions on it. One page, one count, taken from the rows
// the page is about to print.
test('the reason never claims a clean register when the page prints conditions', () => {
  for (const [id, c] of CASES) {
    if (/no conditions or repricing items/i.test(c.recommendation.because)) {
      assert.equal(c.conditions.length, 0, `${id}: claims a clean register while printing ${c.conditions.length} conditions`);
      assert.ok(!c.againstIt.some((r) => r.severity === 'reprice'), `${id}: claims a clean register while printing a repricing item`);
    }
  }
});

// "Growth underwritten at 41%" on a deal the model runs at 15%, and "Growth underwritten
// at 7." on nineteen others with no unit at all. The returns model writes this sentence
// correctly; the page had been writing its own.
test('growth is stated as it is underwritten, and never as a bare number', () => {
  for (const [id, c] of CASES) {
    const g = c.forIt.find((p) => p.point === 'Growth');
    if (!g) continue;
    assert.match(g.basis, /Underwritten at/i, `${id}: growth is not stated as an underwriting`);
    assert.doesNotMatch(g.basis, /at \d+(\.\d+)?[.,]/, `${id}: growth printed without a unit — "${g.basis}"`);
  }
});

test('a deal-stopper on the register forces the call to DECLINE', () => {
  for (const [id, c] of CASES) {
    if (c.decided) continue;
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

test('the ask names an amount, so nobody votes on an unstated number', () => {  for (const [id, c] of CASES) {
    if (!c.ask) continue;
    assert.ok(Number.isFinite(c.ask.enterpriseValue), `${id}: ask has no enterprise value`);
    assert.ok(Number.isFinite(c.ask.equityCheque), `${id}: ask has no equity cheque`);
    assert.match(c.ask.headline, c.decided ? /Committed:/ : /Authorise up to/, `${id}: the ask does not read as ${c.decided ? 'a commitment' : 'an authorisation'}`);
  }
});

// The ask said "$96M equity cheque" beside a sources-and-uses showing $94M of sponsor
// equity, with the reconciliation on a page the reader had not been sent to.
test('where the equity cheque and the sponsor line differ, the ask reconciles them', () => {
  let reconciled = 0;
  for (const [id, c] of CASES) {
    if (!c.ask || !c.ask.equityNote) continue;
    reconciled += 1;
    assert.match(c.ask.equityNote, /fees|rolled over/i, `${id}: equity note does not explain the difference`);
  }
  assert.ok(reconciled > 0, 'no deal exercised the equity-reconciliation path — the guard would be inert');
});

// One deal's approved memo claimed "no unresolved risk-level findings" while its own
// register carried three open conditions. The product held the conflict and buried it.
test('a written recommendation that claims nothing is outstanding is checked against the register', () => {
  for (const [id, c] of CASES) {
    const w = c.writtenRecommendation;
    if (!w) continue;
    assert.ok(w.text.length, `${id}: an empty written recommendation was published as one`);
    if (/no\s+(unresolved|outstanding|open)\b/i.test(w.text) && c.conditions.length) {
      assert.ok(w.conflict, `${id}: written recommendation contradicts the register and the page does not say so`);
    }
  }
});

// "All three scenarios buy at the same enterprise value. The downside puts in more
// equity because it is financed at 4.5x rather than 5x" -- printed unconditionally, and
// false on four of six deals read, where downside and base equity were equal to the
// dollar. One click from a page that had just been corrected to say so.
test('the scenario explanation matches the scenarios it explains', () => {
  let same = 0;
  let differ = 0;
  for (const [id] of CASES) {
    const d = seededDeals.find((x) => x.id === id);
    const r = buildReturnsModel(d);
    const base = r.scenarios.find((s) => /base/i.test(s.name));
    const down = r.scenarios.find((s) => /down/i.test(s.name));
    if (!base || !down || !r.scenarioBasis) continue;
    if (Math.round(base.equityIn) === Math.round(down.equityIn)) {
      same += 1;
      assert.doesNotMatch(r.scenarioBasis, /puts in more equity/i, `${id}: claims the downside puts in more equity where the two are equal`);
      assert.match(r.scenarioBasis, /the same equity/i, `${id}: equal equity cheques not stated as equal`);
    } else {
      differ += 1;
      assert.match(r.scenarioBasis, /puts in more equity/i, `${id}: a larger downside cheque is not explained`);
    }
  }
  assert.ok(same > 0 && differ > 0, 'both scenario paths must be exercised or the guard is half inert');
});

// Growth was emitted under "the case for it" unconditionally, so on a deal recommended
// DO NOT PROCEED *because* 3% growth produces a 15.3% IRR, the 3% was filed in support.
test('growth is not filed as a point in favour', () => {
  for (const [id, c] of CASES) {
    assert.ok(!c.forIt.some((p) => p.point === 'Growth'), `${id}: growth argued as a point for the deal`);
    if (c.baseCase) assert.ok(c.baseCase.growth, `${id}: the base case does not state what growth it was struck on`);
  }
});

// Pulling a sub-hurdle base case out of the case FOR the deal was right. Leaving it off
// the page was not: one decided deal ended up with no return figure on it at all, and a
// failing downside as the only multiple in sight.
test('every case states its base case, whether or not it clears', () => {
  let failing = 0;
  for (const [id, c] of CASES) {
    assert.ok(c.baseCase, `${id}: no base case on the page`);
    assert.ok(Number.isFinite(c.baseCase.moic) && Number.isFinite(c.baseCase.irr), `${id}: base case with no figures`);
    assert.ok(c.baseCase.text && c.baseCase.text.length > 20, `${id}: base case with no sentence`);
    if (!c.baseCase.clearsHurdle) {
      failing += 1;
      assert.match(c.baseCase.text, /does not|not reach|below/i, `${id}: a sub-hurdle base case does not say it misses`);
    }
  }
  assert.ok(failing > 0, 'no deal exercised the sub-hurdle base case — the guard would be inert');
});

// A committee member found the readiness board naming a regulatory clearance and a
// financing condition, and the register naming a working-capital peg and change-of-
// control consents: four items, two lists, no overlap, neither a superset, and a
// headline that counted two.
test('everything outstanding is on one list, and each row says which record it came from', () => {
  for (const [id, c] of CASES) {
    assert.ok(Array.isArray(c.outstanding), `${id}: no single outstanding list`);
    for (const row of c.outstanding) {
      assert.ok(row.text, `${id}: an outstanding row with no text`);
      assert.ok(['committee readiness', 'risk register'].includes(row.from), `${id}: outstanding row with no source`);
    }
    // Nothing on the register or the board may be missing from it.
    for (const cond of c.conditions) {
      assert.ok(c.outstanding.some((r) => r.text === cond.condition), `${id}: a condition is not on the outstanding list`);
    }
  }
});

// The board scores how much of the case traces to a source -- 40 on one deal, with the
// reason written out -- and it was on a different page from the ask it is about.
test('the citation score travels with the case', () => {
  let scored = 0;
  for (const [id, c] of CASES) {
    if (!c.citations) continue;
    scored += 1;
    assert.ok(c.citations.summary, `${id}: a citation score with no explanation`);
  }
  assert.ok(scored > 0, 'no deal carried a citation audit — the guard would be inert');
});

// 232 rows across twenty-four registers, `authored = 0`, and among them "Historic VAT
// exposure identified", "cyber posture is adequate", "no recognised environmental
// condition was identified" and "cost-out opportunity identified (~$6M run-rate)" on a
// $29M EBITDA. A committee member put it exactly right: the disclosure is honest, the
// content it disclaims is not. A template may say what a lane covers and what is open in
// it; it may not report a result.
const ASSERTS_A_RESULT = /\bidentified\b|\bis adequate\b|\bposture adequate\b|review complete|no material undisclosed/i;
test('a templated register row never reports a finding', () => {
  for (const d of seededDeals) {
    for (const r of buildRiskRegister(d).risks) {
      if (r.basis === 'recorded') continue;
      assert.doesNotMatch(r.risk, ASSERTS_A_RESULT, `${d.id}: a row nobody wrote reports a result — "${r.risk.slice(0, 90)}"`);
    }
  }
});

// A finding somebody wrote must be on the page whatever severity it was graded. On a
// signed deal the one real finding -- "Final QoE issued; $2.1M of add-backs disallowed"
// -- was a monitor, fell out of the three killers, and appeared nowhere at all, while
// two rows nobody wrote were printed under "what could kill it".
test('a recorded finding is never pushed off the page by boilerplate', () => {
  let withRecorded = 0;
  for (const [id, c] of CASES) {
    const d = seededDeals.find((x) => x.id === id);
    const recorded = buildRiskRegister(d).risks.filter((r) => r.basis === 'recorded');
    if (!recorded.length) {
      assert.ok(
        c.notOnRecord.some((n) => /written by a named author/i.test(n)),
        `${id}: an entirely templated register does not say so`,
      );
      continue;
    }
    withRecorded += 1;
    for (const r of recorded) {
      assert.ok(c.recordedFindings.some((x) => x.finding === r.risk), `${id}: a recorded finding is absent from the case`);
    }
  }
  assert.ok(withRecorded > 0, 'no deal carried a recorded finding — the guard would be inert');
});

// "Committed: $670M enterprise value at 4.1x" over $134M of EBITDA -- and 670 over 134
// is 5.0x. The multiple was the one stated on the record, the enterprise value was the
// one the model funds, and nothing said they were struck on different numbers. A
// committee reading 4.1x against a base exit at 5.0x sees a turn of multiple expansion
// that is not in the case.
test('where the stated multiple and the funded enterprise value disagree, the page says so', () => {
  let mismatched = 0;
  for (const d of seededDeals) {
    const e = buildReturnsModel(d).entry;
    if (!e) continue;
    const implied = +(e.entryEV / Math.max(1, e.ebitda)).toFixed(1);
    const ties = Math.abs(implied - e.evEbitda) <= 0.15;
    assert.equal(e.ties, ties, `${d.id}: the reconciliation flag disagrees with the arithmetic`);
    if (!ties) {
      mismatched += 1;
      assert.ok(e.entryNote, `${d.id}: ${e.evEbitda}x published over an enterprise value implying ${implied}x, with no note`);
      assert.match(e.entryNote, new RegExp(`${implied}x`), `${d.id}: the note does not state the implied multiple`);
    }
  }
  assert.ok(mismatched > 0, 'no deal exercised the mismatch path — the guard would be inert');
});

// The severity map tested for grades the record does not use, so all 34 written findings
// in the book fell through to `monitor` -- the one band "what could kill it" filters out.
// Zero recorded rows qualified as a killer on any deal, ever; the tie-break that prefers
// a written row over a standard one was dead code; and a committed $640M deal presented
// two templated rows as its killers while a lawyer's note about indemnities carved out
// for a historical customs matter sat below unread.
test('a written finding can reach the killers, and a positive one never does', () => {
  let aboveMonitor = 0;
  for (const d of seededDeals) {
    for (const r of buildRiskRegister(d).risks) {
      if (r.basis !== 'recorded') continue;
      if (r.severity !== 'monitor') aboveMonitor += 1;
    }
  }
  assert.ok(aboveMonitor > 0, 'no written finding is graded above a monitor — the killers can only ever be boilerplate');
  for (const [id, c] of CASES) {
    for (const r of c.againstIt) {
      assert.doesNotMatch(r.risk, /tracking ahead of plan|resilient|durable|real moat|no material historical exposure/i,
        `${id}: a positive finding is presented as a thing that could kill the deal`);
    }
  }
});

// A row that quotes a recorded finding by name cannot also carry "No named author has
// written a finding against it" -- and it did, on the deal coming to committee in four
// days.
test('a row that quotes a finding does not deny one exists', () => {
  for (const d of seededDeals) {
    for (const r of buildRiskRegister(d).risks) {
      if (!r.basisNote) continue;
      if (/has recorded this|financial workstream has recorded/i.test(r.risk)) {
        assert.doesNotMatch(r.basisNote, /No named author/i, `${d.id}: a row quoting a finding says nobody wrote one`);
      }
    }
  }
});

// "None was written by a named author against this company" printed on a deal with six
// named findings, because the claim tested the three-row slice rather than the register.
test('the no-author claim is made about the register, not about three rows of it', () => {
  for (const [id, c] of CASES) {
    const d = seededDeals.find((x) => x.id === id);
    const hasRecorded = buildRiskRegister(d).risks.some((r) => r.basis === 'recorded');
    const claims = c.notOnRecord.some((n) => /Nothing on this deal.s risk register was written by a named author/i.test(n));
    assert.equal(claims, !hasRecorded, `${id}: the no-author claim disagrees with the register`);
  }
});

// One entry multiple per page. The ask read "Committed: $670M at 4.1x" where 670 over
// 134 is 5.0x, and the price comparison quoted the 4.1x while the ask beside it said 5x.
test('the ask, the price comparison and the figures speak one entry multiple', () => {
  for (const [id, c] of CASES) {
    if (!c.ask) continue;
    const implied = +(c.ask.enterpriseValue / Math.max(1, Number(String(c.figures.find((f) => /EBITDA/.test(f.label)).value).replace(/[^0-9.]/g, '')))).toFixed(1);
    assert.ok(Math.abs(c.ask.entryMultiple - implied) <= 0.15,
      `${id}: the ask states ${c.ask.entryMultiple}x over an enterprise value implying ${implied}x`);
    if (c.priceAgainstPrecedent) {
      assert.equal(c.priceAgainstPrecedent.entryMultiple, c.ask.entryMultiple,
        `${id}: the price comparison and the ask quote different multiples`);
    }
  }
});

// "All numeric claims trace to a source fact or cited document", at 100, on a case
// carrying two enterprise values and two entry multiples. A badge measuring something
// other than what its sentence says is worse than no badge.
test('the sourcing badge does not claim a clean bill over a contradiction it cannot see', () => {
  let caveated = 0;
  for (const [id, c] of CASES) {
    if (!c.citations) continue;
    const ebitda = c.figures.find((f) => /EBITDA/.test(f.label));
    const derived = /screening default/i.test(ebitda.basis);
    if (derived) {
      caveated += 1;
      assert.equal(c.citations.clean, false, `${id}: reported clean over a multiple struck on a screening default`);
      assert.match(c.citations.summary, /not whether the figures agree/i, `${id}: the badge does not say what it measures`);
    }
  }
  assert.ok(caveated > 0, 'no deal exercised the caveat path — the guard would be inert');
});
