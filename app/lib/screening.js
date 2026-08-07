// Deterministic pre-diligence artifact engine — the grounded backbone for the
// Stage-1 origination funnel's three pre-gate steps. Each function turns a
// candidate + fund mandate into the real artifact a US mid-market PE firm builds
// at that step, computed from the record (no model needed). The AI layer
// (lib/agents.js) enriches these with narrative; if the model is unavailable the
// deterministic output stands on its own.
//
// Grounded in practitioner research (Wall Street Prep, CFI, M&I/Multiple
// Expansion, Grata, Sourcescrub, DealCloud/Affinity, Axial, SPS/Bain DOBR):
//   O2 Auto Screen   -> Investment-Criteria Scorecard (hard knockouts + soft flags)
//   O3 Triage        -> weighted opportunity score across 6 dimensions -> A/B/C tier
//   O4 Screening Gate -> paper-LBO returns (entry mult, leverage, MOIC, IRR) + memo

import { gateCompany } from './scoring.js';
import { money, symbolFor } from './money.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ===========================================================================
//  O2 · AUTO SCREEN — Investment-Criteria Scorecard (hard knockouts + soft flags)
// ===========================================================================
// A pass/flag/fail matrix over the fund's binding criteria. Research: the initial
// screen is a fast knockout filter — sector/mandate fit, EV/size band, geography,
// positive-EBITDA floor, margin/business-model viability, entry-multiple sanity,
// ESG exclusions — plus soft flags (ownership/actionability, growth/revenue
// quality). Advance only if NOTHING fails; a soft flag warrants a note, not a kill.

const MARGIN_FLOOR = 10;      // WSP: <10% EBITDA margin => business-model viability concern
const MARGIN_STRONG = 20;     // healthy mid-market margin
const MAX_ENTRY_MULT = 20;    // EV/EBITDA sanity ceiling (LBO math breaks well before 30x)
const CONC_FLAG = 30;         // single-customer concentration flag (research: >20-30%)

function verdict(pass, flag) {
  return pass ? (flag ? 'flag' : 'pass') : 'fail';
}

