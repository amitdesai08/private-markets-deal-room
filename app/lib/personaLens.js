// Persona/role ANSWER LENS — the same question must yield a materially different
// answer depending on WHO is asking. A lead partner wants the decision and the risk
// to the thesis; an analyst wants the mechanics and the next task; the fund CFO wants
// returns and structure; the operating partner wants value levers; IR wants the LP read.
//
// The lens is derived from the asker's identity + "view as" role (and, on the persona
// agents, the acting persona). It is injected into every agent prompt so routing,
// specialist consultation and the final composed answer are all framed for the reader.

import { accessFor } from './userPolicy.js';

const LENSES = {
  partner: {
    label: 'Lead Partner (Deal Sponsor)',
    instruction: 'Answer for the LEAD PARTNER who owns the investment decision and the IC vote. Answer the question they actually asked, first sentence. Only open with a recommendation (proceed / hold / pass) when they have asked for a call, a view or a decision — never on a question of fact, ownership or provenance. Be brief and executive: a few sentences or tight bullets, the "so what", and what would change the decision. Skip mechanics unless they change the call.',
  },
  principal: {
    label: 'Principal / VP (Deal Lead)',
    instruction: 'Answer for the PRINCIPAL/VP driving execution. Lead with what is blocking IC readiness, the state of each workstream, and the prioritized next actions to close the gaps. Be specific and action-oriented.',
  },
  analyst: {
    label: 'Analyst / Associate',
    instruction: 'Answer for an ANALYST doing the hands-on work. Show the mechanics: the figures and how they were derived, the exact tasks to progress the deal, and the data/sources to check. More detail is welcome — show your work and name the next task.',
  },
  'fund-cfo': {
    label: 'Fund CFO',
    instruction: 'Answer for the FUND CFO. Lead with returns and structure — base/downside IRR & MOIC vs the hurdle, leverage, sources & uses, and the financing/structuring implications. Money first.',
  },
  'operating-partner': {
    label: 'Operating Partner',
    instruction: 'Answer for the OPERATING PARTNER. Lead with value creation — the EBITDA bridge, the quantified levers, the 100-day plan, and (post-close) how the company tracks vs the underwriting plan.',
  },
  ir: {
    label: 'Investor Relations',
    instruction: 'Answer for INVESTOR RELATIONS. Frame it for LPs — fund-level marks, TVPI/DPI, the ILPA-aligned narrative, and how this reads in a quarterly letter. Avoid deal-team jargon.',
  },
  'retail-md': {
    label: 'Commercial / Sector MD',
    instruction: 'Answer for the COMMERCIAL / SECTOR MD. Lead with the commercial thesis — market, share, growth durability, pricing power, customer concentration — and the commercial risks to the thesis.',
  },
  'ai-md': {
    label: 'AI / Digital MD',
    instruction: 'Answer for the AI / DIGITAL MD. Lead with data & AI readiness, the tech stack, the digital value levers and the technology risks.',
  },
  'supply-md': {
    label: 'Supply Chain / Operations MD',
    instruction: 'Answer for the SUPPLY CHAIN / OPERATIONS MD. Lead with operations — supply chain, procurement/COGS, footprint and tariff exposure, and the operational risks.',
  },
  member: {
    label: 'Read-only stakeholder',
    instruction: 'Answer for a READ-ONLY stakeholder. Keep it high-level and explanatory; give the headline and status, not internal next-steps.',
  },
};

// RBAC tier → default lens when no more-specific acting persona is supplied.
const ROLE_TO_LENS = { admin: 'partner', partner: 'partner', 'deal-team': 'principal', analyst: 'analyst', member: 'member' };

function normalizeKey(k) {
  if (!k) return null;
  const s = String(k).toLowerCase().trim();
  if (LENSES[s]) return s;
  if (ROLE_TO_LENS[s]) return ROLE_TO_LENS[s];
  if (/lead.?partner|sponsor/.test(s)) return 'partner';
  if (/cfo|finance/.test(s)) return 'fund-cfo';
  if (/operat/.test(s)) return 'operating-partner';
  if (/investor|^ir$|\bir\b|\blp\b/.test(s)) return 'ir';
  if (/vp|principal/.test(s)) return 'principal';
  if (/associate|analyst/.test(s)) return 'analyst';
  if (/ai|digital/.test(s)) return 'ai-md';
  if (/supply|operations|\bops\b/.test(s)) return 'supply-md';
  if (/retail|commercial|sector/.test(s)) return 'retail-md';
  return null;
}

// Resolve the lens object for an asker. Precedence: explicit acting persona > view-as
// role > the RBAC role from accessFor. Returns null when nothing resolves.
export function resolveLens({ identity = null, viewAsRole = null, persona = null } = {}) {
  let key = normalizeKey(persona) || normalizeKey(viewAsRole);
  if (!key) {
    try { key = ROLE_TO_LENS[accessFor(identity, viewAsRole).role] || null; } catch { key = null; }
  }
  return key ? { key, ...LENSES[key] } : null;
}

// The prompt block to prepend to an agent input. Empty string when no lens resolves,
// so callers can splice it in unconditionally.
export function lensBlock(opts) {
  const lens = resolveLens(opts);
  if (!lens) return '';
  return `ANSWER LENS — The person asking is a ${lens.label}. ${lens.instruction} The SAME question must yield a materially different answer for a different role; tailor emphasis, depth and what you lead with accordingly. Do NOT print a role header in the answer.`;
}
