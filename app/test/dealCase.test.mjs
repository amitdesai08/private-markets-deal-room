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
import { buildReturnsModel, buildRiskRegister, reconcileFindingText } from '../lib/diligence.js';
import { caseBlock } from '../lib/agents.js';
import { loadFabric } from '../lib/fabric.js';

// The bundled market snapshot has to be loaded, or the price-against-precedent section
// is null on every deal and the guard below silently asserts nothing.
await loadFabric();

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
      assert.equal(c.outstandingCount, 0, `${id}: claims a clean register while carrying ${c.outstandingCount} conditions`);
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
    const d = seededDeals.find((x) => x.id === id);
    // The REGISTER's own stoppers. A row promoted onto the killers from the outstanding
    // list -- a merger-control filing, a takeover timetable -- is a thing that could
    // kill the deal, not a finding that it is dead.
    if (buildRiskRegister(d).risks.some((r) => r.severity === 'stopper')) {
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
    if (/no\\s+(unresolved|outstanding|open)\\b/i.test(w.text) && c.outstandingCount) {
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
    // The register's conditions travel on this list and nowhere else. They used to be
    // published as a second list as well, so on one deal the same QoE paragraph appeared
    // three times over -- as a finding, as a condition and as an outstanding item. And
    // every count on the page is now this list's length: it gave four different answers
    // to "what is outstanding" on one deal, each computed elsewhere off something
    // slightly different.
    assert.equal(c.outstandingCount, c.outstanding.length, `${id}: the outstanding count is not the length of the outstanding list`);
    // And no other line on the page may quote a different one. The readiness headline is
    // computed elsewhere, quoted its own number, and is the line a reader hits first.
    const stray = /\d+ items?\s+(?:remain open on|on)\s+the risk register/i.exec(String(c.readiness.headline || ''));
    assert.equal(stray, null, `${id}: the readiness headline quotes its own count of what is open`);
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
  // Read off the WORKSTREAMS, not the register. A positive finding is graded clear and
  // clear rows never reach the register, so a deal whose diligence produced only good
  // news had seven named authors and a page announcing that nobody had written anything.
  // Asking the register whether anybody worked on the deal was the wrong question.
  let withWritten = 0;
  for (const [id, c] of CASES) {
    const d = seededDeals.find((x) => x.id === id);
    const written = (d.workstreams || []).flatMap((w) => (w.findings || []).filter((f) => f && f.text));
    if (!written.length) {
      assert.ok(
        c.notOnRecord.some((n) => /Nobody has written a finding/i.test(n)),
        `${id}: a deal nobody has written on does not say so`,
      );
      continue;
    }
    withWritten += 1;
    for (const f of written) {
      assert.ok(c.recordedFindings.some((x) => x.finding === String(f.text).trim()), `${id}: a written finding is absent from the case`);
    }
  }
  assert.ok(withWritten > 0, 'no deal carried a written finding — the guard would be inert');
});