// One criterion row: { key, label, group, status: pass|flag|fail, detail, value }
function scorecardRows(c, fund) {
  const rows = [];
  const gate = gateCompany(c, fund);
  const sym = symbolFor(c);

  // --- Hard knockouts (a FAIL blocks advancement) --------------------------
  const sectorOk = fund.sectorsPermitted?.includes(c.sector) && !fund.sectorsExcluded?.includes(c.sector);
  rows.push({
    key: 'sector', label: 'Sector / mandate fit', group: 'hard',
    status: verdict(sectorOk, false),
    detail: sectorOk ? `${c.sector} is a permitted mandate sector.` : `${c.sector} is outside the fund's permitted sectors.`,
    value: c.sector
  });

  const geoReason = gate.reasons.find((r) => /geograph/i.test(r));
  rows.push({
    key: 'geography', label: 'Geography', group: 'hard',
    status: verdict(!geoReason, false),
    detail: geoReason || `${c.region}, ${c.country} is inside the US mandate.`,
    value: `${c.region}`
  });

  const evOk = c.dealSize >= fund.evMin && c.dealSize <= fund.evMax;
  const evNear = !evOk && (c.dealSize >= fund.evMin * 0.85 && c.dealSize <= fund.evMax * 1.15);
  rows.push({
    key: 'ev', label: 'Enterprise-value band', group: 'hard',
    status: evOk ? 'pass' : evNear ? 'flag' : 'fail',
    detail: evOk
      ? `${money(c.dealSize, sym)} EV sits inside the ${money(fund.evMin, sym)}–${money(fund.evMax, sym)} band.`
      : `${money(c.dealSize, sym)} EV is ${c.dealSize < fund.evMin ? 'below' : 'above'} the ${money(fund.evMin, sym)}–${money(fund.evMax, sym)} band${evNear ? ' (marginal).' : '.'}`,
    value: money(c.dealSize, sym)
  });

  const ebitdaPositive = (c.ebitda ?? 0) > 0;
  rows.push({
    key: 'ebitda-floor', label: 'Positive EBITDA (LBO viability)', group: 'hard',
    status: verdict(ebitdaPositive, (c.ebitda ?? 0) < 10),
    detail: !ebitdaPositive
      ? `Non-positive EBITDA (${money(c.ebitda, sym)}) — cannot service acquisition debt.`
      : (c.ebitda < 10 ? `${money(c.ebitda, sym)} EBITDA is thin for a platform; may fit only as an add-on.` : `${money(c.ebitda, sym)} EBITDA supports a leveraged structure.`),
    value: money(c.ebitda, sym)
  });

  const impliedMult = c.ebitda > 0 ? c.dealSize / c.ebitda : null;
  const multOk = impliedMult != null && impliedMult <= MAX_ENTRY_MULT;
  rows.push({
    key: 'entry-multiple', label: 'Implied entry multiple', group: 'hard',
    status: impliedMult == null ? 'fail' : multOk ? (impliedMult > 12 ? 'flag' : 'pass') : 'fail',
    detail: impliedMult == null
      ? 'No positive EBITDA to compute an entry multiple.'
      : `Implied EV/EBITDA ≈ ${impliedMult.toFixed(1)}x${impliedMult > MAX_ENTRY_MULT ? ` — above the ${MAX_ENTRY_MULT}x sanity ceiling; LBO math is very hard.` : impliedMult > 12 ? ' — full; needs a growth story.' : '.'}`,
    value: impliedMult == null ? '—' : `${impliedMult.toFixed(1)}x`
  });

  const esgReason = gate.reasons.find((r) => /excluded sector|LPA/i.test(r));
  rows.push({
    key: 'esg', label: 'ESG / LPA exclusions', group: 'hard',
    status: verdict(!esgReason, false),
    detail: esgReason || 'Clears the LPA exclusion list (no weapons/tobacco/gambling/coal/adult).',
    value: esgReason ? 'excluded' : 'clear'
  });

  // --- Soft flags (a FLAG warrants a note, never a hard kill) ---------------
  const marginOk = (c.ebitdaMargin ?? 0) >= MARGIN_FLOOR;
  rows.push({
    key: 'margin', label: 'EBITDA margin / model viability', group: 'soft',
    status: marginOk ? ((c.ebitdaMargin ?? 0) >= MARGIN_STRONG ? 'pass' : 'flag') : 'flag',
    detail: marginOk
      ? `${c.ebitdaMargin}% margin${c.ebitdaMargin >= MARGIN_STRONG ? ' is healthy for the sector.' : ' is acceptable; watch model durability.'}`
      : `${c.ebitdaMargin}% margin is below the ${MARGIN_FLOOR}% viability threshold — probe the business model.`,
    value: `${c.ebitdaMargin}%`
  });

  const growthOk = (c.growth ?? 0) >= 0;
  rows.push({
    key: 'growth', label: 'Revenue growth / quality', group: 'soft',
    status: growthOk ? ((c.growth ?? 0) >= 8 ? 'pass' : 'flag') : 'flag',
    detail: growthOk
      ? `${c.growth >= 0 ? '+' : ''}${c.growth}% growth${c.growth >= 8 ? ' supports an organic-growth thesis.' : ' is modest; leans on margin/M&A levers.'}`
      : `${c.growth}% growth — declining top line; confirm it isn't structural.`,
    value: `${c.growth >= 0 ? '+' : ''}${c.growth}%`
  });

  const preferredOwner = /founder|family|sponsor/i.test(c.ownership || '');
  rows.push({
    key: 'ownership', label: 'Ownership / actionability', group: 'soft',
    status: preferredOwner ? 'pass' : 'flag',
    detail: preferredOwner
      ? `${c.ownership}-owned — a clean control/ succession angle is plausible.`
      : `${c.ownership}-owned — actionability and willingness to transact need confirming.`,
    value: c.ownership
  });

  return rows;
}

export function buildScorecard(c, fund) {
  const rows = scorecardRows(c, fund);
  const hard = rows.filter((r) => r.group === 'hard');
  const soft = rows.filter((r) => r.group === 'soft');
  const fails = rows.filter((r) => r.status === 'fail');
  const flags = rows.filter((r) => r.status === 'flag');
  const hardFails = hard.filter((r) => r.status === 'fail');

  const recommendation = hardFails.length ? 'pass' : 'advance';
  const passReasonCode = hardFails.length ? knockoutToReason(hardFails[0].key) : null;
  const clears = hard.length - hardFails.length;

  const headline = hardFails.length
    ? `Fails ${hardFails.length} hard criteri${hardFails.length === 1 ? 'on' : 'a'}: ${hardFails.map((r) => r.label).join(', ')}.`
    : `Clears all ${hard.length} hard knockouts${flags.length ? ` with ${flags.length} soft flag${flags.length === 1 ? '' : 's'} to note` : ''}.`;

  return {
    kind: 'scorecard',
    rows,
    summary: {
      hardTotal: hard.length,
      hardCleared: clears,
      softFlags: soft.filter((r) => r.status === 'flag').length,
      fails: fails.length
    },
    recommendation,           // 'advance' | 'pass'
    passReasonCode,
    headline
  };
}

// Map a failed knockout row to the O2 pass-reason taxonomy (data/candidates.js).
function knockoutToReason(key) {
  return {
    sector: 'sector-risk',
    geography: 'sector-risk',
    ev: 'size-floor',
    'ebitda-floor': 'size-floor',
    'entry-multiple': 'business-model',
    esg: 'esg-exclusion'
  }[key] || 'business-model';
}

