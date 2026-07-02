// Stage-1 origination COHORT — the candidate population that flows through the
// funnel (O2 Auto Screen → O3 Triage → O4 Screening Gate). This mirrors how PE
// firms actually run the top of funnel: a list of candidates is filtered at each
// stage (advance / pass / park), not a single deal walked end-to-end. Only at the
// O4 gate does a PURSUEd candidate flip into a single-deal workflow (a screened
// deal → Launch → diligence).
//
// A candidate carries:
//   stage        — the furthest step it reached: 'O2' | 'O3' | 'O4' | 'pursued'
//   disposition  — 'active' (in play at `stage`) | 'passed' | 'parked' | 'pursued'
//   passReason / passStage — why & where it was killed/parked (null while active)
//   financials   — so lib/scoring.js can gate + score it (same engine as O1)

function hoursAgo(h) {
  const t = new Date();
  t.setHours(t.getHours() - h);
  return t.toISOString();
}
function daysAgo(d) {
  return hoursAgo(d * 24);
}

// Pass-reason codes by stage (from PE practice — DealCloud/Affinity pass codes).
export const PASS_REASONS = {
  O2: [
    { id: 'size-floor', label: 'Below size floor' },
    { id: 'business-model', label: 'Business-model viability' },
    { id: 'revenue-quality', label: 'Revenue quality / concentration' },
    { id: 'sector-risk', label: 'Sector-specific risk' },
    { id: 'exit-prospects', label: 'Weak exit prospects' },
    { id: 'esg-exclusion', label: 'ESG / mandate exclusion' },
    { id: 'capital-structure', label: 'Capital structure / litigation' }
  ],
  O3: [
    { id: 'valuation-gap', label: 'Valuation expectations gap' },
    { id: 'competitive', label: 'Competitive dynamics' },
    { id: 'weak-moat', label: 'Weak moat / market position' },
    { id: 'no-angle', label: 'No value-creation angle' },
    { id: 'management', label: 'Management quality / key-person' },
    { id: 'no-portfolio-fit', label: 'No portfolio fit / synergy' },
    { id: 'team-capacity', label: 'Deal-team capacity' },
    { id: 'conviction', label: 'Thesis conviction' }
  ],
  O4: [
    { id: 'no-champion', label: 'No partner champion' },
    { id: 'competitive-process', label: 'Competitive process risk' },
    { id: 'resource-constraint', label: 'Resource constraint' },
    { id: 'fund-timing', label: 'Fund lifecycle timing' },
    { id: 'macro-timing', label: 'Macro / cycle timing' },
    { id: 'valuation-gap', label: 'Valuation gap not closeable' },
    { id: 'better-uses', label: 'Better uses of capital' },
    { id: 'diligence-spend', label: 'Diligence-spend threshold' }
  ]
};

export const PARK_REASONS = [
  { id: 'not-ready', label: 'Not ready to transact' },
  { id: 'monitor', label: 'Monitor 12–24 months' },
  { id: 're-engage', label: 'Re-engage on trigger event' }
];

export const reasonLabel = (stage, id) => {
  const pool = [...(PASS_REASONS[stage] || []), ...PARK_REASONS,
    ...PASS_REASONS.O2, ...PASS_REASONS.O3, ...PASS_REASONS.O4];
  return (pool.find((r) => r.id === id) || {}).label || id;
};

