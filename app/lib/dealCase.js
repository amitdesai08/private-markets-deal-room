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
import { buildReturnsModel, buildRiskRegister, canonicalFigures, likelihoodOf, reconcileFindingText } from './diligence.js';
import { screeningMultiple } from './screening.js';
import { computeICReadiness } from './icReadiness.js';
import {validateCitations, sourcingCaveats } from './citations.js';
import { compsForDeal } from './fabric.js';
import { ownerLabel, laneLabel } from './cockpit.js';
import { money as fmtMoney, symbolFor } from './money.js';

const SEVERITY_RANK = { stopper: 0, reprice: 1, condition: 2, monitor: 3 };
// A row that reports its own resolution. These are real diligence outcomes and they
// belong on the page -- under what diligence found, not under what could kill the deal.
//
// The first pass listed the four strings that had been caught in review, which fixed
// those four and not the class: "warehouse consolidation ON TRACK; one site slipped a
// quarter on lease timing" was then promoted to a thing that could kill the deal. What
// these have in common is a clause reporting that the thing is handled.
const RESOLVED_IN_TEXT = /reflected in the [\d.]+x|no objection in writing|already (?:taken|deducted|reflected)|substantially agreed|re-prices well|bound at signing|costed into the model|\bon track\b|\bin place\b|\bagreed\b|\bsecured\b|\bcleared\b|\bcompleted\b|no material .{0,30}(identified|exposure)|within tolerance|is clean\b|verified against/i;

// Findings quote multiples of their own, and one of them read "expensing them moves the
// entry multiple from 9.4x to 10.1x" on a deal whose ask, base case and provision all say
// 8.3x. 8.3x and 9.4x are the same number on the same page and a reader stops there.
// `reconcileFindingText` was written for exactly this, its own comment records the
// committee member who counted four multiples on one deal and said they would not repeat
// any of them -- and it was never called from anywhere. Written, not wired, which is the
// same shape as the filter that was bypassed last round.
const reconciled = (deal) => (text) => reconcileFindingText(String(text || ''), deal);

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
const UNDILIGENCED_SOURCE = /^(screen|screening|teaser|cim|broker model|desk|desk research|derived|estimate)$/i
  // Not anchored, because the seller's paper travels under a dozen names.
  ;
