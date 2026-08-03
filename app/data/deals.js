// Seeded deal estate — realistic private-equity opportunities at different
// lifecycle stages. The lead deal (Nordic Grocery Group) is richly populated so
// the workspace is compelling on first open; the rest show the pipeline spread.
//
// These are SEEDED INTO THE DATASTORE at boot (see lib/store.js hydrate → seededDeals),
// so they are live, mutable records like any other deal — not read-only fixtures.
// Each therefore carries the same governance/placement fields the demo-stage deals do:
//   region    — territory for the Entra region-group access model (European HQs here,
//               so they also exercise the 'international' scope)
//   stage     — the flow STEP key (data/flow.js). This is what actually places a deal
//               in a lifecycle phase: derive() looks the step up and overwrites
//               stageName from the step's stage. Note D1..D5 are ALL diligence steps
//               (D5 is Archive, the audit close-out) — execution starts at E1.
//   stageName — mirrors the label derive() will produce. Kept for readability only;
//               the step code above is authoritative.
//   status    — lifecycle state used by the workspace/gating logic
export const seedDeals = [
  {
    id: 'nordic-grocery',
    company: 'Nordic Grocery Group',
    region: 'international',
    tags: [],
    sector: 'Consumer & Retail',
    subSector: 'Grocery / Convenience',
    hq: 'Stockholm, Sweden',
    dealSize: 820,
    currency: 'EUR',
    stage: 'D2',
    stageName: 'Diligence & Approval',
    status: 'in_diligence',
    sponsorPersona: 'partner',
    leadAnalyst: 'analyst',
    targetICDate: daysFromNow(12),
    baselineDays: 45,
    thesis:
      'Buy-and-build of a #2 Nordic convenience grocer with a proven private-label margin engine and an under-monetised loyalty dataset. Thesis: accelerate own-brand penetration and stand up an AI-driven assortment & pricing capability to close a 230 bps EBITDA-margin gap vs. the regional leader.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '$1.94B', source: 'CIM p.12', confidence: 'high' },
      { label: 'EBITDA (LTM)', value: '$148M', source: 'CIM p.14 / QoE draft', confidence: 'high' },
      { label: 'EBITDA margin', value: '7.6%', source: 'Derived', confidence: 'high' },
      { label: 'Entry multiple', value: '8.4x EV/EBITDA', source: 'Deal model v3', confidence: 'medium' },
      { label: 'Private-label mix', value: '21%', source: 'CIM p.31', confidence: 'high' },
      { label: 'Loyalty members', value: '3.1M', source: 'Data room / mgmt', confidence: 'medium' }
    ],
    workstreams: [
      {
        lane: 'commercial',
        owner: 'retail-md',
        status: 'in_progress',
        progress: 55,
        findings: [
          { text: 'Grocery market growing 3.1% CAGR; convenience format outpacing at 5.4% — tailwind supports the base case.', severity: 'positive', source: 'Euromonitor / Commercial DD' },
          { text: 'Top-10 store catchments overlap 18% with the leader; cannibalisation risk in the buy-and-build is contained.', severity: 'neutral', source: 'Geospatial analysis' }
        ]
      },
      {
        lane: 'techai',
        owner: 'ai-md',
        status: 'in_progress',
        progress: 40,
        findings: [
          { text: 'Loyalty data is rich (3.1M members, 4yr history) but siloed in legacy POS; needs a lakehouse before AI pricing is viable.', severity: 'caution', source: 'Tech/AI DD' }
        ]
      },
      {
        lane: 'operations',
        owner: 'supply-md',
        status: 'not_started',
        progress: 0,
        findings: []
      },
      {
        lane: 'financial',
        owner: 'fund-cfo',
        status: 'in_progress',
        progress: 45,
        findings: [
          { text: 'Supplier rebates of EUR 8.4M are recognised on invoice rather than on achievement; roughly EUR 2.9M of LTM EBITDA depends on volumes not yet earned.', severity: 'high', source: 'Financial / QoE' },
          { text: 'Like-for-like growth is 1.8% once the 11 stores opened in the period are stripped out, against 3.1% presented.', severity: 'medium', source: 'Financial / QoE' }
        ]
      },
      {
        lane: 'tax',
        owner: 'fund-cfo',
        status: 'not_started',
        progress: 0,
        findings: []
      }
    ],
    documents: [
      { name: 'Confidential Information Memorandum.pdf', type: 'CIM', pages: 142, status: 'parsed' },
      { name: 'Audited Financials 2021-2024.xlsx', type: 'Financials', pages: 0, status: 'parsed' },
      { name: 'Customer Cohort Analysis.pdf', type: 'Commercial', pages: 38, status: 'parsing' },
      { name: 'Supplier Master & Contracts.zip', type: 'Operations', pages: 0, status: 'uploaded' }
    ],
    memoSections: [
      { key: 'thesis', title: 'Investment thesis', status: 'draft', content: 'Convenience-led consolidation play with a private-label and data-monetisation upside. (Draft — run the screening agent to refresh from the live record.)', citations: ['CIM p.12', 'Deal model v3'] },
      { key: 'market', title: 'Market & commercial', status: 'in_progress', content: '', citations: [] },
      { key: 'value-creation', title: 'Value creation plan', status: 'empty', content: '', citations: [] },
      { key: 'risks', title: 'Key risks & mitigants', status: 'empty', content: '', citations: [] },
      { key: 'recommendation', title: 'Recommendation', status: 'empty', content: '', citations: [] }
    ],
    compliance: [
      { check: 'SFDR Article 8 alignment assessment', framework: 'SFDR', status: 'in_progress' },
      { check: 'ILPA reporting template mapping', framework: 'ILPA', status: 'pending' },
      { check: 'Sanctions / UBO screening', framework: 'KYC', status: 'passed' },
      { check: 'Data-room sensitivity labelling', framework: 'Purview', status: 'passed' }
    ],
    activity: [
      { actor: 'Deal team — document review', action: 'Parsed CIM (142 pp) → termsheet + 11 KPIs to Fabric', when: hoursAgo(20) },
      { actor: 'James Whitfield', action: 'Opened Commercial DD lane', when: hoursAgo(18) },
      { actor: 'Deal team — diligence planning', action: 'Drafted DD checklist from 3 comparable deals', when: hoursAgo(17) }
    ],
    hoursSaved: 26
  },
  {
    id: 'heliopack',
    company: 'HelioPack Sustainable Packaging',
    region: 'international',
    tags: [],
    sector: 'Industrials',
    subSector: 'Sustainable Packaging',
    hq: 'Rotterdam, Netherlands',
    dealSize: 410,
    currency: 'EUR',
    stage: 'D1',
    stageName: 'Diligence & Approval',
    status: 'in_diligence',
    sponsorPersona: 'partner',
    leadAnalyst: 'analyst',
    targetICDate: daysFromNow(26),
    baselineDays: 45,
    thesis:
      'Carve-out of a fibre-based packaging leader riding the plastics-substitution regulatory wave. Thesis: consolidate fragmented EU converters and re-rate on ESG-aligned demand, with tariff-exposed input costs the central diligence question.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '$512M', source: 'Teaser', confidence: 'medium' },
      { label: 'EBITDA (LTM)', value: '$61M', source: 'Teaser', confidence: 'medium' },
      { label: 'EBITDA margin', value: '11.9%', source: 'Derived', confidence: 'medium' }
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'not_started', progress: 0, findings: [] },
      { lane: 'financial', owner: 'fund-cfo', status: 'complete', progress: 100, findings: [] },
      { lane: 'techai', owner: 'ai-md', status: 'not_started', progress: 0, findings: [] },
      { lane: 'operations', owner: 'supply-md', status: 'in_progress', progress: 25, findings: [
        { text: 'Pulp inputs 38% sourced from tariff-exposed regions; hedging and dual-sourcing are the swing factor on margin.', severity: 'caution', source: 'Ops DD (prelim)' }
      ] }
    ],
    documents: [
      { name: 'Teaser & Process Letter.pdf', type: 'Teaser', pages: 18, status: 'parsed' },
      { name: 'Management Presentation.pdf', type: 'CIM', pages: 76, status: 'parsing' }
    ],
    memoSections: [
      { key: 'thesis', title: 'Investment thesis', status: 'draft', content: 'Plastics-substitution consolidation play. (Draft.)', citations: ['Teaser'] },
      { key: 'market', title: 'Market & commercial', status: 'empty', content: '', citations: [] },
      { key: 'value-creation', title: 'Value creation plan', status: 'empty', content: '', citations: [] },
      { key: 'risks', title: 'Key risks & mitigants', status: 'empty', content: '', citations: [] },
      { key: 'recommendation', title: 'Recommendation', status: 'empty', content: '', citations: [] }
    ],
    compliance: [
      { check: 'SFDR Article 9 candidate review', framework: 'SFDR', status: 'pending' },
      { check: 'Sanctions / UBO screening', framework: 'KYC', status: 'in_progress' }
    ],
    activity: [
      { actor: 'Deal team — deal setup', action: 'Provisioned diligence workspace + data room', when: hoursAgo(40) },
      { actor: 'Diego Marquez', action: 'Flagged tariff exposure for early review', when: hoursAgo(30) }
    ],
    hoursSaved: 9
  },
  {
    id: 'lumen-analytics',
    company: 'Lumen Analytics',
    region: 'international',
    tags: [],
    sector: 'Software',
    subSector: 'Vertical SaaS / Data',
    hq: 'Dublin, Ireland',
    dealSize: 240,
    currency: 'EUR',
    stage: 'D3',
    stageName: 'Diligence & Approval',
    status: 'in_diligence',
    sponsorPersona: 'ai-md',
    leadAnalyst: 'analyst',
    targetICDate: daysFromNow(9),
    baselineDays: 45,
    thesis:
      'High-growth vertical-SaaS provider with an emerging AI product line. Thesis: a platform asset to anchor a digital value-creation roadmap; diligence confirmed net-revenue retention and proprietary-data defensibility — now synthesising the IC memo.',
    keyFigures: [
      { label: 'ARR', value: '$58M', source: 'QoE', confidence: 'high' },
      { label: 'Growth (YoY)', value: '41%', source: 'QoE', confidence: 'high' },
      { label: 'NRR', value: '118%', source: 'Commercial DD', confidence: 'medium' }
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'complete', progress: 100, findings: [
        { text: 'NRR of 118% verified against cohort data; land-and-expand motion is durable.', severity: 'positive', source: 'Commercial DD' }
      ] },
      { lane: 'techai', owner: 'ai-md', status: 'in_progress', progress: 80, findings: [
        { text: 'Proprietary training data (7yr labelled corpus) gives a real moat beyond the GPT layer.', severity: 'positive', source: 'Tech/AI DD' }
      ] },
      { lane: 'financial', owner: 'fund-cfo', status: 'in_progress', progress: 70, findings: [
        { text: 'EUR 4.1M of ARR is invoiced annually in advance but recognised on signature; on a ratable basis LTM EBITDA is EUR 3.2M lower than the model carries.', severity: 'high', source: 'Financial / QoE' },
        { text: 'Capitalised development costs of EUR 2.6M sit above peer practice; expensing them moves the entry multiple from 9.4x to 10.1x.', severity: 'medium', source: 'Financial / QoE' }
      ] },
      { lane: 'tax', owner: 'fund-cfo', status: 'in_progress', progress: 30, findings: [
        { text: 'Irish IP box claimed on the data assets since 2021; the ruling has not been produced and the benefit is in the base case.', severity: 'caution', source: 'Tax DD' }
      ] },
      { lane: 'operations', owner: 'supply-md', status: 'complete', progress: 100, findings: [{ text: 'Warehouse automation payback 3.1 years on the vendor quote; no capex gap to the model.', severity: 'positive', source: 'Operations DD' }] }
    ],
    documents: [
      { name: 'Investment Screen.pdf', type: 'Screen', pages: 6, status: 'parsed' },
      { name: 'Quality of Earnings.pdf', type: 'Financials', pages: 44, status: 'parsed' },
      { name: 'Tech & Data DD.pdf', type: 'Tech', pages: 52, status: 'parsed' }
    ],
    memoSections: [
      { key: 'thesis', title: 'Investment thesis', status: 'approved', content: 'Vertical SaaS platform with a defensible proprietary-data moat and 41% growth.', citations: ['QoE', 'Tech/AI DD'] },
      { key: 'market', title: 'Market & commercial', status: 'approved', content: 'NRR 118%; durable land-and-expand.', citations: ['Commercial DD'] },
      { key: 'value-creation', title: 'Value creation plan', status: 'in_progress', content: '', citations: [] },
      { key: 'risks', title: 'Key risks & mitigants', status: 'draft', content: 'Model-cost inflation; founder key-person.', citations: [] },
      { key: 'recommendation', title: 'Recommendation', status: 'empty', content: '', citations: [] }
    ],
    compliance: [
      { check: 'Sanctions / UBO screening', framework: 'KYC', status: 'passed' },
      { check: 'SFDR Article 8 alignment assessment', framework: 'SFDR', status: 'passed' },
      { check: 'AI Act risk classification', framework: 'EU AI Act', status: 'in_progress' }
    ],
    activity: [
      { actor: 'Deal team — IC memo', action: 'Drafted thesis & market sections from the live record', when: hoursAgo(14) },
      { actor: 'Priya Nair', action: 'Approved the commercial synthesis', when: hoursAgo(9) }
    ],
    hoursSaved: 19
  },
  {
    id: 'atlas-coldchain',
    company: 'Atlas Cold Chain Logistics',
    region: 'international',
    tags: [],
    sector: 'Logistics',
    subSector: 'Temperature-controlled 3PL',
    hq: 'Hamburg, Germany',
    dealSize: 360,
    currency: 'EUR',
    stage: 'D4',
    stageName: 'Diligence & Approval',
    status: 'in_diligence',
    sponsorPersona: 'partner',
    leadAnalyst: 'analyst',
    targetICDate: daysFromNow(4),
    baselineDays: 45,
    thesis:
      'Temperature-controlled logistics roll-up benefiting from pharma & grocery e-commerce. Thesis: scarce cold-chain capacity with proven pricing power and resilient utilisation — memo complete, routing to IC for approval.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '$288M', source: 'QoE', confidence: 'high' },
      { label: 'EBITDA (LTM)', value: '$46M', source: 'QoE', confidence: 'high' },
      { label: 'EBITDA margin', value: '16.0%', source: 'QoE', confidence: 'high' }
    ],
    workstreams: [
      // All SEVEN lanes, deliberately. `ensureFirstClassLanes` in store.js backfills any
      // lane a deal omits as not_started/0, and a not-started lane blocks the IC gate — so
      // a seed that lists three lanes is not a deal with three lanes, it is a deal with
      // four silently un-started ones. Atlas is the one deal in the demo that is genuinely
      // ready to table, and it cannot be that with lanes nobody opened.
      { lane: 'commercial', owner: 'retail-md', status: 'complete', progress: 100, findings: [
        { text: 'Utilisation resilient at 87% through the cycle; pricing power validated across pharma contracts.', severity: 'positive', source: 'Commercial DD' }
      ] },
      { lane: 'financial', owner: 'finance-md', status: 'complete', progress: 100, findings: [
        { text: 'QoE supports $46M LTM EBITDA; $2.1M of add-backs disallowed, reflected in the 9.2x entry.', severity: 'medium', source: 'Financial / QoE' },
        { text: 'Working-capital seasonality is real but self-funding across the year; no incremental facility required.', severity: 'positive', source: 'Financial / QoE' }
      ] },
      { lane: 'legal', owner: 'legal-md', status: 'complete', progress: 100, findings: [
        { text: 'Change-of-control consents required on two of the top-five pharma contracts; both counterparties have indicated no objection in writing.', severity: 'medium', source: 'Legal DD' }
      ] },
      { lane: 'tax', owner: 'tax-md', status: 'complete', progress: 100, findings: [
        { text: 'German/Dutch structure reviewed; no material historical exposure identified. Interest limitation modelled at the target leverage.', severity: 'positive', source: 'Tax DD' }
      ] },
      { lane: 'techai', owner: 'ai-md', status: 'complete', progress: 100, findings: [{ text: 'Cold-chain telemetry stack is vendor-hosted; no material in-house tech debt found.', severity: 'positive', source: 'Tech / AI DD' }] },
      { lane: 'operations', owner: 'supply-md', status: 'complete', progress: 100, findings: [
        { text: 'Energy-cost exposure hedged via long-dated PPAs; margin downside contained.', severity: 'positive', source: 'Ops DD' }
      ] },
      { lane: 'esg', owner: 'esg-md', status: 'complete', progress: 100, findings: [
        { text: 'Refrigerant transition to low-GWP units is capex-planned through FY27; costed into the model.', severity: 'medium', source: 'ESG / Environmental' }
      ] }
    ],
    documents: [
      { name: 'Confidential Information Memorandum.pdf', type: 'CIM', pages: 118, status: 'parsed' },
      { name: 'Quality of Earnings.pdf', type: 'Financials', pages: 51, status: 'parsed' },
      { name: 'IC Memo v2.docx', type: 'Memo', pages: 22, status: 'parsed' }
    ],
    memoSections: [
      { key: 'thesis', title: 'Investment thesis', status: 'approved', content: 'Scarce cold-chain capacity with pricing power.', citations: ['CIM', 'QoE'] },
      { key: 'market', title: 'Market & commercial', status: 'approved', content: 'Utilisation 87%; pharma tailwind.', citations: ['Commercial DD'] },
      { key: 'value-creation', title: 'Value creation plan', status: 'approved', content: 'Buy-and-build; energy hedging.', citations: ['Ops DD'] },
      { key: 'risks', title: 'Key risks & mitigants', status: 'approved', content: 'Energy costs hedged via PPAs.', citations: ['Ops DD'] },
      { key: 'recommendation', title: 'Recommendation', status: 'approved', content: 'Recommend proceed at 9.2x. Diligence complete across all three lanes; no unresolved risk-level findings.', citations: ['Deal model', 'Commercial DD', 'Tech / AI DD'] }
    ],
    compliance: [
      { check: 'Sanctions / UBO screening', framework: 'KYC', status: 'passed' },
      { check: 'SFDR Article 8 alignment assessment', framework: 'SFDR', status: 'passed' },
      { check: 'ILPA reporting template mapping', framework: 'ILPA', status: 'passed' }
    ],
    activity: [
      { actor: 'Deal team — IC coordination', action: 'Assembled IC pack and circulated to committee', when: hoursAgo(10) },
      { actor: 'Eleanor Bishop', action: 'Scheduled IC review', when: hoursAgo(6) }
    ],
    hoursSaved: 31
  },
  {
    id: 'baltic-precision',
    company: 'Baltic Precision Components',
    region: 'international',
    tags: [],
    sector: 'Industrials',
    subSector: 'Precision Components',
    hq: 'Tallinn, Estonia',
    dealSize: 195,
    currency: 'EUR',
    stage: 'D5',
    // D5 is Archive — the audit-trail close-out of the DILIGENCE stage, which is exactly
    // where this deal sits: IC approved, record archived, not yet through E1 financing.
    stageName: 'Diligence & Approval',
    status: 'signing',
    sponsorPersona: 'partner',
    leadAnalyst: 'analyst',
    targetICDate: daysFromNow(-6),
    baselineDays: 45,
    thesis:
      'Founder-succession buyout of a precision-components supplier riding reshoring demand. IC approved; deal archived with a full lineage-tracked record.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '$162M', source: 'QoE', confidence: 'high' },
      { label: 'EBITDA (LTM)', value: '$27M', source: 'QoE', confidence: 'high' },
      { label: 'Entry multiple', value: '7.1x EV/EBITDA', source: 'Deal model', confidence: 'high' }
    ],
    workstreams: [
      // Seven lanes, for the same reason as Atlas: this deal has SIGNED. A seed listing
      // three lanes leaves four backfilled as not-started, and the engine — correctly —
      // then reports work with nothing recorded against it on a closed transaction.
      { lane: 'commercial', owner: 'retail-md', status: 'complete', progress: 100, findings: [
        { text: 'Reshoring driving dual-sourcing wins; order book +22% YoY.', severity: 'positive', source: 'Commercial DD' }
      ] },
      { lane: 'financial', owner: 'finance-md', status: 'complete', progress: 100, findings: [
        { text: 'QoE clean; normalised EBITDA agreed with the vendor and locked in the SPA completion mechanism.', severity: 'positive', source: 'Financial / QoE' }
      ] },
      { lane: 'legal', owner: 'legal-md', status: 'complete', progress: 100, findings: [
        { text: 'W&I policy bound at signing; two specific indemnities carved out for the historical customs matter.', severity: 'medium', source: 'Legal DD' }
      ] },
      { lane: 'tax', owner: 'tax-md', status: 'complete', progress: 100, findings: [
        { text: 'Baltic/Polish structure reviewed pre-signing; no material historical exposure identified.', severity: 'positive', source: 'Tax DD' }
      ] },
      { lane: 'techai', owner: 'ai-md', status: 'complete', progress: 100, findings: [{ text: 'ERP is a supported SAP release; no end-of-life exposure inside the hold period.', severity: 'positive', source: 'Tech / AI DD' }] },
      { lane: 'operations', owner: 'supply-md', status: 'complete', progress: 100, findings: [{ text: 'Two of four plants are near capacity; the reshoring case needs a third line by year two.', severity: 'watch', source: 'Operations DD' }] },
      { lane: 'esg', owner: 'esg-md', status: 'complete', progress: 100, findings: [
        { text: 'Scope 1/2 baseline established across all four plants; no remediation liabilities identified at the owned sites.', severity: 'positive', source: 'ESG / Environmental' }
      ] }
    ],
    documents: [
      { name: 'IC Memo (Approved).docx', type: 'Memo', pages: 24, status: 'parsed' },
      { name: 'Signed SPA.pdf', type: 'Legal', pages: 88, status: 'parsed' }
    ],
    memoSections: [
      { key: 'thesis', title: 'Investment thesis', status: 'approved', content: 'Reshoring-led precision components consolidation.', citations: ['QoE'] },
      { key: 'market', title: 'Market & commercial', status: 'approved', content: 'Order book +22% YoY.', citations: ['Commercial DD'] },
      { key: 'value-creation', title: 'Value creation plan', status: 'approved', content: 'Buy-and-build; footprint optimisation.', citations: ['Ops DD'] },
      { key: 'risks', title: 'Key risks & mitigants', status: 'approved', content: 'Customer concentration mitigated by contract terms.', citations: ['Commercial DD'] },
      { key: 'recommendation', title: 'Recommendation', status: 'approved', content: 'Approved at IC; proceed to signing.', citations: ['IC minutes — not on file in this system'] }
    ],
    compliance: [
      { check: 'Sanctions / UBO screening', framework: 'KYC', status: 'passed' },
      { check: 'SFDR Article 8 alignment assessment', framework: 'SFDR', status: 'passed' },
      { check: 'ILPA reporting template mapping', framework: 'ILPA', status: 'passed' },
      { check: 'Data-room sensitivity labelling', framework: 'Purview', status: 'passed' }
    ],
    activity: [
      { actor: 'Deal team — records & compliance', action: 'Archived data room with Purview audit trail', when: hoursAgo(50) },
      { actor: 'Investment Committee', action: 'Approved the transaction', when: hoursAgo(72) }
    ],
    hoursSaved: 38
  }
];