// deskId links a candidate back to a rich News-&-filings desk company (news.js)
// where one exists, so the O1 sub-explorers stay wired. Net-new candidates have
// deskId: null.
export const seedCandidates = [
  // ── Pursued (2) — these generate the screened deals at store init ──────────
  {
    id: 'cand-frostbite', deskId: 'frostbite', company: 'Frostbite Foods',
    sector: 'Consumer & Retail', subSector: 'Convenience / Private-label', region: 'DACH', country: 'Germany', hq: 'Munich, Germany',
    dealSize: 280, ownership: 'founder', revenue: 420, ebitda: 34, ebitdaMargin: 8.1, growth: 4,
    keywords: ['convenience', 'private-label', 'bolt-on', 'loyalty'], sources: ['cxo', 'news'],
    stage: 'pursued', disposition: 'pursued', passReason: null, passStage: null, sourcedAt: daysAgo(9), sponsorPersona: 'retail-md'
  },
  {
    id: 'cand-meridian', deskId: 'meridian', company: 'Meridian Components',
    sector: 'Industrials', subSector: 'Precision Components', region: 'DACH', country: 'Germany', hq: 'Stuttgart, Germany',
    dealSize: 190, ownership: 'founder', revenue: 210, ebitda: 25, ebitdaMargin: 11.9, growth: 6,
    keywords: ['reshoring', 'precision', 'succession', 'bolt-on'], sources: ['cxo', 'news'],
    stage: 'pursued', disposition: 'pursued', passReason: null, passStage: null, sourcedAt: daysAgo(7), sponsorPersona: 'supply-md'
  },

  // ── Active @ O4 (2) — at the Screening Gate ───────────────────────────────
  {
    id: 'cand-brauhaus', deskId: 'brauhaus', company: 'Brauhaus Group',
    sector: 'Consumer & Retail', subSector: 'Convenience', region: 'DACH', country: 'Germany', hq: 'Cologne, Germany',
    dealSize: 320, ownership: 'family', revenue: 380, ebitda: 42, ebitdaMargin: 11, growth: 1,
    keywords: ['convenience', 'private-label', 'loyalty', 'bolt-on'], sources: ['news'],
    stage: 'O4', disposition: 'active', passReason: null, passStage: null, sourcedAt: daysAgo(11)
  },
  {
    id: 'cand-nordfiber', deskId: 'nordfiber', company: 'NordFiber',
    sector: 'Industrials', subSector: 'Precision Components', region: 'Nordics', country: 'Sweden', hq: 'Gothenburg, Sweden',
    dealSize: 210, ownership: 'sponsor', revenue: 190, ebitda: 24, ebitdaMargin: 12.6, growth: 8,
    keywords: ['reshoring', 'bolt-on', 'succession', 'precision'], sources: ['news'],
    stage: 'O4', disposition: 'active', passReason: null, passStage: null, sourcedAt: daysAgo(10)
  },

  // ── Active @ O3 (3) — awaiting triage ─────────────────────────────────────
  {
    id: 'cand-helvetia', deskId: null, company: 'Helvetia Health Foods',
    sector: 'Consumer & Retail', subSector: 'Health & wellness food', region: 'DACH', country: 'Switzerland', hq: 'Zürich, Switzerland',
    dealSize: 260, ownership: 'founder', revenue: 300, ebitda: 33, ebitdaMargin: 11, growth: 9,
    keywords: ['private-label', 'wellness', 'bolt-on'], sources: ['news'],
    stage: 'O3', disposition: 'active', passReason: null, passStage: null, sourcedAt: daysAgo(6)
  },
  {
    id: 'cand-lindqvist', deskId: null, company: 'Lindqvist Automation',
    sector: 'Industrials', subSector: 'Factory automation', region: 'Nordics', country: 'Sweden', hq: 'Malmö, Sweden',
    dealSize: 175, ownership: 'founder', revenue: 160, ebitda: 22, ebitdaMargin: 13.8, growth: 12,
    keywords: ['automation', 'reshoring', 'succession'], sources: ['news'],
    stage: 'O3', disposition: 'active', passReason: null, passStage: null, sourcedAt: daysAgo(6)
  },
  {
    id: 'cand-aperture', deskId: null, company: 'Aperture Diagnostics',
    sector: 'Healthcare', subSector: 'Diagnostics services', region: 'UK', country: 'United Kingdom', hq: 'Manchester, UK',
    dealSize: 340, ownership: 'sponsor', revenue: 250, ebitda: 40, ebitdaMargin: 16, growth: 10,
    keywords: ['diagnostics', 'roll-up', 'recurring'], sources: ['news'],
    stage: 'O3', disposition: 'active', passReason: null, passStage: null, sourcedAt: daysAgo(5)
  },

  // ── Active @ O2 (4) — awaiting the hard-knockout screen ───────────────────
  {
    id: 'cand-bergstrom', deskId: null, company: 'Bergström Logistics',
    sector: 'Business Services', subSector: 'Contract logistics', region: 'Nordics', country: 'Norway', hq: 'Oslo, Norway',
    dealSize: 220, ownership: 'founder', revenue: 240, ebitda: 26, ebitdaMargin: 10.8, growth: 7,
    keywords: ['logistics', 'outsourcing', 'bolt-on'], sources: ['news'],
    stage: 'O2', disposition: 'active', passReason: null, passStage: null, sourcedAt: daysAgo(3)
  },
  {
    id: 'cand-clairemont', deskId: null, company: 'Clairemont Software',
    sector: 'Software', subSector: 'Vertical SaaS', region: 'France', country: 'France', hq: 'Lyon, France',
    dealSize: 310, ownership: 'founder', revenue: 72, ebitda: 15, ebitdaMargin: 20.8, growth: 28,
    keywords: ['vertical SaaS', 'recurring', 'proprietary data'], sources: ['cxo', 'news'],
    stage: 'O2', disposition: 'active', passReason: null, passStage: null, sourcedAt: daysAgo(2)
  },
  {
    id: 'cand-vandenberg', deskId: null, company: 'Vandenberg Packaging',
    sector: 'Industrials', subSector: 'Sustainable packaging', region: 'Benelux', country: 'Netherlands', hq: 'Eindhoven, Netherlands',
    dealSize: 290, ownership: 'family', revenue: 340, ebitda: 38, ebitdaMargin: 11.2, growth: 5,
    keywords: ['packaging', 'sustainability', 'bolt-on'], sources: ['news'],
    stage: 'O2', disposition: 'active', passReason: null, passStage: null, sourcedAt: daysAgo(2)
  },
  {
    id: 'cand-aurora', deskId: null, company: 'Aurora Retail Group',
    sector: 'Consumer & Retail', subSector: 'Specialty retail', region: 'UK', country: 'United Kingdom', hq: 'Leeds, UK',
    dealSize: 180, ownership: 'founder', revenue: 260, ebitda: 21, ebitdaMargin: 8.1, growth: 3,
    keywords: ['specialty', 'omnichannel', 'loyalty'], sources: ['cxo'],
    stage: 'O2', disposition: 'active', passReason: null, passStage: null, sourcedAt: daysAgo(1)
  },

  // ── Passed (3) — killed with a reason, at the stage reached ───────────────
  {
    id: 'cand-petra', deskId: null, company: 'Petra Home Retail',
    sector: 'Consumer & Retail', subSector: 'Home & furnishings', region: 'UK', country: 'United Kingdom', hq: 'Birmingham, UK',
    dealSize: 160, ownership: 'public', revenue: 300, ebitda: 15, ebitdaMargin: 5, growth: -4,
    keywords: ['home', 'DTC', 'distress'], sources: ['news'],
    stage: 'O2', disposition: 'passed', passReason: 'revenue-quality', passStage: 'O2', sourcedAt: daysAgo(8),
    passNote: 'Single-customer concentration >45% and declining like-for-like sales.'
  },
  {
    id: 'cand-halden', deskId: null, company: 'Halden Steel',
    sector: 'Industrials', subSector: 'Specialty steel', region: 'Nordics', country: 'Norway', hq: 'Halden, Norway',
    dealSize: 520, ownership: 'family', revenue: 610, ebitda: 68, ebitdaMargin: 11.1, growth: 2,
    keywords: ['steel', 'commodity', 'cyclical'], sources: ['news'],
    stage: 'O3', disposition: 'passed', passReason: 'valuation-gap', passStage: 'O3', sourcedAt: daysAgo(12),
    passNote: 'Family pricing implies ~11x on a cyclical asset; math does not work.'
  },
  {
    id: 'cand-blau', deskId: null, company: 'Blau Software',
    sector: 'Software', subSector: 'Horizontal SaaS', region: 'DACH', country: 'Germany', hq: 'Berlin, Germany',
    dealSize: 410, ownership: 'sponsor', revenue: 95, ebitda: 12, ebitdaMargin: 12.6, growth: 22,
    keywords: ['SaaS', 'crowded', 'GTM'], sources: ['news'],
    stage: 'O4', disposition: 'passed', passReason: 'no-champion', passStage: 'O4', sourcedAt: daysAgo(14),
    passNote: 'No partner conviction on the GTM thesis in a crowded category.'
  },

  // ── Parked (2) — watchlist / revisit ──────────────────────────────────────
  {
    id: 'cand-nordwind', deskId: null, company: 'Nordwind Renewables',
    sector: 'Business Services', subSector: 'Energy services', region: 'Nordics', country: 'Denmark', hq: 'Aarhus, Denmark',
    dealSize: 230, ownership: 'founder', revenue: 200, ebitda: 24, ebitdaMargin: 12, growth: 14,
    keywords: ['energy services', 'recurring', 'transition'], sources: ['news'],
    stage: 'O3', disposition: 'parked', passReason: 'not-ready', passStage: 'O3', sourcedAt: daysAgo(9),
    passNote: 'Founder not ready to transact for ~12 months; revisit post-FY.'
  },
  {
    id: 'cand-alpen', deskId: null, company: 'Alpen Medtech',
    sector: 'Healthcare', subSector: 'Medical devices', region: 'DACH', country: 'Austria', hq: 'Graz, Austria',
    dealSize: 380, ownership: 'family', revenue: 280, ebitda: 45, ebitdaMargin: 16.1, growth: 11,
    keywords: ['medtech', 'devices', 'regulatory'], sources: ['news'],
    stage: 'O2', disposition: 'parked', passReason: 'monitor', passStage: 'O2', sourcedAt: daysAgo(4),
    passNote: 'CE-mark transition in progress; monitor 12–24 months.'
  }
];

// Stage ordering helpers for funnel "reached" math.
export const STAGE_ORDER = ['O2', 'O3', 'O4', 'pursued'];
export const stageIndex = (s) => {
  const i = STAGE_ORDER.indexOf(s);
  return i < 0 ? 0 : i;
};
