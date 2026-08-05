// ===========================================================================
//  THE CASE — what a committee member reads cold, composed from the record
// ===========================================================================
// An IC member opened a deal an hour before the committee sat and found the memo's
// recommendation section stored as `{status: "empty", content: ""}` and value creation
// as an empty string. Their words: "I am asked to approve $240M against a thesis
// paragraph." The papers are written by people and most of them had not been; but the
// record already holds the ask, the returns, the register and the readiness board, and
// declining to put them in one place because a human has not typed a memo is a filing
// convention, not an answer.
//
// So this composes the case from what is on file. It is NOT the analyst's memo and never
// claims to be — `composed` is true and the note says where it came from.
//
// THE SECOND READ FOUND THE PAGE BREAKING ITS OWN PROMISES, AND THOSE ARE THE RULES NOW
// The first version said "the register carries nothing outstanding" ten lines above the
// register; filed a sub-hurdle base case under "the case FOR it"; wrote "downside holds
// at 1.19x / 3.5% IRR" against a 2x / 20% hurdle; said "a larger $256M equity cheque"
// where base and downside were both $256M; printed "Growth underwritten at 41%" where
// the model underwrites 15% and says so; printed "Growth underwritten at 7." with no
// unit; and asked a committee to authorise money on deals that had already signed.
// Every one of those is the same fault: a sentence written once and then not checked
// against the number it was about to sit beside. The guards are in the tests.
import { buildReturnsModel, buildRiskRegister, canonicalFigures } from './diligence.js';
import { computeICReadiness } from './icReadiness.js';
import { validateCitations } from './citations.js';
import { money as fmtMoney, symbolFor } from './money.js';

const SEVERITY_RANK = { stopper: 0, reprice: 1, condition: 2, monitor: 3 };

// Statuses at or past the committee decision. On these the committee is not being asked
// for money — it has already been given. Printing "Authorise up to $290M" and "DO NOT
// PROCEED ON THESE TERMS" against a deal whose own record reads "IC approved; deal
// archived" asks a reader to decline something that cannot be declined, and to fund
// something that is already funded.
const DECIDED = new Set(['approved', 'signing', 'signed', 'closed', 'owned', 'exiting', 'exited']);
const isDecided = (deal) => DECIDED.has(String(deal.status || '').toLowerCase());

// How the number got onto the page, in words a committee member can act on. "derived"
// on its own is a label; it does not tell a reader whether to trust the multiple.
function figureBasis(kind, canon, deal) {
  const cur = canon.currency;
  if (kind === 'ev') {
    return deal.dealSize
      ? 'Recorded on the deal as the enterprise value being pursued.'
      : 'No enterprise value is recorded on the deal; this is the screening default.';
  }
  if (kind === 'ebitda') {
    if (canon.ebitdaSource === 'recorded') return 'Recorded on the deal from diligence.';
    if (canon.ebitdaSource === 'implied by the recorded entry multiple') {
      return `Not recorded. Implied by dividing the ${cur}${canon.ev}M enterprise value by the ${canon.entryMultiple}x multiple the record states.`;
    }
    return 'Not recorded. This is 12% of enterprise value — the screening default the model falls back to when no EBITDA is on file. The multiple below rests on it.';
  }
  if (kind === 'multiple') {
    return canon.entryMultipleSource === 'recorded'
      ? 'Stated on the deal record.'
      : `Derived: ${cur}${canon.ev}M enterprise value over ${cur}${canon.ebitda}M EBITDA.`;
  }
  if (kind === 'revenue') {
    return canon.revenueRecorded ? 'Recorded on the deal from diligence.' : 'Not recorded. Screening estimate at 1.2x enterprise value.';
  }
  return null;
}

