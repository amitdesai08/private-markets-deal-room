// MARKET BENCHMARKS — where the platform's valuation and capital-structure assumptions
// come from, and how they are derived.
//
// WHY THIS FILE EXISTS
// The screening multiples, credit turns and margin assumptions used to be hand-typed
// tables. Nobody could say where a number came from, and the results did not survive
// contact with a private-equity reader: nine of nineteen deals priced between 3.7x and
// 6.8x EBITDA, which for a mid-market control buyout is a distressed print. A vertical
// SaaS business carried a 6.9% EBITDA margin. Those are not opinions the product is
// entitled to have — they are observable facts about markets, and they belong in one
// place with their provenance attached.
//
// SOURCES
//  1. Aswath Damodaran (NYU Stern), "Enterprise Value Multiples by Sector (US)" and
//     "Margins by Sector (US)", data as of January 2026.
//     https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/vebitda.html
//     https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/margin.html
//     Used for SECTOR RELATIVITY and for EBITDA/Sales margins.
//  2. Bain & Company, Global Private Equity Report 2026 — "12 is the new 5": entry
//     multiples are high, debt is expensive, and multiple expansion is no longer
//     available, so the return has to be earned through EBITDA growth.
//     Used for the BUYOUT ANCHOR and for the underwriting posture.
//
// THE METHOD, AND WHY IT IS NOT JUST THE PUBLIC MULTIPLE
// A public EV/EBITDA is not a buyout price. Public comparables carry growth and liquidity
// premia that a mid-market private company does not, which is why standard practice is to
// take the public comparable and adjust for size, liquidity and control rather than to use
// it raw. Damodaran's software multiple of 24.5x is a true fact about listed software and
// a false one about what a fund pays for a $200M ARR vertical SaaS business.
//
// So the sector's multiple is expressed as its RELATIVITY to the market, damped, and
// anchored to the observed mid-market buyout price:
//
//     buyout = ANCHOR × (sectorPublic / marketPublic) ^ DAMPING
//
// Damping below 1 is the size/liquidity adjustment: private mid-market multiples are
// compressed toward the middle relative to listed peers — the premium sectors trade down
// harder than the discount sectors trade up. At DAMPING = 0.6 the table lands where
// mid-market deals actually clear: software mid-teens, grocery and forestry high single
// digits, industrials around eleven.

// Damodaran, January 2026, "Total Market (without financials)", EV/EBITDA on positive-
// EBITDA firms. Financials are excluded because their EV/EBITDA is not meaningful.
export const MARKET_EV_EBITDA = 16.95;

// Mid-market US control buyout purchase price. Bain's 2026 report frames the current era
// as one of persistently high entry multiples; ~11.5x is the working anchor for a
// mid-market platform deal.
export const BUYOUT_ANCHOR = 11.5;

// The size/liquidity/control adjustment. See the note above.
export const RELATIVITY_DAMPING = 0.6;

// No sector prices outside this band at mid-market scale, whatever the listed comparables
// do. The floor stops a distressed print; the ceiling stops a venture multiple.
export const MULTIPLE_FLOOR = 6.5;
export const MULTIPLE_CEILING = 17.0;