// "Committed: $670M enterprise value at 4.1x" over $134M of EBITDA -- and 670 over 134
// is 5.0x. The cause was a FLOOR of 5x on the entry multiple, so the model bought a deal
// whose own record implies 4.1x at 5x instead, and every page downstream inherited a
// purchase price 22% above the one on the deal.
//
// The first attempt at this wrote a sentence admitting the contradiction and left the
// numbers alone; a partner still could not state the purchase price. The floor is gone,
// so this asserts the stronger contract -- the funded enterprise value and the published
// multiple tie, on every deal -- rather than that the mismatch is well described. That
// is deliberately stricter than what it replaced.
test('the funded enterprise value and the published entry multiple always tie', () => {
  for (const d of seededDeals) {
    const e = buildReturnsModel(d).entry;
    if (!e) continue;
    const implied = +(e.entryEV / Math.max(1, e.ebitda)).toFixed(1);
    assert.ok(
      Math.abs(implied - e.evEbitda) <= 0.15,
      `${d.id}: publishes ${e.evEbitda}x over an enterprise value of ${e.entryEV} on EBITDA of ${e.ebitda}, which is ${implied}x`,
    );
    assert.equal(e.ties, true, `${d.id}: the reconciliation flag disagrees with the arithmetic`);
  }
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

// "None was written by a named author against this company" printed on a deal with seven,
// because the claim tested the register -- where positives, which is what those seven
// were, never appear.
test('the no-author claim is made about the whole deal, not about the register', () => {
  for (const [id, c] of CASES) {
    const d = seededDeals.find((x) => x.id === id);
    const authored = (d.workstreams || []).some((w) => (w.findings || []).some((f) => f && f.text));
    const claims = c.notOnRecord.some((n) => /Nobody has written a finding/i.test(n));
    assert.equal(claims, !authored, `${id}: the no-author claim disagrees with the workstreams`);
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
      assert.equal(c.citations.score, null, `${id}: a score published over a price that cannot be relied on`);
      assert.ok(c.citations.scoreWithheld, `${id}: no score and no reason for withholding it`);
      // And the summary states the fraction rather than asserting every claim traced --
      // it was hardcoded to "every claim it tested does trace to a source" and printed on
      // a deal reporting two of three.
      assert.match(c.citations.summary, new RegExp(`${c.citations.sourced} of ${c.citations.total} claim`), `${id}: the badge does not state what it actually tested`);
    }
  }
  assert.ok(caveated > 0, 'no deal exercised the caveat path — the guard would be inert');
});

// A mechanical SPA working-capital true-up that appears on every deal in the fund was
// presented to a committee as one of the three things most likely to kill it, alongside
// a consent point quoted with its own evidence that it was closed. A committee that
// reads three rows and finds none of them capable of killing anything stops reading.
test('only a stopper or a repricing item is presented as a thing that could kill the deal', () => {
  for (const [id, c] of CASES) {
    for (const r of c.againstIt) {
      // A condition may reach this list only by deliberate promotion -- a merger-control
      // filing, a takeover timetable, or a condition a named workstream wrote against
      // this company. Everything else here is a stopper or a repricing item; a mechanical
      // SPA true-up appearing on every deal in the fund is not a thing that kills one.
      assert.ok(r.severity === 'stopper' || r.severity === 'reprice' || r.promoted === true,
        `${id}: a ${r.severityLabel} is presented as a killer — "${r.risk.slice(0, 70)}"`);
      assert.notEqual(r.basis, 'templated', `${id}: a row nobody wrote is presented as a killer`);
    }
    // And nothing is lost by the narrowing: a condition is an obligation and belongs on
    // the outstanding list, where a reader can act on it.
    if (c.outstandingCount) {
      assert.ok(c.outstanding.some((o) => o.from === 'risk register'), `${id}: conditions fell off both lists`);
    }
  }
});

// $73M is 12% of $610M -- the screening default -- fired on a deal whose record carries
// a diligenced "Adj. EBITDA $142M" at high confidence, because the label pattern
// required the word EBITDA to start the label. The product then told a committee that an
// asset the fund owns "is below the 20% / 2x hurdle on both legs" using an EBITDA it had
// invented, while the real one sat on the same record. At $142M the entry is 4.3x, not
// 8.4x, and the deal does not fail.
test('a recorded EBITDA is used however its label is worded', () => {
  let matched = 0;
  for (const d of seededDeals) {
    const kf = (d.keyFigures || []).find((k) => /ebitda/i.test(k.label) && !/margin|vs|growth|uplift|delta|change/i.test(k.label));
    if (!kf) continue;
    const stated = Number(String(kf.value).replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(stated) || /%/.test(String(kf.value))) continue;
    matched += 1;
    const e = buildReturnsModel(d).entry;
    const dflt = Math.round((d.dealSize || 0) * 0.12);
    assert.notEqual(e.ebitda, dflt === stated ? -1 : dflt,
      `${d.id}: "${kf.label} ${kf.value}" is on the record and the screening default fired anyway`);
  }
  assert.ok(matched > 3, 'too few deals record an EBITDA for this guard to mean anything');
});

// Four real public companies -- among them a clinical-stage gene-therapy registrant --
// carried "$375M revenue, $36M LTM EBITDA, Recorded on the deal from diligence" and
// scored 100 out of 100 for sourcing. $36M is 12% of the $300M asking price and $375M is
// 125% of it. Both figures ARE on the record, sourced "Screen" at medium confidence, and
// the page read the presence of a source and reported diligence.
const NOT_DILIGENCE = /^(screen|screening|teaser|cim|broker model|desk|desk research|derived|estimate)$/i;
test('a figure sourced at screening is never described as diligenced', () => {
  let checked = 0;
  for (const [id, c] of CASES) {
    const d = seededDeals.find((x) => x.id === id);
    const kf = (d.keyFigures || []).find((k) => /ebitda/i.test(k.label) && !/margin|vs|growth/i.test(k.label));
    if (!kf || !NOT_DILIGENCE.test(String(kf.source || ''))) continue;
    checked += 1;
    const row = c.figures.find((f) => /EBITDA/.test(f.label));
    assert.doesNotMatch(row.basis, /from diligence/i, `${id}: "${kf.source}" reported as diligence`);
    assert.match(row.basis, /not a diligenced figure/i, `${id}: does not say the figure was never diligenced`);
    assert.equal(c.citations.clean, false, `${id}: scored clean on a price that rests on a screening figure`);
  }
  assert.ok(checked > 0, 'no deal exercised the screening-source path — the guard would be inert');
});

// "PROCEED, SUBJECT TO CONDITIONS — Returns clear the hurdle" on a deal with all seven
// workstreams not started and no EBITDA on the record, eighteen lines above its own list
// saying nothing had been diligenced. The hurdle was cleared by returns computed from a
// number the same function knew was invented.
test('no deal is recommended on returns computed from a figure nobody diligenced', () => {
  let early = 0;
  for (const [id, c] of CASES) {
    const d = seededDeals.find((x) => x.id === id);
    const lanes2 = d.workstreams || [];
    const opened = lanes2.filter((w) => (w.findings || []).length || (w.contributions || []).length).length;
    const ebitda = c.figures.find((f) => /EBITDA/.test(f.label));
    const unevidenced = /screening default|not a diligenced figure/i.test(ebitda.basis);
    if (c.decided || !unevidenced || !lanes2.length || opened * 2 >= lanes2.length) continue;
    early += 1;
    assert.equal(c.recommendation.call, 'NOT ON THIS PRICE — THE EBITDA IS NOT ON THE RECORD',
      `${id}: nothing diligenced and no evidenced price, but the call is ${c.recommendation.call}`);
  }
  assert.ok(early > 0, 'no deal exercised the nothing-diligenced path — the guard would be inert');
});

// The assumption the whole MOIC rests on was on a different page, so a reader asked to
// source the most important number in the paper had to open a second tab.
test('the base case states the exit it is modelled on', () => {
  for (const [id, c] of CASES) {
    assert.ok(c.baseCase.exit, `${id}: a base case with no exit assumption`);
    assert.match(c.baseCase.exit, /against .*x at entry/, `${id}: the exit does not compare itself to entry`);
  }
});

// Three authoring notes had been written into the block the model is told to quote
// verbatim -- among them "Say that, and point at what is outstanding". It duly quoted one
// back to a committee member under "Quote from THE CASE (do not paraphrase)", in
// quotation marks, as something the deal file says. Read aloud in a room, that is a
// partner reading this product's prompt to the investment committee.
test('the case handed to the assistant contains no instructions to the assistant', () => {
  const IMPERATIVE = /\b(say that|do not paraphrase|you must|quote it|point at what|must never|if asked|raise if)\b/i;
  for (const d of seededDeals) {
    const block = caseBlock(d);
    if (!block) continue;
    for (const line of block.split('\n')) {
      assert.doesNotMatch(line, IMPERATIVE, `${d.id}: an instruction is inside the quotable block — "${line.slice(0, 80)}"`);
    }
  }
});

// Two deals holding identical records -- an undiligenced price, no author on either --
// returned different verdicts because one analyst had opened one tab and left a lane at
// 8%. A percentage is a switch; evidence is not.
test('the not-enough-on-the-record call is decided on evidence, not on a typed status', () => {
  for (const [id, c] of CASES) {
    const d = seededDeals.find((x) => x.id === id);
    if (c.decided) continue;
    const ebitda = c.figures.find((f) => /EBITDA/.test(f.label));
    const unevidenced = /screening default|not a diligenced figure/i.test(ebitda.basis);
    const lanes = d.workstreams || [];
    const worked = lanes.filter((w) => (w.findings || []).length || (w.contributions || []).length).length;
    // Half the lanes, not one of them. A deal with six unopened workstreams and an
    // undiligenced price is not decidable because one analyst opened one tab.
    if (!unevidenced || !lanes.length || worked * 2 >= lanes.length) continue;
    assert.equal(c.recommendation.call, 'NOT ON THIS PRICE — THE EBITDA IS NOT ON THE RECORD',
      `${id}: no lane has produced evidence and the price is unevidenced, but the call is ${c.recommendation.call}`);
    assert.equal(c.forIt.some((p) => /Base case|Downside/i.test(p.point)), false,
      `${id}: a return computed off an undiligenced denominator is offered as a point in favour`);
  }
});

// "We are buying at 8.3x, inside the two Healthcare transactions on file" -- on a
// clinical-stage gene-therapy registrant, on a denominator the product invented. The
// first version of this guard tested only the screening-default path, so on the deals
// where the same default had been WRITTEN to the record as a figure sourced "Screen",
// the warning was suppressed and the comparison went ahead.
test('the price is never compared against precedent on a figure nobody diligenced', () => {
  let declined = 0;
  for (const [id, c] of CASES) {
    if (!c.priceAgainstPrecedent) continue;
    const ebitda = c.figures.find((f) => /EBITDA/.test(f.label));
    if (!/screening default|not a diligenced figure/i.test(ebitda.basis)) continue;
    declined += 1;
    assert.equal(c.priceAgainstPrecedent.where, 'not comparable', `${id}: opines on price over an undiligenced EBITDA`);
    assert.match(c.priceAgainstPrecedent.text, /No comparison can be drawn/i, `${id}: does not decline the comparison in words`);
  }
  assert.ok(declined > 0, 'no deal exercised the undiligenced-price path — the guard would be inert');
});

// Some deals exit a turn above entry and nothing said when or why, so a reader was left
// inferring the policy by diffing two numbers in one sentence.
test('multiple expansion in the exit is declared, or its absence is', () => {
  for (const [id, c] of CASES) {
    assert.match(c.baseCase.exit, /multiple expansion|below entry/i, `${id}: the exit does not say whether it assumes expansion`);
  }
});

// "No multiple expansion is assumed" was true of the base case and printed as though it
// were true of the model. One deal exits its upside a full turn above entry, and that
// turn is carrying the upside IRR. A declared assumption that is false in two scenarios
// out of three is a misstatement, and it is the sentence a partner repeats in the room.
test('the exit declaration is about the base case and does not speak for the others', () => {
  let spread = 0;
  for (const [id, c] of CASES) {
    const d = seededDeals.find((x) => x.id === id);
    const r = buildReturnsModel(d);
    const mult = (s) => +(s.exitEV / Math.max(1, s.exitEbitda)).toFixed(1);
    const base = r.scenarios.find((s) => /base/i.test(s.name));
    const others = r.scenarios.filter((s) => !/base/i.test(s.name));
    assert.match(c.baseCase.exit, /The base case (assumes|exits)/i, `${id}: the exit speaks for the whole model`);
    if (others.some((s) => Math.abs(mult(s) - mult(base)) > 0.05)) {
      spread += 1;
      assert.match(c.baseCase.exit, /do not hold it flat/i, `${id}: the other scenarios move the multiple and the page does not say so`);
    }
  }
  assert.ok(spread > 0, 'no deal exercised the moving-multiple path — the guard would be inert');
});

// A timetable somebody else controls is not a condition. A listed take-private carried
// "Takeover Code (rule 2.7) timetable and irrevocables are the critical path" graded a
// closing condition, so the register reported status green and zero deal-stoppers while
// the case page and the assistant both called that row the thing that kills the deal.
test('a critical-path item is a deal-stopper on the register, not a condition', () => {
  const CRITICAL = /takeover code|rule 2\.7|merger control|antitrust clearance|cfius/i;
  let found = 0;
  for (const d of seededDeals) {
    for (const r of buildRiskRegister(d).risks) {
      if (!CRITICAL.test(r.risk)) continue;
      found += 1;
      assert.equal(r.severity, 'stopper', `${d.id}: "${r.risk.slice(0, 50)}" graded ${r.severity}`);
    }
  }
  assert.ok(found > 0, 'no deal carried a critical-path row — the guard would be inert');
});

// One deal carried "QoE supports $46M LTM EBITDA; $2.1M of add-backs disallowed" as a
// thing diligence found AND as a thing still to do, inflating the count of what is
// outstanding on the deal going to committee that week.
test('a vendor reassurance does not remove a condition from the outstanding list', () => {
  // The resolved-in-text filter was written for the killers list and was also stripping
  // the closing-conditions list, which is the one list whose whole purpose is rows that
  // are NOT yet resolved. It removed a change-of-control consent on two of the five
  // largest customers, on the deal going to committee: "both counterparties have
  // indicated no objection in writing" is an indication, not a consent.
  for (const [id, c] of CASES) {
    const d = seededDeals.find((x) => x.id === id);
    const conditions = buildRiskRegister(d).risks.filter((r) => r.severity === 'condition');
    for (const cond of conditions) {
      assert.ok(
        c.outstanding.some((r) => r.text === cond.risk || r.text.includes(cond.risk.slice(0, 40))),
        `${id}: a closing condition is not on the outstanding list — "${cond.risk.slice(0, 60)}"`,
      );
    }
  }
});

// Five unrelated companies -- consumer audio, cinema advertising, document outsourcing,
// footwear and gene therapy -- returned 8.3x, 20.3% IRR and 2.51x MOIC to the decimal.
// Those are not five views; they are one calculation with five names on it.
test('an indicative return says on the case that it is indicative', () => {
  // No seeded deal omits a growth rate, so this builds one. The path is live in
  // production, where the screened cohort carries none: five unrelated companies --
  // consumer audio, cinema advertising, document outsourcing, footwear and gene therapy
  // -- returned 8.3x, 20.3% IRR and 2.51x MOIC to the decimal, because the model runs on
  // the fund default and those are one calculation with five names on it.
  const donor = seededDeals.find((d) => d.workstreams && d.workstreams.length);
  const bare = {
    ...donor,
    id: 'test-no-growth',
    growth: undefined,
    keyFigures: (donor.keyFigures || []).filter((k) => !/growth|cagr|nrr/i.test(k.label)),
  };
  assert.equal(buildReturnsModel(bare).indicative, true, 'the fixture does not exercise the indicative path');
  const c = buildDealCase(bare);
  assert.ok(c.notOnRecord.some((n) => /Indicative only/i.test(n)), 'indicative returns are not declared as such');
});
// On the deal four days from committee the paper reported no blocking workstreams and an
// empty killers list, while its own register said nobody had spoken to a customer,
// referenced the management team below the chief executive, or produced the customer
// schedule the concentration figure is modelled on. Those are precisely "what is not yet
// known", they were graded monitor, and only conditions and repricers reached the page.
// A committee that has to open the register itself has been failed by the page that
// exists to stop it.
test('what nobody has looked at is on the page', () => {
  let carried = 0;
  for (const [id, c] of CASES) {
    const d = seededDeals.find((x) => x.id === id);
    const monitors = buildRiskRegister(d).risks.filter((r) => r.severity === 'monitor');
    // Not on a decided deal: work that will never now be done is a records gap, not a
    // known unknown, and 'voice-of-customer work has not been commissioned' on a signed
    // and archived transaction told a reader nothing they could act on.
    if (!monitors.length || c.decided) continue;
    carried += 1;
    for (const m of monitors) {
      assert.ok(c.notYetKnown.some((u) => u.item === m.risk), `${id}: an unexamined item is on the register and not on the case`);
    }
  }
  assert.ok(carried > 0, 'no deal carried an unexamined item — the guard would be inert');
});

// A base case that misses the fund hurdle is the thing most likely to lose the money and
// it was in a different block: on one deal it appeared nowhere, 15.3% IRR against a 20%
// hurdle, while the killers were a modelled allowance and a rebate finding.
test('a base case that misses the hurdle names the failure first', () => {
  // On a deal whose price nobody has diligenced, the hurdle result is arithmetic on the
  // same invented denominator, so it cannot be the headline either -- the price is. On a
  // deal whose price IS evidenced, the failed hurdle is the first thing that could lose
  // the money. Either way the first row names why, and it is never empty.
  let missed = 0;
  for (const [id, c] of CASES) {
    if (c.decided || c.baseCase.clearsHurdle) continue;
    missed += 1;
    assert.ok(c.againstIt.length, `${id}: misses the hurdle and nothing could kill it`);
    assert.equal(c.againstIt[0].severity, 'stopper', `${id}: the first killer is not a stopper`);
    const unevidenced = /screening default|not a diligenced figure|not a completed result/i
      .test(c.figures.find((f) => /EBITDA/.test(f.label)).basis);
    if (unevidenced) {
      assert.match(c.againstIt[0].risk, /nobody has diligenced|rests on a draft/i, `${id}: the unevidenced price is not the first killer`);
    } else {
      assert.equal(c.againstIt[0].risk, c.baseCase.text, `${id}: the failed hurdle is not the first killer`);
    }
  }
  assert.ok(missed > 0, 'no deal misses the hurdle — the guard would be inert');
});

// The same sentence appeared at two severities inside one object: graded a deal-stopper
// under the killers and a caution under what diligence found, because the register may
// regrade a row and the author's grade was published beside the register's.
test('one row, one severity, across the whole case', () => {
  for (const [id, c] of CASES) {
    for (const r of c.recordedFindings) {
      const asKiller = c.againstIt.find((k) => k.risk === r.finding);
      if (!asKiller) continue;
      assert.equal(r.severity, asKiller.severity, `${id}: "${r.finding.slice(0, 40)}" is ${r.severity} in one section and ${asKiller.severity} in another`);
    }
  }
});

// A signed deal underwritten at 18.3% against a 20% hurdle showed an empty killers list,
// because the failed-hurdle killer was suppressed past the committee. On precisely the
// deals where the money has already gone, an empty list reads as "nothing is wrong".
test('the killers list is never empty on a deal underwritten below the hurdle', () => {
  let below = 0;
  for (const [id, c] of CASES) {
    if (c.baseCase.clearsHurdle) continue;
    below += 1;
    assert.ok(c.againstIt.length, `\heliopack: underwritten below the hurdle and nothing could kill it`);
    if (/screening default|not a diligenced figure|not a completed result/i.test(c.figures.find((f) => /EBITDA/.test(f.label)).basis)) continue;
    assert.equal(c.againstIt[0].risk, c.baseCase.text, `\heliopack: the failed hurdle is not the first killer`);
  }
  assert.ok(below > 0, 'no deal was underwritten below the hurdle — the guard would be inert');
});

// A committee was handed three killers of which two were the same rebate finding: once
// on its own and once quoted verbatim inside the modelled allowance that argues with it.
test('a killer that quotes another killer is one killer', () => {
  for (const [id, c] of CASES) {
    for (let i = 0; i < c.againstIt.length; i += 1) {
      for (let j = i + 1; j < c.againstIt.length; j += 1) {
        const a = c.againstIt[i].risk;
        const b = c.againstIt[j].risk;
        assert.ok(!a.includes(b) && !b.includes(a), `${id}: one killer contains another verbatim`);
      }
    }
  }
});

// Three deals exit their DOWNSIDE on exactly today's EBITDA and a fourth grows it: there
// is no scenario anywhere in this model in which EBITDA falls. For a grocery roll-up
// whose like-for-like growth has just been restated downward, a downside that assumes no
// decline is not a downside -- and the page narrated "Downside breaks the hurdle"
// without ever stating its central assumption.
test('the downside states what it assumes EBITDA does', () => {
  for (const [id, c] of CASES) {
    if (!c.downside) continue;
    assert.match(c.downside.basis, /grows EBITDA|holds EBITDA flat|takes EBITDA from/i,
      `${id}: the downside does not say what it assumes about EBITDA`);
    // And why it needs more equity when the price has not changed -- the returns model
    // writes that sentence and it was never carried onto the page a committee reads.
    assert.match(c.downside.basis, /same enterprise value|financed at/i,
      `${id}: the downside does not explain its own capital structure`);
  }
});

// "Approved" -- by whom, when, on which paper. On a deal whose entire framing is "the
// committee has ruled on this", a reader cannot tell what they are not re-litigating.
test('an approval is attributed, or the page says it is not', () => {
  let written = 0;
  for (const [id, c] of CASES) {
    if (!c.writtenRecommendation) continue;
    written += 1;
    assert.ok(c.writtenRecommendation.attribution, `${id}: a written recommendation with no attribution line`);
    if (!c.writtenRecommendation.approvedBy) {
      assert.match(c.writtenRecommendation.attribution, /does not say who approved it/i,
        `${id}: an unattributed approval does not say it is unattributed`);
    }
  }
  assert.ok(written > 0, 'no deal carried a written recommendation — the guard would be inert');
});

// Not one register row on any deal carries a due date, and the disclosure about missing
// dates covered the blocking workstreams only -- so the register's silence was itself
// silent. "Who is closing it by when" was answered halfway on every deal in the book.
test('every outstanding row carries a date or says there is none', () => {
  for (const [id, c] of CASES) {
    for (const row of c.outstanding) {
      assert.ok(row.dueDate || row.dueNote, `${id}: an outstanding row with neither a date nor a note about its absence`);
    }
  }
});

// The exclusion that keeps self-resolving rows out of the killers is written at the top
// of the selection and the promotion loop four hundred lines later put them straight
// back, so the deal going to committee still listed "reflected in the 7.8x entry" and
// "both counterparties have indicated no objection in writing" as two of the three
// things that could kill it. The fix was written and then bypassed.
test('no killer reports its own resolution, whatever route it arrived by', () => {
  const RESOLVED = /reflected in the [\d.]+x|no objection in writing|already (?:taken|deducted|reflected)|substantially agreed|is sticky and re-prices well|bound at signing/i;
  for (const [id, c] of CASES) {
    for (const r of c.againstIt) {
      assert.doesNotMatch(r.risk, RESOLVED, `${id}: a killer says in its own words that it is dealt with — "${r.risk.slice(0, 70)}"`);
    }
  }
});

// "Downside breaks the hurdle: 19% IRR is below the 20%" put one point of IRR in a model
// among the three things most likely to lose the money. And on a company already owned
// and in exit preparation, a modelled downside sensitivity was the single named killer.
test('a downside is only a killer when it misses by something worth a vote', () => {
  for (const [id, c] of CASES) {
    const row = c.againstIt.find((r) => /^Downside breaks the hurdle/.test(r.risk));
    if (!row) continue;
    assert.equal(c.decided, false, `${id}: a modelled sensitivity is a named killer on a decided deal`);
    assert.ok(c.downside.moic < 1.8 || c.downside.irr < 18,
      `${id}: a downside missing by less than a rounding tolerance is presented as a killer`);
  }
});

// "Nobody has produced it" is true of a screening default and false of a QoE draft, and
// the killer said it anyway -- four sections above the page's own line reading "Recorded
// from CIM p.14 / QoE draft at high confidence". A draft is not a result and it is not
// nothing.
test('a draft price and an unproduced price are described differently', () => {
  let drafts = 0;
  let unproduced = 0;
  for (const [id, c] of CASES) {
    const basis = c.figures.find((f) => /EBITDA/.test(f.label)).basis;
    const first = c.againstIt[0];
    if (/not a completed result/i.test(basis)) {
      drafts += 1;
      assert.match(first.risk, /rests on a draft/i, `${id}: a draft-sourced price is not described as a draft`);
      assert.doesNotMatch(first.risk, /nobody has produced|nobody has diligenced/i, `${id}: says nobody produced a figure a draft produced`);
    } else if (/screening default|not a diligenced figure/i.test(basis) && !c.decided) {
      unproduced += 1;
      assert.match(first.risk, /nobody has diligenced/i, `${id}: an unproduced price is not named as one`);
    }
  }
  assert.ok(drafts > 0 && unproduced > 0, 'both price paths must be exercised or the guard is half inert');
});

// "Expensing them moves the entry multiple from 9.4x to 10.1x" on a deal whose ask, base
// case and provision all say 8.3x. 8.3x and 9.4x are the same number on the same page and
// a reader stops there. `reconcileFindingText` was written for exactly this -- its own
// comment records the committee member who counted four multiples on one deal and said
// they would not repeat any of them -- and it was never called from anywhere. Written,
// not wired, which is the same shape as the filter bypassed the round before.
test('a multiple quoted inside a finding is reconciled to the one on the page', () => {
  // The stored records carry the absolute wording; the seed carries the relative one, so
  // this drives the reconciler directly rather than passing on a fixture that never
  // exercises it. Production is where "expensing them moves the entry multiple from 9.4x
  // to 10.1x" appeared on a deal whose ask, base case and provision all said 8.3x.
  const d = seededDeals.find((x) => x.id === 'lumen-analytics');
  const raw = 'Capitalised development costs sit above peer practice; expensing them moves the entry multiple from 9.4x to 10.1x.';
  const out = reconcileFindingText(raw, d);
  assert.notEqual(out, raw, 'the reconciler left an absolute multiple that contradicts the page');
  assert.doesNotMatch(out, /from 9\.4x/, 'the contradicting multiple survives');

  // And it is wired: every text the case publishes goes through it.
  for (const [id, c] of CASES) {
    const published = c.ask ? c.ask.entryMultiple : null;
    if (!Number.isFinite(published)) continue;
    for (const t of [...c.againstIt.map((r) => r.risk), ...c.outstanding.map((r) => r.text)]) {
      const m = /entry multiple (?:from|to|of|becomes) ([\d.]+)x/i.exec(t);
      if (m) assert.ok(Number(m[1]) >= published - 0.15, `${id}: a finding quotes ${m[1]}x where the page publishes ${published}x`);
    }
  }
});
// Three deals in the same state -- an entry multiple on an EBITDA nobody has produced --
// returned DECLINE, NOT ENOUGH ON THE RECORD TO DECIDE and NOT ON THIS PRICE. Three names
// for one condition means the committee cannot rely on the verdict word, which is the
// only word on the page some readers will read.
test('one state, one verdict word', () => {
  // Three deals in the same state returned DECLINE, NOT ENOUGH ON THE RECORD TO DECIDE
  // and NOT ON THIS PRICE. The verdict word is the only thing on the page some readers
  // read. A draft price and an unproduced price are DIFFERENT states -- "the EBITDA is
  // not on the record" is false where a QoE draft produced it -- so they are counted
  // apart, and each must have exactly one word.
  const groups = new Map();
  for (const [id, c] of CASES) {
    if (c.decided) continue;
    const d = seededDeals.find((x) => x.id === id);
    if (buildRiskRegister(d).risks.some((r) => r.severity === 'stopper')) continue;
    const basis = c.figures.find((f) => /EBITDA/.test(f.label)).basis;
    const draft = /not a completed result/i.test(basis);
    const unproduced = /screening default|not a diligenced figure/i.test(basis);
    if (!draft && !unproduced) continue;
    const key = draft ? 'draft' : 'unproduced';
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(c.recommendation.call);
  }
  assert.ok(groups.size > 0, 'no deal exercised an unevidenced-price state — the guard would be inert');
  for (const [state, words] of groups) {
    assert.equal(words.size, 1, `the "${state}" state returned ${words.size} different verdict words: ${[...words].join(' / ')}`);
  }
});

// The returns model restating itself was consuming a killer slot on thirteen deals, and
// on two of them it cost the last slot outright: a technology lane nobody had opened,
// and a change-of-control consent on two of the five largest customers, neither of which
// made the list because the scenario table had already taken the space.
test('the scenario table never crowds out something diligence found', () => {
  for (const [id, c] of CASES) {
    const fromModel = c.againstIt.filter((r) => r.basis === 'the returns model').length;
    const fromRecord = c.againstIt.length - fromModel;
    if (c.againstIt.length < 3) continue;
    // With a full list, at most one slot may go to the model restating itself, and only
    // once everything on the record has had one.
    assert.ok(fromModel <= 1 || fromRecord === 0,
      `${id}: ${fromModel} of 3 killers are the returns model talking about itself`);
  }
});

// "Warehouse consolidation on track; one site slipped a quarter on lease timing" was
// promoted to a thing that could kill the deal. The previous fix listed the four strings
// caught in review, which fixed those four and not the class.
test('a row reporting that the thing is handled is never a killer', () => {
  const HANDLED = /\bon track\b|\bin place\b|\bsecured\b|\bcleared\b|no objection in writing|costed into the model|within tolerance|re-prices well/i;
  for (const [id, c] of CASES) {
    for (const r of c.againstIt) {
      // Only rows drawn from the register. The composed rows describe an absence and
      // legitimately use words like "no completed result is on the record".
      if (r.basis === 'the returns model' || r.basis === 'the deal record') continue;
      assert.doesNotMatch(r.risk, HANDLED, `${id}: a killer reports that it is handled — "${r.risk.slice(0, 70)}"`);
    }
  }
});

// A partner would have read "returns clear the hurdle", quoted it, been asked about the
// downside, and been caught out on their own deal. The headline names both legs.
test('a headline that says the returns clear does not hide a downside that breaks', () => {
  let hidden = 0;
  for (const [id, c] of CASES) {
    if (!/clears the hurdle/i.test(c.recommendation.because)) continue;
    if (!c.downside || c.downside.clearsHurdle) continue;
    hidden += 1;
    assert.match(c.recommendation.because, /the downside does not/i,
      `${id}: the headline says the returns clear and says nothing about a downside that breaks`);
  }
  assert.ok(hidden > 0, 'no deal exercised the clearing-base/breaking-downside path — the guard would be inert');
});

// "Lane" is the code's word for a workstream and it reached a partner's screen twice.
test('the case never calls a workstream a lane', () => {
  for (const [id, c] of CASES) {
    const prose = [
      ...c.notOnRecord,
      ...c.againstIt.map((r) => `${r.risk} ${r.mitigation || ''} ${r.basisNote || ''}`),
      ...c.notYetKnown.map((r) => r.item),
      ...c.outstanding.map((r) => r.text),
      c.recommendation.because,
      c.outstandingNote,
    ].join(' ');
    assert.doesNotMatch(prose, /\blanes?\b/i, `${id}: "lane" reached the reader`);
  }
});

// An analyst read their own outstanding list and found the committee items -- the papers,
// the memo sections, the compliance clearance, all of which are theirs -- with nobody
// against them, then copied them into a spreadsheet because the product said no one
// owned them.
test('every outstanding row says who it belongs to', () => {
  for (const [id, c] of CASES) {
    for (const row of c.outstanding) {
      assert.ok(row.owner, `${id}: an outstanding row with no owner — "${row.text.slice(0, 60)}"`);
    }
  }
});

// A row whose whole text already appears inside another row is the same obligation
// twice. One deal listed ten outstanding items where the tenth was a sentence quoted
// verbatim inside the third.
test('no outstanding row is quoted verbatim inside another', () => {
  for (const [id, c] of CASES) {
    for (let i = 0; i < c.outstanding.length; i += 1) {
      for (let j = 0; j < c.outstanding.length; j += 1) {
        if (i === j) continue;
        const a = c.outstanding[i].text;
        const b = c.outstanding[j].text;
        assert.ok(!(b.length > a.length && b.includes(a)), `${id}: an outstanding row is contained in another`);
      }
    }
  }
});

// Findings are quoted in the currency of the document they came from and the model is
// struck in the deal's. On one deal that put "EUR 4.1M of ARR" in the register against
// $29M of EBITDA in the figures, with no rate anywhere.
test('a finding in another currency is declared as one', () => {
  let mixed = 0;
  for (const [id, c] of CASES) {
    const d = seededDeals.find((x) => x.id === id);
    const own = d.currency || 'USD';
    const texts = [
      ...c.againstIt.map((r) => r.risk),
      ...c.outstanding.map((r) => r.text),
      ...c.recordedFindings.map((r) => r.finding),
    ].join(' ');
    const others = [...texts.matchAll(/\b(EUR|GBP|USD|CHF|SEK|NOK|DKK)\s?[\d.]/g)].map((m) => m[1]).filter((x) => x !== own);
    if (!others.length) continue;
    mixed += 1;
    assert.ok(
      c.notOnRecord.some((n) => /No exchange rate is on the record/i.test(n)),
      `${id}: quotes ${[...new Set(others)].join('/')} against a ${own} model and does not say so`,
    );
  }
  assert.ok(mixed > 0, 'no deal mixed currencies — the guard would be inert');
});