// The things that could kill it, in the order a committee should hear them: deal-stoppers
// first, then anything that moves the price, then closing conditions. Monitors are
// excluded — a committee asked to weigh five monitors alongside a stopper has been given
// a list, not a case.
//
// `basis` travels with the row. Every register row on every deal is currently stamped
// `templated`, and among them are rows reading "historic VAT exposure identified" and
// "cyber posture is adequate" — a template cannot identify an exposure or pronounce a
// posture adequate. The API was honest about it and this page was dropping the one field
// that told a reader whether anybody had looked.
function againstIt(register) {
  return (register.risks || [])
    .filter((r) => r.severity !== 'monitor')
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))
    .slice(0, 3)
    .map((r) => ({
      risk: r.risk,
      severity: r.severity,
      severityLabel: r.severityLabel,
      likelihood: r.likelihood || null,
      workstream: r.workstream || null,
      owner: r.owner || null,
      mitigation: r.mitigation || null,
      basis: r.basis || null,
      basisNote: r.basis === 'templated'
        ? 'Standard row for this workstream. No named author has written a finding against it.'
        : null,
    }));
}

// What the committee is actually being asked to authorise, as one sentence plus the
// numbers behind it. A vote is on an amount, and the amount was on a different page.
//
// The equity line reconciles here rather than a page away: the ask used to read "$96M
// equity cheque" beside a sources-and-uses showing $94M of sponsor equity, with the
// explanation on the returns page the reader had not been sent to.
function theAsk(canon, returns, deal) {
  const m = (v) => fmtMoney(v, symbolFor(deal));
  const base = (returns.scenarios || []).find((s) => /base/i.test(s.name)) || null;
  if (!base) return null;
  const sponsor = ((returns.sourcesUses || {}).sources || []).find((x) => /sponsor equity/i.test(x.label));
  const decided = isDecided(deal);
  return {
    // Past the decision this is a record of what was authorised, not a request. The
    // verb is the whole difference and it was wrong on eight deals.
    headline: decided
      ? `Committed: ${m(base.entryEV)} enterprise value at ${canon.entryMultiple}x, funded with a ${m(base.equityIn)} equity cheque and ${m(base.debt)} of debt at ${canon.leverage}. This deal is past the committee decision.`
      : `Authorise up to ${m(base.entryEV)} enterprise value at ${canon.entryMultiple}x, funded with a ${m(base.equityIn)} equity cheque and ${m(base.debt)} of debt at ${canon.leverage}.`,
    decided,
    enterpriseValue: base.entryEV,
    equityCheque: base.equityIn,
    debt: base.debt,
    leverage: canon.leverage,
    currency: canon.currency,
    equityNote: sponsor && Math.round(sponsor.amount) !== Math.round(base.equityIn)
      ? (returns.sourcesUses || {}).equityBasisNote || null
      : null,
  };
}

// The case FOR the deal, each point tied to a figure rather than an adjective. A point
// that does not survive contact with its own number is not made — it goes to the reading
// below instead. Filing "does not clear the fund hurdle" under the case for it was the
// single worst line on the first version of this page.
function forIt(deal, canon, returns) {
  const m = (v) => fmtMoney(v, symbolFor(deal));
  const base = (returns.scenarios || []).find((s) => /base/i.test(s.name));
  const down = (returns.scenarios || []).find((s) => /down/i.test(s.name));
  const hurdle = returns.hurdle || { irr: 20, moic: 2 };
  const out = [];
  if (base && returns.meetsHurdle) {
    out.push({
      point: `Base case returns ${base.moic}x on ${base.irr}% IRR over ${canon.holdYears} years`,
      basis: `${m(base.equityIn)} in, ${m(base.equityOut)} out. Clears the fund hurdle of ${hurdle.irr}% / ${hurdle.moic}x.`,
    });
  }
  // "Downside holds at 1.19x / 3.5% IRR" appeared on twenty of twenty-four deals against
  // a 2x / 20% hurdle. The one question asked of a downside is whether it breaks the
  // hurdle, and the page answered "holds" without testing it. It only appears here when
  // it earns the place; either way it is stated in full below.
  if (down && down.moic >= hurdle.moic && down.irr >= hurdle.irr) {
    out.push({
      point: `Downside still clears the hurdle at ${down.moic}x / ${down.irr}% IRR`,
      basis: `Modelled on an exit EBITDA of ${m(down.exitEbitda)}${base && down.equityIn > base.equityIn ? ` and a larger ${m(down.equityIn)} equity cheque` : ''}.`,
    });
  }
  // Say what is being underwritten, not what is on the record, and say it with a unit.
  // Growth used to be emitted here unconditionally, so on a deal recommended DO NOT
  // PROCEED *because* 3% growth produces a 15.3% IRR, the 3% was filed as a point in
  // favour. It is neither for nor against on its own -- it is the assumption the whole
  // model turns on, and it now has its own line above both.
  if (deal.thesis) out.push({ point: 'The thesis on file', basis: String(deal.thesis).trim() });
  return out;
}