// ===========================================================================
//  O3 · TRIAGE — weighted opportunity score across 6 dimensions -> A/B/C tier
// ===========================================================================
// Research: triage RANKS survivors on relative attractiveness across ~5-8 weighted
// dimensions (thesis fit, asset quality, value-creation angle, actionability,
// valuation, competitive dynamics) -> a composite 0-100 -> an A/B/C tier
// (A pursue, B monitor, C pass). Deterministic scoring from the record.

const TRIAGE_DIMS = [
  { key: 'thesisFit', label: 'Investment-thesis fit', weight: 22 },
  { key: 'assetQuality', label: 'Asset quality', weight: 22 },
  { key: 'valueCreation', label: 'Value-creation angle', weight: 18 },
  { key: 'actionability', label: 'Deal actionability', weight: 16 },
  { key: 'valuation', label: 'Valuation attractiveness', weight: 12 },
  { key: 'competitive', label: 'Competitive dynamics', weight: 10 }
];

// Each scorer returns { pct: 0-1, note }.
function scoreThesisFit(c, fund, fitScore) {
  // fitScore is the existing 0-100 mandate/screen fit (reuse the O1 engine result).
  const pct = clamp((fitScore ?? 0) / 100, 0, 1);
  return { pct, note: `${Math.round(pct * 100)}/100 mandate & screen fit${c.matchedScreenName ? ` (best: ${c.matchedScreenName})` : ''}.` };
}
function scoreAssetQuality(c) {
  // Margin (vs 20% strong), growth (vs 12%), recurring/keyword hints.
  const m = clamp((c.ebitdaMargin ?? 0) / 25, 0, 1);
  const g = clamp(((c.growth ?? 0) + 5) / 25, 0, 1);
  const recurring = (c.keywords || []).some((k) => /recurring|saas|subscription|contract/i.test(k)) ? 0.15 : 0;
  const pct = clamp(0.45 * m + 0.4 * g + recurring, 0, 1);
  return { pct, note: `${c.ebitdaMargin}% margin, ${c.growth >= 0 ? '+' : ''}${c.growth}% growth${recurring ? ', recurring revenue' : ''}.` };
}
function scoreValueCreation(c) {
  const kw = c.keywords || [];
  const rollup = kw.some((k) => /roll-?up|bolt-?on|buy-and-build|consolidat|platform/i.test(k)) ? 0.4 : 0;
  const margin = kw.some((k) => /margin|pricing|efficien|automat|digital/i.test(k)) ? 0.25 : 0;
  const growth = (c.growth ?? 0) >= 8 ? 0.2 : 0.1;
  const base = 0.2;
  const pct = clamp(base + rollup + margin + growth, 0, 1);
  const levers = [];
  if (rollup) levers.push('buy-and-build');
  if (margin) levers.push('margin/pricing');
  if ((c.growth ?? 0) >= 8) levers.push('organic growth');
  return { pct, note: levers.length ? `Levers: ${levers.join(', ')}.` : 'Value-creation angle to be defined in diligence.' };
}
function scoreActionability(c) {
  const owner = /founder|family/i.test(c.ownership || '') ? 0.85 : /sponsor/i.test(c.ownership || '') ? 0.55 : /public/i.test(c.ownership || '') ? 0.4 : 0.5;
  const cxo = (c.sources || []).includes('cxo') ? 0.15 : 0; // a warm CxO signal = a relationship angle
  const pct = clamp(owner + cxo, 0, 1);
  return { pct, note: `${c.ownership}-owned${cxo ? ', warm CxO relationship' : ''}.` };
}
function scoreValuation(c) {
  // Same rule as the model: where the record states the entry price, score THAT, so the
  // sourcing note and the deal's own page cannot rank a company on a multiple it is not
  // actually being bought at.
  const mult = c.statedMultiple ?? (c.ebitda > 0 ? c.dealSize / c.ebitda : 99);
  // Cheaper entry = more attractive; ~6x great, ~12x full.
  const pct = clamp(1 - (mult - 6) / 8, 0, 1);
  return { pct, note: c.statedMultiple ? `${mult.toFixed(1)}x EV/EBITDA entry, as recorded.` : c.ebitda > 0 ? `Implied ${mult.toFixed(1)}x EV/EBITDA entry.` : 'No positive EBITDA to value.' };
}
function scoreCompetitive(c) {
  // Founder/family + a CxO angle implies a more proprietary look; sponsor/public implies an auction.
  const proprietary = /founder|family/i.test(c.ownership || '') && (c.sources || []).includes('cxo');
  const pct = proprietary ? 0.85 : /founder|family/i.test(c.ownership || '') ? 0.6 : /sponsor|public/i.test(c.ownership || '') ? 0.35 : 0.5;
  return { pct, note: proprietary ? 'Likely proprietary / limited process.' : /sponsor|public/i.test(c.ownership || '') ? 'Likely competitive / auction.' : 'Process competitiveness TBD.' };
}

