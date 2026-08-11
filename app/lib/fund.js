// Fund-level & portfolio-monitoring engine.
//
// Everything here is DERIVED from the owned-portfolio seed (data/portfolio.js)
// and the LPA mandate (data/mandates.js) — current EV / equity marks, gross
// MOIC & IRR, DPI / TVPI / RVPI, capital deployed vs. dry powder and portfolio
// concentration vs. the fund's hard limits. Nothing is a hard-coded mark, so
// the fund lens recomputes as the record changes.
//
// This closes the deck's post-IC gap: the pipeline stops at IC / close, and the
// three views below (portfolio monitoring · fund / LP lens · executive value)
// activate the Operating-Partner, Fund-CFO and Investor-Relations personas.

import { seedPortfolio, fundVintage } from '../data/portfolio.js';
import { fundMandate } from '../data/mandates.js';

const MONTH = 1000 * 60 * 60 * 24 * 30.44;

const fmtM = (n) => `$${Math.round(Number(n) || 0)}M`;

function round(n, dp = 0) {
  const f = 10 ** dp;
  return Math.round((Number(n) || 0) * f) / f;
}

// "$2.6B" / "$850M" → millions of USD.
function parseFundSize(s) {
  if (typeof s === 'number') return s;
  const m = String(s || '').match(/([\d.]+)\s*([bm])/i);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  return m[2].toLowerCase() === 'b' ? v * 1000 : v;
}

function holdMonths(entryDate) {
  const start = new Date(entryDate).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0.5, (Date.now() - start) / MONTH);
}

// Per-company derived view — the portfolio-monitoring row.
export function portfolioCompany(pc) {
  const entryEV = round(pc.entry.ebitda * pc.entry.entryMultiple);
  const entryEquity = round(Math.max(1, entryEV - pc.entry.netDebt));
  const currentEV = round(pc.current.ebitda * pc.current.multiple);
  const currentEquity = round(Math.max(0, currentEV - pc.current.netDebt));
  // ON WHAT BASIS IS THAT WRITTEN DOWN?
  //
  // A position was marked at 0.64x and -16.8% IRR and nothing on the page or in the
  // payload said how the mark was struck, so the first question an LP or an auditor asks
  // had no answer. The method is a market-approach multiple applied to current EBITDA
  // less net debt, which is what IPEV and ASC 820 call a Level 3 fair value; say so, and
  // say when the multiple has been moved off entry, because that is the judgement.
  const multipleMoved = round(pc.current.multiple - pc.entry.entryMultiple, 2);
  const valuationPolicy = {
    framework: 'IPEV Valuation Guidelines · ASC 820 Level 3',
    approach: 'Market approach — an EV/EBITDA multiple applied to current EBITDA, less net debt.',
    basis: [
      `Marked at ${pc.current.multiple}x current EBITDA of ${fmtM(pc.current.ebitda)}, less ${fmtM(pc.current.netDebt)} of net debt.`,
      multipleMoved === 0
        ? 'The multiple is held at entry, so the whole movement in this mark is operating performance and debt paydown.'
        : `The multiple has been moved ${multipleMoved > 0 ? 'up' : 'down'} ${Math.abs(multipleMoved)}x from the ${pc.entry.entryMultiple}x paid at entry — that part of the mark is judgement, not performance.`,
      'Unobservable inputs, so this is a Level 3 fair value. It is not a transaction price and no third party has confirmed it.',
    ].join(' '),
    multipleMoved,
  };
  const realized = round((pc.realized || []).reduce((s, r) => s + (r.proceeds || 0), 0));
  const totalValue = currentEquity + realized;
  const grossMoic = round(totalValue / entryEquity, 2);
  const months = holdMonths(pc.entry.date);
  const years = Math.max(0.25, months / 12);
  const grossIrr = grossMoic > 0 ? round((grossMoic ** (1 / years) - 1) * 100, 1) : -100;

  // Value-creation progress: blend the 100-day completion with average lever progress.
  const levers = pc.valueCreation?.levers || [];
  const leverAvg = levers.length ? levers.reduce((s, l) => s + (l.progressPct || 0), 0) / levers.length : 0;
  const vcpProgress = round(0.25 * (pc.valueCreation?.hundredDayPct || 0) + 0.75 * leverAvg);

  // VARIANCE TO PLAN, ON THE LINES THAT SHARE A UNIT.
  //
  // This averaged every KPI's percentage variance regardless of unit, so a volume KPI
  // planned at 4% and running at -6% contributed -250% and dragged the roll-up to -72.3%
  // beside an EBITDA of $34M against a $42M plan. A margin measured in points and a
  // revenue measured in millions do not average.
  const kpis = pc.kpis || [];
  const isRate = (k) => /%|margin|rate|churn|retention|utilisation|utilization/i.test(`${k.unit || ''} ${k.label || ''}`);
  const scalar = kpis.filter((k) => k.plan && !isRate(k));
  const kpiVariancePct = scalar.length
    ? round((scalar.reduce((s, k) => s + (k.actual - k.plan) / Math.abs(k.plan), 0) / scalar.length) * 100, 1)
    : 0;
  // Rate KPIs are reported in points off plan, never folded into the percentage above.
  const kpiRateVariancePts = kpis.filter((k) => k.plan && isRate(k))
    .map((k) => ({ label: k.label, pts: round(k.actual - k.plan, 1) }));

  const ebitdaGrowthPct = pc.entry.ebitda ? round(((pc.current.ebitda - pc.entry.ebitda) / pc.entry.ebitda) * 100, 1) : 0;

  return {
    id: pc.id,
    company: pc.company,
    sector: pc.sector,
    subSector: pc.subSector,
    hq: pc.hq,
    region: pc.region,
    owner: pc.owner,
    sponsorPersona: pc.sponsorPersona,
    status: pc.status,
    thesis: pc.thesis,
    entryDate: pc.entry.date,
    holdMonths: round(months),
    entryEV,
    entryEquity,
    entryMultiple: pc.entry.entryMultiple,
    entryEbitda: pc.entry.ebitda,
    currentEbitda: pc.current.ebitda,
    currentMultiple: pc.current.multiple,
    currentEV,
    currentEquity,
    valuationPolicy,
    ebitdaGrowthPct,
    realized,
    realizations: pc.realized || [],
    grossMoic,
    grossIrr,
    vcpProgress,
    hundredDayPct: pc.valueCreation?.hundredDayPct || 0,
    levers,
    kpis,
    kpiVariancePct,
    addOns: pc.addOns || { completed: 0, pipeline: 0 },
    currency: 'USD'
  };
}