const SELLER_DOC = /seller|vendor|information memorandum|confidential information|teaser|management accounts|broker|pitch/i;
// A figure the record itself grades low or medium confidence cannot carry a comparison
// the page then describes as a judgement.
const WEAK_CONFIDENCE = /^(low|medium)$/i;
function sourceIsUndiligenced(fig) {
  if (!fig) return false;
  const src = String(fig.source || '').trim();
  if (UNDILIGENCED_SOURCE.test(src)) return true;
  if (SELLER_DOC.test(src)) return true;
  return WEAK_CONFIDENCE.test(String(fig.confidence || '').trim());
}
// A draft is not a result. One deal sourced the whole price -- $148M of EBITDA -- to
// "CIM p.14 / QoE draft" at high confidence, which is the distinction this page is
// careful about everywhere else.
const DRAFT_SOURCE = /\bdraft\b|\bpreliminary\b|\bindicative\b|\bp\.\s*\d/i;

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
  if (SELLER_DOC.test(src) || WEAK_CONFIDENCE.test(conf)) {
    return `Recorded on the deal from ${src}${conf ? ` at ${conf} confidence` : ''} \u2014 the seller\u2019s own figure, and not a diligenced figure. No workstream has tested it.`;
  }
  if (DRAFT_SOURCE.test(src)) {
    return `Recorded from ${src}${conf ? ` at ${conf} confidence` : ''}. That is a draft, not a completed result, and no final figure is on the record.`;
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
    return `Not recorded. Implied from the ${canon.entryMultiple}x screening default for ${deal.subSector || deal.sector || 'this sector'} — the convention the model falls back to when no EBITDA is on file. The multiple below rests on it.`;
  }
  if (kind === 'multiple') {
    // A multiple the EBITDA above was implied from cannot also be derived from it.
    if (canon.ebitdaSource === 'derived') {
      return `The screening default for ${deal.subSector || deal.sector || 'this sector'}. No diligenced EBITDA is on the record, so the EBITDA above is implied from this multiple rather than the reverse.`;
    }
    return canon.entryMultipleSource === 'recorded'
      ? `Stated on the deal record, and it is ${cur}${Math.round(canon.ev)}M of enterprise value over ${cur}${+Number(canon.ebitda).toFixed(1)}M of EBITDA.`
      : (() => {
        const ev = Math.round(canon.ev);
        const eb = +Number(canon.ebitda).toFixed(1);
        const shown = Math.round(canon.ebitda);
        return eb === shown
          ? `Derived: ${cur}${ev}M enterprise value over ${cur}${eb}M EBITDA.`
          : `Derived: ${cur}${ev}M enterprise value over ${cur}${eb}M EBITDA \u2014 the row above rounds that to ${cur}${shown}M.`;
      })();
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
function againstIt(register, fix) {
  return (register.risks || [])
    // A deal-stopper, or something that moves the price. Nothing else.
    //
    // This admitted closing conditions, so a mechanical working-capital true-up that
    // appears on every deal in the fund was presented to a committee as one of the three
    // things most likely to kill the deal, alongside a consent point quoted with its own
    // evidence that it was closed. Conditions have not disappeared -- they are
    // obligations, and they are on the outstanding list where a reader can act on them.
    // The named ones that genuinely bite are promoted back in below.
    .filter((r) => r.severity === 'stopper' || r.severity === 'reprice')
    // And a standard row nobody wrote is not one of the three things most likely to lose
    // the money. "Customer concentration is modelled at ~30% of revenue... no customer
    // schedule has been recorded to confirm the figure" was wearing a killer's badge:
    // that is a not-yet-known, and it has its own section.
    .filter((r) => r.basis !== 'templated')
    // And a row that says in its own text that it is dealt with. Two of one deal's three
    // killers read "$2.1M of add-backs disallowed, REFLECTED IN THE 7.8X ENTRY" and
    // "consents required... BOTH COUNTERPARTIES HAVE INDICATED NO OBJECTION IN WRITING".
    // A committee reading three things that could kill the deal, two of which announce
    // that they cannot, stops reading the section.
    .filter((r) => !RESOLVED_IN_TEXT.test(r.risk))
    // Severity first, and within a severity a row somebody wrote before a row nobody
    // did. A committee reading three killers should be reading the three things the
    // diligence found, where the diligence found anything.
    .sort((a, b) => ((SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))
      || ((a.basis === 'recorded' ? 0 : 1) - (b.basis === 'recorded' ? 0 : 1)))
    .slice(0, 3)
    .map((r) => ({
      risk: fix(r.risk),
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
// The EBITDA's provenance in one place, in three registers: a headline qualifier, a
// short noun phrase, and the long clause the ask and the precedent comparison use.
// Everything that used to splice the raw source field reads from here.
const PROVENANCE = [
  { match: /quality of earnings|qoe/i, draft: /draft|preliminary/i,
    head: 'THE EBITDA IS A DRAFT', short: 'a draft quality-of-earnings report',
    long: 'an EBITDA from a draft quality-of-earnings report, which is not a final result' },
  { match: /teaser/i, head: 'THE EBITDA IS THE SELLER\u2019S', short: 'the seller\u2019s teaser',
    long: 'an EBITDA taken from the seller\u2019s teaser, which no workstream has verified' },
  { match: /\bcim\b|information memorandum/i, head: 'THE EBITDA IS THE SELLER\u2019S',
    short: 'the seller\u2019s information memorandum',
    long: 'an EBITDA taken from the seller\u2019s information memorandum, which no workstream has verified' },
  { match: /broker|analyst|research/i, head: 'THE EBITDA IS A BROKER NUMBER', short: 'a broker model',
    long: 'an EBITDA taken from a broker model, which no workstream has verified' },
  { match: /management accounts?/i, head: 'THE EBITDA IS UNAUDITED', short: 'unaudited management accounts',
    long: 'an EBITDA taken from unaudited management accounts, which no workstream has verified' },
];

// The EBITDA the card publishes. Where the figure is ours rather than the record's it
// carries a tenth, because the multiple beside it was struck on that tenth.
function ebitdaShown(canon) {
  return canon.ebitdaSource === 'recorded'
    ? fmtMoney(canon.ebitda, canon.currency)
    : `${canon.currency}${+Number(canon.ebitda).toFixed(1)}M`;
}

// A date a reader reads, not the instant it was written.
function shortDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function priceCaveat(returns, deal) {
  const base = (returns?.scenarios || []).find((s) => /base/i.test(s.name)) || null;
  const irr = base?.irr;
  if (!returns?.meetsHurdle) {
    return 'The returns below do not clear the hurdle even on the asking price, so the price is the second problem, not the first.';
  }
  if (typeof irr === 'number' && irr >= 30) {
    return `A ${irr}% base case on a price nobody has tested is a reason to test the price, not a reason to pay it.`;
  }
  if (typeof irr === 'number') {
    return `The ${irr}% base case below is arithmetic on the asking price. It is not yet a view on ${deal.company}.`;
  }
  return 'The returns below are arithmetic on the asking price, not a view on the company.';
}

function ebitdaProvenance(canon, sourceLabel) {
  if (canon.ebitdaSource === 'derived' || !sourceLabel) {
    return {
      headline: 'NO EBITDA HAS BEEN PRODUCED',
      shortPhrase: 'a screening default',
      longPhrase: 'a screening-default EBITDA that no workstream has produced',
    };
  }
  const row = PROVENANCE.find((r) => r.match.test(sourceLabel));
  if (!row) {
    const clean = sourceLabel.toLowerCase();
    return {
      headline: 'THE EBITDA IS NOT DILIGENCED',
      shortPhrase: `the ${clean}`,
      longPhrase: `an EBITDA taken from the ${clean}, which no workstream has verified`,
    };
  }
  const isDraft = row.draft && row.draft.test(sourceLabel);
  return {
    headline: isDraft ? row.head : (row.head || 'THE EBITDA IS NOT DILIGENCED'),
    shortPhrase: row.short,
    longPhrase: row.long,
  };
}

function theAsk(canon, returns, deal, priceUnproduced, priceBasisPhrase, priceUnevidenced = priceUnproduced) {
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
      ? `Committed: ${m(base.entryEV)} enterprise value at ${mult}x${priceUnproduced ? ` on ${priceBasisPhrase}` : ''}, funded with a ${m(base.equityIn)} equity cheque and ${m(base.debt)} of debt at ${canon.leverage}. This deal is past the committee decision.${multNote}`
      // "Authorise up to ... $492M of debt at 3.3x" states as a fact a leverage nobody
      // has offered. It is disclosed as modelled two sections down; the sentence a
      // committee votes on should not need the footnote.
      // WITHHOLDING A NUMBER THE SAME PAGE THEN PRINTS FOUR TIMES IS WORSE THAN
      // PRINTING IT WITH A WARNING.
      //
      // This said "no multiple is quoted, because nobody has produced an EBITDA to strike
      // one on", and the figures table beside it read "Entry multiple —  Not calculable".
      // Two cards further down the same screen the returns block said "8.3x entry", the
      // exit sentence said "8.3x, against 8.3x at entry", and the readiness tab one click
      // away said "8.3x LTM EBITDA". On eight of nineteen deals the case declared the
      // price incomputable and then computed it four times, and there is no answer to
      // "so is it 8.3x or not?" that does not concede the product is arguing with itself.
      //
      // The multiple is not incomputable. It is computable and weakly grounded, which is a
      // different sentence and the one the returns page already tells properly. Say that,
      // once, everywhere. The verdict may still be NOT ON THIS PRICE -- that is a
      // judgement about whether to pay it, not a claim that the arithmetic cannot be done.
      : `${priceUnevidenced ? 'The ask on the table is up to' : 'Authorise up to'} ${m(base.entryEV)} enterprise value at ${mult}x${priceUnproduced ? `, struck on ${priceBasisPhrase}` : ''}, funded with a ${m(base.equityIn)} equity cheque and ${m(base.debt)} of debt at a modelled ${canon.leverage}.${priceUnevidenced ? ' That is the price asked, not the price recommended \u2014 the call is below.' : ''}${multNote}`,
    decided,
    entryMultiple: mult,
    entryMultipleUnevidenced: !!priceUnproduced,
    enterpriseValue: base.entryEV,
    equityCheque: base.equityIn,
    debt: base.debt,
    leverage: canon.leverage,
    currency: canon.currency,
    equityNote: sponsor && Math.round(sponsor.amount) !== Math.round(base.equityIn)
      // The Sources & uses note says "the sponsor line above", and above it on THAT
      // screen there is one. Here there is not: it lives under Analysis.
      ? String((returns.sourcesUses || {}).equityBasisNote || '')
        .replace(/\bsponsor line above\b/, 'sponsor line under Analysis')
        .replace(/\babove is that figure\b/, 'under Analysis is that figure') || null
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
        // TWO DERIVATIONS OF ONE MULTIPLE.
        //
        // This recomputed the exit multiple by dividing the rounded exit EV by the rounded
        // exit EBITDA, while the scenario table printed the multiple the model actually
        // exited at. On one deal that gave "downside exits at 14.4x" in the prose and
        // 14.3x in the table beside it. Take the model's figure where it has one.
        const mult = (s) => {
          if (s && Number.isFinite(s.exitMult)) return +Number(s.exitMult).toFixed(1);
          return (s && Number.isFinite(s.exitEV) && Number.isFinite(s.exitEbitda) ? +(s.exitEV / Math.max(1, s.exitEbitda)).toFixed(1) : null);
        };
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
        // 0.1x was being promoted to "a stated dependency of the case" on a deal where
        // 300/36 is 8.33x and 401/48 is 8.35x. That is a rounding artefact, not an
        // assumption anybody made.
        const note = Math.abs(delta) <= 0.15
          ? ` ${saidTwoWays(deal, [
          'The base case assumes no multiple expansion — it is made on EBITDA growth and debt paydown alone.',
          'The base case assumes no multiple expansion — nothing in it comes from a higher exit multiple; it is earnings and debt paydown.',
          'The base case assumes no multiple expansion and takes no credit for re-rating the asset — the return is earnings growth and delevering.',
          'The base case assumes no multiple expansion: what the equity gains, it gains from EBITDA and from debt coming down.',
        ])}${spread}`
          : delta > 0
            ? ` The base case assumes ${delta}x of multiple expansion, which it depends on and the record does not evidence.${spread}`
            : ` The base case exits ${Math.abs(delta)}x below entry — it is made without any help from the exit multiple.${spread}`;
        // ARITHMETIC THE ROOM CAN DO IN ITS HEAD HAS TO WORK.
        //
        // The EV was formatted to "$1.5B" and the EBITDA rounded to whole millions, so a
        // reader dividing the two printed figures got 15.6x beside a stated 15.3x. The
        // multiple is right; the inputs to it were not on the page. Print both exactly
        // enough that the division lands where the sentence says it does.
        const sym = symbolFor(deal);
        // Division landed and multiplication did not: "$170.8M of EBITDA and $1,429M of
        // enterprise value — 8.4x" invites 170.8 x 8.4, which is 1,435. A partner
        // multiplies. Print the product of the two figures shown, not a third number
        // rounded from the unrounded model.
        // The enterprise value is the model's, not something re-derived here. Printing the
        // product of the two shown figures made the sentence multiply correctly and put
        // $508M on this page against the $509M every other surface serves. Take the EV and
        // print the multiple that actually relates the two numbers on the line.
        const ebShown = Number.isFinite(base.exitEbitdaExact) ? base.exitEbitdaExact : base.exitEbitda;
        const evShown = Math.round(base.exitEV);
        // Nothing is derived from a product here any more, so no precision search.
        const ebExact = `${sym}${ebShown}M`;
        const evExact = `${sym}${evShown.toLocaleString('en-GB')}M`;
        // The entry multiple is the published one — 8.4x on every other line of this
        // card — and the exit is quoted against it. Chasing an exact product between the
        // three printed figures produced "8.367x at entry" on a page that says 8.4x five
        // times, which is a claim about price rather than a rounding wobble. The
        // enterprise value is the model's, and the sentence says whose it is.
        const flat = base.exitMult != null && base.entryMult != null
          && Math.abs(base.exitMult - base.entryMult) < 0.05;
        const exitShown = flat ? canon.entryMultiple : +(base.exitMult ?? xm).toFixed(1);
        return `Exit modelled at ${exitShown}x on ${ebExact} of EBITDA — ${evExact} of enterprise value in the model, against ${canon.entryMultiple}x at entry.${note}`;
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
function theDownside(deal, returns, canon) {
  const m = (v) => fmtMoney(v, symbolFor(deal));
  const down = (returns.scenarios || []).find((s) => /down/i.test(s.name));
  const base = (returns.scenarios || []).find((s) => /base/i.test(s.name));
  const hurdle = returns.hurdle || { irr: 20, moic: 2 };
  if (!down) return null;
  const clears = down.moic >= hurdle.moic && down.irr >= hurdle.irr;
  const legs = [];
  if (down.moic < hurdle.moic) legs.push(`${down.moic}x is below the ${hurdle.moic}x`);
  if (down.irr < hurdle.irr) legs.push(`${down.irr}% IRR is below the ${hurdle.irr}%`);
  // What the downside actually assumes about the business, which is the one thing it
  // never said. On three deals the downside exits on exactly today's EBITDA and on a
  // fourth it grows it -- there is no scenario anywhere in this model in which EBITDA
  // falls. For a grocery roll-up whose like-for-like growth has just been restated
  // downward, a downside that assumes no decline is not a downside, and the page was
  // narrating "Downside breaks the hurdle" without ever stating its central assumption.
  const entryEbitda = canon.ebitda;
  const shape = !Number.isFinite(entryEbitda) ? ''
    : down.exitEbitda > entryEbitda
      ? ` It still grows EBITDA, from ${m(entryEbitda)} today to ${m(down.exitEbitda)} at exit — nothing in this model contemplates EBITDA falling.`
      : down.exitEbitda === entryEbitda
        ? ` It holds EBITDA flat at today's ${m(entryEbitda)} for the whole hold — it does not contemplate EBITDA falling.`
        : ` It takes EBITDA from ${m(entryEbitda)} today to ${m(down.exitEbitda)} at exit.`;
  return {
    moic: down.moic,
    irr: down.irr,
    clearsHurdle: clears,
    exitEbitda: down.exitEbitda,
    entryEbitda,
    text: clears
      ? `Downside clears the hurdle at ${down.moic}x / ${down.irr}% IRR.`
      : `Downside breaks the hurdle: ${legs.join(' and ')}.`,
    // "on a larger $153M equity cheque than the base case" -- and the page never said
    // why more equity is needed when the price has not changed. The returns model writes
    // that sentence and it was never carried across.
    basis: `Exit EBITDA of ${m(down.exitEbitda)}${base && down.equityIn > base.equityIn ? `, on a larger ${m(down.equityIn)} equity cheque than the base case` : `, on the same ${m(down.equityIn)} equity cheque as the base case`}.${shape}${returns.scenarioBasis ? ` ${returns.scenarioBasis}` : ''}`,
  };
}

// The analyst's own recommendation, where one has been written, printed beside the
// composed reading rather than replaced by it — and where the two disagree, said so.
// On one deal the approved memo claimed "no unresolved risk-level findings" while the
// register carried three open conditions and the readiness board agreed with the
// register. The product held the conflict and buried it.
function writtenRecommendation(deal, conditionCount, returns) {
  const sec = (deal.memoSections || []).find((s) => s.key === 'recommendation');
  if (!sec || !sec.content || sec.status === 'empty') return null;
  // The memo is prose somebody wrote, and it goes stale the same way a finding does: Atlas
  // read "Recommend proceed at 7.8x" a few centimetres from an ask of 9.7x. Findings were
  // reconciled on the way out and this string was not, so the contradiction simply moved
  // panels. Same treatment, same reason — the record is what production serves.
  const text = reconcileFindingText(String(sec.content).trim(), deal);
  const claimsClean = /no\s+(unresolved|outstanding|open)\b/i.test(text)
    // A memo that qualifies its claim to risk-level findings is not claiming the register
    // is empty, and must not be read as though it were.
    && !/no\s+unresolved\s+risk-level/i.test(text);

  // A RETURN QUOTED IN THE MEMO THAT THE MODEL DOES NOT PRODUCE.
  //
  // Aurora's recommendation said "~2.8x MOIC" and the bullet directly beneath it said
  // "Base case returns 3.01x on 24.7% IRR over 5 years". Both are right — one is the exit
  // model over the hold to date, the other the fund's standard five-year screening case —
  // and the page stacked them with nothing between. A reader gets two MOICs and no way to
  // choose. This hook existed and only ever fired on "claims nothing outstanding".
  const base = (returns?.scenarios || []).find((s) => /base/i.test(s.name)) || null;
  const returnsConflict = (() => {
    if (!base) return null;
    const claimed = [...text.matchAll(/([\d.]+)\s*x\s*(?:gross\s*)?MOIC/gi)]
      .map((m) => Number(m[1]))
      .filter((n) => Number.isFinite(n) && n > 0.2 && n < 20);
    const off = claimed.find((n) => Math.abs(n - base.moic) >= 0.1);
    if (off == null) return null;
    const explained = /hold|horizon|year|exit model/i.test(text);
    return explained
      ? `The memo quotes ${off}x and the returns page beside it models ${base.moic}x. The memo says why — the two run different holds — so read them as two questions, not one figure twice.`
      : `The memo quotes ${off}x MOIC and the returns page beside it models ${base.moic}x on a ${returns?.holdYears || 5}-year hold. Nothing on the record says which horizon the memo used, so the two cannot be reconciled from what is written here.`;
  })();

  return {
    text,
    status: sec.status || null,
    length: text.length,
    // "Approved" — by whom, when, and on which paper. On a deal whose entire framing is
    // "the committee has ruled on this", a reader cannot tell what they are not
    // re-litigating. Where the record does not carry the name and the date, say so
    // rather than letting an unattributed approval read as an institutional act.
    approvedBy: sec.approvedBy || sec.author || null,
    approvedAt: sec.approvedAt || sec.updatedAt || null,
    attribution: (sec.approvedBy || sec.author)
      ? `${sec.approvedBy || sec.author}${sec.approvedAt || sec.updatedAt ? `, ${sec.approvedAt || sec.updatedAt}` : ''}.`
      : 'No name and no date are recorded against this, so the record does not say who approved it or when.',
    conflict: claimsClean && conditionCount > 0
      ? `The written recommendation reports nothing unresolved. The register carries ${conditionCount} open item${conditionCount === 1 ? '' : 's'}, listed below.`
      : returnsConflict,
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
  return { label: 'Revenue', value: fmtMoney(canon.revenue, canon.currency), basis: figureBasis('revenue', canon, deal) };
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

function againstPrecedent(deal, canon, entryMultiple, priceUnevidenced, priceBasisPhrase) {
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
      // The third place this sentence is composed, and the one the last round missed: it
      // still said "the model's screening default" on deals whose figure card, ten lines
      // above, named a broker model. The ask's phrase is passed in so all three agree.
      text: `No comparison can be drawn. The ${entryMultiple}x rests on ${priceBasisPhrase || "an EBITDA no workstream has produced"}, so the multiple says nothing about how this price compares. The fund has paid ${range} in ${deal.sector}.`,
      basis: `${comps.length} transaction${comps.length === 1 ? '' : 's'} the fund underwrote in ${deal.sector}. The comparison holds once an EBITDA the fund has tested is on the record.`,
    };
  }
  return {
    entryMultiple,
    low: lo,
    high: hi,
    count: comps.length,
    sector: deal.sector,
    where,
    text: (() => {
      const near = where === 'above'
        ? comps.find((c) => c.evEbitda === hi)
        : where === 'below' ? comps.find((c) => c.evEbitda === lo) : null;
      const gap = near ? Math.abs(entryMultiple - near.evEbitda) : 0;
      const turns = gap >= 0.95
        ? `${gap.toFixed(1)} turn${gap.toFixed(1) === '1.0' ? '' : 's'}`
        : gap >= 0.05 ? `${Math.round(gap * 10) / 10} of a turn` : 'a fraction of a turn';
      if (where === 'above') {
        return `We are buying at ${entryMultiple}x against ${set}. That is ${turns} above ${near ? `${near.company}, the highest the fund has paid in ${deal.sector}` : `anything the fund has paid in ${deal.sector}`}, and nothing on the record explains what the premium buys.`;
      }
      if (where === 'below') {
        return `We are buying at ${entryMultiple}x against ${set}. That is ${turns} below ${near ? near.company : `anything the fund has paid in ${deal.sector}`}, and the thesis on file argues the business rather than the discount — so the reason it is cheaper is not on the record.`;
      }
      return `We are buying at ${entryMultiple}x, inside ${set}.`;
    })(),
    basis: (() => {
      const named = comps.map((c) => `${c.company} at ${c.evEbitda}x`);
      const list = named.length > 1 ? `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}` : named[0];
      return comps.length < 3
        ? `Measured against ${list} — the only ${deal.sector} transaction${comps.length === 1 ? '' : 's'} the fund has underwritten, so read ${comps.length === 1 ? 'it' : 'them'} individually rather than as a range. Open Comparables & precedents for the committee's reasoning on each.`
        : `Measured against ${comps.length} ${deal.sector} transactions the fund underwrote: ${list}. Open Comparables & precedents for the committee's reasoning on each.`;
    })(),
  };
}

// The same true sentence on nineteen deals is what makes a room decide the record is
// generated. Deterministic per deal, so a deal always reads the same.
function saidTwoWays(deal, options) {
  let h = 0;
  for (const ch of String(deal?.id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return options[h % options.length];
}

export function buildDealCase(deal) {
  const canon = canonicalFigures(deal);
  if (!canon) return null;
  const returns = buildReturnsModel(deal);
  const register = buildRiskRegister(deal);
  const board = computeICReadiness(deal);
  const v = board.verdict || {};
  const conditions = (register.risks || []).filter((r) => r.severity === 'condition');
  const decided = isDecided(deal);
  const lanesWorked = (deal.workstreams || []).filter((w) => (w.findings || []).length || (w.contributions || []).length).length;
  const laneTotal = (deal.workstreams || []).length;
  const ebitdaKf = recordedFigure(deal, /ebitda/i);
  // Two different faults, and they were being treated as one. "Nobody has produced it"
  // is true where the figure is a screening default or a teaser number; it is false where
  // a QoE draft produced it, and the killer said so anyway, four sections above the page's
  // own line reading "Recorded from CIM p.14 / QoE draft at high confidence". A draft is
  // not a result and it is not nothing.
  const priceFromDraft = canon.ebitdaSource === 'recorded' && ebitdaKf && DRAFT_SOURCE.test(String(ebitdaKf.source || ''));
  // On a deal past the committee the price is settled: the fund paid it. Saying "nobody
  // has diligenced the EBITDA under the 8.4x" on a company we own and are selling is a
  // sentence with no answer to it in a room, and the screening default that produced the
  // figure is an artefact of this model rather than a fact about the transaction.
  const priceUnproduced = !decided && (canon.ebitdaSource === 'derived'
    || (canon.ebitdaSource === 'recorded' && ebitdaKf && sourceIsUndiligenced(ebitdaKf)));
  // "A screening-default EBITDA" was printed even where a figure WAS recorded — from a
  // broker model or a teaser — so the ask contradicted the figure card naming that source
  // two rows below it. Name what the number actually rests on.
  const ebitdaSourceLabel = String(ebitdaKf?.source || '').trim();
  // ONE ENUM, ONE RENDERING.
  //
  // The record's source field was spliced raw into four sentences, so one page carried
  // "rests on Teaser", "taken from the qoe draft" and "comes from QoE draft" — three
  // casings of one field, two of them without an article. And the headline claimed the
  // EBITDA was "NOT ON THE RECORD" on a deal whose next line said it came from the
  // teaser: it is on the record, it is just not diligenced. Name the provenance once.
  const basis = ebitdaProvenance(canon, ebitdaSourceLabel);
  const priceBasisPhrase = basis.longPhrase;
  const priceUnevidenced = priceUnproduced || (!decided && priceFromDraft);
  const fix = reconciled(deal);
  const risks = againstIt(register, fix);
  // Narrowing the killers to stoppers and repricing items was right and went one step
  // too far: the seeded registers grade almost nothing at those levels, so the deal four
  // days from committee arrived with a section headed "what could kill it" containing
  // nothing, while its own readiness board carried "Merger control (EU) filing readiness
  // not cleared". A merger-control filing that does not clear kills a deal. It was
  // sitting in an unranked list.
  // A base case that misses the fund hurdle is the thing most likely to lose the money,
  // and it was in a different block. On one deal it appeared nowhere: 15.3% IRR against
  // a 20% hurdle, and the killers were a modelled allowance and a rebate finding.
  //
  // It applies to decided deals too. Suppressing it there left a signed deal underwritten
  // at 18.3% against a 20% hurdle showing an empty killers list, which reads as "nothing
  // is wrong with this" on precisely the deals where the money has already gone.
  // Where nobody has diligenced the EBITDA, the hurdle result is arithmetic on the same
  // invented denominator -- so it cannot be the headline killer either. The price is.
  if (!returns.meetsHurdle && !priceUnproduced) {
    risks.unshift({
      risk: returns.headline,
      severity: 'stopper',
      // Not a diligence finding, so not the register's word for one. The register
      // grades zero deal-stoppers on this deal and the badge said otherwise.
      severityLabel: 'Below the fund hurdle',
      raisedBy: 'this paper',
      likelihood: null,
      workstream: 'Returns',
      owner: null,
      mitigation: decided
        ? (() => {
          // The conditions the committee attached ARE on the record where a written
          // recommendation exists. Denying that while the page prints them is worse
          // than saying nothing; what is genuinely absent is the reasoning.
          const wrote = (deal.memoSections || []).find((sx) => sx.key === 'recommendation' && sx.content);
          return wrote
            ? `This deal was underwritten below the hurdle. What the committee attached is on the record — ${String(wrote.content).replace(/^IC approved with conditions:\s*/i, '').replace(/\.$/, '')} — but not what it weighed to get there.`
            : 'This deal was underwritten below the hurdle. Nothing on the record says what the committee attached or what it weighed.';
        })()
        : 'The price or the plan has to change; the hurdle does not.',
      basis: 'the returns model',
      basisNote: null,
    });
  }
  // And a downside that breaks the hurdle. On the deal four days from committee the page
  // said nothing could kill it, twelve lines above its own downside reading "1.72x is
  // below the 2x and 11.4% IRR is below the 20%".
  //
  // It goes LAST, after everything the diligence actually found has had a slot. The
  // returns model restating itself was consuming a killer on thirteen deals, and on two
  // of them it cost the last slot outright: a technology lane nobody had opened, and a
  // change-of-control consent on two of the five largest customers, neither of which made
  // the list because the scenario table had already taken the space. Only where the base
  // case cleared (or the two are one problem stated twice), only where the miss is
  // material, and only before the committee has sat.
  const downside = theDownside(deal, returns, canon);
  const materialMiss = downside && (downside.moic < (returns.hurdle?.moic ?? 2) * 0.9 || downside.irr < (returns.hurdle?.irr ?? 20) - 2);
  const addDownsideKiller = () => {
    if (decided || !returns.meetsHurdle || !downside || downside.clearsHurdle || !materialMiss || risks.length >= 3) return;
    risks.push({
      risk: downside.text,
      severity: 'reprice',
      severityLabel: 'Downside breaks the hurdle',
      raisedBy: 'this paper',
      likelihood: null,
      workstream: 'Returns',
      owner: null,
      mitigation: downside.basis,
      basis: 'the returns model',
      basisNote: null,
    });
  };
  const REGULATORY = /merger control|antitrust|regulatory clearance|competition|cfius|foreign investment|change of control consent|takeover code|rule 2\.7|irrevocable|critical path|financing condition/i;
  const CANDIDATES = [
    ...(board.verdict?.gating || []).map((g) => ({ text: String(g), from: 'Committee readiness' })),
    // A listed take-private carried "Takeover Code (rule 2.7) timetable and irrevocables
    // are the critical path" at row eight of its outstanding list, graded a condition, and
    // the page reported that nothing could kill the deal. On a public bid the 2.7
    // timetable IS the thing that kills it: it is not a condition to be waived, it is a
    // clock somebody else controls. The product's own assistant named it as a killer,
    // which is two surfaces of one product disagreeing about whether the deal had any.
    ...(register.risks || []).filter((r) => r.severity === 'condition').map((r) => ({ text: String(r.risk), from: r.workstream || 'Risk register', owner: r.owner || null, written: r.basis === 'recorded' })),
  ];
  for (const cand of CANDIDATES) {
    if (risks.length >= 3) break;
    // The exclusion above filters these rows out and this loop was putting them back, so
    // the deal going to committee still listed "reflected in the 7.8x entry" and "both
    // counterparties have indicated no objection in writing" as two of the three things
    // that could kill it. The fix was written and then bypassed four hundred lines later.
    if (RESOLVED_IN_TEXT.test(cand.text)) continue;
    // A named condition somebody WROTE against this company belongs in the killers even
    // where it is not regulatory: "change-of-control consents required on two of the
    // top-five pharma contracts" is the long pole on a cold-chain roll-up whose thesis is
    // pricing power on pharma contracts, and it was sitting among the positives.
    if (!REGULATORY.test(cand.text) && !cand.written) continue;
    if (risks.some((r) => String(r.risk).toLowerCase().includes(cand.text.toLowerCase().slice(0, 25)))) continue;
    risks.push({
      // Promoted rows were pushed with raw register text, so the reconciler wired through
      // the rest of the page was bypassed on exactly the rows most likely to quote a
      // multiple -- and one deal published "from 9.4x to 10.1x" in the killers and
      // "roughly 0.7x against the 8.3x" in the outstanding list, sixty lines apart.
      risk: fix(cand.text),
      // The register's own grade travels with the row. Regrading it here put the same
      // sentence at two severities inside one object, which is the fault this page was
      // fixed for two rounds ago.
      severity: 'condition',
      severityLabel: REGULATORY.test(cand.text) ? 'Closing condition — regulatory' : 'Closing condition',
      promoted: true,
      // The grade above is the row's grade; the likelihood has to follow it, or the card
      // grades one row and leaves the two below it blank. A constant is no better than a
      // null, so it is read off what the row is actually about.
      // Decided once, on the register, and read from there. Recomputing it here put
      // the same sentence at two likelihoods on two tabs of one deal.
      likelihood: likelihoodOf('condition', cand.text),
      workstream: cand.from,
      owner: cand.owner || null,
      mitigation: REGULATORY.test(cand.text)
        ? 'A clearance that does not come, or a timetable somebody else controls, is not a condition to be waived.'
        : (() => {
          // A name on its own is not a mitigation, and the owner is already printed
          // beside the row. Say what closing it takes, off what the row is about.
          const t = String(cand.text || '');
          if (/ebitda|qoe|quality of earnings|add-back|normalis/i.test(t)) return 'Close it with a final quality-of-earnings result, and do not quote the multiple until it is on the record.';
          if (/concentration|customer|churn|retention/i.test(t)) return 'Get the customer schedule onto the record, then decide whether it is priced or papered.';
          if (/consent|change of control|counterpart/i.test(t)) return 'Consents are a condition to closing, not a diligence item — they need a name against each counterparty and a date.';
          if (/tax|vat|transfer pricing|withholding|ip box/i.test(t)) return 'Size it before the pack is finalised; an unquantified exposure cannot be indemnified or priced.';
          if (/environment|phase i|esg/i.test(t)) return 'Commission the assessment. Nothing on the record supports a clean opinion until it reports.';
          if (/cyber|platform|scalab|technolog/i.test(t)) return 'Scope the technical review; the 100-day plan depends on the answer.';
          if (/management|succession|retention terms|senior team/i.test(t)) return 'Put the retention and succession terms on paper before signing, not after.';
          return cand.owner ? `${cand.owner} owns closing this before the pack is finalised.` : null;
        })(),
      basis: cand.written ? 'recorded' : 'promoted from the outstanding list',
      basisNote: null,
    });
  }
  // The paper's own verdict named the killer -- "nobody has diligenced the EBITDA" -- and
  // that killer was not in the list of things that could kill the deal. It is the one
  // thing on the page that would lose the money, and a committee reading only the three
  // rows would not have seen it.
  if (priceUnevidenced && !decided) {
    risks.unshift({
      risk: priceFromDraft
        ? `The entry multiple rests on a draft. The ${fmtMoney(canon.ebitda, canon.currency)} of EBITDA under it comes from ${basis.shortPhrase}, and no completed result is on the record.`
        : `The entry multiple rests on an EBITDA nobody has diligenced. Every return below is arithmetic on ${ebitdaShown(canon)} that no workstream has produced.`,
      severity: 'stopper',
      severityLabel: 'The price is not evidenced',
      raisedBy: 'this paper',
      likelihood: null,
      workstream: 'Financial / Quality of Earnings',
      owner: null,
      mitigation: priceFromDraft
        ? 'Get the final result onto the record before the multiple is quoted in a room.'
        : 'Get an EBITDA onto the record. Nothing else on this page can be relied on until it is there.',
      basis: 'the deal record',
      basisNote: null,
    });
  }
  // Last, so nothing the diligence found is crowded out by the model restating itself.
  addDownsideKiller();
  // One killer that quotes another verbatim inside itself is one killer. A committee was
  // handed three of which two were the same rebate finding -- once on its own and once
  // embedded in the modelled allowance that argues with it -- and the paper said so.
  //
  // And three is the cap, applied here rather than at each push: the rows added later in
  // priority order were pushing the earlier ones past it. Three is the point of the
  // section; a longer list is the register, which is one click away.
  const deduped = [];
  for (const r of risks) {
    const dup = deduped.some((k) => k.risk.includes(r.risk) || r.risk.includes(k.risk));
    if (!dup) deduped.push(r);
  }
  risks.length = 0;
  risks.push(...deduped.slice(0, 3));

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
      const add = (text, from, owner, basis, due) => {
      const key = String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
      if (!key || seen.has(key)) return;
      seen.add(key);
      // Not one register row on any deal carries a due date, and the disclosure about
      // missing dates covered the blocking workstreams only — so the register's silence
      // was itself silent. "Who is closing it by when" was answered halfway.
      // Whether anybody wrote this row, in words. Sixty-seven of these are standard
      // rows for a workstream and the list rendered them exactly like a diligenced
      // finding, because the renderer never read `basis`.
      const templated = basis === 'templated' || basis === 'the readiness board';
      rows.push({
        text: String(text), from, owner: owner || null, basis: basis || null,
        dueDate: due || null, undated: !due,
        authored: !templated,
        basisNote: templated && from === 'risk register'
          ? 'Standard row for this workstream. No named author has written a finding against it.'
          : null,
      });
    };
    // The committee-readiness items are the analyst's own work — the papers, the memo
    // sections, the compliance clearance. They were the only rows with nobody against
    // them, so an analyst read their own list and found four items the product said
    // nobody owned, then copied them into a spreadsheet because there was nowhere else.
    // AN AGGREGATE IS NOT AN ITEM, AND THEY WERE IN THE SAME LIST.
    //
    // The readiness board summarises: "4 required items outstanding: Final IC memo, IC
    // memo sections approved, Recommendation drafted, KYC / compliance cleared". That
    // went into the outstanding list as ONE row, beside individual register rows, under
    // a note reading "9 items are outstanding". A partner read four in the first row,
    // five in the second, counted seven more, and the total said nine. Every one of those
    // numbers was right about a different thing, which is the worst way to be right.
    //
    // Split the summaries back into the things they summarise, so the list is one
    // granularity and its length is the answer.
    const expandGating = (line) => {
      const s = String(line).trim();
      const papers = s.match(/^\d+ required items? outstanding:\s*(.+)$/i);
      if (papers) {
        return papers[1].split(',').map((x) => x.trim()).filter(Boolean)
          .map((label) => ({ text: label, owner: 'The deal team — this is a committee paper' }));
      }
      const lanes = s.match(/^\d+ workstreams? blocking:\s*(.+)$/i);
      if (lanes) {
        // "Legal DD (Anjali Raman) — not started, Tax DD (David Osei) — recorded at 15%".
        // Split before a capitalised lane name that opens its own parenthesised owner,
        // so an em-dash inside a reason does not become a boundary.
        return lanes[1].split(/,\s(?=[A-Z][\w &/]*\s\()/).map((x) => x.trim()).filter(Boolean)
          .map((part) => {
            const who = part.match(/\(([^)]+)\)/);
            const text = part.replace(/\s*\([^)]*\)/, '').trim();
            return { text, owner: who ? `${who[1].trim()} — the workstream lead` : 'The workstream leads' };
          });
      }
      return [{ text: s, owner: /risk-level|issue|finding/i.test(s)
        ? 'The deal team — an open finding to close or carry'
        : 'The deal team — a committee paper' }];
    };
    // The lanes named by the readiness board are also written up as register rows on most
    // deals -- "Legal DD — not started" beside "Legal diligence has not started, so there
    // is no basis on the record for an opinion on litigation...". One obligation, two rows.
    // The lanes the readiness board names are also written up as register rows on most
    // deals -- "Tax DD — recorded at 15% with nothing written against it" beside "Tax
    // diligence has not started; no exposure has been quantified". One obligation, two
    // rows. Keep the register's, which says what is missing and why; the board's row is
    // the same fact with less in it. Dropping the register row instead would take a
    // closing condition off the list a committee votes against.
    const registerLanes = new Set();
    for (const r of [...conditions, ...(register.risks || []).filter((x) => x.severity === 'reprice')]) {
      const txt = String(fix(r.risk));
      // Every way the register says a lane has produced nothing, not just the one.
      const m = txt.match(/^([A-Za-z][\w /]*?)\s+(?:diligence )?has not (?:started|been (?:started|opened|scoped))/i)
        || txt.match(/^Nobody has (?:started|opened|scoped) (?:the )?([A-Za-z][\w /]*?)\s/i)
        || txt.match(/^No ([A-Za-z][\w /]*?) (?:review|work|assessment) has been/i)
        || txt.match(/^The ([A-Za-z][\w /]*?) workstream is unstarted/i)
        || txt.match(/^([A-Za-z][\w /]*?) diligence is open\b/i);
      // The environmental rows never name the lane, so they are matched on their subject.
      if (/Phase I environmental assessment|environmental position rests on/i.test(txt)) registerLanes.add('environmental');
      if (m) registerLanes.add(m[1].toLowerCase().replace(/\s*(dd|diligence)\s*$/i, '').trim());
      if (/^No Phase I environmental assessment/i.test(fix(r.risk))) registerLanes.add('environmental');
    }
    const alreadyOnRegister = (text) => {
      const lane = String(text).match(/^([A-Za-z][\w &/]*?)\s*(?:—|-|$)/);
      if (!lane) return false;
      const key = lane[1].toLowerCase().replace(/\s*(dd|diligence)\s*$/i, '').trim();
      if (!key) return false;
      if (registerLanes.has(key)) return true;
      return /esg|environmental/.test(key) && registerLanes.has('environmental');
    };
    for (const g of (v.gating || [])) {
      for (const row of expandGating(g)) {
        if (alreadyOnRegister(row.text)) continue;
        // The board knows when a blocking workstream is due; the row it produces has to
        // carry that date or the page reports the whole list as undated.
        const dated = (board.blockingWorkstreams || []).find((b) => b.dueDate && String(row.text).toLowerCase().startsWith(String(b.label || '').toLowerCase()));
        add(row.text, 'committee readiness', row.owner, 'the readiness board', dated?.dueDate || null);
      }
    }
    // A row that reports good news, or one whose own words say the thing is settled, is
    // not outstanding. "...enterprise book is sticky and re-prices well" and "UK
    // take-private structure confirmed: stamp duty at 0.5%..." were both rows on a list
    // headed Everything outstanding, and both were inside the count under it.
    const stillOpen = (r) => {
      const text = String(fix(r.risk) || '');
      if (r.supportive || r.severity === 'positive' || r.severity === 'clear') return false;
      // Closing conditions stay, whatever their wording: a condition is outstanding until
      // it is closed, and a guard written for exactly that failure catches any attempt to
      // filter one out. Only a row that reports GOOD NEWS is not an outstanding item.
      return true;
    };
    for (const r of conditions) { if (stillOpen(r)) add(fix(r.risk), 'risk register', r.owner || null, r.basis, r.dueDate); }
    for (const r of (register.risks || []).filter((x) => x.severity === 'reprice')) { if (stillOpen(r)) add(fix(r.risk), 'risk register', r.owner || null, r.basis, r.dueDate); }
    // A row whose whole text already appears inside another row is the same obligation
    // twice. One deal listed ten outstanding items where the tenth was a sentence quoted
    // verbatim inside the third.
    return rows.filter((r, i) => !rows.some((o, j) => j !== i && o.text.length > r.text.length && o.text.includes(r.text)));
    // A vendor's reassurance is not a resolution, and this filter -- written for the
    // killers list -- was also stripping the closing-conditions list, which is the one
    // list whose whole purpose is rows that are NOT yet resolved. It removed a
    // change-of-control consent on two of the five largest customers, on the deal going
    // to committee: "both counterparties have indicated no objection in writing" is an
    // indication, not a consent, and it belongs in front of a committee.
    return rows;
  })();
  const openCount = outstanding.length;
  // TWO NUMBERS, ELEVEN WORDS APART, IN ONE CARD.
  //
  // The verdict line said "12 items outstanding before signing" and the readiness
  // headline directly beneath it said "4 required items outstanding". Both true: the
  // four are inside the twelve. The sentence that said so was twelve rows down on a
  // different card, which is nowhere. Say it where the number is.
  const fromBoard = outstanding.filter((r) => r.from === 'committee readiness').length;
  const fromRegister = outstanding.length - fromBoard;
  const outstandingSplit = openCount
    ? ` — ${fromBoard} the readiness board is waiting on and ${fromRegister} from the risk register`
    : '';
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
  const tooEarly = !decided && priceUnevidenced && (laneTotal === 0 || lanesWorked * 2 < laneTotal);
  // Two deals with the same defect were getting opposite verdicts: both rest the entry
  // multiple on an EBITDA nobody diligenced, and one said NOT ENOUGH ON THE RECORD TO
  // DECIDE while the other said PROCEED, SUBJECT TO CONDITIONS — over its own line
  // reading "the entry multiple rests on a screening default". A paper that recommends
  // proceeding on returns computed from a figure it admits nobody produced is not being
  // serious about the money, whatever else is on the page.
  const priceOnly = !decided && !tooEarly && priceUnevidenced;
  // Three deals in the same state -- an entry multiple on an EBITDA nobody has produced
  // -- returned DECLINE, NOT ENOUGH ON THE RECORD TO DECIDE and NOT ON THIS PRICE. Three
  // names for one condition means the committee cannot rely on the verdict word, which is
  // the only word on the page some readers will read. One state, one phrase; how far the
  // diligence has otherwise got is said in the reason.
  const call = register.counts.stopper && !decided
    ? 'DECLINE'
    : (tooEarly || priceOnly)
      // "THE EBITDA IS NOT ON THE RECORD" is false where a QoE draft produced it, and the
      // page said so on a deal whose own figures block reads "Recorded from CIM p.14 /
      // QoE draft at high confidence". One phrase per state; a draft is its own state.
      ? `NOT ON THIS PRICE — ${basis.headline}`
      : decided
    ? `ALREADY DECIDED — ${String(deal.stageName || deal.stage || '').toUpperCase() || 'PAST COMMITTEE'}`
    : register.counts.stopper ? 'DECLINE'
      : !returns.meetsHurdle ? 'DO NOT PROCEED ON THESE TERMS'
        // A deal nobody has launched into diligence cannot be recommended to proceed:
        // there is nothing on it that has been examined to proceed on.
        : /^O/i.test(String(deal.stage || '')) ? 'NOT YET — NO WORKSTREAM HAS BEEN OPENED'
          : openCount ? 'PROCEED, SUBJECT TO CONDITIONS'
            : 'PROCEED';
  const because = register.counts.stopper && !decided
    // DECLINE was firing off a reason word-for-word identical to the price call's, so two
    // deals gave the same explanation and different verdicts with nothing to say why.
    // A decline is about the stopper on the register, and it names it.
    ? (() => {
      // The count and the list have to be the same population. Naming one stopper under
      // a count of two reads as an error in the count.
      const stoppers = (register.risks || []).filter((r) => r.severity === 'stopper').map((r) => r.risk).filter(Boolean);
      const n = register.counts.stopper;
      return `${n} deal-stopper${n === 1 ? '' : 's'} on the register: ${stoppers.join('; and ')}`;
    })()
    : tooEarly
    ? (() => {
      const worked = (deal.workstreams || []).filter((w) => (w.findings || []).length || (w.contributions || []).length);
      const idle = (deal.workstreams || []).filter((w) => !((w.findings || []).length || (w.contributions || []).length));
      const name = (ws) => ws.slice(0, 2).map((w) => laneLabel(w.lane)).join(' and ');
      const opening = worked.length
        ? `${name(worked)} ${worked.length === 1 ? 'has' : 'have'} reported; ${idle.length} of the ${laneTotal} ${idle.length === 1 ? 'workstream has' : 'workstreams have'} produced nothing${idle.length ? ` — ${name(idle)}${idle.length > 2 ? ' among them' : ''}` : ''}.`
        : `None of the ${laneTotal} workstreams has produced anything yet.`;
      const priceOn = ebitdaKf && ebitdaKf.source
        ? `The entry multiple rests on ${basis.shortPhrase}, which no workstream has verified.`
        : 'The entry multiple rests on a screening default, not on a figure anybody has produced.';
      return `${opening} ${priceOn} ${priceCaveat(returns, deal)}`;
    })()
    : priceOnly
      ? `${lanesWorked} of ${laneTotal} workstreams have produced something, but the entry multiple still rests on ${basis.shortPhrase}. ${priceCaveat(returns, deal)}${openCount ? ` ${openCount} item${openCount === 1 ? ' is' : 's are'} outstanding${outstandingSplit}.` : ''}`
      : decided
    ? (() => {
      const tail = openCount ? ` ${openCount} item${openCount === 1 ? ' is' : 's are'} still outstanding${outstandingSplit}.` : '';
      const st = String(deal.stage || '');
      const said = st.startsWith('E')
        ? 'The committee approved this deal; what follows is the case as the record stands while the obligations to closing are worked off.'
        : st.startsWith('V')
          ? 'This is an owned asset. What follows is the case the committee approved, measured against what the record now says.'
          : st.startsWith('O')
            ? 'The fund holds this asset. What follows is the case as the record stands, not a request for authorisation.'
            : 'The committee has ruled on this deal. What follows is the case as the record now stands, not a request for authorisation.';
      return `${deal.stageName || deal.stage} — ${said}${tail}`;
    })()
    : register.counts.stopper
      ? `${register.counts.stopper} deal-stopper${register.counts.stopper === 1 ? '' : 's'} on the register.${openCount ? ` ${openCount} item${openCount === 1 ? ' is' : 's are'} outstanding${outstandingSplit}.` : ''}`
      : !returns.meetsHurdle
        ? `${returns.headline}${openCount ? ` ${openCount} item${openCount === 1 ? ' is' : 's are'} outstanding${outstandingSplit}.` : ''}`
        : openCount
          // "Returns clear the hurdle" was the whole of the reason on deals whose downside
          // breaks it, so a partner would quote the headline and be caught out on their
          // own deal. The headline names both legs.
          ? `Base case clears the hurdle${downside && !downside.clearsHurdle ? `; the downside does not, at ${downside.moic}x / ${downside.irr}%` : ''}. ${openCount} item${openCount === 1 ? '' : 's'} outstanding before signing${outstandingSplit}.`
          : `Base case clears the hurdle${downside && !downside.clearsHurdle ? `; the downside does not, at ${downside.moic}x / ${downside.irr}%` : ''}, and nothing is outstanding on the record.`;

  // What the committee is NOT being given. A reader who cannot see the gap will assume
  // there isn't one, and the papers most often missing are the ones a vote depends on.
  const written = (deal.memoSections || []).filter((s) => s.status && s.status !== 'empty').length;
  const notOnRecord = [];
  if (!(deal.memoSections || []).length) notOnRecord.push('No IC memo sections have been opened on this deal.');
  else if (written < (deal.memoSections || []).length) { const gap = (deal.memoSections || []).length - written; notOnRecord.push(`${gap} of ${(deal.memoSections || []).length} memo sections ${gap === 1 ? 'is' : 'are'} unwritten.`); }
  if (canon.ebitdaSource === 'derived') notOnRecord.push('No EBITDA has been recorded from diligence; the entry multiple rests on a screening default.');
  // Five unrelated companies -- consumer audio, cinema advertising, document outsourcing,
  // footwear and gene therapy -- returned 8.3x, 20.3% IRR and 2.51x MOIC to the decimal.
  // The model runs on the fund default wherever no growth rate is recorded, so those are
  // not five views; they are one calculation with five names on it, and the page should
  // say so before anybody quotes one of them as a return.
  if (returns.indicativeNote) notOnRecord.push(returns.indicativeNote);
  if (returns.provision) notOnRecord.push(returns.provision.note);
  // Findings are quoted in the currency of the document they came from, and the model is
  // struck in the deal's. On one deal that put "EUR 4.1M of ARR" and "EUR 3.2M lower" in
  // the register against $29M of EBITDA in the figures, with no rate anywhere -- a reader
  // spent a minute working out whether they were comparable and still did not know.
  const foreign = [...new Set([
    ...(register.risks || []).map((r) => r.risk),
    ...(deal.workstreams || []).flatMap((w) => (w.findings || []).map((f) => String(f?.text || ''))),
  ]
    // Scan what the reader is actually shown. A stored finding whose currency has been
    // reconciled against the seed at render no longer quotes euros, and scanning the raw
    // record made the page disclose a mismatch that is not on it any more.
    .map((t) => reconcileFindingText(t, deal))
    .flatMap((t) => [...String(t).matchAll(/\b(EUR|GBP|USD|CHF|SEK|NOK|DKK)\s?[\d.]/g)].map((m) => m[1])))]
    .filter((c) => c !== (deal.currency || 'USD'));
  if (foreign.length) {
    notOnRecord.push(`Some findings on this deal are quoted in ${foreign.join(' and ')} while the model is struck in ${deal.currency || 'USD'}. No exchange rate is on the record, so those figures cannot be netted against the ones above without one.`);
  }
  // Every open item carries an owner and a workstream and not one carries a date. That
  // is a fact about the record and it belongs here rather than being left for a reader
  // to notice on their own.
  const undated = (board.blockingWorkstreams || []).filter((b) => !b.dueDate);
  for (const b of (board.blockingWorkstreams || [])) {
    notOnRecord.push(`${b.label}: ${b.reasons.join('; ')}${shortDate(b.dueDate) ? ` — due ${shortDate(b.dueDate)}` : ''}.`);
  }
  if (undated.length) notOnRecord.push(undated.length === 1
      ? 'No completion date is committed on the record for the one outstanding workstream above.'
      : undated.length === (board.blockingWorkstreams || []).length
        ? 'No completion date is committed on the record for any of the workstreams above.'
        : `No completion date is committed on the record for ${undated.length} of the ${(board.blockingWorkstreams || []).length} workstreams above.`);
  // A deal with seven named authors was told "nothing on this register was written by a
  // named author", because the claim read the register -- where positives never appear.
  const authored = (deal.workstreams || []).some((w) => (w.findings || []).some((f) => f && f.text));
  if (!authored) {
    notOnRecord.push('No workstream on this deal has produced a finding. The register is running on the scope each workstream opens with.');
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
    // The readiness headline is computed elsewhere and quoted a different number from
    // the one list, and it is the line a reader hits first. The state and the gating
    // travel; the count does not, because there is one count on this page.
    // The readiness headline is computed elsewhere and quoted its own count of what is
    // open, beside a list of a different length, and it is the line a reader hits first.
    // The state and the gating travel; the count does not, because there is one count on
    // this page. Both of the board's phrasings are stripped -- the first pass caught only
    // the post-committee wording and the diligence-phase one went straight through.
    readiness: {
      state: v.state || null,
      // The board's own sentence, with only the number reconciled.
      //
      // A regex used to strip its count — and once the post-committee wording grew a
      // second clause it ate that too, so the case page read "...has recorded something
      // What no workstream has reported on..." while the Analysis tab two clicks away
      // still carried "2 items remain open on the risk register". Removing a sentence to
      // remove a number is the wrong instrument. Replace the number in place, keep every
      // clause, and never leave the sentence without its stop.
      headline: (() => {
        let h = String(v.headline || '').trim();
        if (!h) return null;
        // A lane the register writes up more richly is dropped from the list below, so
        // the board's sentence must not go on naming it four lines above the three.
        h = h.replace(/(\d+) workstreams? blocking: ([^;.]+)/i, (m, n, list) => {
          const shownLanes = outstanding.filter((r) => r.from === 'committee readiness')
            .map((r) => String(r.text).split(/\s*[\u2014-]\s*/)[0].trim().toLowerCase());
          const kept = String(list).split(/,\s(?=[A-Z])/)
            .filter((part) => shownLanes.some((l) => part.trim().toLowerCase().startsWith(l)));
          if (!kept.length || kept.length === Number(n)) return m;
          return `${kept.length} workstream${kept.length === 1 ? '' : 's'} blocking: ${kept.join(', ')}`;
        });
        h = h.replace(/(—\s*)no obligation or unopened workstream outstanding/i, (m, dash) => (outstanding.length
          ? `${dash}no committee obligation and no unopened workstream, though ${outstanding.length} item${outstanding.length === 1 ? ' is' : 's are'} still outstanding below`
          : `${dash}nothing outstanding on the record`));
        // The board's own count stays the board's. Rewriting it here to conditions plus
        // monitors, while the board prints conditions alone, put two different integers
        // in one identical clause a click apart on every decided deal.
        return /[.!?]$/.test(h) ? h : `${h}.`;
      })(),
      gating: v.gating || [],
    },
    recommendation: { call, because },
    writtenRecommendation: writtenRecommendation(deal, openCount, returns),
    ask: theAsk(canon, returns, deal, priceUnproduced, priceBasisPhrase, priceUnevidenced || /^O/i.test(String(deal.stage || '')) || /^(DO NOT PROCEED|DECLINE|NOT )/i.test(String(call))),
    baseCase: theBaseCase(deal, returns, canon),
    // The comparison is about the NUMBER, not about the stage. A multiple struck on a
    // screening default says nothing about the company whether or not the fund has
    // already bought it — so this reads the figure directly rather than the verdict flag,
    // which is deliberately false on a decided deal.
    priceAgainstPrecedent: againstPrecedent(deal, canon, entryMultipleFor(returns, canon), priceUnevidenced || canon.ebitdaSource === 'derived', priceBasisPhrase),
    forIt: forIt(deal, canon, returns, tooEarly || priceOnly),
    downside: theDownside(deal, returns, canon),
    againstIt: risks,
    // "How many open risks?" is the second question a partner asks after "what's the
    // price", and the product had five answers for it on one deal: twelve rows on the
    // register, eight on the readiness board, three here, and two red badges against a
    // register grading zero deal-stoppers. They are different questions — everything
    // diligence found, what blocks the committee, and the three most likely to lose the
    // money — so this says which one it just answered and where the rest live.
    againstItNote: (() => {
      const own = risks.filter((r) => r.raisedBy === 'this paper').length;
      const found = risks.length - own;
      const total = (register.risks || []).length;
      if (!risks.length) return null;
      const lead = risks.length === 1
        ? 'This is the one most likely to lose the money.'
        : `These are the ${risks.length} most likely to lose the money.`;
      const where = [];
      if (found && found === risks.length) where.push(`${risks.length === 1 ? 'It is' : 'They are all'} on the risk register, which carries ${total} row${total === 1 ? '' : 's'} in total`);
      else if (found) where.push(`${found} of them ${found === 1 ? 'is' : 'are'} on the risk register, which carries ${total} row${total === 1 ? '' : 's'} in total`);
      if (own) where.push(own === risks.length
        ? `${own === 1 ? 'It was' : 'They were all'} raised by this paper rather than by a workstream`
        : `${own} ${own === 1 ? 'was' : 'were'} raised by this paper rather than by a workstream`);
      return where.length ? `${lead} ${where.join('; ')}.` : lead;
    })(),
    // What nobody has looked at. These never reached the page: on the deal four days
    // from committee the paper reported "no blocking workstreams" while its own register
    // said nobody had spoken to a customer, referenced the management team below the
    // chief executive, or produced the customer schedule the concentration figure is
    // modelled on.
    //
    // Not on a decided deal. "Voice-of-customer work has not been commissioned yet" on a
    // signed and archived transaction is not a known unknown; it is a records gap about
    // work that will never now be done.
    notYetKnown: (register.risks || [])
      .filter((r) => r.severity === 'monitor')
      // `basis: 'templated'` was being shipped to the reader -- the product telling a
      // committee about its own plumbing. The sentence already says it in words.
      //
      // The register also carries categories that are NOT workstreams on this deal — HR /
      // management being the standing one. Labelling those "workstream" sent a reader to
      // the diligence tab to find a lane that does not exist. Say which are lanes and
      // which are gaps nobody has opened a lane for.
      .map((r) => {
        const lane = r.workstream || null;
        const onDeal = !!lane && (deal.workstreams || []).some((w) => laneLabel(w.lane) === lane || w.lane === r.lane);
        return {
          item: fix(r.risk),
          workstream: lane,
          workstreamOnDeal: onDeal,
          workstreamNote: lane && !onDeal ? `No ${lane} workstream has been opened on this deal.` : null,
          owner: r.owner || null,
          standardRow: (r.basis || 'templated') === 'templated',
        };
      }),
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
      .map((f) => {
        const text = fix(String(f.text).trim());
        // The register may have regraded this row -- a takeover timetable written as a
        // caution is a deal-stopper -- and publishing the author's grade beside the
        // register's put the same sentence at two severities inside one object.
        const onRegister = (register.risks || []).find((r) => r.risk === text);
        return {
          finding: text,
          workstream: w.label || w.lane,
          owner: w.owner ? ownerLabel(w.owner, w.lane) : null,
          severity: onRegister ? onRegister.severity : (f.severity || null),
          severityLabel: onRegister ? onRegister.severityLabel : null,
          gradedAs: onRegister && onRegister.severity !== f.severity ? `Written as ${f.severity}; the register grades it ${onRegister.severityLabel}.` : null,
          supportive: !onRegister && /^(positive|neutral)$/i.test(String(f.severity || '')),
        };
      })),
    figures: [
      { label: 'Enterprise value', value: fmtMoney(canon.ev, canon.currency), basis: figureBasis('ev', canon, deal) },
      // A screening default is enterprise value times 0.12, so the multiple it produces is
      // 1/0.12 = 8.33x on EVERY deal that has no diligenced EBITDA. Four consecutive deals
      // — a dental roll-up, a specialty-foods business, a listed BPO and a vertical-SaaS
      // platform — priced within 0.2x of each other, and a reader who clicks through three
      // of them sees the arithmetic rather than the companies. Saying "not recorded" under
      // the number was not enough: the number is the thing that gets read, quoted and
      // remembered. Where nobody has produced the EBITDA there is no multiple to print.
      // The figure is always shown, and the WARNING beside it names which of the two
      // faults applies — a screening default nobody produced, or a real number from a
      // draft that is not a result. Those are different sentences and collapsing them
      // told a reader no EBITDA existed on a deal whose own row above said "Recorded from
      // CIM p.14 / QoE draft at high confidence".
      // Where the figure is ours rather than the record's it carries a tenth, and the row
    // has to print the number the multiple beside it was struck on.
    { label: 'LTM EBITDA', value: ebitdaShown(canon), basis: figureBasis('ebitda', canon, deal) },
      { label: 'Entry multiple',
        value: `${canon.entryMultiple}x`,
        basis: [
          figureBasis('multiple', canon, deal),
          (returns.entry || {}).entryNote,
          priceUnproduced
            ? (canon.ebitdaSource === 'derived'
              ? 'The EBITDA under it is the screening default, not a diligenced figure, so this reads the same on every deal without one on file. Treat it as the ask rather than as a valuation.'
              : 'The EBITDA under it comes from a draft rather than a completed result, so the multiple will move if the draft does.')
            : null,
        ].filter(Boolean).join(' ') },
      revenueFigure(canon, deal),
      // Leverage is the largest single driver of the IRR being voted on, and this said
      // "debt at 60% of enterprise value... there is no sector input in the calculation"
      // on every deal, because there wasn't one: the quantum was a constant and the cap
      // bound on all nineteen. There is a sector input now, so the paper states what it
      // was and why, and a reader can argue with the credit view rather than only with
      // the number it produced.
      //
      // "No lender is on the record" was then printed three sections from a recorded
      // finding reading "take-private financing pre-underwritten by two banks", so the
      // claim is now tested against the record before it is made.
      { label: 'Leverage', value: canon.leverage, basis: (() => {
        const financing = (deal.workstreams || [])
          .flatMap((w) => (w.findings || []))
          .map((f) => String(f?.text || ''))
          .find((t) => /underwritten|debt package|financing (?:secured|committed)|lender|credit committee|term sheet/i.test(t));
        const credit = returns.leverageBasis || (returns.entry || {}).leverageBasis;
        const base = credit || `Modelled over ${fmtMoney(canon.ebitda, canon.currency)} of EBITDA.`;
        return financing
          ? `${base} A financing finding is on the record and the model does not read it: “${financing.trim()}”`
          : `${base} No lender or indicative terms are on the record.`;
      })() },
    ],
    // `conditions` used to be published here as well, and the two lists were the same
    // rows twice on every deal -- with the QoE row appearing three times on one, as a
    // finding, a condition and an outstanding item. One list, and this is its length.
    outstandingCount: outstanding.length,
    // Said once for the list rather than on every row; see the note where rows are built.
    outstandingDateNote: (() => {
      const undated = outstanding.filter((r) => r.undated).length;
      if (!undated) return null;
      return undated === outstanding.length
        ? saidTwoWays(deal, [
        'No completion date is committed on the record against any of these.',
        'Not one of these carries a date anybody has committed to.',
        'None of these has a date against it, so none of them has a deadline.',
        'Dates are absent throughout: nothing here says by when.',
      ])
        : `${undated} of these carry no committed completion date.`;
    })(),
    // The register returns twelve rows, the readiness board says five papers plus four
    // workstreams, and this list holds seven. Each is defensible on its own filter and
    // nothing said they were one universe read three ways.
    outstandingNote: (() => {
      // This subtracted the register-derived outstanding rows from the register total and
      // called the remainder monitors -- so on every deal it told the committee that the
      // recorded findings promoted into its own killers list were post-close monitors.
      // Count the monitors.
      const monitors = (register.risks || []).filter((r) => r.severity === 'monitor').length;
      const sev = (r) => String(r.severity || '').toLowerCase();
      // All four counted off the same list as the monitors above. Counting these off the
      // promoted-killers subset while the monitors came off the register put two
      // populations in one sentence: "7 from the risk register" and then "1 moves the
      // price and 2 are closing conditions", on a register grading six conditions.
      const killers = risks.filter((r) => sev(r) === 'stopper').length;
      const repricers = (register.risks || []).filter((r) => sev(r) === 'reprice').length;
      const conditions = (register.risks || []).filter((r) => sev(r) === 'condition').length;
      const n = outstanding.length;
      // The rows the reader can see, graded as the page grades them.
      const shown = risks || [];
      // The badge, not the field behind it: a reader counts what is printed.
      const shownKillers = shown.filter((r) => /deal-stopper/i.test(String(r.severityLabel || ''))).length;
      const label = (r) => String(r.severityLabel || '').trim();
      const shownRepricers = shown.filter((r) => /price|repric/i.test(label(r))).length;
      const shownConditions = shown.filter((r) => /closing condition/i.test(label(r))).length;
      // A row graded fatal that wears another badge is still the thing that kills the
      // deal. Name the badge rather than reporting that nothing does.
      const otherFatal = shown.filter((r) => sev(r) === 'stopper' && !/deal-stopper/i.test(label(r))).map(label).filter(Boolean);
      const listSays = (() => {
        if (!shown.length) return 'Nothing is listed under what could kill it.';
        // Group by the badge the reader can see, so every row is accounted for in the
        // words it is actually wearing.
        const byBadge = new Map();
        for (const r of shown) {
          const lb = String(r.severityLabel || '').trim() || 'Unlabelled';
          byBadge.set(lb, (byBadge.get(lb) || 0) + 1);
        }
        // A badge can be a sentence ("The price is not evidenced"). Read inline after
        // "1 graded" that is a broken concatenation, so say it as a thing, not a claim.
        // Every badge the register can produce, as a thing rather than a claim, with a
        // plural for when there is more than one of it.
        const INLINE_GRADE = {
          'the price is not evidenced': ['unevidenced on price', 'unevidenced on price'],
          'downside breaks the hurdle': ['a downside that breaks the hurdle', 'downsides that break the hurdle'],
          'below the fund hurdle': ['below the fund hurdle', 'below the fund hurdle'],
          'the return does not clear the hurdle': ['short of the hurdle', 'short of the hurdle'],
          'closing condition': ['a closing condition', 'closing conditions'],
          'closing condition \u2014 regulatory': ['a regulatory closing condition', 'regulatory closing conditions'],
          'price-adjuster': ['a price-adjuster', 'price-adjusters'],
          'deal-stopper': ['a deal-stopper', 'deal-stoppers'],
          'monitor': ['a monitor', 'monitors'],
          'post-close monitor': ['a post-close monitor', 'post-close monitors'],
        };
        const inline = (lb, c) => {
          const hit = INLINE_GRADE[String(lb).trim().toLowerCase()];
          if (hit) return c === 1 ? hit[0] : hit[1];
          // Unknown badge: lower-case it so it reads as a grade, not a headline.
          const s = String(lb);
          return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
        };
        const parts = [...byBadge.entries()].map(([lb, c]) => (c === 1 && byBadge.size === 1 ? `graded ${inline(lb, 1)}` : `${c} graded ${inline(lb, c)}`));
        const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
        const total = shown.length;
        if (shownKillers) {
          return `${shownKillers === 1 ? 'One of the rows' : `${shownKillers} of the rows`} listed under what could kill it ${shownKillers === 1 ? 'is' : 'are'} graded a deal-stopper on the register${otherFatal.length ? `, and ${otherFatal.length === 1 ? 'one more is' : `${otherFatal.length} more are`} raised by this paper` : ''}. ${total === 1 ? 'The row is' : `The ${total} rows are`} ${list}.`;
        }

        const lead = total === 1
          ? 'The single row listed under what could kill it is not graded a deal-stopper'
          : `None of the ${total} rows listed under what could kill it is graded a deal-stopper`;
        return `${lead} \u2014 ${total === 1 ? 'it is' : 'they are'} ${list}.`;
      })();
      // One sentence on nineteen deals, listing categories that are empty on most of
      // them. Say what the register holds, not what it does not.
      const held = [
        monitors ? `${monitors} monitor${monitors === 1 ? '' : 's'}` : null,
        repricers ? `${repricers} repricing row${repricers === 1 ? '' : 's'}` : null,
        conditions ? `${conditions} closing condition${conditions === 1 ? '' : 's'}` : null,
      ].filter(Boolean);
      const reg = held.length
        ? `Separately the register carries ${held.length > 1 ? `${held.slice(0, -1).join(', ')} and ${held[held.length - 1]}` : held[0]}.`
        : 'The register carries nothing beyond those rows.';
      const fromBoard = outstanding.filter((r) => r.from === 'committee readiness').length;
      const fromRegister = n - fromBoard;
      const opener = !fromRegister
        ? `${n} item${n === 1 ? ' is' : 's are'} outstanding, all of them things the committee-readiness board is waiting on — the register adds nothing that conditions the deal or moves the price.`
        : !fromBoard
          ? `${n} item${n === 1 ? ' is' : 's are'} outstanding, and every one of them comes off the risk register rather than the readiness board: rows that condition the deal or move the price.`
          : `${n} item${n === 1 ? ' is' : 's are'} outstanding: ${fromBoard} the committee-readiness board is waiting on, and ${fromRegister} register row${fromRegister === 1 ? ' that conditions the deal or moves the price' : 's that condition the deal or move the price'}.`;
      return `${opener} ${reg} ${listSays}`;    })(),
    outstanding,
    // The board already audits how much of the case traces to a source, and scores Lumen
    // at 40 with the reason written out -- "IC ask derived from unsourced Revenue &
    // EBITDA". It was on a different page from the ask it is about.
    citations: (() => {      const a = validateCitations(deal);
      if (!a) return null;
      // The audit reads whether a claim traces to a source. It does not read whether two
      // sourced claims on the same page contradict each other, and it printed "All
      // numeric claims trace to a source fact or cited document" at score 100 on a case
      // carrying two enterprise values and two entry multiples. A badge that measures
      // something other than what its sentence says is worse than no badge.
      const caveats = sourcingCaveats(deal, { entryTies: (returns.entry || {}).ties, ebitdaDerived: canon.ebitdaSource === 'derived' });
      return {
        // Score, summary and boolean gave three different answers: 100, "All numeric
        // claims trace to a source fact or cited document", and clean: false, in one
        // object. And the denominator is the real problem -- three claims tested on a
        // page carrying seventeen figures. A 100 out of 3 is worse than no score,
        // because it is the number a reader quotes.
        score: caveats.length || a.totalClaims <= 1 ? null : a.score,
        scoreWithheld: caveats.length
          // This said "that check passes" unconditionally, so a deal reporting "0 of 1
          // claim tested trace to a source" carried a sentence saying the trace check had
          // passed — the one panel on the page whose job is to answer "where did that come
          // from?" contradicting itself two lines apart.
          ? (a.sourcedClaims >= a.totalClaims
            ? `No score. Every figure tested carries a source, but ${caveats[0]}, so a score would say the page is sound when it is not.`
            : `No score. ${a.totalClaims - a.sourcedClaims} of the ${a.totalClaims} claim${a.totalClaims === 1 ? '' : 's'} tested does not trace to a source at all, and the ones that do rest on figures that cannot be relied on.`)
          : a.totalClaims <= 1
            // A score of 100 was printed beside "only 1 claim was tested, too few to say
            // anything about the page", while three other deals correctly withheld it in
            // exactly the same situation. Publish or withhold, not both.
            ? 'No score. One claim is too small a sample to score.'
            : null,
        summary: caveats.length
          // "Every claim it tested does trace to a source" was hardcoded, and printed on
          // a deal reporting sourced 2 of 3. Two of three is not every claim.
          ? (() => {
            const lead = `On this deal ${caveats.join(', and ')}`.replace(/\s+$/, '');
            const stopped = /[.\u2026?!]$/.test(lead) ? lead : `${lead}.`;
            const n = a.sourcedClaims;
            return `${stopped} ${n} of ${a.totalClaims} claim${a.totalClaims === 1 ? '' : 's'} tested ${n === 1 ? 'traces' : 'trace'} to a source${a.sourcedClaims === a.totalClaims ? ', so every claim tested carries a source — which is not the same as being able to rely on the figure' : ''}.`;
          })()
          // "All numeric claims trace to a source fact or cited document. 1 claim tested."
          // If one claim was tested, the first sentence is not a finding.
          : a.totalClaims <= 1
            ? `Only ${a.totalClaims} claim was tested — too few to say anything about the page. It traces to a source.`
            : `${a.summary} ${a.totalClaims} claims tested — the key figures on the record, not every number on this page.`,
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
      // Both of these opened the same tab, so the second button was a button that did
      // nothing a reader could see. One destination, one name.
      { label: 'Returns, plan & risk', path: 'returns' },
      { label: 'Committee readiness', path: 'ic-readiness' },
      { label: 'Comparables & precedents', path: 'comparables' },
      // Resolved to Papers, which is where documents live and is not what the firm calls
      // a data room. Name the tab.
      { label: 'Papers', path: 'documents' },
    ],
  };
}