export function buildTriageScore(c, fund, fitScore) {
  const scorers = {
    thesisFit: scoreThesisFit(c, fund, fitScore),
    assetQuality: scoreAssetQuality(c),
    valueCreation: scoreValueCreation(c),
    actionability: scoreActionability(c),
    valuation: scoreValuation(c),
    competitive: scoreCompetitive(c)
  };
  const dims = TRIAGE_DIMS.map((d) => {
    const s = scorers[d.key];
    return { key: d.key, label: d.label, weight: d.weight, pct: +s.pct.toFixed(2), points: +(s.pct * d.weight).toFixed(1), note: s.note };
  });
  const composite = Math.round(dims.reduce((a, d) => a + d.points, 0));
  const tier = composite >= 68 ? 'A' : composite >= 45 ? 'B' : 'C';
  const tierAction = { A: 'advance', B: 'park', C: 'pass' }[tier];
  const tierLabel = { A: 'Pursue — earns a gate slot', B: 'Monitor — watchlist', C: 'Pass — below the bar' }[tier];
  const top = [...dims].sort((a, b) => b.points - a.points).slice(0, 2).map((d) => d.label.toLowerCase());
  const weak = [...dims].sort((a, b) => a.pct - b.pct).slice(0, 1).map((d) => d.label.toLowerCase());
  return {
    kind: 'triage',
    dims,
    composite,
    tier,
    tierAction,          // recommended action from the tier
    tierLabel,
    headline: `Tier ${tier} · ${composite}/100 — strongest on ${top.join(' & ')}; weakest on ${weak[0]}.`,
    parkReasonCode: tier === 'B' ? 'monitor' : null,
    passReasonCode: tier === 'C' ? (scorers.valuation.pct < 0.35 ? 'valuation-gap' : scorers.valueCreation.pct < 0.4 ? 'no-angle' : 'conviction') : null
  };
}

// ===========================================================================
//  O4 · SCREENING GATE — paper-LBO returns + IC pre-screen memo (deterministic)
// ===========================================================================
// Research: at pre-screen the sponsor presents a back-of-envelope ("paper") LBO —
// entry EV/EBITDA × EBITDA = EV; assume 4-6x leverage; grow EBITDA over a 5-yr
// hold; exit at a multiple; compute MOIC & IRR in base/upside/downside. Targets:
// >=20% base IRR, >=2.0x MOIC. This computes that math from the record so the
// memo (and the AI narrative in agents.js) is grounded in real numbers.

const HOLD_YEARS = 5;

// Real LBOs fund at most ~55-65% of enterprise value with debt; the sponsor
// always writes a meaningful equity check. Cap leverage at this share of EV so
// that when the leverage multiple approaches the entry multiple (e.g. a 5x floor
// entry with 5x leverage) the equity check can't collapse to ~$0 and blow the
// MOIC/IRR up to absurd numbers.
const MAX_DEBT_TO_EV = 0.65;

// CREDIT IS A DECISION. IT WAS A CONSTANT, AND THE CONSTANT BOUND EVERYWHERE.
//
// Debt was `min(EBITDA x 5, EV x 0.6)`. Where no EBITDA is recorded the model assumes
// 12% of EV, and 5/8.33 is 0.60 exactly — so the cap and the turns agreed to the decimal
// and every deal came out at 60.0% debt. On the cheaper deals the cap simply bound. All
// nineteen were financed identically: a $194M precision-components carve-out and an $814M
// grocery chain, same structure, same leverage, same page. Put two side by side and the
// room sees one spreadsheet with the company name changed.
//
// Lenders do not do that. What a business can carry depends on how contracted and how
// cash-generative it is, so that is what decides it here — and the returns page says which
// reason applied, because leverage is the largest single driver of the IRR being voted on.
const CREDIT_PROFILES = [
  { match: /renewable|storage/i, turns: 6.0, evCap: 0.70, why: 'contracted offtake supports project-style gearing' },
  { match: /vertical saas|software|data/i, turns: 5.5, evCap: 0.55, why: 'recurring revenue and high gross margin support a full quantum, but lenders discount the asset base' },
  { match: /payment|fintech/i, turns: 5.25, evCap: 0.55, why: 'recurring transaction revenue, offset by regulatory capital sensitivity' },
  { match: /multi-site care|care \/ services|health partners|dental/i, turns: 5.0, evCap: 0.60, why: 'reimbursement-backed cash flows across many small sites' },
  { match: /3pl|logistics|cold chain/i, turns: 4.5, evCap: 0.60, why: 'contracted volumes and a financeable fleet, against operational gearing' },
  { match: /packaging/i, turns: 4.5, evCap: 0.60, why: 'long customer contracts and hard assets, against raw-material pass-through risk' },
  { match: /diagnostic|lab services/i, turns: 4.75, evCap: 0.58, why: 'annuity-like testing volumes with meaningful equipment capex' },
  { match: /grocery|convenience/i, turns: 4.0, evCap: 0.60, why: 'defensive demand and property, against thin margins that leave little headroom' },
  { match: /specialty food|food manufactur/i, turns: 4.25, evCap: 0.58, why: 'staple demand, against commodity input volatility' },
  { match: /precision|manufactur|component/i, turns: 4.0, evCap: 0.55, why: 'programme backlog and hard assets, against cyclical end markets' },
  { match: /forestry|building product|timber/i, turns: 3.75, evCap: 0.55, why: 'asset backing, against commodity price and housing cyclicality' },
  { match: /biotech tools|cro/i, turns: 4.0, evCap: 0.50, why: 'contracted study backlog, against customer concentration and funding cyclicality' },
  { match: /marine/i, turns: 3.5, evCap: 0.55, why: 'vessel security, against day-rate volatility' },
  { match: /carve-out|specialty chemical/i, turns: 3.5, evCap: 0.50, why: 'no standalone track record through a cycle, and a live TSA' },
  { match: /energy service|electrification/i, turns: 3.0, evCap: 0.50, why: 'activity-driven earnings that lenders will not underwrite through the trough' },
];
const DEFAULT_CREDIT = { turns: 4.5, evCap: 0.60, why: 'no sector precedent on file; the fund\'s standard mid-market structure' };