export const seedSourcing = [
  {
    id: 'src-1',
    company: 'Frostbite Foods',
    sector: 'Consumer & Retail',
    signal: 'Founder CxO interview signals openness to a growth partner; 3 bolt-ons available in DACH.',
    score: 91,
    tags: ['retail-md', 'analyst'],
    rationale: 'Matches convenience-grocery mandate; adjacency to Nordic Grocery thesis.',
    source: 'CxO interview · Sector news',
    promoted: false
  },
  {
    id: 'src-2',
    company: 'GridSense AI',
    sector: 'Software',
    signal: 'Series C insider round oversubscribed; energy-grid AI with proprietary sensor data.',
    score: 87,
    tags: ['ai-md', 'analyst'],
    rationale: 'Defensible data moat; strong AI-readiness profile.',
    source: 'Filings · Analyst report',
    promoted: false
  },
  {
    id: 'src-3',
    company: 'Meridian Components',
    sector: 'Industrials',
    signal: 'Tariff reshoring tailwind; founder retirement creates succession window.',
    score: 78,
    tags: ['supply-md', 'analyst'],
    rationale: 'Supplier-base consolidation angle; tariff-resilient sourcing.',
    source: 'News · Trade data',
    promoted: false
  },
  {
    id: 'src-4',
    company: 'Verda Home',
    sector: 'Consumer & Retail',
    signal: 'DTC home brand with strong loyalty data; growth slowing, valuation reset.',
    score: 72,
    tags: ['retail-md', 'ai-md'],
    rationale: 'Loyalty-data monetisation parallels the Nordic Grocery playbook.',
    source: 'Web grounding · Internal history',
    promoted: false
  }
];

