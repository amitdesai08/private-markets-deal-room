// Demo profiles — a named showcase persona for each RBAC role, so the identity-aware
// access model is demoable without provisioning real users. Each profile pins a
// character (from ./personas.js where applicable) to a role, which the orchestrator
// resolves into the agents that identity may call and the roles it can "view as".
//
// These are ONLY honoured when DEMO_PROFILES is enabled (see lib/userPolicy.js and
// the `deployDemoProfiles` infra toggle); a production deploy with the flag off
// never grants a role by demo name.

import { personaById } from './personas.js';

// The showcase roster. The first tier of profiles maps ONE character per RBAC tier so the
// demo shows the access SEPARATION and guardrails (admin / partner / deal-team / analyst /
// member). Themed after The Good Place, mapped by personality:
//   • Michael Realman (the Architect who designs & runs the neighbourhood) → Administrator.
//   • Eleanor Shellstrop (the reluctant leader who makes the hard call)   → Partner / IC chair.
//   • Tahani Al-Jamil (the consummate connector & value-builder)          → Deal Team.
//   • Chidi Anagonye (the rigorous over-thinker who reads every source)   → Analyst (read-only).
//   • Jason Mendoza (along for the ride, out of his depth)                → Member / observer (floor).
// The second tier pins the SPECIFIC sector / functional partners (AI Partner, Supply Chain
// Partner, Commercial Partner, Fund CFO, Principal, Operating Partner) — each mapped to its
// persona so signing in AS them makes the assistant answer in that partner's domain voice.
//
// These are ONLY honoured when DEMO_PROFILES is enabled (see lib/userPolicy.js and
// the `deployDemoProfiles` infra toggle); a production deploy with the flag off
// never grants a role by demo name.
const SPEC = [
  { id: 'admin', role: 'admin', personaId: null, name: 'Michael Realman', title: 'The Architect — Administrator', initials: 'MR', color: '#7c3aed',
    blurb: 'The Architect who runs the neighbourhood. Oversight & governance — sees every deal and every stage, works with every specialist, and can view the room as any role.' },
  { id: 'partner', role: 'partner', personaId: 'partner', name: 'Eleanor Shellstrop', title: 'Partner — Deal Sponsor & IC Chair', initials: 'ES', color: '#be123c',
    blurb: 'The reluctant leader who makes the call. Sponsors the deal and chairs the IC — full access to every deal and every stage.' },
  { id: 'deal-team', role: 'deal-team', personaId: 'operating-partner', name: 'Tahani Al-Jamil', title: 'Deal Team — Value Creation', initials: 'TA', color: '#0d9488',
    blurb: 'The consummate connector and value builder. Deal-team access — Stage 2 diligence, the workstreams and the value-creation plan. No territory limit — sees every region.' },
  { id: 'regional-md', role: 'partner', personaId: null, name: 'Riley West', title: 'Regional MD — West Coast territory', initials: 'RW', color: '#0369a1', regionScope: ['northwest', 'southwest'],
    blurb: 'Managing director over the West Coast TERRITORY (Northwest + Southwest). Full deal-team powers, but scoped to West Coast deals only — other regions stay out of view. Shows the grouped-region manager pattern.' },
  // Specific deal-team specialists — sign in AS the sector / functional partner and the
  // assistant answers in THEIR voice (each maps to a persona → the persona lens). Deal-team
  // access; each owns their diligence lane. This is what the feedback asked for: not just
  // "MD / Partner" but AI Partner, Supply Chain Partner, Commercial Partner, Fund CFO, etc.
  { id: 'ai-md', role: 'deal-team', personaId: 'ai-md', name: 'Dr. Priya Nair', title: 'AI Partner — Tech & Digital Value', initials: 'PN', color: '#7e22ce',
    blurb: 'AI & digital-value lead. Owns the Tech/AI diligence lane — data & AI readiness, the tech stack and the digital EBITDA levers. The assistant answers in the AI partner\'s voice.' },
  { id: 'supply-md', role: 'deal-team', personaId: 'supply-md', name: 'Diego Marquez', title: 'Supply Chain Partner — Operations', initials: 'DM', color: '#b45309',
    blurb: 'Operations & supply-chain lead. Owns the Operations lane — supplier map, tariff exposure, COGS bridge and footprint. The assistant answers in the supply-chain partner\'s voice.' },
  { id: 'retail-md', role: 'deal-team', personaId: 'retail-md', name: 'James Whitfield', title: 'Commercial Partner — Sector & Growth', initials: 'JW', color: '#0e7490',
    blurb: 'Commercial / sector lead. Owns the Commercial lane — market, share, growth durability, pricing power and customer concentration. The assistant answers in the commercial partner\'s voice.' },
  { id: 'fund-cfo', role: 'deal-team', personaId: 'fund-cfo', name: 'David Osei', title: 'Finance Partner — Fund CFO', initials: 'DO', color: '#a16207',
    blurb: 'Finance & financing lead. Owns the LBO / returns model, sensitivities and sources & uses. The assistant answers in the Fund CFO\'s voice — returns and structure first.' },
  { id: 'principal', role: 'deal-team', personaId: 'principal', name: 'Marcus Feld', title: 'Principal — Deal Lead', initials: 'MF', color: '#0d9488',
    blurb: 'Deal lead / VP driving execution — IOI / LOI, the diligence plan and the path to IC. The assistant answers in the deal lead\'s voice — what\'s blocking IC and the next actions.' },
  { id: 'operating-partner', role: 'deal-team', personaId: 'operating-partner', name: 'Rachel Nguyen', title: 'Operating Partner — Value Creation', initials: 'RN', color: '#0f766e',
    blurb: 'Value-creation lead — the 100-day plan, the EBITDA bridge and portfolio monitoring vs the underwriting. The assistant answers in the operating partner\'s voice.' },
  { id: 'analyst', role: 'analyst', personaId: 'analyst', name: 'Chidi Anagonye', title: 'Analyst — Northeast desk', initials: 'CA', color: '#2563eb', regionScope: ['northeast'],
    blurb: 'The rigorous over-thinker who reads every source. Read-only analyst scoped to a SINGLE region (Northeast) — sources, screens and models Northeast deals in Stage 1; other territories and confidential deals stay hidden.' },
  { id: 'member', role: 'member', personaId: null, name: 'Jason Mendoza', title: 'Member — Observer', initials: 'JM', color: '#64748b',
    blurb: 'Along for the ride, out of his depth. View-only — sees the portfolio dashboard but has no specialist access and cannot act. The guardrail floor.' },
];

export const demoProfiles = SPEC.map((p) => {
  const persona = p.personaId ? personaById[p.personaId] : null;
  return {
    id: p.id,
    upn: p.id,
    role: p.role,
    personaId: p.personaId,
    name: p.name || persona?.name || p.id,
    title: p.title || persona?.title || '',
    initials: p.initials,
    color: p.color || persona?.color || '#475569',
    blurb: p.blurb,
    // Territory (region) scope for the demo — base region keys this profile is
    // limited to (empty = sees all regions). Resolved in userPolicy.regionsForIdentity.
    regionScope: p.regionScope || [],
  };
});

export const demoProfileById = Object.fromEntries(demoProfiles.map((p) => [p.id, p]));

// role → the demo identity ids that map to it (lowercased for matching).
export const demoRoleIds = demoProfiles.reduce((acc, p) => {
  (acc[p.role] ||= []).push(p.id.toLowerCase());
  return acc;
}, {});