// Damodaran, January 2026. `ev` is EV/EBITDA for positive-EBITDA firms; `margin` is
// EBITDA/Sales. `match` maps our own sector/sub-sector wording onto the industry.
// Order matters: the first match wins, so the specific patterns precede the general ones.
export const SECTOR_BENCHMARKS = [
  { key: 'software', label: 'Software (System & Application)', match: /saas|software|vertical saas|data platform/i, ev: 24.48, margin: 35.93, growth: 14 },
  { key: 'healthIT', label: 'Healthcare Information and Technology', match: /health.?tech|healthcare it|clinical software/i, ev: 21.27, margin: 20.50, growth: 11 },
  { key: 'healthProducts', label: 'Healthcare Products', match: /biotech tools|cro|diagnostic|lab services|medical device/i, ev: 19.78, margin: 20.34, growth: 8 },
  { key: 'healthFacilities', label: 'Hospitals/Healthcare Facilities', match: /multi.?site care|clinic|dental|hospital|care services/i, ev: 8.86, margin: 15.80, growth: 7 },
  { key: 'machinery', label: 'Machinery', match: /precision|machinery|industrial equipment|components/i, ev: 16.22, margin: 19.62, growth: 5 },
  { key: 'specialtyChem', label: 'Chemical (Specialty)', match: /specialty chemical|chemical/i, ev: 13.36, margin: 18.01, growth: 4 },
  { key: 'envServices', label: 'Environmental & Waste Services', match: /waste|environmental|recycling/i, ev: 15.61, margin: 20.99, growth: 6 },
  { key: 'power', label: 'Power', match: /renewable|storage|solar|wind|power/i, ev: 12.38, margin: 35.33, growth: 9 },
  { key: 'oilfield', label: 'Oilfield Svcs/Equip.', match: /energy services|electrification|oilfield/i, ev: 8.63, margin: 7.76, growth: 5 },
  { key: 'coldChain', label: 'Trucking (temperature-controlled)', match: /temperature.?controlled|cold.?chain|refrigerated/i, ev: 10.41, margin: 15.58, growth: 7 },
  { key: 'transport', label: 'Transportation', match: /contract logistics|3pl|freight|transport/i, ev: 12.55, margin: 9.83, growth: 5 },
  { key: 'trucking', label: 'Trucking', match: /trucking|haulage/i, ev: 10.41, margin: 15.58, growth: 4 },
  { key: 'marine', label: 'Shipbuilding & Marine', match: /marine|shipyard|port/i, ev: 7.95, margin: 20.41, growth: 5 },
  { key: 'packaging', label: 'Packaging & Container', match: /packaging|container/i, ev: 9.71, margin: 14.36, growth: 4 },
  { key: 'forest', label: 'Paper/Forest Products', match: /forestry|timber|paper|building products/i, ev: 8.18, margin: 14.65, growth: 3 },
  { key: 'buildingMaterials', label: 'Building Materials', match: /building materials|construction supplies/i, ev: 11.61, margin: 17.32, growth: 4 },
  { key: 'foodProcessing', label: 'Food Processing', match: /specialty food|food manufactur|food processing/i, ev: 10.01, margin: 15.25, growth: 3 },
  { key: 'grocery', label: 'Retail (Grocery and Food)', match: /grocery|convenience|food retail/i, ev: 8.94, margin: 5.40, growth: 3 },
  { key: 'payments', label: 'Financial Svcs. (Non-bank & Insurance)', match: /payments|fintech|financial services/i, ev: 20.00, margin: 21.02, growth: 11 },
  { key: 'busServices', label: 'Business & Consumer Services', match: /business services|outsourc|facilities/i, ev: 14.26, margin: 15.65, growth: 6 },
  { key: 'retailSpecial', label: 'Retail (Special Lines)', match: /retail|consumer/i, ev: 11.47, margin: 9.85, growth: 3 },
];

// Used when nothing matches: the market ex-financials, which prices at the anchor.
export const DEFAULT_BENCHMARK = { key: 'market', label: 'Total Market (without financials)', ev: MARKET_EV_EBITDA, margin: 17.42, growth: 5 };

const hay = (deal) => `${deal?.subSector || ''} ${deal?.sector || ''} ${deal?.keywords?.join(' ') || ''}`;