// WHAT A SECTOR TRADES AT, USED ONLY WHERE NOBODY HAS PRODUCED AN EBITDA.
//
// The screening default was a flat 12% of enterprise value, and 1/0.12 is 8.33 — so every
// deal without a diligenced EBITDA priced at 8.3x. A narrator clicked four consecutive
// deals — renewables, marine services, vertical SaaS and specialty foods — and read 8.3x,
// 8.3x, 8.3x, 8.3x. Four sectors, one number, because it was never about the sector.
//
// A screening default should be the sector's own convention. It is still a placeholder and
// the page still says so; it is just no longer the SAME placeholder for a grocer and a
// software business.
const SCREENING_MULTIPLES = [
  { match: /vertical saas|software|data/i, x: 12 },
  { match: /biotech tools|cro/i, x: 11.5 },
  { match: /payment|fintech/i, x: 11 },
  { match: /diagnostic|lab services/i, x: 10.5 },
  { match: /renewable|storage/i, x: 10 },
  { match: /multi-site care|care \/ services|health partners|dental/i, x: 9.5 },
  { match: /specialty food|food manufactur/i, x: 9 },
  { match: /3pl|logistics|cold chain/i, x: 8.5 },
  { match: /packaging/i, x: 8 },
  { match: /precision|manufactur|component/i, x: 7.5 },
  { match: /carve-out|specialty chemical/i, x: 7 },
  { match: /grocery|convenience/i, x: 6.5 },
  { match: /forestry|building product|timber/i, x: 6.5 },
  { match: /marine/i, x: 6 },
  { match: /energy service|electrification/i, x: 5.5 },
];
const DEFAULT_SCREENING_MULTIPLE = 8.5;

export function screeningMultiple(deal) {
  const hay = `${deal?.subSector || ''} ${deal?.sector || ''}`;
  return (SCREENING_MULTIPLES.find((s) => s.match.test(hay)) || { x: DEFAULT_SCREENING_MULTIPLE }).x;
}

// Turns of EBITDA this business can carry, and the reason in words.
export function creditProfile(c) {
  const hay = `${c?.subSector || ''} ${c?.sector || ''}`;
  const p = CREDIT_PROFILES.find((x) => x.match.test(hay)) || DEFAULT_CREDIT;
  // Margin is the other half of the credit question: cash conversion decides how much of
  // the quantum is actually serviceable, whatever the sector convention says.
  const margin = c?.ebitdaMargin ?? null;
  const adj = margin == null ? 0 : margin >= 25 ? 0.5 : margin >= 15 ? 0.25 : margin < 8 ? -0.5 : 0;
  const turns = +Math.max(2.5, Math.min(6.5, p.turns + adj)).toFixed(2);
  const marginNote = margin == null ? null
    : adj > 0 ? `${margin}% EBITDA margins convert well, which supports the upper end`
      : adj < 0 ? `${margin}% EBITDA margins leave little headroom, so the quantum is cut back`
        : null;
  return { turns, evCap: p.evCap, why: p.why, marginNote };
}

// The most EBITDA growth we are willing to compound for the whole hold at screening
// grade. A 41%-growth asset gets 15%; the upside of being right about the rest is
// argued in the IC paper, not smuggled into the headline return.
const UNDERWRITTEN_GROWTH_CAP = 0.15;