// The base case, stated once, in the returns page's own words -- which name the failing
// leg where there is one: "the 2.32x clears the 2x hurdle; the 18.3% IRR does not reach
// 20%". Pulling a sub-hurdle base case out of the case FOR the deal was right; leaving
// it off the page altogether was not, and a decided deal ended up with no return figure
// on it at all and a failing downside as the only multiple in sight.
function theBaseCase(deal, returns, canon) {
  const m = (v) => fmtMoney(v, symbolFor(deal));
  const base = (returns.scenarios || []).find((s) => /base/i.test(s.name));
  if (!base) return null;
  return {
    moic: base.moic,
    irr: base.irr,
    holdYears: canon.holdYears,
    clearsHurdle: !!returns.meetsHurdle,
    text: returns.headline,
    basis: `${m(base.equityIn)} in, ${m(base.equityOut)} out over ${canon.holdYears} years.`,
    growth: returns.growthBasis || null,
  };
}

// The downside, stated once, whether or not it helps. It belongs on the page either way
// — a committee that only sees a downside when it flatters the case is not being shown
// a downside.
function theDownside(deal, returns) {
  const m = (v) => fmtMoney(v, symbolFor(deal));
  const down = (returns.scenarios || []).find((s) => /down/i.test(s.name));
  const base = (returns.scenarios || []).find((s) => /base/i.test(s.name));
  const hurdle = returns.hurdle || { irr: 20, moic: 2 };
  if (!down) return null;
  const clears = down.moic >= hurdle.moic && down.irr >= hurdle.irr;
  const legs = [];
  if (down.moic < hurdle.moic) legs.push(`${down.moic}x is below the ${hurdle.moic}x`);
  if (down.irr < hurdle.irr) legs.push(`${down.irr}% IRR is below the ${hurdle.irr}%`);
  return {
    moic: down.moic,
    irr: down.irr,
    clearsHurdle: clears,
    text: clears
      ? `Downside clears the hurdle at ${down.moic}x / ${down.irr}% IRR.`
      : `Downside breaks the hurdle: ${legs.join(' and ')}.`,
    basis: `Exit EBITDA of ${m(down.exitEbitda)}${base && down.equityIn > base.equityIn ? `, on a larger ${m(down.equityIn)} equity cheque than the base case` : `, on the same ${m(down.equityIn)} equity cheque as the base case`}.`,
  };
}

// The analyst's own recommendation, where one has been written, printed beside the
// composed reading rather than replaced by it — and where the two disagree, said so.
// On one deal the approved memo claimed "no unresolved risk-level findings" while the
// register carried three open conditions and the readiness board agreed with the
// register. The product held the conflict and buried it.
function writtenRecommendation(deal, conditionCount) {
  const sec = (deal.memoSections || []).find((s) => s.key === 'recommendation');
  if (!sec || !sec.content || sec.status === 'empty') return null;
  const text = String(sec.content).trim();
  const claimsClean = /no\s+(unresolved|outstanding|open)\b/i.test(text);
  return {
    text,
    status: sec.status || null,
    length: text.length,
    conflict: claimsClean && conditionCount > 0
      ? `The written recommendation reports nothing unresolved. The register carries ${conditionCount} open item${conditionCount === 1 ? '' : 's'}, listed below.`
      : null,
  };
}

