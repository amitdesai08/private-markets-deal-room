// The end-to-end deal flow from Slide 5 — the single spine the whole app is
// built around: "From the screening funnel into the Deal Collaboration Hub on
// M365". Two stages joined by the PURSUE gate; nine sequential steps. Every step
// is described with the same atoms so the UI can render one uniform "station":
//   what   — what happens in this step (from the slide)
//   agent  — the orchestration agent that does the heavy lifting
//   inputs — what feeds the step
//   produces — the artifacts it hands to the next step
//   m365   — the Microsoft 365 / CRM collaboration surfaces
//   owner  — who owns the decision
//   panel  — optional deal-data panel to surface (lanes / memo / compliance / audit)

export const STAGES = [
  {
    id: 'origination',
    num: 1,
    name: 'Origination & Screening',
    tagline: 'The screening funnel',
    accent: '#2563eb',
    dataSources: [
      { group: 'External', items: ['FactSet', 'Capital IQ', 'PitchBook', 'Morningstar', 'Web', 'Analyst reports'] },
      { group: 'Internal / M365', items: ['Work IQ', 'Dynamics 365 CRM', 'Policies DB', 'Model repository', 'SharePoint'] }
    ],
    skills: ['@deal-screening', '@comps-analysis']
  },
  {
    id: 'diligence',
    num: 2,
    name: 'Diligence & Approval',
    tagline: 'The Deal Collaboration Hub',
    accent: '#c2410c',
    dataSources: [
      { group: 'Work surfaces', items: ['Teams', 'Excel', 'PowerPoint', 'Word', 'SharePoint'] },
      { group: 'Intelligence', items: ['Work IQ', 'Fabric IQ', 'Foundry IQ', 'Purview'] }
    ],
    skills: ['@diligence-planner', '@ic-memo']
  },
  {
    id: 'execution',
    num: 3,
    name: 'Execution & Closing',
    tagline: 'From IC approval to close',
    accent: '#059669',
    dataSources: [
      { group: 'Deal execution', items: ['Financing model', 'SPA & legal', 'Data room', 'CP checklist'] },
      { group: 'Work surfaces', items: ['Teams', 'Word', 'Excel', 'SharePoint', 'Purview'] }
    ],
    skills: ['@financing-structuring', '@closing-orchestration']
  }
];

export const GATE = {
  label: 'PURSUE',
  detail: 'Power Automate spins up the deal collaboration space',
  afterStep: 'O4'
};

