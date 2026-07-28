// Demo profiles — a named showcase persona for each RBAC role, so the identity-aware
// access model is demoable without provisioning real users. Each profile pins a
// character (from ./personas.js where applicable) to a role, which the orchestrator
// resolves into the agents that identity may call and the roles it can "view as".
//
// These are ONLY honoured when DEMO_PROFILES is enabled (see lib/userPolicy.js and
// the `deployDemoProfiles` infra toggle); a production deploy with the flag off
// never grants a role by demo name.

import { personaById } from './personas.js';

// A MINIMAL showcase roster — one character per RBAC tier, so the demo shows the
// access SEPARATION and guardrails without a crowd of look-alike deal-team profiles.
// Themed after The Good Place, mapped by personality:
//   • Michael Realman (the Architect who designs & runs the neighbourhood) → Administrator.
//   • Eleanor Shellstrop (the reluctant leader who makes the hard call)   → Partner / IC chair.
//   • Tahani Al-Jamil (the consummate connector & value-builder)          → Deal Team.
//   • Chidi Anagonye (the rigorous over-thinker who reads every source)   → Analyst (read-only).
//   • Jason Mendoza (along for the ride, out of his depth)                → Member / observer (floor).
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
