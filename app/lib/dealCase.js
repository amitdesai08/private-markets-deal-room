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
import { compsForDeal } from './fabric.js';
import { ownerLabel } from './cockpit.js';
import { money as fmtMoney, symbolFor } from './money.js';

const SEVERITY_RANK = { stopper: 0, reprice: 1, condition: 2, monitor: 3 };

// Statuses at or past the committee decision. On these the committee is not being asked
// for money — it has already been given. Printing "Authorise up to $290M" and "DO NOT
// PROCEED ON THESE TERMS" against a deal whose own record reads "IC approved; deal
// archived" asks a reader to decline something that cannot be declined, and to fund
// something that is already funded.
const DECIDED = new Set(['approved', 'signing', 'signed', 'closed', 'owned', 'exiting', 'exited']);
const isDecided = (deal) => DECIDED.has(String(deal.status || '').toLowerCase());

// A source that is not diligence. "Screen", "Teaser" and "Broker model" are the vendor's
// numbers or our own arithmetic off the asking price; treating them as diligenced is how
// four real public companies -- among them a clinical-stage gene-therapy registrant --
// came to carry "$375M revenue, $36M LTM EBITDA, Recorded on the deal from diligence",
// scored 100 out of 100 for sourcing. $36M is 12% of the $300M asking price and $375M is
// 125% of it. The disclosure machinery existed and did not fire, because the figures were
// on the record: they were just never diligenced.
const UNDILIGENCED_SOURCE = /^(screen|screening|teaser|cim|broker model|desk|desk research|derived|estimate)$/i;

function recordedFigure(deal, pattern) {
  return (deal.keyFigures || []).find((k) => pattern.test(String(k.label || ''))
    && !/margin|vs|growth|uplift|delta|change/i.test(String(k.label || '')));
}

