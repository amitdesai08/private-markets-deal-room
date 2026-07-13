// Owned portfolio — the companies Fund IV has ALREADY acquired and is now
// holding. The seedDeals estate (data/deals.js) is the *pipeline* (sourcing →
// screening → diligence → IC); this file is the *post-IC* estate the Operating
// Partner, Fund CFO and Investor Relations personas monitor.
//
// Numbers are raw inputs (entry + current EBITDA / multiple / net debt). The
// fund engine (lib/fund.js) DERIVES current EV, current equity value, gross
// MOIC, hold period, DPI / TVPI / RVPI and portfolio concentration from these —
// nothing is a hard-coded mark, so every figure is defensible and recomputes as
// the record changes.

// Fund-level facts not already on the LPA mandate (data/mandates.js fundMandate).
export const fundVintage = {
  vintageYear: 2024,
  firstClose: '2024-02-15',
  finalClose: '2024-06-30',
  // Approximate share of committed capital reserved for fees, expenses and
  // follow-on / add-on reserves (i.e. not available for new platform equity).
  reservePct: 12,
  // Preferred return / hurdle and carry — standard mid-market economics.
  preferredReturnPct: 8,
  carryPct: 20,
  managementFeePct: 2
};

// vc lever helper — target vs realised progress on the value-creation plan.
const lever = (name, owner, target, progressPct) => ({ name, owner, target, progressPct });
// kpi helper — plan vs actual, so the monitor shows variance to underwriting.
const kpi = (label, plan, actual, unit) => ({ label, plan, actual, unit });

