// Demo profiles — a named showcase persona for each RBAC role, so the identity-aware
// access model is demoable without provisioning real users. Each profile pins a
// character (from ./personas.js where applicable) to a role, which the orchestrator
// resolves into the agents that identity may call and the roles it can "view as".
//
// These are ONLY honoured when DEMO_PROFILES is enabled (see lib/userPolicy.js and
// the `deployDemoProfiles` infra toggle); a production deploy with the flag off
// never grants a role by demo name.

import { personaById } from './personas.js';

// role → the persona character that fronts it in the demo. Admin has no persona
// lane (it is a cross-cutting oversight role), so it is described inline.
const SPEC = [
  { id: 'admin', role: 'admin', personaId: null, name: 'Sam Rivera', title: 'Platform Administrator', initials: 'SR', color: '#334155',
    blurb: 'Oversight & governance — sees and can call every agent, and can view the deal room as any role.' },
  { id: 'partner', role: 'partner', personaId: 'partner', initials: 'EB',
    blurb: 'Sponsors the deal and chairs the IC — full access to every agent and every stage.' },
  { id: 'retail-md', role: 'deal-team', personaId: 'retail-md', initials: 'JW',
    blurb: 'Owns commercial diligence — deal-team access to the sector, tech and ops agents.' },
  { id: 'ai-md', role: 'deal-team', personaId: 'ai-md', initials: 'PN',
    blurb: 'Owns AI & digital value — deal-team access to the sector, tech and ops agents.' },
  { id: 'supply-md', role: 'deal-team', personaId: 'supply-md', initials: 'DM',
    blurb: 'Owns operations & supply chain — deal-team access to the sector, tech and ops agents.' },
  { id: 'principal', role: 'deal-team', personaId: 'principal', initials: 'MF',
    blurb: 'Runs the deal end-to-end — coordinates the workstreams and owns the IOI/LOI into IC.' },
  { id: 'operating-partner', role: 'deal-team', personaId: 'operating-partner', initials: 'RN',
    blurb: 'Owns value creation — the 100-day plan, EBITDA bridge and value-creation levers.' },
  { id: 'fund-cfo', role: 'deal-team', personaId: 'fund-cfo', initials: 'DO',
    blurb: 'Owns the returns case — LBO/IRR/MOIC, sources & uses, financing and covenant headroom.' },
  { id: 'legal-gc', role: 'deal-team', personaId: 'legal-gc', initials: 'PR',
    blurb: 'Owns legal diligence & execution — SPA, reps & warranties, KYC/AML and clearance.' },
  { id: 'ir-lp', role: 'partner', personaId: 'ir-lp', initials: 'SM',
    blurb: 'Owns the LP lens — fund-level exposure, ILPA/SFDR reporting and portfolio concentration.' },
  { id: 'analyst', role: 'analyst', personaId: 'analyst', initials: 'MO',
    blurb: 'Sources & screens targets — read-only analyst access, Stage 1 only.' },
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
  };
});

export const demoProfileById = Object.fromEntries(demoProfiles.map((p) => [p.id, p]));

// role → the demo identity ids that map to it (lowercased for matching).
export const demoRoleIds = demoProfiles.reduce((acc, p) => {
  (acc[p.role] ||= []).push(p.id.toLowerCase());
  return acc;
}, {});