// ---- View 1 · Portfolio monitoring -----------------------------------------
export function portfolioMonitoring() {
  const companies = seedPortfolio.map(portfolioCompany);
  const byStatus = companies.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});
  return {
    asOf: new Date().toISOString(),
    count: companies.length,
    statusCounts: {
      onTrack: byStatus['on-track'] || 0,
      watch: byStatus.watch || 0,
      underperform: byStatus.underperform || 0
    },
    addOnsClosed: companies.reduce((s, c) => s + (c.addOns.completed || 0), 0),
    addOnsPipeline: companies.reduce((s, c) => s + (c.addOns.pipeline || 0), 0),
    avgVcpProgress: companies.length ? round(companies.reduce((s, c) => s + c.vcpProgress, 0) / companies.length) : 0,
    companies
  };
}

function concentration(companies, key, invested, fundSize, limitPct) {
  const groups = {};
  for (const c of companies) {
    const g = c[key] || 'Other';
    groups[g] = (groups[g] || 0) + c.entryEquity;
  }
  return Object.entries(groups)
    .map(([name, equity]) => {
      const pctOfFund = round((equity / fundSize) * 100, 1);
      const pctOfInvested = round((equity / invested) * 100, 1);
      // WHICH DENOMINATOR THE CAP IS TESTED AGAINST.
      //
      // The row carried both percentages and the methodology said "sector exposure / fund
      // value" without saying what fund value meant, so one position produced 11.2%, 24.6%
      // or 15.8% depending on which number a reader picked. An LPA concentration cap is
      // written against COMMITMENTS, so that is the one the status is decided on and the
      // one named on the row; the share of capital deployed to date is useful context and
      // is labelled as such rather than left to be mistaken for the test.
      const status = limitPct == null
        ? 'ok'
        : pctOfFund >= limitPct ? 'breach' : pctOfFund >= limitPct * 0.8 ? 'near' : 'ok';
      return {
        name,
        equity: round(equity),
        pctOfFund,
        pctOfInvested,
        limitPct: limitPct ?? null,
        testedOn: limitPct == null ? null : 'committed capital',
        basis: limitPct == null
          ? 'No LPA cap applies to this breakdown, so no limit is shown.'
          : `${pctOfFund}% of the fund's ${fmtM(fundSize)} of commitments against a ${limitPct}% LPA cap. ${pctOfInvested}% of capital deployed so far, which is not the test.`,
        status,
      };
    })
    .sort((a, b) => b.equity - a.equity);
}