export function benchmarkFor(deal) {
  return SECTOR_BENCHMARKS.find((s) => s.match.test(hay(deal))) || DEFAULT_BENCHMARK;
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// The entry multiple a mid-market buyer would underwrite for this sector, and the sentence
// that says where it came from. Never a bare number: an entry multiple with no provenance
// is the thing this file exists to stop.
export function sectorEntryMultiple(deal) {
  const b = benchmarkFor(deal);
  const relativity = (b.ev / MARKET_EV_EBITDA) ** RELATIVITY_DAMPING;
  const raw = BUYOUT_ANCHOR * relativity;
  const x = +clamp(raw, MULTIPLE_FLOOR, MULTIPLE_CEILING).toFixed(1);
  return {
    multiple: x,
    benchmark: b,
    clamped: raw < MULTIPLE_FLOOR || raw > MULTIPLE_CEILING,
    basis: `${x}x is the mid-market entry multiple for ${b.label}: listed peers trade at ${b.ev.toFixed(1)}x EV/EBITDA against ${MARKET_EV_EBITDA.toFixed(1)}x for the market (Damodaran, January 2026), adjusted for the size and liquidity discount a private mid-market company carries and anchored to a ${BUYOUT_ANCHOR}x mid-market buyout price.`,
  };
}

// The EBITDA margin the sector actually earns, used to sanity-check a recorded figure and
// to derive one where the record holds revenue but no EBITDA.
export function sectorMargin(deal) {
  const b = benchmarkFor(deal);
  return { margin: b.margin, benchmark: b, basis: `${b.margin.toFixed(1)}% is the EBITDA/Sales margin for ${b.label} (Damodaran, January 2026).` };
}

// CAPITAL STRUCTURE
//
// Two independent constraints, and the binding one is whichever bites first — which is how
// a credit committee actually sizes debt:
//   • cash-flow test  — turns of EBITDA the business can service
//   • asset/value test — debt as a share of enterprise value
//
// Turns scale with margin because margin is the crude proxy for cash conversion: a 35%
// margin business services more debt per turn of revenue than a 5% one. Post-2022, equity
// contribution to US LBOs has run around half the capital structure, so the debt-to-EV
// ceiling sits at 0.55 rather than the 0.65 of the cheap-debt era.
export const MAX_DEBT_TO_EV = 0.55;
export const TARGET_EQUITY_CONTRIBUTION = 0.50;

export function creditTurnsFor(deal, marginPct = null) {
  const b = benchmarkFor(deal);
  const m = marginPct == null ? b.margin : marginPct;
  // 4.0x is the mid-market base. Margin moves it within a band lenders recognise.
  const adj = m >= 30 ? 1.25 : m >= 20 ? 0.75 : m >= 12 ? 0.25 : m >= 8 ? -0.25 : -0.75;
  const turns = +clamp(4.0 + adj, 2.5, 6.0).toFixed(2);
  return {
    turns,
    maxDebtToEv: MAX_DEBT_TO_EV,
    basis: `${turns}x is the cash-flow test for ${b.label} at a ${m.toFixed(1)}% EBITDA margin; the structure is also held to ${Math.round(MAX_DEBT_TO_EV * 100)}% debt-to-enterprise-value, and the binding constraint is whichever is reached first.`,
  };
}

// Underwriting posture. Bain's 2026 report is explicit that multiple expansion is no
// longer available, so an entry-equals-exit assumption is the honest default and any
// uplift has to be argued rather than assumed.
export const EXIT_MULTIPLE_POLICY = {
  expansion: 0,
  basis: 'Exit is underwritten at the entry multiple. Bain\u2019s Global Private Equity Report 2026 finds that low prices, cheap debt and easy multiple expansion are gone, so the return has to come from EBITDA growth and debt paydown rather than from selling at a higher multiple.',
};

// COMPANY-LEVEL ADJUSTMENT.
//
// A sector default applied unchanged gives every deal in a sector the same price, which is
// both wrong and obviously machine-made. Two adjustments, and both are effects a valuation
// practitioner would recognise and defend in a committee:
//
//   SIZE      Larger companies trade at higher multiples than smaller ones in the same
//             sector — deeper buyer pools, more financing options, less key-person risk.
//             Applied on a log scale around a $300M reference so it tapers rather than
//             running away at the top.
//   GROWTH    Faster-growing companies command a premium over the sector's typical grower.
//             Applied against the sector's own organic rate, so 8% is a premium in
//             forestry and a discount in software.
//
// Both are bounded: this is a screening default, not a bid.
const REFERENCE_EV = 300;
const SIZE_SENSITIVITY = 0.08;
const GROWTH_SENSITIVITY = 0.9;

export function companyEntryMultiple(deal, { growth = null } = {}) {
  const base = sectorEntryMultiple(deal);
  const ev = Number(deal?.dealSize) || REFERENCE_EV;
  const sizeAdj = clamp(Math.log(ev / REFERENCE_EV) * SIZE_SENSITIVITY, -0.10, 0.12);
  const g = growth == null ? (base.benchmark.growth ?? 5) : growth;
  const typical = base.benchmark.growth ?? 5;
  const growthAdj = clamp(((g - typical) / 100) * GROWTH_SENSITIVITY, -0.12, 0.15);
  const multiple = +clamp(base.multiple * (1 + sizeAdj + growthAdj), MULTIPLE_FLOOR, MULTIPLE_CEILING).toFixed(1);
  const notes = [];
  if (Math.abs(sizeAdj) >= 0.01) notes.push(`${sizeAdj > 0 ? 'a premium' : 'a discount'} of ${Math.abs(Math.round(sizeAdj * 100))}% for scale at $${Math.round(ev)}M of enterprise value`);
  if (Math.abs(growthAdj) >= 0.01) notes.push(`${growthAdj > 0 ? 'a premium' : 'a discount'} of ${Math.abs(Math.round(growthAdj * 100))}% for growth of ${g}% against ${typical}% typical for the sector`);
  return {
    multiple,
    sectorMultiple: base.multiple,
    benchmark: base.benchmark,
    growth: g,
    basis: `${base.basis}${notes.length ? ` This company carries ${notes.join(' and ')}.` : ''}`,
  };
}

// The three figures a screen needs, derived from the one number a deal always has — the
// price — so that EV, EBITDA and revenue can never disagree with the multiple printed
// beside them. Used to derive a figure the record does not hold, never to overwrite one
// it does.
export function impliedFinancials(deal, { growth = null } = {}) {
  const ev = Number(deal?.dealSize);
  if (!Number.isFinite(ev)) return null;
  const m = companyEntryMultiple(deal, { growth });
  const margin = sectorMargin(deal).margin;
  const ebitda = Math.round(ev / m.multiple);
  const revenue = Math.round(ebitda / (margin / 100));
  return { ev, ebitda, revenue, margin, entryMultiple: m.multiple, growth: m.growth, basis: m.basis, benchmark: m.benchmark };
}

// MARGIN EXPANSION — the half of EBITDA growth that is not revenue growth.
//
// The model compounded revenue growth and called the answer EBITDA growth, which is why a
// book of realistically-priced deals returned 7-15% and almost nothing cleared a 20%
// hurdle. That is not how a sponsor underwrites: the value-creation plan is expected to
// widen the margin over the hold — procurement, pricing, overhead leverage, mix — and the
// EBITDA line therefore grows faster than the top line.
//
// 200bps over a five-year hold is a conservative underwriting assumption — sponsor plans
// commonly target 200-400bps — and it is the low end deliberately, because it is applied
// to every deal rather than argued deal by deal. It is
// applied to the base and upside and NEVER to the downside, where margin compresses
// instead, and it is disclosed in the assumptions rather than folded silently into a
// headline return.
export const MARGIN_EXPANSION_BPS = 200;
export const MARGIN_COMPRESSION_BPS = 100;

// EBITDA CAGR implied by growing revenue at `revenueCagr` while the margin moves from
// `marginPct` by `bps` over `years`. Exact rather than approximated: the exit EBITDA is
// revenue at exit times margin at exit, so the CAGR follows from the ratio of the two.
export function underwrittenEbitdaCagr(revenueCagr, marginPct, { bps = MARGIN_EXPANSION_BPS, years = 5 } = {}) {
  const m0 = Number(marginPct);
  if (!Number.isFinite(m0) || m0 <= 0 || !Number.isFinite(years) || years <= 0) return revenueCagr;
  const m1 = Math.max(1, m0 + bps / 100);
  const revMultiple = (1 + revenueCagr) ** years;
  const ebitdaMultiple = revMultiple * (m1 / m0);
  return ebitdaMultiple ** (1 / years) - 1;
}

export function marginExpansionBasis(marginPct, { bps = MARGIN_EXPANSION_BPS, years = 5 } = {}) {
  const m0 = Number(marginPct);
  if (!Number.isFinite(m0) || m0 <= 0) return null;
  return `EBITDA is underwritten to grow faster than revenue: the plan carries ${bps}bps of margin expansion over ${years} years, taking the margin from ${m0.toFixed(1)}% to ${(m0 + bps / 100).toFixed(1)}%. The downside instead compresses it by ${MARGIN_COMPRESSION_BPS}bps.`;
}

// THE COST OF THE DEBT, WHICH THE MODEL DID NOT CHARGE FOR.
//
// The paper LBO repaid a fixed share of debt driven only by margin: the downside repaid
// exactly as much as the base while EBITDA fell, which requires more than 100% cash
// conversion and no interest at all. There was no rate, no tax and no capex anywhere on
// the returns page, so "what did you finance this at?" had no answer on any screen.
//
// Mid-market sponsor debt is floating: a reference rate plus a spread. Unitranche and
// broadly-syndicated spreads for mid-market LBOs have run in the 475-600bps area over the
// reference rate, so ~9.5% all-in is the working assumption. Cash taxes are the US federal
// 21% plus state, and interest is deductible, so the shield falls out of the sweep rather
// than being applied separately.
export const REFERENCE_RATE_PCT = 4.0;
export const CREDIT_SPREAD_BPS = 550;
export const COST_OF_DEBT_PCT = REFERENCE_RATE_PCT + CREDIT_SPREAD_BPS / 100;
export const CASH_TAX_RATE = 0.25;
// Capex as a share of revenue. Deliberately one broad mid-market figure rather than twenty
// invented ones, capped as a share of EBITDA so a thin-margin business is not modelled
// spending its entire cash flow on maintenance.
export const CAPEX_PCT_REVENUE = 3.5;
export const CAPEX_CAP_PCT_EBITDA = 0.5;

export const financingBasis = () => `Debt is priced at ${COST_OF_DEBT_PCT.toFixed(1)}% — a ${REFERENCE_RATE_PCT.toFixed(1)}% reference rate plus ${CREDIT_SPREAD_BPS}bps, the mid-market sponsor spread. Cash taxes are charged at ${Math.round(CASH_TAX_RATE * 100)}% on earnings after interest and depreciation, and maintenance capex at ${CAPEX_PCT_REVENUE}% of revenue. Debt is repaid out of what is left, year by year, so a weaker year repays less.`;

// PRICE THE PAPER TO THE CREDIT, NOT TO A CONSTANT.
//
// Every one of nineteen deals was financed at 9.5% with the same sentence beneath it — a
// Nordic grocer at 2.8x and a vertical SaaS asset at 5.8x priced identically. A lender
// does not do that, and a room notices by the third deal. The spread moves with the two
// things a credit committee actually prices: how much leverage is being asked for, and
// how much of the business's earnings are contracted or asset-backed.
//
// Leverage: mid-market unitranche pricing widens roughly 25bps per turn above 4.0x and
// tightens the same below it, floored and capped so the range stays inside the 475-650bps
// band the market has run in.
const SPREAD_PER_TURN_BPS = 25;
const SPREAD_PIVOT_TURNS = 4.0;
const SPREAD_MIN_BPS = 450;
const SPREAD_MAX_BPS = 675;

// Sector adjustment. Asset-backed and contracted cash flows are cheaper to finance than
// discretionary consumer or single-asset development risk. These are relative, not
// absolute: they move the spread around the mid-market average, they do not set it.
const SECTOR_SPREAD_BPS = [
  { match: /cold chain|logistics|3pl|transport|fleet/i, bps: -35, why: 'contracted volumes and a financeable fleet' },
  { match: /grocery|convenience|food retail|staples/i, bps: -30, why: 'staple demand and freehold property' },
  { match: /timber|forest|mill|land/i, bps: -40, why: 'a hard asset base behind the loan' },
  { match: /software|saas|analytics|data/i, bps: 40, why: 'recurring revenue but no asset security' },
  { match: /biotech|pharma|clinical|life science/i, bps: 70, why: 'binary clinical outcomes' },
  { match: /energy|oil|gas|drilling|mining/i, bps: 55, why: 'commodity-price exposure' },
  { match: /packaging|industrial|manufactur|precision|component/i, bps: -10, why: 'plant and equipment security' },
  { match: /healthcare|diagnostics|clinic|care/i, bps: 0, why: 'reimbursement risk offset by demand stability' },
];

export function creditSpreadFor(deal, leverageTurns) {
  const hay = `${deal?.sector || ''} ${deal?.subSector || ''} ${deal?.company || ''}`;
  const row = SECTOR_SPREAD_BPS.find((r) => r.match.test(hay)) || null;
  const turns = Number.isFinite(leverageTurns) ? leverageTurns : SPREAD_PIVOT_TURNS;
  const levAdj = Math.round((turns - SPREAD_PIVOT_TURNS) * SPREAD_PER_TURN_BPS);
  const raw = CREDIT_SPREAD_BPS + levAdj + (row?.bps || 0);
  const bps = Math.max(SPREAD_MIN_BPS, Math.min(SPREAD_MAX_BPS, raw));
  return {
    bps,
    pct: Number((REFERENCE_RATE_PCT + bps / 100).toFixed(2)),
    clamped: bps !== raw,
    leverageAdjBps: levAdj,
    sectorAdjBps: row?.bps || 0,
    sectorWhy: row?.why || null,
  };
}

export function financingBasisFor(deal, leverageTurns) {
  const s = creditSpreadFor(deal, leverageTurns);
  const lev = s.leverageAdjBps === 0
    ? `${SPREAD_PIVOT_TURNS.toFixed(1)}x is the pivot, so leverage moves the spread neither way`
    : `${s.leverageAdjBps > 0 ? 'plus' : 'less'} ${Math.abs(s.leverageAdjBps)}bps for asking ${Math.abs(leverageTurns - SPREAD_PIVOT_TURNS).toFixed(1)} turn${Math.abs(leverageTurns - SPREAD_PIVOT_TURNS) === 1 ? '' : 's'} ${leverageTurns > SPREAD_PIVOT_TURNS ? 'above' : 'below'} the ${SPREAD_PIVOT_TURNS.toFixed(1)}x pivot`;
  const sec = s.sectorAdjBps === 0
    ? ''
    : ` ${s.sectorAdjBps > 0 ? 'plus' : 'less'} ${Math.abs(s.sectorAdjBps)}bps for the sector — ${s.sectorWhy}.`;
  return `Debt is priced at ${s.pct.toFixed(2)}% — a ${REFERENCE_RATE_PCT.toFixed(1)}% reference rate plus a ${s.bps}bps spread: ${CREDIT_SPREAD_BPS}bps mid-market base, ${lev}${sec ? ',' : '.'}${sec}${s.clamped ? ' The spread is held inside the 450–675bps band the mid-market has actually traded in.' : ''} Cash taxes are charged at ${Math.round(CASH_TAX_RATE * 100)}% on earnings after interest and depreciation, and maintenance capex at ${CAPEX_PCT_REVENUE}% of revenue. Debt is repaid out of what is left, year by year, so a weaker year repays less.`;
}

// Year-by-year cash sweep. Returns the debt still outstanding at exit and what the hold
// actually cost in interest and tax — the figures a credit committee asks for first.
export function sweepDebt({ debt, ebitda0, ebitdaCagr, years, marginPct, costOfDebtPct }) {
  let bal = Math.max(0, debt);
  let interestPaid = 0;
  let taxPaid = 0;
  let capexPaid = 0;
  // The rate is now priced per deal; the constant remains the fallback so a caller that
  // has not been updated still gets the mid-market average rather than nothing.
  const rate = (Number.isFinite(costOfDebtPct) ? costOfDebtPct : COST_OF_DEBT_PCT) / 100;
  const margin = Number.isFinite(marginPct) && marginPct > 0 ? marginPct : 15;
  for (let y = 1; y <= years; y += 1) {
    const ebitda = ebitda0 * (1 + ebitdaCagr) ** y;
    const revenue = ebitda / (margin / 100);
    const capex = Math.min(ebitda * CAPEX_CAP_PCT_EBITDA, revenue * (CAPEX_PCT_REVENUE / 100));
    const interest = bal * rate;
    // Depreciation is proxied by maintenance capex, which is the standard screening
    // shortcut and keeps the tax shield honest without inventing a fixed-asset schedule.
    const taxable = Math.max(0, ebitda - capex - interest);
    const tax = taxable * CASH_TAX_RATE;
    const fcf = ebitda - interest - capex - tax;
    interestPaid += interest;
    taxPaid += tax;
    capexPaid += capex;
    bal = Math.max(0, bal - Math.max(0, fcf));
  }
  return { debtAtExit: bal, interestPaid, taxPaid, capexPaid };
}