function sourcedBasis(kf, fallback) {
  if (!kf) return fallback;
  const src = String(kf.source || '').trim();
  const conf = String(kf.confidence || '').trim();
  if (UNDILIGENCED_SOURCE.test(src)) {
    return `Recorded at ${/teaser/i.test(src) ? 'the teaser' : /broker/i.test(src) ? 'the broker model' : 'screening'} (${src}${conf ? `, ${conf} confidence` : ''}) — not a diligenced figure. No workstream has confirmed it.`;
  }
  return `Recorded on the deal from ${src || 'diligence'}${conf ? ` at ${conf} confidence` : ''}.`;
}

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
    if (canon.ebitdaSource === 'recorded') return sourcedBasis(recordedFigure(deal, /ebitda/i), 'Recorded on the deal from diligence.');
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
    return canon.revenueRecorded ? sourcedBasis(recordedFigure(deal, /revenue/i), 'Recorded on the deal from diligence.') : 'Not recorded. Screening estimate at 1.2x enterprise value.';
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
    // A deal-stopper, or something that moves the price. Nothing else.
    //
    // This admitted closing conditions, so a mechanical working-capital true-up that
    // appears on every deal in the fund was presented to a committee as one of the three
    // things most likely to kill the deal, alongside a consent point quoted with its own
    // evidence that it was closed. A committee that reads three rows and finds none of
    // them capable of killing anything stops reading the section. Conditions have not
    // disappeared -- they are obligations, and they are on the outstanding list where a
    // reader can act on them.
    .filter((r) => r.severity === 'stopper' || r.severity === 'reprice')
    // Severity first, and within a severity a row somebody wrote before a row nobody
    // did. A committee reading three killers should be reading the three things the
    // diligence found, where the diligence found anything.
    .sort((a, b) => ((SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))
      || ((a.basis === 'recorded' ? 0 : 1) - (b.basis === 'recorded' ? 0 : 1)))
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
  // The ask took its enterprise value from the scenario and its multiple from the
  // canonical figures, and on one deal those are struck on different numbers: it read
  // "Committed: $670M enterprise value at 4.1x" where 670 over 134 is 5.0x. The
  // reconciliation note was added to the returns page and the entry-multiple basis, and
  // this line -- the one a committee actually reads -- was left saying the wrong thing.
  const entry = returns.entry || {};
  const mult = entry.ties === false && Number.isFinite(entry.ebitda) && entry.ebitda > 0
    ? +(base.entryEV / entry.ebitda).toFixed(1)
    : canon.entryMultiple;
  const multNote = mult !== canon.entryMultiple
    ? ` The record states ${canon.entryMultiple}x; that multiple is struck on a lower enterprise value than the one funded here.`
    : '';
  return {
    // Past the decision this is a record of what was authorised, not a request. The
    // verb is the whole difference and it was wrong on eight deals.
    headline: decided
      ? `Committed: ${m(base.entryEV)} enterprise value at ${mult}x, funded with a ${m(base.equityIn)} equity cheque and ${m(base.debt)} of debt at ${canon.leverage}. This deal is past the committee decision.${multNote}`
      : `Authorise up to ${m(base.entryEV)} enterprise value at ${mult}x, funded with a ${m(base.equityIn)} equity cheque and ${m(base.debt)} of debt at ${canon.leverage}.${multNote}`,
    decided,
    entryMultiple: mult,
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
function forIt(deal, canon, returns, tooEarly) {
  const m = (v) => fmtMoney(v, symbolFor(deal));
  const base = (returns.scenarios || []).find((s) => /base/i.test(s.name));
  const down = (returns.scenarios || []).find((s) => /down/i.test(s.name));
  const hurdle = returns.hurdle || { irr: 20, moic: 2 };
  const out = [];
  // A return computed off a denominator nobody has diligenced is not an argument for the
  // deal. It was being offered as one on the very deals the page had just called not
  // decidable, which is the page arguing with itself two sections apart.
  if (base && returns.meetsHurdle && !tooEarly) {
    out.push({
      point: `Base case returns ${base.moic}x on ${base.irr}% IRR over ${canon.holdYears} years`,
      basis: `${m(base.equityIn)} in, ${m(base.equityOut)} out. Clears the fund hurdle of ${hurdle.irr}% / ${hurdle.moic}x.`,
    });
  }
  // "Downside holds at 1.19x / 3.5% IRR" appeared on twenty of twenty-four deals against
  // a 2x / 20% hurdle. The one question asked of a downside is whether it breaks the
  // hurdle, and the page answered "holds" without testing it. It only appears here when
  // it earns the place; either way it is stated in full below.
  if (down && down.moic >= hurdle.moic && down.irr >= hurdle.irr && !tooEarly) {
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
    // The assumption the whole MOIC rests on, and it was on a different page. A reader
    // asked to source the most important number in the paper had to open a second tab,
    // which is the one test this section exists to pass.
    exit: Number.isFinite(base.exitEbitda) && Number.isFinite(base.exitEV)
      ? (() => {
        const mult = (s) => (s && Number.isFinite(s.exitEV) && Number.isFinite(s.exitEbitda) ? +(s.exitEV / Math.max(1, s.exitEbitda)).toFixed(1) : null);
        const xm = mult(base);
        const delta = +(xm - canon.entryMultiple).toFixed(1);
        // "No multiple expansion is assumed" was true of the base case and printed as
        // though it were true of the model. One deal exits its upside a full turn above
        // entry, and that turn is carrying the upside IRR. An undeclared assumption is a
        // gap; a declared assumption that is false in two scenarios out of three is a
        // misstatement, and it is the sentence a partner repeats in the room.
        const others = (returns.scenarios || [])
          .filter((s) => !/base/i.test(s.name))
          .map((s) => ({ name: s.name, x: mult(s) }))
          .filter((s) => s.x != null);
        const spread = others.length
          ? ` The other scenarios do not hold it flat: ${others.map((s) => `${s.name.toLowerCase()} exits at ${s.x}x`).join(' and ')}.`
          : '';
        const note = Math.abs(delta) < 0.05
          ? ` The base case assumes no multiple expansion — it is made on EBITDA growth and debt paydown alone.${spread}`
          : delta > 0
            ? ` The base case assumes ${delta}x of multiple expansion, which it depends on and the record does not evidence.${spread}`
            : ` The base case exits ${Math.abs(delta)}x below entry — it is made without any help from the exit multiple.${spread}`;
        return `Exit modelled at ${m(base.exitEbitda)} of EBITDA and ${m(base.exitEV)} of enterprise value — ${xm}x, against ${canon.entryMultiple}x at entry.${note}`;
      })()
      : null,
    growth: returns.growthBasis || null,
    // The model underwrites the growth on the record. Where a workstream has written
    // that the presented growth is overstated, those two sentences sat on the same deal
    // with nothing connecting them -- and on one deal that finding IS the deal: "like-
    // for-like growth is 1.8% once the eleven stores opened in the period are stripped
    // out, against 3.1% presented".
    growthContradicted: (deal.workstreams || [])
      .flatMap((w) => (w.findings || []))
      .map((f) => String(f?.text || ''))
      .find((t) => /(like-for-like|underlying|organic).{0,60}(growth|lfl)/i.test(t) && /against|versus|\bvs\b|presented|reported/i.test(t)) || null,
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

// Is this multiple right for this sector? It is the only question that matters on price,
// the comparable transactions to answer it were two clicks away, and a committee member
// had to do the arithmetic themselves — which is the thing the comparables route was
// built to stop. Nobody should have to notice that 8.3x sits under a 13.1x–16.9x
// precedent set; the page should say it.
// The one entry multiple this page speaks with. Where the record states a multiple that
// is struck on a lower enterprise value than the model funds, the funded one is the one
// a committee is being asked about -- and the page was quoting the stated 4.1x in the
// price comparison while the ask beside it read 5.0x.
function entryMultipleFor(returns, canon) {
  const e = returns.entry || {};
  const base = (returns.scenarios || []).find((s) => /base/i.test(s.name));
  if (e.ties === false && base && Number.isFinite(e.ebitda) && e.ebitda > 0) {
    return +(base.entryEV / e.ebitda).toFixed(1);
  }
  return canon.entryMultiple;
}

function againstPrecedent(deal, canon, entryMultiple, priceUnevidenced) {
  const comps = (compsForDeal(deal) || []).filter((c) => Number.isFinite(c.evEbitda) && c.evEbitda > 0);
  if (!comps.length || !Number.isFinite(entryMultiple)) return null;
  const mults = comps.map((c) => c.evEbitda).sort((a, b) => a - b);
  const lo = mults[0];
  const hi = mults[mults.length - 1];
  const where = entryMultiple < lo ? 'below' : entryMultiple > hi ? 'above' : 'inside';
  const range = lo === hi ? `${lo}x` : `${lo}x–${hi}x`;
  const set = comps.length === 1
    ? `the single ${deal.sector} transaction on file, at ${range}`
    : comps.length === 2
      ? `the two ${deal.sector} transactions on file, at ${range}`
      : `a ${deal.sector} precedent set of ${range}`;
  // The judgement is only worth making about a real multiple. Where no EBITDA has been
  // diligenced the model divides enterprise value by 12% of itself, which is 8.33x on
  // every such deal by definition -- and this section was telling a committee we were
  // cheap on one, dear on another and in range on a third, on a number carrying no
  // information about any of the companies.
  //
  // The first version tested only the screening-default path, so on the deals where that
  // same default had been WRITTEN to the record as a figure sourced "Screen", the
  // warning was suppressed and the page went ahead: "We are buying at 8.3x, inside the
  // two Healthcare transactions on file" -- on a clinical-stage gene-therapy registrant,
  // on a denominator the product invented. The test is now whether the price has been
  // diligenced, by any route.
  if (priceUnevidenced) {
    return {
      entryMultiple,
      low: lo,
      high: hi,
      count: comps.length,
      sector: deal.sector,
      where: 'not comparable',
      text: `No comparison can be drawn. Nobody has diligenced the EBITDA under the ${entryMultiple}x, so the multiple says nothing about this company. The fund has paid ${range} in ${deal.sector}.`,
      basis: `${comps.length} transaction${comps.length === 1 ? '' : 's'} the fund underwrote in ${deal.sector}. Get an EBITDA onto the record and this comparison becomes worth making.`,
    };
  }
  return {
    entryMultiple,
    low: lo,
    high: hi,
    count: comps.length,
    sector: deal.sector,
    where,
    text: where === 'below'
      ? `We are buying at ${entryMultiple}x against ${set}. If it is that cheap, the case needs to say why.`
      : where === 'above'
        ? `We are buying at ${entryMultiple}x against ${set}. That is above everything the fund has paid in the sector.`
        : `We are buying at ${entryMultiple}x, inside ${set}.`,
    basis: `${comps.length} transaction${comps.length === 1 ? '' : 's'} the fund underwrote in ${deal.sector}${comps.length < 3 ? ' — too few to be a distribution, so read them individually rather than as a range' : ''}. Open Comparables & precedents for the committee's reasoning on each.`,
  };
}

export function buildDealCase(deal) {
  const canon = canonicalFigures(deal);
  if (!canon) return null;
  const returns = buildReturnsModel(deal);
  const register = buildRiskRegister(deal);
  const board = computeICReadiness(deal);
  const v = board.verdict || {};
  const risks = againstIt(register);
  // Narrowing the killers to stoppers and repricing items was right and went one step
  // too far: the seeded registers grade almost nothing at those levels, so the deal four
  // days from committee arrived with a section headed "what could kill it" containing
  // nothing, while its own readiness board carried "Merger control (EU) filing readiness
  // not cleared". A merger-control filing that does not clear kills a deal. It was
  // sitting in an unranked list.
  const REGULATORY = /merger control|antitrust|regulatory clearance|competition|cfius|foreign investment|change of control consent|takeover code|rule 2\.7|irrevocable|critical path|financing condition/i;
  const CANDIDATES = [
    ...(board.verdict?.gating || []).map((g) => ({ text: String(g), from: 'Committee readiness' })),
    // A listed take-private carried "Takeover Code (rule 2.7) timetable and irrevocables
    // are the critical path" at row eight of its outstanding list, graded a condition, and
    // the page reported that nothing could kill the deal. On a public bid the 2.7
    // timetable IS the thing that kills it: it is not a condition to be waived, it is a
    // clock somebody else controls. The product's own assistant named it as a killer,
    // which is two surfaces of one product disagreeing about whether the deal had any.
    ...(register.risks || []).filter((r) => r.severity === 'condition').map((r) => ({ text: String(r.risk), from: r.workstream || 'Risk register', owner: r.owner || null })),
  ];
  for (const cand of CANDIDATES) {
    if (risks.length >= 3) break;
    if (!REGULATORY.test(cand.text)) continue;
    if (risks.some((r) => String(r.risk).toLowerCase().includes(cand.text.toLowerCase().slice(0, 25)))) continue;
    risks.push({
      risk: cand.text,
      severity: 'stopper',
      severityLabel: 'Deal-stopper',
      likelihood: null,
      workstream: cand.from,
      owner: cand.owner || null,
      mitigation: 'A clearance that does not come, or a timetable somebody else controls, is not a condition to be waived.',
      basis: 'promoted from the outstanding list',
      basisNote: null,
    });
  }
  const conditions = (register.risks || []).filter((r) => r.severity === 'condition');
  const decided = isDecided(deal);

  // The call. Not a view — an arithmetic reading of the record, stated as such.
  //
  // It is counted off the rows this page actually prints. The first version read
  // `verdict.conditionsTotal`, which is a different count computed a different way, and
  // so announced "the register carries nothing outstanding" ten lines above a register
  // with two conditions on it. One page, one count, taken from the thing being shown.
  // ONE LIST, AND EVERY COUNT ON THE PAGE IS ITS LENGTH.
  //
  // The duplicate list was removed last round and replaced with a number that
  // contradicted the list it sat above. On one deal the page then gave four different
  // answers to "what is outstanding": the reason said seven, the count said five, the
  // list held nine rows and the readiness headline said three plus six. Each was
  // computed somewhere else off something slightly different. A committee an hour from a
  // vote cannot use any of them.
  const outstanding = (() => {
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
    // A finding somebody has written and closed is not an outstanding item. One deal
    // carried "QoE supports $46M LTM EBITDA; $2.1M of add-backs disallowed" as a thing
    // diligence found AND as a thing still to do, which inflated the count of what is
    // outstanding by one on the deal going to committee that week.
    const done = new Set((deal.workstreams || []).flatMap((w) => (w.findings || []).map((f) => String(f?.text || '').trim())));
    return rows.filter((r) => !done.has(r.text));
  })();
  const openCount = outstanding.length;
  // Whether there is enough on the record to strike a view at all. The call read the
  // stopper count and then `meetsHurdle`, and nothing else -- so a deal with all seven
  // workstreams not started and no EBITDA on the record returned "PROCEED, SUBJECT TO
  // CONDITIONS — Returns clear the hurdle", eighteen lines above its own list saying
  // nothing had been diligenced.
  //
  // The first version tested `lanesOpened === 0`, which is a switch: two deals holding
  // identical records, an undiligenced price and no author on either returned different
  // verdicts because one analyst had opened one tab and left a lane at 8%. A lane that
  // has produced no finding and no contribution has not been worked, whatever number is
  // in the box -- the same rule the readiness board already applies, and unlike a
  // percentage it cannot be cleared without doing the work.
  const lanesWorked = (deal.workstreams || []).filter((w) => (w.findings || []).length || (w.contributions || []).length).length;
  const laneTotal = (deal.workstreams || []).length;
  const ebitdaKf = recordedFigure(deal, /ebitda/i);
  const priceUnevidenced = canon.ebitdaSource === 'derived'
    || (canon.ebitdaSource === 'recorded' && ebitdaKf && UNDILIGENCED_SOURCE.test(String(ebitdaKf.source || '')));
  const tooEarly = !decided && priceUnevidenced && laneTotal > 0 && lanesWorked * 2 < laneTotal;
  const call = tooEarly
    ? 'NOT ENOUGH ON THE RECORD TO DECIDE'
    : decided
    ? 'ALREADY DECIDED'
    : register.counts.stopper ? 'DECLINE'
      : !returns.meetsHurdle ? 'DO NOT PROCEED ON THESE TERMS'
        : openCount ? 'PROCEED, SUBJECT TO CONDITIONS'
          : 'PROCEED';
  const because = tooEarly
    ? `${lanesWorked ? `${lanesWorked} of ${laneTotal} workstreams have produced anything` : 'No workstream has produced anything'} and the entry multiple rests on a figure nobody has diligenced. The returns below clear the hurdle arithmetically; they are arithmetic on the asking price, not a view on the company.`
    : decided
    ? `${deal.stageName || deal.stage} — the committee has ruled on this deal. What follows is the case as the record now stands, not a request for authorisation.`
    : register.counts.stopper
      ? `${register.counts.stopper} deal-stopper on the register.`
      : !returns.meetsHurdle
        ? returns.headline
        : openCount
          ? `Returns clear the hurdle; ${openCount} item${openCount === 1 ? '' : 's'} outstanding before signing.`
          : 'Returns clear the hurdle and nothing is outstanding on the record.';

  // What the committee is NOT being given. A reader who cannot see the gap will assume
  // there isn't one, and the papers most often missing are the ones a vote depends on.
  const written = (deal.memoSections || []).filter((s) => s.status && s.status !== 'empty').length;
  const notOnRecord = [];
  if (!(deal.memoSections || []).length) notOnRecord.push('No IC memo sections have been opened on this deal.');
  else if (written < (deal.memoSections || []).length) notOnRecord.push(`${(deal.memoSections || []).length - written} of ${(deal.memoSections || []).length} memo sections are unwritten.`);
  if (canon.ebitdaSource === 'derived') notOnRecord.push('No EBITDA has been recorded from diligence; the entry multiple rests on a screening default.');
  // Five unrelated companies -- consumer audio, cinema advertising, document outsourcing,
  // footwear and gene therapy -- returned 8.3x, 20.3% IRR and 2.51x MOIC to the decimal.
  // The model runs on the fund default wherever no growth rate is recorded, so those are
  // not five views; they are one calculation with five names on it, and the page should
  // say so before anybody quotes one of them as a return.
  if (returns.indicativeNote) notOnRecord.push(returns.indicativeNote);
  if (returns.provision) notOnRecord.push(returns.provision.note);
  // Every open item carries an owner and a workstream and not one carries a date. That
  // is a fact about the record and it belongs here rather than being left for a reader
  // to notice on their own.
  const undated = (board.blockingWorkstreams || []).filter((b) => !b.dueDate);
  for (const b of (board.blockingWorkstreams || [])) {
    notOnRecord.push(`${b.label}: ${b.reasons.join('; ')}${b.dueDate ? ` — due ${b.dueDate}` : ''}.`);
  }
  if (undated.length) notOnRecord.push(`No completion date is committed on the record for any of the ${undated.length} outstanding workstream${undated.length === 1 ? '' : 's'} above.`);
  // A deal with seven named authors was told "nothing on this register was written by a
  // named author", because the claim read the register -- where positives never appear.
  const authored = (deal.workstreams || []).some((w) => (w.findings || []).some((f) => f && f.text));
  if (!authored) {
    notOnRecord.push('Nobody has written a finding on any workstream of this deal. Every row on the register is the standard set for its lane.');
  } else if (risks.length && risks.every((r) => r.basis === 'templated')) {
    notOnRecord.push('The three items above are standard rows for their workstreams. What diligence actually found is listed separately.');
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
    priceAgainstPrecedent: againstPrecedent(deal, canon, entryMultipleFor(returns, canon), priceUnevidenced),
    forIt: forIt(deal, canon, returns, tooEarly),
    downside: theDownside(deal, returns),
    againstIt: risks,
    // Everything on the register that somebody actually wrote, at any severity. On a
    // signed deal the one real finding -- "Final QoE issued; $2.1M of add-backs
    // disallowed" -- was graded a monitor and therefore fell out of the three killers,
    // so the page printed two rows nobody wrote and left out the one somebody did.
    // Boilerplate must never be able to push a recorded finding off the page.
    // Everything anybody wrote on this deal, at any grade, taken off the workstreams
    // rather than off the register. A positive finding is graded `clear` and `clear` rows
    // are filtered off the register -- so a deal whose diligence produced only good news
    // had seven named authors, nothing on its register, and a page announcing that
    // nobody had written anything. Reading the register to find out whether anybody
    // worked on the deal was the wrong question all along.
    recordedFindings: (deal.workstreams || []).flatMap((w) => (w.findings || [])
      .filter((f) => f && f.text)
      .map((f) => ({
        finding: String(f.text).trim(),
        workstream: w.label || w.lane,
        owner: w.owner ? ownerLabel(w.owner, w.lane) : null,
        severity: f.severity || null,
        // Good news is on this page too, and marked as good news. It was being dropped
        // entirely, which flatters nobody and hides who did the work.
        supportive: /^(positive|neutral)$/i.test(String(f.severity || '')),
      }))),
    figures: [
      { label: 'Enterprise value', value: `${canon.currency}${canon.ev}M`, basis: figureBasis('ev', canon, deal) },
      { label: 'LTM EBITDA', value: `${canon.currency}${canon.ebitda}M`, basis: figureBasis('ebitda', canon, deal) },
      { label: 'Entry multiple', value: `${canon.entryMultiple}x`, basis: [figureBasis('multiple', canon, deal), (returns.entry || {}).entryNote].filter(Boolean).join(' ') },
      revenueFigure(canon, deal),
      { label: 'Leverage', value: canon.leverage, basis: 'Modelled at the financeable ceiling for the sector.' },
    ],
    // `conditions` used to be published here as well, and the two lists were the same
    // rows twice on every deal -- with the QoE row appearing three times on one, as a
    // finding, a condition and an outstanding item. One list, and this is its length.
    outstandingCount: outstanding.length,
    outstanding,
    // The board already audits how much of the case traces to a source, and scores Lumen
    // at 40 with the reason written out -- "IC ask derived from unsourced Revenue &
    // EBITDA". It was on a different page from the ask it is about.
    citations: (() => {
      const a = validateCitations(deal);
      if (!a) return null;
      // The audit reads whether a claim traces to a source. It does not read whether two
      // sourced claims on the same page contradict each other, and it printed "All
      // numeric claims trace to a source fact or cited document" at score 100 on a case
      // carrying two enterprise values and two entry multiples. A badge that measures
      // something other than what its sentence says is worse than no badge.
      const caveats = [];
      if ((returns.entry || {}).ties === false) caveats.push('the stated entry multiple and the funded enterprise value are struck on different numbers');
      if (canon.ebitdaSource === 'derived') caveats.push('the EBITDA under the multiple is a screening default, not a diligenced figure');
      else if (ebitdaKf && UNDILIGENCED_SOURCE.test(String(ebitdaKf.source || ''))) {
        // The audit asks whether a figure has a source. "Screen" is a source. It scored
        // 100 out of 100 on four real public companies whose revenue and EBITDA are the
        // asking price times 1.25 and 0.12.
        caveats.push(`the EBITDA under the multiple is sourced "${ebitdaKf.source}", which is not diligence`);
      }
      return {
        // Score, summary and boolean gave three different answers: 100, "All numeric
        // claims trace to a source fact or cited document", and clean: false, in one
        // object. And the denominator is the real problem -- three claims tested on a
        // page carrying seventeen figures. A 100 out of 3 is worse than no score,
        // because it is the number a reader quotes.
        score: caveats.length ? null : a.score,
        scoreWithheld: caveats.length
          ? 'No score. The audit checks whether a figure has a source; on this deal that check passes and the figures still cannot be relied on.'
          : null,
        summary: caveats.length
          ? `On this deal ${caveats.join(', and ')}. Every claim it tested does trace to a source, which is why the check passes and the price still cannot be relied on.`
          : `${a.summary} ${a.totalClaims} claim${a.totalClaims === 1 ? '' : 's'} tested — the key figures on the record, not every number on this page.`,
        clean: caveats.length ? false : a.clean,
        sourced: a.sourcedClaims,
        total: a.totalClaims,
      };
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