export const seedPortfolio = [
  {
    id: 'summit-provisions',
    company: 'Summit Provisions Co.',
    sector: 'Consumer & Retail',
    subSector: 'Specialty grocery',
    hq: 'Denver, CO',
    region: 'West / California',
    owner: 'operating-partner',
    sponsorPersona: 'partner',
    status: 'on-track',
    thesis: 'Buy-and-build of a Mountain-West specialty grocer; own-brand penetration and loyalty-data monetization close a margin gap vs. national peers.',
    entry: { date: '2024-05-20', ebitda: 65, entryMultiple: 8.0, netDebt: 290 },
    current: { ebitda: 82, multiple: 8.5, netDebt: 230 },
    realized: [{ date: '2025-09-10', type: 'Dividend recap', proceeds: 40 }],
    valueCreation: {
      hundredDayPct: 100,
      levers: [
        lever('Own-brand penetration 21% → 30%', 'operating-partner', '30% private-label mix', 78),
        lever('AI assortment & pricing rollout', 'ai-md', 'All 140 stores live', 62),
        lever('3 bolt-on acquisitions', 'partner', '3 add-ons closed', 100)
      ]
    },
    kpis: [
      kpi('Revenue', 940, 1010, '$M'),
      kpi('EBITDA', 78, 82, '$M'),
      kpi('EBITDA margin', 8.3, 8.1, '%'),
      kpi('Private-label mix', 27, 26, '%')
    ],
    addOns: { completed: 3, pipeline: 2 }
  },
  {
    id: 'cascade-precision',
    company: 'Cascade Precision Group',
    sector: 'Industrials',
    subSector: 'Precision components',
    hq: 'Cleveland, OH',
    region: 'Midwest',
    owner: 'operating-partner',
    sponsorPersona: 'supply-md',
    status: 'on-track',
    thesis: 'Reshoring-led consolidation of founder-owned precision machining suppliers into a scaled, qualified vendor for aerospace and medical OEMs.',
    entry: { date: '2024-08-12', ebitda: 45, entryMultiple: 7.5, netDebt: 190 },
    current: { ebitda: 54, multiple: 8.0, netDebt: 150 },
    realized: [],
    valueCreation: {
      hundredDayPct: 100,
      levers: [
        lever('Procurement & footprint optimization', 'supply-md', '250 bps gross-margin lift', 71),
        lever('Commercial excellence / cross-sell', 'retail-md', '+$18M cross-sell ARR', 55),
        lever('2 bolt-on acquisitions', 'partner', '2 add-ons closed', 100)
      ]
    },
    kpis: [
      kpi('Revenue', 300, 322, '$M'),
      kpi('EBITDA', 50, 54, '$M'),
      kpi('EBITDA margin', 16.7, 16.8, '%'),
      kpi('Order book YoY', 15, 22, '%')
    ],
    addOns: { completed: 2, pipeline: 3 }
  },
  {
    id: 'vertex-data',
    company: 'Vertex Data Systems',
    sector: 'Software',
    subSector: 'Vertical SaaS / Data',
    hq: 'Austin, TX',
    region: 'Texas',
    owner: 'operating-partner',
    sponsorPersona: 'ai-md',
    status: 'on-track',
    thesis: 'Vertical-SaaS platform for logistics operators; proprietary labelled-data moat anchors an AI product roadmap and a durable land-and-expand motion.',
    entry: { date: '2024-06-28', ebitda: 40, entryMultiple: 12.0, netDebt: 220 },
    current: { ebitda: 58, multiple: 12.0, netDebt: 186 },
    realized: [{ date: '2025-11-01', type: 'Dividend recap', proceeds: 30 }],
    valueCreation: {
      hundredDayPct: 100,
      levers: [
        lever('AI product line to 25% of ARR', 'ai-md', '25% AI-attached ARR', 64),
        lever('Net revenue retention 118% → 125%', 'retail-md', '125% NRR', 48),
        lever('Enterprise go-to-market build', 'partner', '20 enterprise logos', 70)
      ]
    },
    kpis: [
      kpi('ARR', 72, 79, '$M'),
      kpi('EBITDA', 52, 58, '$M'),
      kpi('Net revenue retention', 122, 121, '%'),
      kpi('AI-attached ARR', 20, 18, '%')
    ],
    addOns: { completed: 1, pipeline: 2 }
  },
  {
    id: 'meridian-health',
    company: 'Meridian Health Partners',
    sector: 'Healthcare',
    subSector: 'Multi-site specialty care',
    hq: 'Charlotte, NC',
    region: 'Southeast',
    owner: 'operating-partner',
    sponsorPersona: 'partner',
    status: 'watch',
    thesis: 'De-novo and acquisition-led roll-up of specialty outpatient clinics; payer-mix optimization and centralized RCM drive same-clinic margin expansion.',
    entry: { date: '2025-02-10', ebitda: 68, entryMultiple: 9.0, netDebt: 320 },
    current: { ebitda: 74, multiple: 9.0, netDebt: 300 },
    realized: [],
    valueCreation: {
      hundredDayPct: 85,
      levers: [
        lever('Centralized revenue-cycle management', 'operating-partner', '400 bps margin lift', 42),
        lever('Payer-contract renegotiation', 'legal-gc', 'Top-5 payers renegotiated', 38),
        lever('De-novo clinic expansion', 'partner', '8 new clinics', 50)
      ]
    },
    kpis: [
      kpi('Revenue', 560, 548, '$M'),
      kpi('EBITDA', 78, 74, '$M'),
      kpi('EBITDA margin', 13.9, 13.5, '%'),
      kpi('Same-clinic growth', 6, 4, '%')
    ],
    addOns: { completed: 4, pipeline: 5 }
  },
  {
    id: 'blueriver-services',
    company: 'BlueRiver Business Services',
    sector: 'Business Services',
    subSector: 'Outsourced operations',
    hq: 'Columbus, OH',
    region: 'Midwest',
    owner: 'operating-partner',
    sponsorPersona: 'partner',
    status: 'on-track',
    thesis: 'Tech-enabled outsourced back-office platform; automation and offshore delivery expand margins while a fragmented market fuels a bolt-on pipeline.',
    entry: { date: '2025-07-15', ebitda: 32.5, entryMultiple: 8.0, netDebt: 140 },
    current: { ebitda: 34, multiple: 8.0, netDebt: 132 },
    realized: [],
    valueCreation: {
      hundredDayPct: 70,
      levers: [
        lever('Automation / delivery-cost reduction', 'operating-partner', '300 bps margin lift', 35),
        lever('Offshore delivery-center standup', 'supply-md', '2 centers live', 50),
        lever('Bolt-on pipeline build', 'partner', '3 add-ons in dialogue', 30)
      ]
    },
    kpis: [
      kpi('Revenue', 210, 214, '$M'),
      kpi('EBITDA', 33, 34, '$M'),
      kpi('EBITDA margin', 15.7, 15.9, '%'),
      kpi('Net revenue retention', 108, 109, '%')
    ],
    addOns: { completed: 0, pipeline: 3 }
  },
  {
    id: 'harbor-coatings',
    company: 'Harbor Industrial Coatings',
    sector: 'Industrials',
    subSector: 'Specialty coatings',
    hq: 'Pittsburgh, PA',
    region: 'Northeast',
    owner: 'operating-partner',
    sponsorPersona: 'supply-md',
    status: 'underperform',
    thesis: 'Specialty industrial-coatings platform; input-cost inflation and a soft construction cycle have pushed volumes below the underwriting case.',
    entry: { date: '2024-03-05', ebitda: 37.5, entryMultiple: 8.0, netDebt: 165 },
    current: { ebitda: 34, multiple: 7.5, netDebt: 168 },
    realized: [],
    valueCreation: {
      hundredDayPct: 100,
      levers: [
        lever('Pricing recovery on input inflation', 'operating-partner', 'Full cost pass-through', 44),
        lever('Fixed-cost / footprint reset', 'supply-md', 'Consolidate to 4 plants', 55),
        lever('End-market diversification', 'retail-md', '30% non-construction mix', 28)
      ]
    },
    kpis: [
      kpi('Revenue', 260, 241, '$M'),
      kpi('EBITDA', 42, 34, '$M'),
      kpi('EBITDA margin', 16.2, 14.1, '%'),
      kpi('Volume YoY', 4, -6, '%')
    ],
    addOns: { completed: 1, pipeline: 0 }
  }
];