function daysFromNow(d) {
  const t = new Date();
  t.setDate(t.getDate() + d);
  return t.toISOString();
}
function hoursAgo(h) {
  const t = new Date();
  t.setHours(t.getHours() - h);
  return t.toISOString();
}

// Later-stage showcase deals for Stage 3 (Execution & Closing) and Stage 4 (Value
// Creation & Exit). Seeded idempotently at boot by lib/store.js so the new stages have
// live deals to open. Distinct 'demo-' ids so they never collide with the pipeline seed.
export const demoStageDeals = [
  // ── Region-spread demo deals ──────────────────────────────────────────────
  // Each carries an explicit `region` so the territory (Entra region-group) access
  // model has a clear spread to demonstrate: an analyst scoped to Northeast sees
  // Beacon Hill; the West Coast MD sees Cascadia (NW) + Mojave (SW); MDs/admins see all.
  {
    id: 'demo-cascadia', company: 'Cascadia Timber Partners', region: 'northwest', tags: [],
    sector: 'Industrials', subSector: 'Forestry / Building Products', hq: 'Portland, Oregon, United States',
    dealSize: 380, currency: 'USD', stage: 'D2', stageName: 'Diligence & Approval', status: 'in_diligence',
    sponsorPersona: 'partner', leadAnalyst: 'analyst', targetICDate: daysFromNow(24), baselineDays: 45,
    thesis: 'Buy-and-build of a Pacific Northwest sustainable-forestry and engineered-wood platform; margin upside from mill automation and FSC-certified premium mix.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '$412M', source: 'CIM', confidence: 'high' },
      { label: 'EBITDA (LTM)', value: '$61M', source: 'QoE draft', confidence: 'medium' },
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'in_progress', progress: 55, findings: [{ text: 'Housing-start exposure hedged by repair-&-remodel mix (48%).', severity: 'positive', source: 'Commercial DD' }] },
      { lane: 'operations', owner: 'supply-md', status: 'in_progress', progress: 40, findings: [] },
      { lane: 'financial', owner: 'fund-cfo', status: 'in_progress', progress: 25, findings: [
        { text: 'Standing timber is carried at historical cost; a fair-value reassessment is the single largest swing item in the model and is not yet complete.', severity: 'medium', source: 'Financial / QoE (prelim)' }
      ] },
      { lane: 'tax', owner: 'fund-cfo', status: 'in_progress', progress: 15, findings: [] },
      { lane: 'esg', owner: 'esg-md', status: 'not_started', progress: 0, findings: [] },
    ],
    memoSections: [{ key: 'thesis', title: 'Investment thesis', status: 'draft', content: 'PNW forestry consolidation with automation-led margin gains.', citations: ['CIM'] }],
    compliance: [{ check: 'Sanctions / UBO screening', framework: 'KYC', status: 'passed' }],
    activity: [{ actor: 'Deal Room Assistant', action: 'Assembled the commercial DD summary', when: hoursAgo(18) }], hoursSaved: 12,
  },
  {
    id: 'demo-beaconhill', company: 'Beacon Hill Biotech', region: 'northeast', tags: [],
    sector: 'Healthcare', subSector: 'Biotech Tools / CRO', hq: 'Boston, Massachusetts, United States',
    dealSize: 300, currency: 'USD', stage: 'D1', stageName: 'Diligence & Approval', status: 'in_diligence',
    sponsorPersona: 'partner', leadAnalyst: 'analyst', targetICDate: daysFromNow(30), baselineDays: 45,
    thesis: 'Carve-out of a Boston-cluster contract-research platform serving early-stage biotech; recurring revenue and a scientific-talent moat.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '$286M', source: 'CIM', confidence: 'high' },
      { label: 'EBITDA (LTM)', value: '$44M', source: 'Screen', confidence: 'medium' },
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'in_progress', progress: 35, findings: [] },
      // DELIBERATELY BARE, and the only lane in the seed that is. Marked complete at 100%
      // with nothing recorded against it — the exact state the readiness gate exists to
      // catch: a lane the committee cannot check, whatever the status field says. Every
      // other lane carries its findings, so without this one the rule would live in the
      // code, never fire in a demo, and be deleted by the next person who could not see
      // why it was there.
      { lane: 'techai', owner: 'ai-md', status: 'complete', progress: 100, findings: [] },
    ],
    memoSections: [{ key: 'thesis', title: 'Investment thesis', status: 'draft', content: 'Boston CRO carve-out with recurring biotech demand.', citations: ['CIM'] }],
    compliance: [{ check: 'Sanctions / UBO screening', framework: 'KYC', status: 'pending' }],
    activity: [{ actor: 'Eleanor Bishop', action: 'PURSUE recorded at screening', when: hoursAgo(60) }], hoursSaved: 6,
  },
  {
    id: 'demo-lonestar', company: 'Lone Star Energy Services', region: 'southcentral', tags: [],
    sector: 'Energy', subSector: 'Energy Services / Electrification', hq: 'Houston, Texas, United States',
    dealSize: 520, currency: 'USD', stage: 'D3', stageName: 'Diligence & Approval', status: 'in_diligence',
    sponsorPersona: 'partner', leadAnalyst: 'analyst', targetICDate: daysFromNow(21), baselineDays: 45,
    thesis: 'Grid-electrification and industrial-services platform in the Texas/Gulf corridor; tailwind from utility capex and reshoring.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '$640M', source: 'CIM', confidence: 'high' },
      { label: 'EBITDA (LTM)', value: '$96M', source: 'QoE draft', confidence: 'medium' },
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'in_progress', progress: 70, findings: [{ text: 'Backlog covers 1.8x forward-year revenue; utility framework agreements sticky.', severity: 'positive', source: 'Commercial DD' }] },
      { lane: 'financial', owner: 'fund-cfo', status: 'in_progress', progress: 60, findings: [
        { text: 'Two acquisitions completed in the LTM are presented pro-forma for a full year of synergies that have not yet been actioned; USD 7M of the USD 96M is unearned.', severity: 'medium', source: 'Financial / QoE draft' }
      ] },
      { lane: 'tax', owner: 'fund-cfo', status: 'in_progress', progress: 35, findings: [
        { text: 'Texas franchise-tax treatment of the 2022 reorganisation is unresolved with the state; exposure is capped but not quantified.', severity: 'caution', source: 'Tax DD' }
      ] },
      { lane: 'legal', owner: 'legal-md', status: 'in_progress', progress: 40, findings: [] },
    ],
    memoSections: [{ key: 'thesis', title: 'Investment thesis', status: 'in_progress', content: 'Gulf-corridor electrification services with a sticky utility backlog.', citations: ['CIM', 'QoE draft'] }],
    compliance: [{ check: 'Sanctions / UBO screening', framework: 'KYC', status: 'passed' }],
    activity: [{ actor: 'Deal Room Assistant', action: 'Drafted the red-flag report', when: hoursAgo(8) }], hoursSaved: 19,
  },
  {
    id: 'demo-peachtree', company: 'Peachtree Health Partners', region: 'southeast', tags: [],
    sector: 'Healthcare', subSector: 'Multi-site Care / Services', hq: 'Atlanta, Georgia, United States',
    dealSize: 460, currency: 'USD', stage: 'V2', stageName: 'Value Creation', status: 'owned',
    sponsorPersona: 'operating-partner', leadAnalyst: 'analyst', targetICDate: daysFromNow(-120), baselineDays: 45,
    thesis: 'Portfolio company: Southeast multi-site specialty-care platform. Value creation via de-novo clinics, payer-contract optimisation and an AI scheduling capability.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '$540M', source: 'Board pack', confidence: 'high' },
      { label: 'EBITDA vs entry', value: '+11.2%', source: 'VC tracker', confidence: 'high' },
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'complete', progress: 100, findings: [{ text: 'De-novo clinic ramp ahead of plan (7 of 10 open).', severity: 'positive', source: 'VC lever 1' }] },
      { lane: 'techai', owner: 'ai-md', status: 'in_progress', progress: 60, findings: [] },
    ],
    memoSections: [{ key: 'value-creation', title: 'Value creation plan', status: 'in_progress', content: 'Three of four levers in flight; EBITDA +11.2% vs entry.', citations: ['VC plan', 'Board pack'] }],
    compliance: [{ check: 'Quarterly LP reporting (ILPA)', framework: 'ILPA', status: 'passed' }],
    activity: [{ actor: 'Deal team — value creation', action: 'Updated the EBITDA-bridge tracker', when: hoursAgo(40) }], hoursSaved: 33,
  },
  {
    id: 'demo-greatlakes', company: 'Great Lakes Precision', region: 'midwest', tags: [],
    sector: 'Industrials', subSector: 'Precision Manufacturing', hq: 'Chicago, Illinois, United States',
    dealSize: 410, currency: 'USD', stage: 'E1', stageName: 'Execution & Closing', status: 'signing',
    sponsorPersona: 'partner', leadAnalyst: 'analyst', targetICDate: daysFromNow(-7), baselineDays: 45,
    thesis: 'Approved at IC: Midwest precision-components manufacturer with reshoring tailwinds. In execution — debt secured, SPA in signing.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '$395M', source: 'QoE final', confidence: 'high' },
      { label: 'Entry multiple', value: '8.1x EV/EBITDA', source: 'Signed structure', confidence: 'high' },
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'complete', progress: 100, findings: [{ text: 'Top-10 customers are 47% of revenue and all on rolling 12-month terms.', severity: 'watch', source: 'Commercial DD' }] },
      { lane: 'operations', owner: 'supply-md', status: 'complete', progress: 100, findings: [{ text: 'Single-site manufacturing; business-interruption cover reviewed and adequate.', severity: 'watch', source: 'Operations DD' }] },
    ],
    memoSections: [{ key: 'recommendation', title: 'Recommendation', status: 'approved', content: 'IC approved; reshoring backlog underwrites the base case.', citations: ['IC minutes — not on file in this system'] }],
    compliance: [{ check: 'Financing conditions precedent', framework: 'Legal', status: 'in_progress' }, { check: 'Sanctions / UBO screening', framework: 'KYC', status: 'passed' }],
    activity: [{ actor: 'Deal team — financing & structuring', action: 'Locked the debt package; funds-flow drafted', when: hoursAgo(26) }], hoursSaved: 28,
  },
  {
    id: 'demo-mojave', company: 'Mojave Renewables', region: 'southwest', tags: [],
    sector: 'Energy', subSector: 'Renewables / Storage', hq: 'Phoenix, Arizona, United States',
    dealSize: 350, currency: 'USD', stage: 'O2', stageName: 'Origination & Screening', status: 'screened',
    sponsorPersona: 'partner', leadAnalyst: 'analyst', targetICDate: daysFromNow(48), baselineDays: 45,
    thesis: 'Southwest utility-scale solar-plus-storage developer; contracted PPA backlog and IRA-driven economics.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '$210M', source: 'Screen', confidence: 'medium' },
      { label: 'Contracted backlog', value: '2.4 GW', source: 'Screen', confidence: 'medium' },
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'not_started', progress: 0, findings: [] },
    ],
    memoSections: [{ key: 'thesis', title: 'Investment thesis', status: 'draft', content: 'Contracted solar-plus-storage backlog with IRA economics.', citations: ['Screen'] }],
    compliance: [{ check: 'Sanctions / UBO screening', framework: 'KYC', status: 'pending' }],
    activity: [{ actor: 'Eleanor Bishop', action: 'PURSUE recorded at screening', when: hoursAgo(72) }], hoursSaved: 4,
  },
  // Top-of-funnel spread. Origination is mostly a CANDIDATE activity (see data/
  // candidates.js) — only pursued candidates become deals — but the funnel reads as
  // hollow if the first phase holds a single row, so each territory carries one
  // freshly-screened deal that has not yet been launched into diligence.
  {
    id: 'demo-riverbend', company: 'Riverbend Specialty Foods', region: 'midwest', tags: [],
    sector: 'Consumer & Retail', subSector: 'Specialty Food Manufacturing', hq: 'Milwaukee, Wisconsin, United States',
    dealSize: 165, currency: 'USD', stage: 'O2', stageName: 'Origination & Screening', status: 'screened',
    sponsorPersona: 'retail-md', leadAnalyst: 'analyst', targetICDate: daysFromNow(63), baselineDays: 45,
    thesis: 'Founder-owned specialty food manufacturer supplying private-label premium lines to regional grocers; succession window and an under-used second plant.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '$188M', source: 'Screen', confidence: 'medium' },
      { label: 'EBITDA margin', value: '13.2%', source: 'Screen', confidence: 'low' },
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'not_started', progress: 0, findings: [] },
    ],
    memoSections: [{ key: 'thesis', title: 'Investment thesis', status: 'draft', content: 'Private-label specialty manufacturer with spare capacity and a succession window.', citations: ['Screen'] }],
    compliance: [{ check: 'Sanctions / UBO screening', framework: 'KYC', status: 'pending' }],
    activity: [{ actor: 'Deal team — sourcing', action: 'Surfaced from founder-succession signals; PURSUE recorded at screening', when: hoursAgo(30) }], hoursSaved: 3,
  },
  {
    id: 'demo-harborlight', region: 'northeast', tags: [],
    company: 'Harborlight Marine Services',
    sector: 'Industrials', subSector: 'Marine Infrastructure Services', hq: 'Portland, Maine, United States',
    dealSize: 225, currency: 'USD', stage: 'O3', stageName: 'Origination & Screening', status: 'screened',
    sponsorPersona: 'supply-md', leadAnalyst: 'analyst', targetICDate: daysFromNow(55), baselineDays: 45,
    thesis: 'Port and offshore-wind maintenance services platform along the Atlantic seaboard; contracted revenue from federal port modernisation and a fragmented competitor set.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '$142M', source: 'Screen', confidence: 'medium' },
      { label: 'Contracted backlog', value: '$310M', source: 'Screen', confidence: 'medium' },
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'not_started', progress: 0, findings: [] },
      { lane: 'operations', owner: 'supply-md', status: 'not_started', progress: 0, findings: [] },
    ],
    memoSections: [{ key: 'thesis', title: 'Investment thesis', status: 'draft', content: 'Fragmented marine services roll-up on contracted port and offshore-wind demand.', citations: ['Screen'] }],
    compliance: [{ check: 'Sanctions / UBO screening', framework: 'KYC', status: 'in_progress' }],
    activity: [{ actor: 'Diego Marquez', action: 'Completed the screening triage; routed to the go / no-go decision', when: hoursAgo(46) }], hoursSaved: 5,
  },
  {
    id: 'demo-cypress', company: 'Cypress Grove Dental Partners', region: 'southeast', tags: [],
    sector: 'Healthcare', subSector: 'Dental Services Organisation', hq: 'Tampa, Florida, United States',
    dealSize: 280, currency: 'USD', stage: 'O2', stageName: 'Origination & Screening', status: 'screened',
    sponsorPersona: 'partner', leadAnalyst: 'analyst', targetICDate: daysFromNow(70), baselineDays: 45,
    thesis: 'Sunbelt dental services organisation with 64 clinics; de-novo and tuck-in pipeline in demographically growing catchments, with reimbursement mix the central screening question.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '$246M', source: 'Screen', confidence: 'medium' },
      { label: 'Clinics', value: '64', source: 'Screen', confidence: 'high' },
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'not_started', progress: 0, findings: [] },
    ],
    memoSections: [{ key: 'thesis', title: 'Investment thesis', status: 'draft', content: 'Sunbelt DSO consolidation with a de-novo pipeline; reimbursement mix to be tested.', citations: ['Screen'] }],
    compliance: [{ check: 'Sanctions / UBO screening', framework: 'KYC', status: 'pending' }],
    activity: [{ actor: 'Eleanor Bishop', action: 'PURSUE recorded at screening', when: hoursAgo(20) }], hoursSaved: 3,
  },

  {
    id: 'demo-helvetia',
    company: 'Helvetia Diagnostics',
    // Need-to-know: analyst "Maya" is named on this deal team, so she gets the full
    // workspace even though her role tier would normally see status-only.
    team: ['analyst'],
    confidential: false,
    sector: 'Healthcare',
    subSector: 'Diagnostics / Lab Services',
    hq: 'Basel, Switzerland',
    dealSize: 640,
    currency: 'EUR',
    stage: 'E2',
    stageName: 'Signing (SPA)',
    status: 'signed',
    sponsorPersona: 'partner',
    leadAnalyst: 'analyst',
    targetICDate: daysFromNow(-14),
    baselineDays: 45,
    thesis:
      'Buy-and-build of a #2 European diagnostics lab network, approved at IC. Post-approval execution: debt package secured at 4.1x, SPA in signing with a locked-box mechanism; close targeted in three weeks.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '$418M', source: 'QoE final', confidence: 'high' },
      { label: 'EBITDA (LTM)', value: '$92M', source: 'QoE final', confidence: 'high' },
      { label: 'Entry multiple', value: '7.9x EV/EBITDA', source: 'Signed structure', confidence: 'high' },
      { label: 'Leverage', value: '4.1x net debt / EBITDA', source: 'Debt commitment', confidence: 'high' }
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'complete', progress: 100, findings: [
        { text: 'Payer mix resilient; 62% public reimbursement with contracted volume floors — downside protected.', severity: 'positive', source: 'Commercial DD (final)' }
      ] },
      { lane: 'techai', owner: 'ai-md', status: 'complete', progress: 100, findings: [
        { text: 'LIMS consolidation + AI triage adds ~180 bps margin by Y2; roadmap costed into the plan.', severity: 'positive', source: 'Tech/AI DD (final)' }
      ] },
      { lane: 'operations', owner: 'supply-md', status: 'complete', progress: 100, findings: [
        { text: 'Reagent supply concentrated in two vendors; dual-sourcing clause negotiated into the SPA.', severity: 'neutral', source: 'Ops DD (final)' }
      ] }
    ],
    memoSections: [
      { key: 'thesis', title: 'Investment thesis', status: 'approved', content: 'Approved at IC 14 days ago. Consolidation of a fragmented lab network with a costed AI/LIMS margin programme.', citations: ['IC memo v5', 'QoE final'] },
      { key: 'recommendation', title: 'Recommendation', status: 'approved', content: 'IC approved with conditions: dual-source reagents (met) and leverage ≤ 4.25x (met at 4.1x).', citations: ['IC minutes — not on file in this system'] }
    ],
    compliance: [
      { check: 'Antitrust / merger clearance (CH + EU)', framework: 'Regulatory', status: 'in_progress' },
      { check: 'Sanctions / UBO screening', framework: 'KYC', status: 'passed' },
      { check: 'Financing conditions precedent', framework: 'Legal', status: 'in_progress' }
    ],
    activity: [
      { actor: 'Deal team — financing & structuring', action: 'Locked debt package at 4.1x; funds-flow drafted', when: hoursAgo(30) },
      { actor: 'Deal team — legal', action: 'Circulated SPA v7 with the negotiated CP list', when: hoursAgo(10) }
    ],
    hoursSaved: 34
  },
  {
    id: 'demo-meridian',
    company: 'Meridian Logistics',
    team: ['operating-partner', 'fund-cfo'],
    confidential: false,
    sector: 'Industrials',
    subSector: 'Contract Logistics / 3PL',
    hq: 'Lyon, France',
    dealSize: 550,
    currency: 'EUR',
    stage: 'V2',
    stageName: 'Value Creation',
    status: 'owned',
    sponsorPersona: 'operating-partner',
    leadAnalyst: 'analyst',
    targetICDate: daysFromNow(-140),
    baselineDays: 45,
    thesis:
      'Portfolio company, closed ~5 months ago. Value-creation plan in flight: network optimisation, an AI routing/pricing capability and a bolt-on pipeline to re-rate the 3PL platform.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '$1.12B', source: 'Board pack Q2', confidence: 'high' },
      { label: 'EBITDA (LTM)', value: '$134M', source: 'Board pack Q2', confidence: 'high' },
      { label: 'EBITDA vs entry', value: '+9.4%', source: 'Value-creation tracker', confidence: 'high' },
      { label: 'Bolt-ons closed', value: '2 of 5', source: 'Pipeline tracker', confidence: 'high' }
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'complete', progress: 100, findings: [
        { text: 'Cross-sell into the acquired base is tracking ahead of plan (+$14M annualised).', severity: 'positive', source: 'VC lever 2' }
      ] },
      { lane: 'techai', owner: 'ai-md', status: 'in_progress', progress: 65, findings: [
        { text: 'AI routing pilot live in 3 hubs; ~7% cost-per-drop reduction, rolling to the network.', severity: 'positive', source: 'VC lever 3' }
      ] },
      { lane: 'operations', owner: 'supply-md', status: 'in_progress', progress: 55, findings: [
        { text: 'Warehouse consolidation on track; one site slipped a quarter on lease timing.', severity: 'caution', source: 'VC lever 1' }
      ] }
    ],
    memoSections: [
      { key: 'value-creation', title: 'Value creation plan', status: 'in_progress', content: '100-day plan complete; three of four levers in flight, EBITDA +9.4% vs entry.', citations: ['VC plan v3', 'Board pack Q2'] }
    ],
    compliance: [
      { check: 'Quarterly LP reporting (ILPA)', framework: 'ILPA', status: 'passed' },
      { check: 'Covenant compliance test', framework: 'Financing', status: 'passed' }
    ],
    activity: [
      { actor: 'Deal team — value creation', action: 'Updated the EBITDA-bridge tracker (+9.4% vs entry)', when: hoursAgo(48) },
      { actor: 'Deal team — portfolio monitoring', action: 'Assembled the Q2 board pack + LP update', when: hoursAgo(20) }
    ],
    hoursSaved: 41
  },
  {
    id: 'demo-aurora',
    company: 'Aurora Software',
    // Confidential exit: exists only for its named team (+ admins). Everyone else
    // never sees it in the pipeline at all.
    team: ['partner', 'fund-cfo'],
    confidential: true,
    sector: 'Software',
    subSector: 'Vertical SaaS',
    hq: 'Dublin, Ireland',
    dealSize: 720,
    currency: 'USD',
    stage: 'V3',
    stageName: 'Exit Preparation',
    status: 'exiting',
    sponsorPersona: 'partner',
    leadAnalyst: 'analyst',
    targetICDate: daysFromNow(-1080),
    baselineDays: 45,
    thesis:
      'Mature holding (~3 years). Exit process underway: readiness assessed, vendor diligence pack in preparation, dual-track trade sale / secondary at a projected 2.8x MOIC.',
    keyFigures: [
      { label: 'ARR', value: '$286M', source: 'Vendor pack draft', confidence: 'high' },
      { label: 'Rule of 40', value: '52%', source: 'KPI pack', confidence: 'high' },
      { label: 'Projected MOIC', value: '2.8x', source: 'Exit model v2', confidence: 'medium' },
      { label: 'Projected gross IRR', value: '31%', source: 'Exit model v2', confidence: 'medium' }
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'complete', progress: 100, findings: [
        { text: 'Net revenue retention 118%; durable growth supports a strategic premium.', severity: 'positive', source: 'Vendor DD' }
      ] },
      { lane: 'techai', owner: 'ai-md', status: 'complete', progress: 100, findings: [
        { text: 'Platform re-architecture complete; AI features now 22% of new bookings — a clear equity story.', severity: 'positive', source: 'Vendor DD' }
      ] },
      { lane: 'operations', owner: 'supply-md', status: 'complete', progress: 100, findings: [{ text: 'Support org scaled with ARR; no operational drag identified ahead of an exit process.', severity: 'positive', source: 'Operations DD' }] }
    ],
    memoSections: [
      { key: 'recommendation', title: 'Exit recommendation', status: 'draft', content: 'Dual-track trade sale / secondary; readiness score 86/100; target close within two quarters at ~2.8x MOIC.', citations: ['Exit model v2', 'Readiness assessment'] }
    ],
    compliance: [
      { check: 'Vendor diligence data-room prep', framework: 'Process', status: 'in_progress' },
      { check: 'Sell-side QoE engagement', framework: 'Finance', status: 'in_progress' }
    ],
    activity: [
      { actor: 'Deal team — exit readiness', action: 'Scored exit readiness 86/100; flagged 2 pre-sale fixes', when: hoursAgo(72) },
      { actor: 'Deal team — IC memo', action: 'Drafted the exit recommendation for the exit committee', when: hoursAgo(26) }
    ],
    hoursSaved: 29
  },
  {
    id: 'demo-sterling',
    company: 'Project Sterling (listed payments processor)',
    // Confidential take-private under a standstill/NDA — deal-team only. Hidden from the
    // status tier (analyst never sees it); only its named team + admins know it exists.
    team: ['partner', 'principal'],
    confidential: true,
    sector: 'Financials',
    subSector: 'Payments / Fintech',
    hq: 'London, United Kingdom',
    dealSize: 480,
    currency: 'GBP',
    stage: 'D2',
    stageName: 'Diligence',
    status: 'in_diligence',
    sponsorPersona: 'partner',
    leadAnalyst: 'principal',
    targetICDate: daysFromNow(28),
    baselineDays: 45,
    thesis:
      'Confidential public-to-private of a UK-listed payments processor under a standstill/NDA. Buy-and-build thesis in embedded finance; disciplined take-private before a rule-2.7 announcement.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '$612M', source: 'Broker model', confidence: 'medium' },
      { label: 'EBITDA (LTM)', value: '$131M', source: 'Broker model', confidence: 'medium' },
      { label: 'Take-private premium', value: '~34%', source: 'Offer model v1', confidence: 'medium' },
      { label: 'Net leverage at close', value: '4.1x', source: 'Financing plan', confidence: 'medium' }
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'in_progress', progress: 60, findings: [
        { text: 'Merchant churn concentrated in SMB tail; enterprise book is sticky and re-prices well.', severity: 'caution', source: 'Commercial DD' }
      ] },
      { lane: 'financial', owner: 'fund-cfo', status: 'in_progress', progress: 55, findings: [
        { text: 'Take-private financing pre-underwritten by two banks; covenant headroom modelled at 18%.', severity: 'positive', source: 'QoE draft' }
      ] },
      { lane: 'tax', owner: 'fund-cfo', status: 'complete', progress: 100, findings: [
        { text: 'UK take-private structure confirmed: stamp duty at 0.5% on the scheme, and the interest-restriction limit binds from year two at the modelled leverage.', severity: 'medium', source: 'Tax DD' }
      ] },
      { lane: 'legal', owner: 'legal-gc', status: 'in_progress', progress: 40, findings: [
        { text: 'Takeover Code (rule 2.7) timetable and irrevocables are the critical path.', severity: 'caution', source: 'Legal DD' }
      ] }
    ],
    memoSections: [
      { key: 'thesis', title: 'Take-private thesis', status: 'in_progress', content: 'Undervalued listed processor; embedded-finance buy-and-build with a pre-underwritten financing package.', citations: ['Offer model v1', 'Financing plan'] }
    ],
    compliance: [
      { check: 'Standstill / NDA in force', framework: 'Confidentiality', status: 'passed' },
      { check: 'Market abuse (MAR) inside-information log', framework: 'MAR', status: 'in_progress' },
      { check: 'FCA change-in-control (Part XII) pre-assessment', framework: 'FCA', status: 'in_progress' }
    ],
    activity: [
      { actor: 'Deal team — diligence', action: 'Opened the clean-team data room; restricted to the named deal team', when: hoursAgo(30) },
      { actor: 'Deal team — financing', action: 'Assembled the pre-underwritten financing package (two banks)', when: hoursAgo(12) }
    ],
    hoursSaved: 34
  },
  {
    id: 'demo-onyx',
    company: 'Project Onyx (specialty-chemicals carve-out)',
    // Confidential carve-out on a clean-team protocol — BUT analyst "Maya" is read-in on
    // a need-to-know basis, so she gets the full workspace even though the deal is hidden
    // from the wider status tier. Showcases confidential + explicit need-to-know together.
    team: ['analyst', 'partner', 'legal-gc'],
    confidential: true,
    sector: 'Industrials',
    subSector: 'Carve-out / Specialty Chemicals',
    hq: 'Rotterdam, Netherlands',
    dealSize: 610,
    currency: 'EUR',
    stage: 'E2',
    stageName: 'Signing (SPA)',
    status: 'signing',
    sponsorPersona: 'partner',
    leadAnalyst: 'analyst',
    targetICDate: daysFromNow(-14),
    baselineDays: 45,
    thesis:
      'Confidential corporate carve-out of a specialty-chemicals division. Complex transitional services (TSA) and clean-team protocol; standalone value-creation on separation and margin recovery.',
    keyFigures: [
      { label: 'Revenue (carve-out)', value: '$840M', source: 'Carve-out P&L', confidence: 'high' },
      { label: 'Adj. EBITDA', value: '$142M', source: 'Carve-out P&L', confidence: 'high' },
      { label: 'One-time separation cost', value: '$47M', source: 'Separation plan', confidence: 'medium' },
      { label: 'TSA duration', value: '18 months', source: 'TSA schedule', confidence: 'high' }
    ],
    workstreams: [
      { lane: 'operations', owner: 'supply-md', status: 'complete', progress: 100, findings: [
        { text: 'Standalone operating model validated; shared-service exit fully scoped across the 18-month TSA.', severity: 'positive', source: 'Separation DD' }
      ] },
      { lane: 'legal', owner: 'legal-gc', status: 'in_progress', progress: 80, findings: [
        { text: 'SPA and TSA substantially agreed; two reps & warranties points open pre-signing.', severity: 'caution', source: 'Legal DD' }
      ] },
      { lane: 'esg', owner: 'esg-md', status: 'complete', progress: 100, findings: [
        { text: 'Environmental liabilities ring-fenced and indemnified by the seller.', severity: 'positive', source: 'ESG DD' }
      ] }
    ],
    memoSections: [
      { key: 'execution', title: 'Signing readiness', status: 'in_progress', content: 'SPA/TSA substantially agreed; clean-team findings folded in; targeting signing within the fortnight.', citations: ['SPA v6', 'TSA schedule'] }
    ],
    compliance: [
      { check: 'Clean-team protocol in force', framework: 'Confidentiality', status: 'passed' },
      { check: 'Merger control (EU) filing readiness', framework: 'Antitrust', status: 'in_progress' },
      { check: 'Seller environmental indemnity', framework: 'Legal', status: 'passed' }
    ],
    activity: [
      { actor: 'Deal team — legal execution', action: 'Reconciled SPA v6 against the clean-team markups; 2 points open', when: hoursAgo(20) },
      { actor: 'Deal team — separation', action: 'Finalised the 18-month TSA exit schedule', when: hoursAgo(8) }
    ],
    hoursSaved: 37
  }
];