// ---- View 2 · Fund / LP lens -----------------------------------------------
export function fundOverview() {
  const companies = seedPortfolio.map(portfolioCompany);
  const fundSize = parseFundSize(fundMandate.fundSize);

  const invested = round(companies.reduce((s, c) => s + c.entryEquity, 0));
  const unrealized = round(companies.reduce((s, c) => s + c.currentEquity, 0));
  const realized = round(companies.reduce((s, c) => s + c.realized, 0));
  const totalValue = round(unrealized + realized);

  // TVPI AND GROSS MOIC ARE NOT THE SAME MEASURE.
  //
  // `grossMoic = tvpi` printed one number twice under an ILPA banner beside a NET IRR.
  // ILPA defines the multiples on PAID-IN capital — what LPs have actually funded, which
  // includes management fees and partnership expenses drawn alongside the investments —
  // while gross MOIC is struck on invested capital only. They differ by the fee drag,
  // which is the whole reason an LP looks at both.
  // Fees are drawn on committed capital from first close, so the drag is a function of the
  // fund's age rather than of what has been deployed. This is what puts an early-vintage
  // fund below its gross multiple — the J-curve, which the product was not showing at all.
  const fundAgeYears = Math.max(0, (Date.now() - new Date(fundVintage.firstClose).getTime()) / (365.25 * 24 * 3600 * 1000));
  const feesDrawn = round(fundSize * ((fundVintage.managementFeePct ?? 2) / 100) * fundAgeYears);
  const paidIn = round(invested + feesDrawn);
  // Printed, because a reader cannot bridge gross MOIC to TVPI without it.
  const capitalDetail = {
    committed: fundSize,
    invested,
    feesDrawn,
    paidIn,
    basis: `Paid-in capital is the ${fmtM(invested)} invested plus ${fmtM(feesDrawn)} of management fees drawn since first close. TVPI, DPI and RVPI are struck on it; gross MOIC is struck on invested capital alone, which is why the two multiples differ.`,
  };
  // All three ILPA multiples share one denominator. DPI and RVPI were struck on invested
  // capital while the banner called them ILPA measures, so they did not sum to TVPI.
  const dpi = round(realized / paidIn, 2);
  const rvpi = round(unrealized / paidIn, 2);
  const tvpi = round(totalValue / paidIn, 2);
  const grossMoic = round(totalValue / invested, 2);

  // Capital-weighted gross IRR across the portfolio.
  const grossIrr = invested
    ? round(companies.reduce((s, c) => s + c.grossIrr * c.entryEquity, 0) / invested, 1)
    : 0;
  // Net-of-fees rule of thumb: haircut for the 2% fee drag and 20% carry above the hurdle.
  const netMoic = round(1 + (grossMoic - 1) * (1 - fundVintage.carryPct / 100) - 0.05, 2);
  // NET MOIC AND TVPI ARE 0.01 APART AND MEAN DIFFERENT THINGS.
  //
  // The paid-in bridge explained gross MOIC against TVPI and left these two sitting side
  // by side with nothing between them. They are close by coincidence, not by construction,
  // and an LP who assumes they are the same figure rounded differently is wrong.
  const netMoicBasis = `Net MOIC of ${netMoic}x is the ${grossMoic}x gross return after ${fundVintage.carryPct}% carried interest and an allowance for fund expenses, struck on invested capital. TVPI of ${tvpi}x is gross of carry and struck on paid-in capital, which includes management fees drawn. They sit close together on this fund by coincidence; they answer different questions and neither is a rounding of the other.`;
  const netIrr = round(grossIrr * 0.75, 1);

  const reserves = round(fundSize * (fundVintage.reservePct / 100));
  const dryPowder = round(Math.max(0, fundSize - invested - reserves));
  const deployedPct = round((invested / fundSize) * 100, 1);

  const bySector = concentration(companies, 'sector', invested, fundSize, fundMandate.maxSectorConcentration);
  const byRegion = concentration(companies, 'region', invested, fundSize, null);

  // Largest single position vs. the per-deal concentration cap.
  const largest = companies.reduce((max, c) => (c.entryEquity > max.entryEquity ? c : max), companies[0] || { entryEquity: 0 });
  const largestPctOfFund = round((largest.entryEquity / fundSize) * 100, 1);

  return {
    asOf: new Date().toISOString(),
    fund: {
      name: fundMandate.name,
      strategy: fundMandate.strategy,
      vintageYear: fundVintage.vintageYear,
      investmentPeriod: fundMandate.investmentPeriod,
      term: fundMandate.term,
      fundSize,
      fundSizeLabel: fundMandate.fundSize
    },
    capital: {
      committed: fundSize,
      invested,
      reserves,
      dryPowder,
      // Committed $2.6B less invested $1.19B is $1.41B, and the tile said $1.10B, so
      // anyone who did the subtraction -- which is the first thing an LP does -- found
      // $310M unaccounted for. The gap is the fee and expense reserve. Say so on the
      // tile rather than leaving it to be discovered.
      dryPowderNote: `net of a $${round(reserves / 1000, 2)}B management-fee and expense reserve.`,
      deployedPct,
      portfolioCompanies: companies.length,
      // Paid-in is what LPs have actually funded, and without it on screen a reader
      // cannot bridge gross MOIC to TVPI.
      feesDrawn: capitalDetail.feesDrawn,
      paidIn: capitalDetail.paidIn,
      paidInBasis: capitalDetail.basis
    },
    performance: {
      grossMoic,
      netMoic,
      netMoicBasis,
      grossIrrPct: grossIrr,
      netIrrPct: netIrr,
      dpi,
      rvpi,
      tvpi,
      realized,
      unrealized,
      totalValue
    },
    concentration: {
      maxSectorPct: fundMandate.maxSectorConcentration,
      maxDealPct: fundMandate.maxEquityPerDeal,
      bySector,
      byRegion,
      largestPosition: { company: largest.company, pctOfFund: largestPctOfFund, limitPct: fundMandate.maxEquityPerDeal, status: largestPctOfFund >= fundMandate.maxEquityPerDeal ? 'breach' : largestPctOfFund >= fundMandate.maxEquityPerDeal * 0.8 ? 'near' : 'ok' }
    },
    lpTerms: {
      preferredReturnPct: fundVintage.preferredReturnPct,
      carryPct: fundVintage.carryPct,
      managementFeePct: fundVintage.managementFeePct,
      esgPolicy: fundMandate.esgPolicy
    },
    ilpaSummary: [
      `Fund: ${fundMandate.name} · vintage ${fundVintage.vintageYear}`,
      `Committed capital: $${round(fundSize / 1000, 2)}B · ${deployedPct}% invested · $${round(dryPowder / 1000, 2)}B dry powder (net of a $${round(reserves / 1000, 2)}B fee and expense reserve)`,
      `Net asset value (unrealised): $${round(unrealized / 1000, 2)}B across ${companies.length} portfolio companies`,
      `TVPI ${tvpi}x · DPI ${dpi}x · RVPI ${rvpi}x · net IRR ${netIrr}%`,
      `Reporting: ${fundMandate.esgPolicy}`
    ]
  };
}