// Used when the record states no growth rate at all, which is most of them. The
// assumptions line says which of the two applied rather than implying every deal came
// with a number.
const DEFAULT_GROWTH = 6;

function paperLbo(c, { entryMult, leverageMult, ebitdaCagr, exitMult, evCap }) {
  const entryEbitda = Math.max(1, c.ebitda || 1);
  const entryEV = entryEbitda * entryMult;
  // The sector's own ceiling, not one number for the whole book.
  const cap = Math.min(evCap ?? MAX_DEBT_TO_EV, MAX_DEBT_TO_EV);
  const debt = Math.min(entryEbitda * leverageMult, entryEV * cap);
  const equityIn = Math.max(1, entryEV - debt);
  const exitEbitda = entryEbitda * Math.pow(1 + ebitdaCagr, HOLD_YEARS);
  const exitEV = exitEbitda * exitMult;
  // Cash available to repay debt tracks margin. A flat 50% had a 7.6%-margin grocer
  // deleveraging exactly like a 30%-margin software business -- and since the debt cap
  // makes EBITDA and entry multiple cancel out of the MOIC, that constant plus a
  // constant growth default was why every deal returned the same IRR.
  const paydown = clamp(0.5 + ((c.ebitdaMargin ?? 15) - 15) / 100, 0.3, 0.7);
  const debtAtExit = debt * (1 - paydown);
  const equityOut = Math.max(0, exitEV - debtAtExit);
  const moic = equityOut / equityIn;
  const irr = moic > 0 ? Math.pow(moic, 1 / HOLD_YEARS) - 1 : -1;
  return {
    entryEV: Math.round(entryEV), equityIn: Math.round(equityIn), debt: Math.round(debt),
    // What is actually repaid over the hold. The value bridge used to re-derive this at a
    // flat 50% while the model repaid a margin-driven share, so the bridge and the returns
    // waterfall disagreed by up to $39M on the same deal, on adjacent screens.
    debtAtExit: Math.round(debtAtExit), debtRepaid: Math.round(debt - debtAtExit),
    exitEbitda: Math.round(exitEbitda), exitEV: Math.round(exitEV), equityOut: Math.round(equityOut),
    entryMult, exitMult,
    moic: +moic.toFixed(2), irr: +(irr * 100).toFixed(1)
  };
}

