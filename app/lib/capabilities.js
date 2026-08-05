// Role-aware capability self-description — "what can you do?".
//
// So a user (especially a NEW one) can ask the Deal Room assistant, cold, what it can
// do FOR THEM and get an honest answer scoped to their role — mapped from their Entra
// identity (see userPolicy.roleForUser: oid / UPN / group -> role). The orchestrator
// delegates to the purpose-based agents (see /SKILLS.md); this module describes those
// capabilities filtered to what the caller's role + need-to-know actually allow.
//
// Deterministic (no model call): capability questions are answered from this map, so the
// "help me get started" experience is instant and always correct + scoped.

// Purpose-based agents (target topology, see docs/AGENTS.md) + the skills each runs and
// the deal stage it serves. `needs` gates the DETAIL: 'read' = any role may ask; 'stage2'
// = full detail needs deal-team access (others get status-only); 'write' = an action.
const CAPABILITIES = [
  {
    agent: 'Sourcing', purpose: 'Find, map and qualify new targets from signals, news & filings',
    skills: ['deal-sourcing', 'market-map', 'competitive-analysis'],
    stage: 'Origination', needs: 'read',
    asks: ['What should we source next in industrials?', 'Map the competitive landscape for a target.'],
  },
  {
    agent: 'Screening', purpose: 'Screen a target against the fund mandate, comps and unit economics',
    skills: ['deal-screening', 'comps-analysis', 'unit-economics', 'ai-readiness'],
    stage: 'Screening', needs: 'read',
    asks: ['Screen this company against our mandate.', 'Pull trading & transaction comps for it.'],
  },
  {
    agent: 'Diligence', purpose: 'Plan and run diligence, surface red-flag risks by workstream',
    skills: ['dd-checklist', 'dd-meeting-prep', 'competitive-analysis'],
    stage: 'Diligence (Stage 2)', needs: 'stage2',
    asks: ['Build the diligence plan for this deal.', 'What are the top red-flag risks?'],
  },
  {
    agent: 'Modelling', purpose: 'Build the returns case — LBO, DCF, 3-statement and comps',
    skills: ['lbo-model', 'dcf-model', '3-statement-model', 'returns-analysis'],
    stage: 'Diligence / Execution', needs: 'read',
    asks: ['Build the LBO — base IRR & MOIC vs the hurdle.', 'Run a base / bull / bear returns sensitivity.'],
  },
  {
    agent: 'IC Memo', purpose: 'Draft the IC memo and deck, and audit every figure to a source',
    skills: ['ic-memo', 'deck-refresh', 'citation-audit'],
    stage: 'Approval (Stage 3)', needs: 'stage2',
    asks: ['Draft the IC memo for this deal.', 'Is every number in the memo sourced?'],
  },
  {
    agent: 'Value Creation & Portfolio', purpose: 'Own the value-creation plan and monitor the portfolio vs the underwriting',
    skills: ['value-creation-plan', 'portfolio-monitoring', 'returns-analysis'],
    stage: 'Ownership (Stage 4)', needs: 'read',
    asks: ['Draft the 100-day value-creation plan.', 'Which portfolio company is off-plan, and why?'],
  },
];

const WRITE_EXAMPLES = [
  'Launch diligence on this deal.',
  'Record a commercial finding (own workstream).',
  'Advance the deal to the next step.',
];

// The structured, role-scoped capability profile.
export function capabilitiesFor(access) {
  const stage2 = !!access.canViewStage2;
  const write = !!access.canWrite;
  const capabilities = CAPABILITIES.map((c) => ({
    agent: c.agent,
    purpose: c.purpose,
    stage: c.stage,
    skills: c.skills,
    // 'read' capabilities are available to everyone (detail still gated per deal);
    // 'stage2' capabilities need deal-team access for the confidential detail.
    detail: c.needs === 'stage2' ? (stage2 ? 'full' : 'status') : 'full',
    asks: c.asks,
  }));
  return {
    role: access.role,
    roleLabel: access.roleLabel,
    isAdmin: !!access.isAdmin,
    canWrite: write,
    canViewStage2: stage2,
    capabilities,
    writeActions: write ? WRITE_EXAMPLES : [],
    limits: buildLimits(access),
  };
}

function buildLimits(access) {
  const limits = [];
  // Access stopped being a property of the role and became a property of the deal when
  // need-to-know landed: an analyst named on a deal team gets the whole workspace for
  // THAT deal and status only elsewhere. This line still announced the old rule, so the
  // same seat was told it "sees status only" and then handed a full risk register,
  // entry multiple and returns model on its own deals. A reader who catches the product
  // contradicting itself about permissions stops believing it about anything.
  if (!access.canViewStage2) limits.push('Past screening, the detail (findings, terms, financing, valuations) is limited to each deal\u2019s own team. On the deals you are named on you see everything; on the rest you see status only.');
  if (!access.canWrite) limits.push('You have read-only access — I analyse and recommend; the deal team records the formal actions.');
  limits.push('Confidential deals you are not on the team for are hidden — I will never surface a deal or figure your role cannot access.');
  return limits;
}

// A ready-to-send markdown answer for "what can you do?", scoped to the caller's role.
export function capabilitiesNarrative(access) {
  const cap = capabilitiesFor(access);
  const lines = [];
  lines.push(`**What I can do for you — ${cap.roleLabel}**`);
  lines.push('');
  lines.push("I'm the Deal Room assistant. I delegate to purpose-built agents and answer grounded in the live deal record — always scoped to what your role can see:");
  lines.push('');
  for (const c of cap.capabilities) {
    const tag = c.detail === 'status' ? ' _(status-only for your role)_' : '';
    lines.push(`- **${c.agent}** — ${c.purpose} · _${c.stage}_${tag}\n  e.g. "${c.asks[0]}"`);
  }
  if (cap.writeActions.length) {
    lines.push('');
    lines.push(`You can also **act** (your role can write): ${cap.writeActions.map((a) => `"${a}"`).join(' · ')}`);
  }
  if (cap.limits.length) {
    lines.push('');
    lines.push('**Your access:** ' + cap.limits.join(' '));
  }
  lines.push('');
  lines.push('Just ask in plain language — e.g. "what should we source next?", "is this deal IC-ready?", or "build the LBO".');
  return lines.join('\n');
}

// Heuristic: is the user asking what the assistant can do / how to get started?
export function isCapabilityQuestion(message) {
  const m = String(message || '').toLowerCase().trim();
  return /\b(what can (you|this|i)|what (are|do) you (do|capable)|what are you capable of|your capabilities|what can i (ask|do)|how (can|do) you help|help me get started|where do i start|what should i ask|what are your (skills|capabilities))\b/.test(m);
}