// A deal that has reached Execution or ownership has already been to committee, so its
// diligence plan, findings report and IC memo exist by definition — they are the papers
// the committee read — and its memo and compliance are signed off. Without this the IC
// readiness verdict has exactly one reachable state across the whole demo record,
// because the artifact check is otherwise satisfied only by running the AI generator.
const PAST_COMMITTEE = /^[EV]/;

// Conditions attach to deals that CLEARED committee subject to closing items — that is
// what a condition is. They sit on post-committee deals for that reason; on a deal that
// is still gated they would be invisible anyway, since the verdict only reports
// conditions once nothing else is outstanding.
const OPEN_CONDITIONS = {
  'demo-greatlakes': [
    { id: 'c-glp-1', text: 'Confirm change-of-control consents on the top-10 customer contracts', owner: 'Legal DD', status: 'proposed' },
    { id: 'c-glp-2', text: 'Working-capital bridge agreed with the vendor before completion', owner: 'Finance MD', status: 'proposed' }
  ],
  'demo-helvetia': [
    { id: 'c-hel-1', text: 'Regulatory clearance filed and acknowledged in both jurisdictions', owner: 'Compliance', status: 'proposed' }
  ]
};

const seedICState = (d) => {
  const stage = String(d.stage || '');
  // Within diligence the papers accumulate with the step, because the steps ARE the
  // papers: you cannot be standing at D3 (draft the IC memo) with no diligence plan and
  // no findings report behind you. Without this every diligence deal reports the same
  // six outstanding items regardless of how far through it is, which is an all-red wall
  // that a partner stops reading by the second week.
  const diligencePapers = {
    D1: {}, // plan being written now — nothing yet on record
    D2: { D1: true },
    D3: { D1: true, D2: true },
    D4: { D1: true, D2: true, D3: true },
    D5: { D1: true, D2: true, D3: true },
  }[stage];
  if (diligencePapers) {
    return Object.keys(diligencePapers).length ? { ...d, icPapers: { ...diligencePapers, ...(d.icPapers || {}) } } : d;
  }
  if (!PAST_COMMITTEE.test(stage)) return d;
  // A deal in Execution or Value has been to committee, so its committee papers exist and
  // it had a recommendation in front of it. That is ALL committee approval implies. It does
  // not mean every compliance check has passed: the EU merger-control filing on an Execution
  // deal is genuinely still running, and that is precisely the substance the record exists
  // to track. An earlier pass forced `compliance` to `passed` and every memo section to
  // `approved` so that these deals would clear the readiness gate — which is clearing a gate
  // by deleting the evidence. The gate no longer applies to a deal past committee
  // (see `dealPhase` in lib/icReadiness.js), so the evidence stays as it stands.
  //
  // An earlier pass ALSO pushed a synthetic memo section here — title "Recommendation",
  // status `approved`, body "Approved at committee.", no citations — on any past-committee
  // deal that lacked one. Deleted. It was written to satisfy the readiness gate, which no
  // longer asks these deals anything; it asserted in a deal document the exact claim this
  // release exists to stop making; and having written it, the system then graded itself
  // against it, because that section satisfies "Recommendation drafted" and counts toward
  // "IC memo sections approved". Manufacturing your own evidence and then marking it is
  // worse than any gap it was covering.
  const conditions = OPEN_CONDITIONS[d.id];
  return {
    ...d,
    icPapers: { D1: true, D2: true, D3: true, ...(d.icPapers || {}) },
    ...(conditions ? { conditions } : {})
  };
};

// Every deal the app seeds into the datastore at boot. lib/store.js inserts any of
// these that the datastore does not already hold, BY ID, and never clobbers one that
// is already there — so a seeded deal becomes a live, mutable record on first boot and
// its subsequent progress survives every restart and redeploy.
export const seededDeals = [...seedDeals, ...demoStageDeals].map(seedICState);