export const STEPS = [
  {
    key: 'O1',
    stage: 'origination',
    code: 'O1',
    title: 'Deal Sourcing',
    what: 'The analyst evaluates CxO conversations, emails, key relationships, news, conference notes and financial statements — assessing each signal against pre-defined investment mandates.',
    agent: 'Deal-Sourcing Signal Agent',
    inputs: ['CxO signals', 'News & filings', 'Analyst reports', 'Investment mandates'],
    produces: ['CRM record created', 'Mandate-fit assessment'],
    m365: ['Dynamics 365 CRM'],
    m365Action: 'Create the CRM record as the target moves to auto-screen',
    owner: 'Analyst',
    actionLabel: 'Scan signals & open CRM record'
  },
  {
    key: 'O2',
    stage: 'origination',
    code: 'O2',
    title: 'Auto Screen',
    what: 'The team reviews and validates the sector, technology-lever and supply-chain-risk hypotheses the agents generated — turning raw signals into a cited screening one-pager.',
    agent: 'Target-Screening Agent',
    inputs: ['CRM record', 'Deal estate (Fabric)', 'Internal deal history'],
    produces: ['Screening one-pager (cited)', 'Validated hypotheses'],
    m365: ['Teams', 'Outlook', 'Excel Copilot', 'PowerPoint Copilot'],
    m365Action: 'Collaborate over Teams & email — internally and with target CxOs',
    owner: 'Analyst + Team',
    actionLabel: 'Draft the screening one-pager'
  },
  {
    key: 'O3',
    stage: 'origination',
    code: 'O3',
    title: 'Triage',
    what: 'Precedents are identified and used to generate high-level comps. A strategic-fit assessment against pre-defined criteria is run by the agents and reviewed by the team.',
    agent: 'Pipeline-Prioritization Agent',
    inputs: ['Screening one-pager', 'Precedent transactions', 'Strategic-fit criteria'],
    produces: ['Comparable companies', 'Strategic-fit score'],
    m365: ['Teams', 'Excel Copilot', 'PowerPoint Copilot'],
    m365Action: 'Collaborate over Teams & email — internally and with target CxOs',
    owner: 'Analyst + Team',
    actionLabel: 'Generate comps & strategic-fit score'
  },
  {
    key: 'O4',
    stage: 'origination',
    code: 'O4',
    title: 'Screening Gate',
    what: 'The MD decides based on the inputs. The CRM record is updated to move the deal forward, and the CIM / NDA process is initiated.',
    agent: 'Gateway Orchestration',
    inputs: ['Screening one-pager', 'Comps & fit score', 'MD judgement'],
    produces: ['Screening decision', 'CIM requested', 'NDA initiated', 'CRM updated'],
    m365: ['Teams', 'Outlook', 'Dynamics 365 CRM'],
    m365Action: 'Collaborate over Teams & email — internally and with target CxOs',
    owner: 'Partner / MD',
    actionLabel: 'Record decision · initiate CIM / NDA',
    isGate: true
  },
  {
    key: 'D1',
    stage: 'diligence',
    code: 1,
    title: 'Launch Orchestration',
    what: 'On "pursue", the deal lead requests the deal workspace, prepares templates and assigns ownership across the diligence swimlanes.',
    agent: 'Diligence-Planner Agent',
    inputs: ['Screening decision', 'DD playbook', 'Comparable deals'],
    produces: ['Deal workspace (Teams + SharePoint)', 'DD checklist & templates', 'Lane owners assigned'],
    m365: ['Teams', 'SharePoint', 'Power Automate'],
    m365Action: 'Event-triggered Teams + SharePoint creation',
    owner: 'Partner / MD',
    actionLabel: 'Provision workspace & assign owners'
  },
  {
    key: 'D2',
    stage: 'diligence',
    code: 2,
    title: 'Diligence',
    what: 'The team conducts diligence in their swimlanes — commercial, tech / AI and operations — in parallel, each supported by its own orchestrated agents on the shared record.',
    agent: 'Orchestrated agents (per swimlane)',
    inputs: ['CIM & financials', 'Data room', 'Deal estate (Fabric)'],
    produces: ['Commercial findings', 'Tech / AI findings', 'Operations findings'],
    m365: ['Excel', 'PowerPoint', 'Work IQ', 'Fabric IQ', 'Foundry IQ'],
    m365Action: 'Swimlane collaboration across Teams, Excel & PowerPoint',
    owner: 'Lead MD',
    actionLabel: 'Run the parallel diligence lanes',
    panel: 'lanes'
  },
  {
    key: 'D3',
    stage: 'diligence',
    code: 3,
    title: 'Synthesis',
    what: 'The team synthesizes the diligence findings into an IC memo, collaborating in real time with consistent, cited figures pulled from the live record.',
    agent: 'IC-Memo Agent',
    inputs: ['Diligence findings', 'Deal model', 'Live record'],
    produces: ['IC memo (cited)'],
    m365: ['Word', 'Excel', 'PowerPoint', 'Work IQ'],
    m365Action: 'Real-time co-authoring in Word, Excel & PowerPoint',
    owner: 'Analyst',
    actionLabel: 'Synthesize the IC memo',
    panel: 'memo'
  },
  {
    key: 'D4',
    stage: 'diligence',
    code: 4,
    title: 'Approval & Execution',
    what: 'The IC reviews and approves the memo. Compliance checks clear, the CRM and other records are updated, and next steps are triggered.',
    agent: 'Approval-Orchestration Agent',
    inputs: ['IC memo', 'Compliance checks', 'IC decision'],
    produces: ['IC decision', 'CRM & records updated'],
    m365: ['Teams Copilot', 'Dynamics 365 CRM', 'SharePoint'],
    m365Action: 'Capture the decision in Teams; write conditions back to CRM',
    owner: 'Analyst + MDs',
    actionLabel: 'Route approval & update records',
    panel: 'compliance'
  },
  {
    key: 'D5',
    stage: 'diligence',
    code: 5,
    title: 'Archive',
    what: 'The team archives the deal documents with a full, lineage-tracked audit trail for the regulated record.',
    agent: 'Records & Compliance agents',
    inputs: ['Approved memo', 'All deal artifacts'],
    produces: ['Archived data room', 'Purview audit trail'],
    m365: ['SharePoint', 'Purview'],
    m365Action: 'Archive to SharePoint with a Purview audit trail',
    owner: 'Analyst',
    actionLabel: 'Archive with full audit trail',
    panel: 'audit'
  },
  {
    key: 'E1',
    stage: 'execution',
    code: 1,
    title: 'Financing & Structuring',
    what: 'The Fund CFO finalises the capital structure and arranges the debt & equity financing — building the funds-flow and confirming leverage against the approved IC case.',
    agent: 'Financing-Structuring Agent',
    inputs: ['Approved IC memo', 'Deal model', 'Lender term sheets'],
    produces: ['Final capital structure', 'Debt package secured', 'Funds-flow statement'],
    m365: ['Excel', 'Teams', 'SharePoint'],
    m365Action: 'Model the structure in Excel; coordinate lenders over Teams',
    owner: 'Fund CFO',
    actionLabel: 'Finalise structure & arrange financing'
  },
  {
    key: 'E2',
    stage: 'execution',
    code: 2,
    title: 'Signing (SPA)',
    what: 'Legal negotiates and signs the Sale & Purchase Agreement — locking the reps & warranties, the price mechanism and the conditions precedent to closing.',
    agent: 'Legal-Negotiation Agent',
    inputs: ['Final structure', 'Diligence findings', 'Draft SPA'],
    produces: ['Signed SPA', 'Reps & warranties schedule', 'Conditions precedent (CP) list'],
    m365: ['Word', 'Teams', 'SharePoint', 'Purview'],
    m365Action: 'Co-author and redline the SPA in Word with a Purview audit trail',
    owner: 'General Counsel',
    actionLabel: 'Negotiate & sign the SPA',
    isGate: true
  },
  {
    key: 'E3',
    stage: 'execution',
    code: 3,
    title: 'Closing',
    what: 'The team clears the conditions precedent, runs the funds flow and completes the legal close — transferring ownership and releasing the consideration.',
    agent: 'Closing-Orchestration Agent',
    inputs: ['Signed SPA', 'CP checklist', 'Funds-flow statement'],
    produces: ['CPs cleared', 'Completion / ownership transfer', 'Closing binder'],
    m365: ['Teams', 'SharePoint', 'Power Automate', 'Purview'],
    m365Action: 'Track CP clearance in Teams; archive the closing binder to SharePoint',
    owner: 'General Counsel + Fund CFO',
    actionLabel: 'Clear CPs & complete the close',
    isGate: true
  },
  {
    key: 'E4',
    stage: 'execution',
    code: 4,
    title: 'Onboarding & Handover',
    what: 'The Operating Partner takes the asset into the portfolio — kicking off the 100-day plan and standing up value-creation and monitoring on the shared record.',
    agent: 'Value-Creation Onboarding Agent',
    inputs: ['Completed deal', 'Value-creation thesis', 'IC conditions'],
    produces: ['100-day plan', 'Portfolio company record', 'Monitoring KPIs'],
    m365: ['Teams', 'Planner', 'Excel', 'SharePoint'],
    m365Action: 'Stand up the portfolio workspace & 100-day plan in Teams + Planner',
    owner: 'Operating Partner',
    actionLabel: 'Kick off the 100-day plan & handover'
  }
];