export function buildReturns(c) {
  const impliedMult = c.ebitda > 0 ? c.dealSize / c.ebitda : null;
  // Use the actual implied entry multiple when it's within a financeable range;
  // above the LBO ceiling the paper deal only works if the entry can be renegotiated,
  // so we model at the ceiling AND flag that the current ask is unfinanceable.
  // This was clamp(impliedMult, 5, MAX_ENTRY_MULT) — a FLOOR of 5x as well as a ceiling.
  // Meridian's own record implies 4.1x, so the model bought it at 5x instead, and every
  // page downstream inherited a purchase price 22% above the one on the deal: "$670M
  // enterprise value at 4.1x", where 670 over 134 is 5.0x. The reconciliation sentence
  // added last round documented the contradiction instead of removing it, and a partner
  // still could not state the purchase price. A cheap entry is a cheap entry; there is
  // no reason to model a deal as dearer than it is. The ceiling stays, because an ask
  // above the financeable limit genuinely cannot be underwritten as asked, and that case
  // already says so in terms.
  // A price the record STATES is the price. Deriving one from EV over EBITDA and
  // modelling at that instead is how one deal came to show five different entry
  // multiples across four screens — the returns page, the triage note, the IC
  // assumption snapshot and the deal header each did this arithmetic separately.
  const askMult = c.statedMultiple ?? impliedMult;
  const baseMult = askMult == null ? 8 : Math.min(askMult, MAX_ENTRY_MULT);
  const entryAboveCeiling = askMult != null && askMult > MAX_ENTRY_MULT;
  // Nobody underwrites a fast-growing asset's current rate for five straight years at
  // screening. Cap what we are willing to put in the model, and say so in the
  // assumptions rather than quietly compounding 41% into a headline return.
  const recordedGrowth = c.growth ?? null;
  const g = clamp((recordedGrowth ?? DEFAULT_GROWTH) / 100, -0.05, UNDERWRITTEN_GROWTH_CAP);
  // Whether the number in the model is the number on the record. A committee member asked
  // where 15% came from when the front page says 41% and got "not recorded... no sign-off"
  // — the cap had silently replaced the recorded rate and nothing said so.
  const growthCapped = recordedGrowth != null && recordedGrowth / 100 > UNDERWRITTEN_GROWTH_CAP;
  // The quantum this business can carry, decided from what it is rather than from a
  // constant. The scenarios move around it: a lender offers less in the downside.
  const credit = creditProfile(c);
  const scenarios = {
    downside: paperLbo(c, { entryMult: baseMult, leverageMult: Math.max(2, credit.turns - 0.5), ebitdaCagr: Math.max(0, g - 0.04), exitMult: baseMult - 1, evCap: credit.evCap }),
    base: paperLbo(c, { entryMult: baseMult, leverageMult: credit.turns, ebitdaCagr: g, exitMult: baseMult, evCap: credit.evCap }),
    upside: paperLbo(c, { entryMult: baseMult, leverageMult: credit.turns + 0.5, ebitdaCagr: g + 0.04, exitMult: baseMult + 1, evCap: credit.evCap })
  };
  const meetsHurdle = !entryAboveCeiling && scenarios.base.irr >= 20 && scenarios.base.moic >= 2.0;
  const entryEbitda = Math.max(1, c.ebitda || 1);
  const entryEbitdaForBasis = entryEbitda;
  const effLeverage = +(scenarios.base.debt / entryEbitda).toFixed(1);
  return {
    entryMultiple: +baseMult.toFixed(1),
    impliedMultiple: impliedMult == null ? null : +impliedMult.toFixed(1),
    entryAboveCeiling,
    leverage: `${effLeverage}x`,
    // "Modelled at the financeable ceiling for the sector" was printed on every deal while
    // there was no sector input anywhere in the calculation. Now there is one, so it can
    // be named.
    leverageBasis: [`Modelled at ${credit.turns}x EBITDA: ${credit.why}.`, credit.marginNote ? `${credit.marginNote}.` : null,
      `Capped so debt stays within ${Math.round(credit.evCap * 100)}% of enterprise value.`].filter(Boolean).join(' '),
    creditTurns: credit.turns,
    debtToEv: scenarios.base.entryEV ? +(scenarios.base.debt / scenarios.base.entryEV).toFixed(3) : null,
    // The inputs the base case was actually struck on. Without these a sensitivity grid
    // has to guess them, and the one on the Returns page guessed a different growth rate
    // and a different leverage -- so none of its nine cells contained the deal.
    ebitdaCagr: g,
    baseLeverageMult: credit.turns,
    growthCapped,
    growthBasis: growthCapped
      ? `Underwritten at ${Math.round(g * 100)}% EBITDA growth, not the ${recordedGrowth}% on the record: this is the ceiling the fund will put in a model at screening, and the rest of the case is argued in the IC paper rather than compounded into the headline return.`
      : recordedGrowth != null
        ? `Underwritten at the ${recordedGrowth}% growth recorded for this company.`
        : `No growth rate is recorded for this company, so the model runs at the ${DEFAULT_GROWTH}% fund default.`,
    // The downside needs MORE equity than the base, which reads backwards until you know
    // why. Asked, the assistant invented a story about enterprise value falling. It does
    // not: the entry is the same in all three and only the debt changes.
    //
    // That sentence was then printed unconditionally, and on most deals it is false. The
    // leverage multiple is a request, not an outcome: on a deal the lender caps below
    // 4.5x, the downside and the base finance identically and the equity cheques come out
    // the same to the dollar. A committee member read "the downside puts in more equity"
    // on four deals where the two numbers were equal, one click from a page that had just
    // been corrected to say so. Say what these three scenarios actually did.
    scenarioBasis: (() => {
      const same = Math.round(scenarios.downside.equityIn) === Math.round(scenarios.base.equityIn);
      const dLev = +(scenarios.downside.debt / entryEbitdaForBasis).toFixed(1);
      const bLev = +(scenarios.base.debt / entryEbitdaForBasis).toFixed(1);
      return same
        ? `All three scenarios buy at the same enterprise value and put in the same equity: the debt is capped below the level the model would otherwise request, so the downside is financed identically to the base at ${bLev}x. Only the exit differs.`
        : `All three scenarios buy at the same enterprise value. The downside puts in more equity because it is financed at ${dLev}x rather than ${bLev}x, not because the price is different.`;
    })(),
    holdYears: HOLD_YEARS,
    scenarios,
    hurdle: { irr: 20, moic: 2.0 },
    meetsHurdle,
    grade: 'screening',
    assumptions: [
      'Screening-grade paper LBO — an indicative heuristic, not an IC model.',
      'Debt repaid from cumulative free cash flow over the hold, at a rate that tracks EBITDA margin.',
      c.growth == null
        ? `No growth rate is recorded for this company, so EBITDA is grown at the ${DEFAULT_GROWTH}% screening default.`
        : `EBITDA growth underwritten at the recorded ${c.growth}% a year, capped at ${Math.round(UNDERWRITTEN_GROWTH_CAP * 100)}%.`,
      'No explicit cash interest, cash taxes, capex or working-capital drag.',
      'Deterministic EBITDA CAGR to a fixed-multiple exit — no multiple expansion is underwritten.'
    ]
  };
}

