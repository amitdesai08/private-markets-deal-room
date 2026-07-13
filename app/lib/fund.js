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

  // KPI variance to plan (avg actual/plan across KPIs, signed).
  const kpis = pc.kpis || [];
  const kpiVariancePct = kpis.length
    ? round((kpis.reduce((s, k) => s + (k.plan ? (k.actual - k.plan) / Math.abs(k.plan) : 0), 0) / kpis.length) * 100, 1)
    : 0;

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
      const status = limitPct == null
        ? 'ok'
        : pctOfFund >= limitPct ? 'breach' : pctOfFund >= limitPct * 0.8 ? 'near' : 'ok';
      return { name, equity: round(equity), pctOfFund, pctOfInvested, limitPct: limitPct ?? null, status };
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

  const dpi = round(realized / invested, 2);
  const rvpi = round(unrealized / invested, 2);
  const tvpi = round(totalValue / invested, 2);
  const grossMoic = tvpi;

  // Capital-weighted gross IRR across the portfolio.
  const grossIrr = invested
    ? round(companies.reduce((s, c) => s + c.grossIrr * c.entryEquity, 0) / invested, 1)
    : 0;
  // Net-of-fees rule of thumb: haircut for the 2% fee drag and 20% carry above the hurdle.
  const netMoic = round(1 + (grossMoic - 1) * (1 - fundVintage.carryPct / 100) - 0.05, 2);
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
      deployedPct,
      portfolioCompanies: companies.length
    },
    performance: {
      grossMoic,
      netMoic,
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
      `Committed capital: $${round(fundSize / 1000, 2)}B · ${deployedPct}% invested · $${round(dryPowder / 1000, 2)}B dry powder`,
      `Net asset value (unrealized): $${round(unrealized / 1000, 2)}B across ${companies.length} portfolio companies`,
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
      avgIcReadiness: pipelineStats.avgReadiness ?? 0
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