export const STEP_KEYS = STEPS.map((s) => s.key);

export function stepIndex(key) {
  return STEP_KEYS.indexOf(key);
}

export function stepByKey(key) {
  return STEPS.find((s) => s.key === key) || null;
}

export function stageById(id) {
  return STAGES.find((s) => s.id === id) || null;
}

// Backwards-compatible lifecycle list used by any legacy consumers.
export const STAGE_ORDER = STEPS.map((s) => ({ key: s.key, label: s.title, phase: s.stage }));

export const FLOW = { stages: STAGES, steps: STEPS, gate: GATE };

// ---------------------------------------------------------------------------
// The full institutional PE deal lifecycle. The 2-stage FLOW above is the demo
// spine (sourcing → the collaboration hub); this LIFECYCLE is the complete
// mid-market buyout process a fund actually runs, grounded in how deal teams,
// IC, and value-creation operate. It is ADDITIVE — the existing screening/
// diligence UI is unchanged; new surfaces (the Lifecycle view, persona owners)
// consume this. `kind: 'gate'` marks the points where capital/resources are
// committed (IOI, LOI, IC, Signing, Close, Exit). `owner` is the persona id
// (see data/personas.js) accountable for the stage.
export const LIFECYCLE_PHASES = [
  { id: 'origination', num: 1, name: 'Origination & Screening', tagline: 'Find & qualify', accent: '#2563eb' },
  { id: 'execution', num: 2, name: 'Diligence & Execution', tagline: 'Diligence, decide, close', accent: '#c2410c' },
  { id: 'ownership', num: 3, name: 'Ownership & Exit', tagline: 'Create value, realize', accent: '#0d9488' },
];