// Deterministic IC pre-screen memo — the fallback/base the AI narrative enriches.
export function buildMemoBase(c, fund, { fitScore, tier } = {}) {
  const returns = buildReturns(c);
  const sym = symbolFor(c);
  const isProprietary = /founder|family/i.test(c.ownership || '') && (c.sources || []).includes('cxo');
  const rec = returns.meetsHurdle ? 'PURSUE' : 'PASS';
  const ceilingNote = returns.entryAboveCeiling
    ? ` The current implied ask (~${returns.impliedMultiple}x EV/EBITDA) is above the ${MAX_ENTRY_MULT}x financeable ceiling — the paper deal only works if the entry can be reset to ~${returns.entryMultiple}x.`
    : '';
  return {
    kind: 'memo',
    generated: false,
    recommendation: rec,
    execSummary: `${c.company} — a ${money(c.dealSize, sym)} ${c.sector.toLowerCase()} ${c.ownership}-owned target. Paper LBO returns ${returns.scenarios.base.moic}x / ${returns.scenarios.base.irr}% IRR in the base case at a ${returns.entryMultiple}x entry.${ceilingNote} ${returns.meetsHurdle ? 'Clears the fund hurdle — recommend PURSUE and authorize an IOI.' : 'Below the 20% / 2.0x hurdle on paper — recommend PASS unless the angle or entry improves.'}`,
    sourcingAngle: isProprietary
      ? 'Warm CxO relationship into a founder/family owner — a proprietary, limited-process angle with room to lead on certainty rather than price.'
      : `${c.ownership}-owned; likely a ${/sponsor|public/i.test(c.ownership) ? 'competitive/auction' : 'semi-intermediated'} process. Angle-to-win must be defined before committing diligence spend.`,
    thesis: valueCreationThesis(c),
    keyRisks: memoRisks(c, returns),
    diligencePriorities: diligencePriorities(c),
    dealTeam: 'Sponsor: sector Partner · Execution: VP + Associate · Advisers: QoE (accounting), commercial DD, legal.',
    returns,
    ask: returns.meetsHurdle
      ? `Approve an IOI at ${returns.entryMultiple}x EV/EBITDA (${money(returns.scenarios.base.entryEV, sym)} EV) and a ~${sym}0.4–0.7M diligence budget over ${returns.holdYears === 5 ? '6–8 weeks' : 'the diligence window'}.`
      : 'No IC ask — recommend logging a pass (or parking on a re-engagement trigger).',
    tier: tier || null
  };
}

function valueCreationThesis(c) {
  const kw = c.keywords || [];
  const levers = [];
  if (kw.some((k) => /roll-?up|bolt-?on|buy-and-build|consolidat|platform/i.test(k))) levers.push('buy-and-build in a fragmented market');
  if (kw.some((k) => /margin|pricing|efficien|automat|digital/i.test(k))) levers.push('margin expansion via pricing/operational levers');
  if ((c.growth ?? 0) >= 8) levers.push(`organic growth (${c.growth}% today)`);
  if (!levers.length) levers.push('operational professionalization under institutional ownership');
  return `Value creation rests on ${levers.join('; ')}. Returns should be driven by EBITDA growth and debt paydown, not multiple expansion.`;
}
function memoRisks(c, returns) {
  const risks = [];
  if (c.ebitdaMargin < 15) risks.push({ risk: `Thin ${c.ebitdaMargin}% EBITDA margin`, mitigant: 'QoE + margin-bridge diligence to confirm normalised profitability.' });
  if ((c.growth ?? 0) < 5) risks.push({ risk: `Modest ${c.growth}% growth`, mitigant: 'Commercial DD to validate the demand and pipeline.' });
  if (/founder|family/i.test(c.ownership || '')) risks.push({ risk: 'Founder/key-person dependency', mitigant: 'Management diligence + retention/incentive structuring.' });
  if (!returns.meetsHurdle) risks.push({ risk: 'Base-case returns below hurdle on paper', mitigant: 'Negotiate entry multiple or identify additional value levers.' });
  risks.push({ risk: 'Customer concentration unknown', mitigant: 'Confirm top-customer mix (<20–30%) in early diligence.' });
  return risks.slice(0, 5).map((r) => ({ ...r, provenance: 'inferred' }));
}
function diligencePriorities(c) {
  return [
    'Quality of Earnings — normalise EBITDA, confirm addbacks and working capital.',
    'Commercial DD — market size, growth durability, competitive position.',
    'Customer concentration & contract quality (retention, pricing).',
    /founder|family/i.test(c.ownership || '') ? 'Management depth & founder-transition/retention plan.' : 'Management assessment & incentive alignment.',
    'Confirmatory legal, tax and (where relevant) ESG/regulatory review.'
  ];
}

export { money as fmtMoney };
export { paperLbo, HOLD_YEARS };