// ---- View 3 · Executive value / ROI ----------------------------------------
// Reframes the pipeline analytics (portfolioStats) into the deck's
// time-to-IC-acceleration value story, plus a couple of fund headlines.
export function executiveValue(pipelineStats = {}) {
  const overview = fundOverview();
  const monitor = portfolioMonitoring();
  return {
    asOf: new Date().toISOString(),
    pipeline: {
      dealsProcessed: pipelineStats.deals ?? 0,
      inDiligence: pipelineStats.inDiligence ?? 0,
      analystHoursSaved: pipelineStats.totalHoursSaved ?? 0,
      fteWeeksSaved: pipelineStats.fteWeeks ?? 0,
      cycleReductionPct: pipelineStats.cycleReductionPct ?? 0,
      avgDaysSaved: pipelineStats.avgDaysSaved ?? 0,
      baselineDays: pipelineStats.baselineDays ?? 45,
      avgIcReadiness: pipelineStats.avgReadiness ?? 0,
      // Carried through so the tile can show its own denominator. See portfolioStats.
      preIcDeals: pipelineStats.preIcDeals ?? 0,
      pastCommitteeDeals: pipelineStats.pastCommitteeDeals ?? 0
    },
    portfolio: {
      companies: overview.capital.portfolioCompanies,
      capitalDeployed: overview.capital.invested,
      deployedPct: overview.capital.deployedPct,
      grossMoic: overview.performance.grossMoic,
      grossIrrPct: overview.performance.grossIrrPct,
      tvpi: overview.performance.tvpi,
      onTrack: monitor.statusCounts.onTrack,
      watch: monitor.statusCounts.watch,
      underperform: monitor.statusCounts.underperform,
      addOnsClosed: monitor.addOnsClosed
    }
  };
}