export const LIFECYCLE = [
  // ── Phase 1 · Origination & Screening ─────────────────────────────────────
  {
    num: 1, phase: 'origination', id: 'mandate', kind: 'stage', name: 'Fund strategy & mandate',
    owner: 'partner', personas: ['partner', 'principal'],
    summary: 'Set the investment thesis, target themes and hard mandate gates the pipeline is measured against.',
    produces: ['Investment thesis', 'Theme map', 'Fund mandate gates'], mapsToSteps: [],
  },
  {
    num: 2, phase: 'origination', id: 'sourcing', kind: 'stage', name: 'Deal sourcing',
    owner: 'analyst', personas: ['analyst', 'principal'],
    summary: 'Proprietary + intermediated origination — CxO signals, bankers, inbound CIMs — scored against the mandate.',
    produces: ['CRM record', 'Mandate-fit assessment'], mapsToSteps: ['O1'],
  },
  {
    num: 3, phase: 'origination', id: 'screening', kind: 'stage', name: 'Screening & triage',
    owner: 'analyst', personas: ['analyst', 'principal'],
    summary: 'Turn raw signals into a cited screening one-pager; triage against the mandate and internal deal history.',
    produces: ['Screening one-pager', 'Triage decision'], mapsToSteps: ['O2', 'O3'],
  },
  {
    num: 4, phase: 'origination', id: 'pursue', kind: 'gate', name: 'Screening gate — PURSUE',
    owner: 'partner', personas: ['partner'],
    summary: 'The sponsor records PURSUE on the gate-ready shortlist, committing the deal team and spinning up the collaboration space.',
    produces: ['PURSUE decision', 'Deal channel + SharePoint data room'], mapsToSteps: ['O4'],
  },
  // ── Phase 2 · Diligence & Execution ───────────────────────────────────────
  {
    num: 5, phase: 'execution', id: 'ioi', kind: 'gate', name: 'Initial review & IOI',
    owner: 'principal', personas: ['principal', 'partner'],
    summary: 'First management meeting and a preliminary valuation; decide whether to submit a non-binding Indication of Interest before spending diligence resources.',
    produces: ['Preliminary valuation', 'Indication of Interest (IOI)'], mapsToSteps: [],
  },
  {
    num: 6, phase: 'execution', id: 'dataroom', kind: 'stage', name: 'NDA & data room / CIM intake',
    owner: 'analyst', personas: ['analyst', 'principal'],
    summary: 'Sign the NDA, ingest the CIM and data room, and run a preliminary commercial & financial read.',
    produces: ['Executed NDA', 'CIM synthesis', 'Preliminary DD read'], mapsToSteps: [],
  },
  {
    num: 7, phase: 'execution', id: 'loi', kind: 'gate', name: 'LOI / term sheet',
    owner: 'partner', personas: ['partner', 'principal'],
    summary: 'Submit a non-binding Letter of Intent with indicative price, structure and exclusivity.',
    produces: ['Letter of Intent (LOI)', 'Exclusivity'], mapsToSteps: [],
  },
  {
    num: 8, phase: 'execution', id: 'diligence', kind: 'stage', name: 'Confirmatory diligence & QoE',
    owner: 'principal', personas: ['principal', 'retail-md', 'ai-md', 'supply-md', 'operating-partner', 'legal-gc'],
    summary: 'Full workstreams — commercial, Quality of Earnings (financial), legal, tax, operational, tech/AI, ESG, insurance — on the live record.',
    produces: ['QoE report', 'Lane findings', 'Risk register'], mapsToSteps: ['D1', 'D2'],
  },
  {
    num: 9, phase: 'execution', id: 'ic', kind: 'gate', name: 'Investment Committee',
    owner: 'partner', personas: ['partner', 'principal', 'fund-cfo'],
    summary: 'IC memo and pack go to the committee; the IC votes and sets conditions precedent.',
    produces: ['IC memo & pack', 'IC decision', 'Conditions'], mapsToSteps: ['D3', 'D4'],
  },
  {
    num: 10, phase: 'execution', id: 'financing', kind: 'stage', name: 'Financing & capital structure',
    owner: 'fund-cfo', personas: ['fund-cfo', 'partner'],
    summary: 'Arrange leverage and equity — sources & uses, debt schedule, covenant headroom, lender commitments.',
    produces: ['Sources & uses', 'Debt commitment', 'Capital structure'], mapsToSteps: [],
  },
  {
    num: 11, phase: 'execution', id: 'signing', kind: 'gate', name: 'SPA negotiation & signing',
    owner: 'legal-gc', personas: ['legal-gc', 'partner'],
    summary: 'Negotiate definitive agreements — SPA, reps & warranties, W&I insurance, disclosure schedules — and sign.',
    produces: ['Signed SPA', 'Reps & warranties / W&I', 'Disclosure schedules'], mapsToSteps: [],
  },
  {
    num: 12, phase: 'execution', id: 'closing', kind: 'stage', name: 'Closing / completion',
    owner: 'legal-gc', personas: ['legal-gc', 'fund-cfo'],
    summary: 'Clear conditions precedent and regulatory/antitrust approvals, run the funds flow, and complete the acquisition.',
    produces: ['Regulatory clearance', 'Funds flow', 'Completion'], mapsToSteps: ['D4', 'D5'],
  },
  // ── Phase 3 · Ownership & Exit ────────────────────────────────────────────
  {
    num: 13, phase: 'ownership', id: 'valuecreation', kind: 'stage', name: 'Value creation & 100-day',
    owner: 'operating-partner', personas: ['operating-partner', 'principal'],
    summary: 'Stand up the board, execute the 100-day plan and the value-creation plan (pricing, cost-out, AI, buy-and-build), and baseline KPIs.',
    produces: ['100-day plan', 'Value-creation plan (VCP)', 'KPI baseline'], mapsToSteps: [],
  },
  {
    num: 14, phase: 'ownership', id: 'monitoring', kind: 'stage', name: 'Portfolio monitoring & add-ons',
    owner: 'operating-partner', personas: ['operating-partner', 'ir-lp', 'fund-cfo'],
    summary: 'Quarterly KPI monitoring, buy-and-build add-ons, and LP reporting against the value-creation plan.',
    produces: ['Quarterly KPIs', 'Add-on pipeline', 'LP reporting'], mapsToSteps: [],
  },
  {
    num: 15, phase: 'ownership', id: 'exit', kind: 'gate', name: 'Exit',
    owner: 'partner', personas: ['partner', 'fund-cfo', 'ir-lp'],
    summary: 'Assess exit readiness and run a dual-track (M&A / IPO) realization; attribute returns (IRR / MOIC) back to the thesis.',
    produces: ['Exit readiness', 'Realization', 'Returns attribution (IRR / MOIC)'], mapsToSteps: [],
  },
];

export const LIFECYCLE_GATES = LIFECYCLE.filter((s) => s.kind === 'gate').map((s) => s.id);

export function lifecycleByPhase() {
  return LIFECYCLE_PHASES.map((ph) => ({ ...ph, stages: LIFECYCLE.filter((s) => s.phase === ph.id) }));
}