// The revenue line. Where the record holds no revenue the model estimates one at 1.2x
// enterprise value — which on Lumen put $288M beside a recorded ARR of $58M, a fivefold
// contradiction between two lines of the same page, and implied a 50% EBITDA margin on
// a 41%-growth software asset. The two are different metrics and the model is right not
// to conflate them; publishing the estimate anyway, next to a recorded figure it cannot
// be reconciled with, is what makes a reader stop and ask who checked it. So where a
// recurring-revenue figure is on the record, that is the line, and the absence of a
// total is stated rather than filled in.
function revenueFigure(canon, deal) {
  const arr = (deal.keyFigures || []).find((k) => /\barr\b|recurring revenue/i.test(k.label));
  if (!canon.revenueRecorded && arr) {
    return {
      label: `Recurring revenue (${arr.label})`,
      value: String(arr.value),
      basis: `Recorded on the deal${arr.source ? ` from ${arr.source}` : ''}. No total revenue figure is on the record, and the screening estimate is not shown beside this because the two cannot be reconciled.`,
    };
  }
  return { label: 'Revenue', value: `${canon.currency}${canon.revenue}M`, basis: figureBasis('revenue', canon, deal) };
}

export function buildDealCase(deal) {
  const canon = canonicalFigures(deal);
  if (!canon) return null;
  const returns = buildReturnsModel(deal);
  const register = buildRiskRegister(deal);
  const board = computeICReadiness(deal);
  const v = board.verdict || {};
  const risks = againstIt(register);
  const conditions = (register.risks || []).filter((r) => r.severity === 'condition');
  const decided = isDecided(deal);

  // The call. Not a view — an arithmetic reading of the record, stated as such.
  //
  // It is counted off the rows this page actually prints. The first version read
  // `verdict.conditionsTotal`, which is a different count computed a different way, and
  // so announced "the register carries nothing outstanding" ten lines above a register
  // with two conditions on it. One page, one count, taken from the thing being shown.
  const openCount = conditions.length + register.counts.reprice;
  const call = decided
    ? 'ALREADY DECIDED'
    : register.counts.stopper ? 'DECLINE'
      : !returns.meetsHurdle ? 'DO NOT PROCEED ON THESE TERMS'
        : openCount ? 'PROCEED, SUBJECT TO CONDITIONS'
          : 'PROCEED';
  const because = decided
    ? `${deal.stageName || deal.stage} — the committee has ruled on this deal. What follows is the case as the record now stands, not a request for authorisation.`
    : register.counts.stopper
      ? `${register.counts.stopper} deal-stopper on the register.`
      : !returns.meetsHurdle
        ? returns.headline
        : openCount
          ? `Returns clear the hurdle; ${openCount} item${openCount === 1 ? '' : 's'} on the register to settle before signing.`
          : 'Returns clear the hurdle and the register carries no conditions or repricing items.';

  // What the committee is NOT being given. A reader who cannot see the gap will assume
  // there isn't one, and the papers most often missing are the ones a vote depends on.
  const written = (deal.memoSections || []).filter((s) => s.status && s.status !== 'empty').length;
  const notOnRecord = [];
  if (!(deal.memoSections || []).length) notOnRecord.push('No IC memo sections have been opened on this deal.');
  else if (written < (deal.memoSections || []).length) notOnRecord.push(`${(deal.memoSections || []).length - written} of ${(deal.memoSections || []).length} memo sections are unwritten.`);
  if (canon.ebitdaSource === 'derived') notOnRecord.push('No EBITDA has been recorded from diligence; the entry multiple rests on a screening default.');
  if (returns.provision) notOnRecord.push(returns.provision.note);
  // Every open item carries an owner and a workstream and not one carries a date. That
  // is a fact about the record and it belongs here rather than being left for a reader
  // to notice on their own.
  const undated = (board.blockingWorkstreams || []).filter((b) => !b.dueDate);
  for (const b of (board.blockingWorkstreams || [])) {
    notOnRecord.push(`${b.label}: ${b.reasons.join('; ')}${b.dueDate ? ` — due ${b.dueDate}` : ''}.`);
  }
  if (undated.length) notOnRecord.push(`No completion date is committed on the record for any of the ${undated.length} outstanding workstream${undated.length === 1 ? '' : 's'} above.`);
  if (risks.length && risks.every((r) => r.basis === 'templated')) {
    notOnRecord.push('Every risk below is the standard row for its workstream. None was written by a named author against this company.');
  }

  return {
    kind: 'deal-case',
    dealId: deal.id,
    company: deal.company,
    sector: deal.sector,
    // Said plainly and first, because the one thing this must never be mistaken for is
    // a paper somebody signed.
    composed: true,
    composedNote: 'Composed from the deal record — the returns model, the risk register and the committee-readiness board. It is not the analyst\'s memo and nobody has approved it.',
    decided,
    readiness: { state: v.state || null, headline: v.headline || null, gating: v.gating || [] },
    recommendation: { call, because },
    writtenRecommendation: writtenRecommendation(deal, openCount),
    ask: theAsk(canon, returns, deal),
    baseCase: theBaseCase(deal, returns, canon),
    forIt: forIt(deal, canon, returns),
    downside: theDownside(deal, returns),
    againstIt: risks,
    figures: [
      { label: 'Enterprise value', value: `${canon.currency}${canon.ev}M`, basis: figureBasis('ev', canon, deal) },
      { label: 'LTM EBITDA', value: `${canon.currency}${canon.ebitda}M`, basis: figureBasis('ebitda', canon, deal) },
      { label: 'Entry multiple', value: `${canon.entryMultiple}x`, basis: figureBasis('multiple', canon, deal) },
      revenueFigure(canon, deal),
      { label: 'Leverage', value: canon.leverage, basis: 'Modelled at the financeable ceiling for the sector.' },
    ],
    conditions: conditions.map((r) => ({ condition: r.risk, owner: r.owner || null, workstream: r.workstream || null })),
    // One list of everything outstanding. A committee member an hour from a vote found
    // the readiness board naming a regulatory clearance and a financing condition, and
    // the register naming a working-capital peg and change-of-control consents: four
    // items, two lists, no overlap, neither a superset, and a headline that counted two.
    // The paper could not tell them whether the deal had two obligations or four.
    outstanding: (() => {
      const seen = new Set();
      const rows = [];
      const add = (text, from, owner) => {
        const key = String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
        if (!key || seen.has(key)) return;
        seen.add(key);
        rows.push({ text: String(text), from, owner: owner || null });
      };
      for (const g of (v.gating || [])) add(g, 'committee readiness');
      for (const r of conditions) add(r.risk, 'risk register', r.owner || null);
      for (const r of (register.risks || []).filter((x) => x.severity === 'reprice')) add(r.risk, 'risk register', r.owner || null);
      return rows;
    })(),
    // The board already audits how much of the case traces to a source, and scores Lumen
    // at 40 with the reason written out -- "IC ask derived from unsourced Revenue &
    // EBITDA". It was on a different page from the ask it is about.
    citations: (() => {
      const a = validateCitations(deal);
      if (!a) return null;
      return { score: a.score, summary: a.summary, clean: a.clean, sourced: a.sourcedClaims, total: a.totalClaims };
    })(),
    notOnRecord,
    // Where a reader goes to check any of it, rather than taking the composition on
    // trust. Comparables is on this list because the only question that matters on
    // price — is this multiple right for this sector — was one tab away and unlinked.
    checkAgainst: [
      { label: 'Returns, plan & risk', path: 'returns' },
      { label: 'Risk register', path: 'risk-register' },
      { label: 'Committee readiness', path: 'ic-readiness' },
      { label: 'Comparables & precedents', path: 'comparables' },
      { label: 'Data room', path: 'documents' },
    ],
  };
}
