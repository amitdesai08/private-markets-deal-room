// Fund/portfolio METRIC DICTIONARY + lineage stamp (advisor SC-4).
//
// Canonical, single-source definitions for every KPI the Fund & Portfolio views and
// the Power BI report present, so the same number means the same thing across the
// in-app UI, exports, and reporting. Each metric carries its formula, plain-language
// definition, unit, and source-of-record; the methodology endpoint and every fund
// response stamp an `asOf` timestamp + a link back here so figures are lineage-traceable.

// Source of record for all fund figures: the governed deal record (positions, entry/
// exit marks, cash flows) plus the fund configuration (committed capital, LPA limits).
export const SOURCE_OF_RECORD = 'Governed deal record (Cosmos) + fund configuration';
export const REFRESH_CADENCE = 'Recomputed live from the governed record on every read (write-through); no cached rollups.';

export const FUND_METRICS = [
  { id: 'tvpi', label: 'TVPI', category: 'fund', unit: 'x',
    formula: '(Realized value + Unrealized NAV) / Paid-in capital',
    definition: 'Total Value to Paid-In — every dollar returned or still held per dollar drawn.' },
  { id: 'dpi', label: 'DPI', category: 'fund', unit: 'x',
    formula: 'Cumulative distributions / Paid-in capital',
    definition: 'Distributions to Paid-In — realized cash returned to LPs per dollar drawn.' },
  { id: 'rvpi', label: 'RVPI', category: 'fund', unit: 'x',
    formula: 'Unrealized NAV / Paid-in capital',
    definition: 'Residual Value to Paid-In — value still held in the portfolio per dollar drawn.' },
  { id: 'grossMoic', label: 'Gross MOIC', category: 'fund', unit: 'x',
    formula: 'Total gross value / Invested capital (before fees & carry)',
    definition: 'Multiple on Invested Capital at the deal level, before fund fees and carried interest.' },
  { id: 'netMoic', label: 'Net MOIC', category: 'fund', unit: 'x',
    formula: 'Total value to LPs / Paid-in capital (after fees & carry)',
    definition: 'Multiple to LPs, net of management fees and carried interest.' },
  { id: 'grossIrr', label: 'Gross IRR', category: 'fund', unit: '%',
    formula: 'Annualized money-weighted return of deal-level cash flows (pre-fee)',
    definition: 'Internal rate of return on gross, deal-level cash flows and marks.' },
  { id: 'netIrr', label: 'Net IRR', category: 'fund', unit: '%',
    formula: 'Annualized money-weighted return of LP cash flows (post-fee/carry)',
    definition: 'Internal rate of return experienced by LPs after fees and carry.' },
  { id: 'deployedPct', label: 'Capital deployed', category: 'fund', unit: '%',
    formula: 'Invested capital / Committed capital',
    definition: 'Share of the fund’s commitments put to work.' },
  { id: 'dryPowder', label: 'Dry powder', category: 'fund', unit: '$',
    formula: 'Committed capital − Invested capital − Reserved',
    definition: 'Uncalled commitments still available to invest.' },
  { id: 'sectorConcentration', label: 'Sector concentration', category: 'concentration', unit: '%',
    formula: 'Max(sector exposure) / Fund value, compared to the LPA sector cap',
    definition: 'Largest single-sector exposure vs the mandate’s hard cap (compliance-by-design).' },
  { id: 'positionConcentration', label: 'Single-position concentration', category: 'concentration', unit: '%',
    formula: 'Max(single-position equity) / Fund value, compared to the LPA per-deal cap',
    definition: 'Largest single position vs the mandate’s per-deal cap.' },
];

// The lineage stamp attached to every fund/portfolio response so a reader always knows
// as-of when it was computed, from what source, and where the formulas live.
export function fundMetaStamp() {
  return {
    asOf: new Date().toISOString(),
    sourceOfRecord: SOURCE_OF_RECORD,
    refreshCadence: REFRESH_CADENCE,
    methodology: '/api/fund/methodology',
  };
}

// Attach the lineage stamp to a payload without disturbing its shape.
export function withFundMeta(payload) {
  return { ...payload, _meta: fundMetaStamp() };
}

export function fundMethodology() {
  return {
    asOf: new Date().toISOString(),
    sourceOfRecord: SOURCE_OF_RECORD,
    refreshCadence: REFRESH_CADENCE,
    note: 'These are the canonical definitions used identically by the in-app Fund & Portfolio views, the exported pack, and the Power BI report.',
    metrics: FUND_METRICS,
  };
}
