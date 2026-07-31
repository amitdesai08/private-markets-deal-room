// WHOSE DESK IS THIS? — resolving a viewer into the work they are accountable for.
//
// The Deal Room already carries two facts about a viewer, and they answer different
// questions:
//
//   role    (admin / partner / deal-team / analyst / member)
//           WHAT AM I CLEARED TO SEE. Enforced in userPolicy.js. This is a security
//           boundary and nothing in this file may widen it.
//
//   persona (supply-md / fund-cfo / legal-gc / partner / analyst / ...)
//           WHAT AM I ACCOUNTABLE FOR. Until now this only reframed how the assistant
//           worded an answer. It never changed what the home page showed, which is why
//           a Supply Chain Partner and a Fund CFO opened the app to a byte-identical
//           portfolio briefing about legal and commercial gaps neither of them owns.
//
// This module turns the second fact into something computable: which diligence lanes
// this seat OWNS, and therefore which rows on the home page are that person's problem
// rather than someone else's.
//
// THE BINDING IS NOT INVENTED. Every persona in data/personas.js already declares a
// `lane`, and data/workspace.js already declares the seven first-class diligence lanes
// with an owning MD per lane. This file only joins the two, and states plainly where
// the join does not exist rather than guessing.
//
// WHAT THIS DOES NOT DO: it never filters the deal list. A seat's lanes change the
// ORDER and the WORDING of what a viewer sees about deals they are already cleared to
// open — it is a lens, not a second access-control layer. Hiding a deal from a partner
// because it is "not their lane" would be a product deciding what a partner may know.

import { personaById } from '../data/personas.js';
import { LANE_ORDER } from '../data/workspace.js';
import { demoProfileById } from '../data/demoProfiles.js';
import { demoModeActive } from './userPolicy.js';

// Human labels for the seven first-class diligence lanes, so a seat can be described
// in the words the workspace uses rather than a key.
export const LANE_LABEL = {
  commercial: 'Commercial',
  financial: 'Financial / QoE',
  legal: 'Legal',
  tax: 'Tax & structuring',
  techai: 'Tech & AI',
  operations: 'Operations',
  esg: 'ESG',
};

// persona.lane -> the diligence lane(s) that persona actually owns on a deal record.
//
// Five personas map onto a lane one-for-one. The rest are cross-cutting: an IC chair,
// a deal lead, an analyst, an operating partner and an IR lead do not own a diligence
// lane, they own an outcome that spans all of them. Pretending otherwise — handing the
// IC chair the "legal" lane because it had to be given something — would put a name
// against work that person does not do.
const PERSONA_LANES = {
  commercial: ['commercial'],
  techai: ['techai'],
  operations: ['operations'],
  legal: ['legal'],
  // The Fund CFO's stated focus is "the returns case and the capital structure — LBO
  // model, IRR/MOIC, sources & uses, debt and covenant headroom". Sources & uses IS the
  // structuring question, so tax & structuring belongs on this desk; leaving it
  // unowned meant a first-class lane could go late with nobody's home page showing it.
  finance: ['financial', 'tax'],
};

// Lanes no persona in the roster owns. Named explicitly rather than left as an
// accident of the map above: if a deal is blocked on ESG, no seat in this product will
// surface it, and that is a gap worth being able to see rather than one to discover on
// stage. LANE_ORDER is the source of truth for what exists.
export const UNOWNED_LANES = LANE_ORDER.filter((l) => !Object.values(PERSONA_LANES).flat().includes(l));

// What the seat is FOR. Drives which question the home page leads with. Each kind is a
// genuinely different job, not a different colour scheme:
//
//   lane      — I own a diligence lane. Show me my lane, everywhere it is late.
//   committee — I chair or sponsor the gate. Show me what is ready to table and what is not.
//   deal-lead — I run deals end to end. Show me which lane is blocking MY deals.
//   screening — I source and screen. Show me what is early and what needs work to progress.
//   value     — I own value creation post-close. Show me the owned portfolio.
//   lp        — I face investors. Show me fund-level exposure.
//   oversight — I administer the platform. Show me everything, unweighted, and say so.
//   observer  — I can see status and nothing else. Say that plainly instead of pretending.
const PERSONA_KIND = {
  ic: 'committee',
  'deal-lead': 'deal-lead',
  screening: 'screening',
  valuecreation: 'value',
  ir: 'lp',
};

/**
 * Resolve a viewer into a seat.
 *
 * `persona` is the persona id the viewer is bound to (see personaForIdentity in
 * userPolicy.js). `role` is their RBAC role and is used ONLY to describe seats that
 * have no persona binding at all — an administrator, or any production user before
 * personas are assigned in the tenant.
 */
export function seatFor({ role = null, persona = null } = {}) {
  const p = persona ? personaById[persona] : null;
  const lanes = p ? (PERSONA_LANES[p.lane] || []).filter((l) => LANE_ORDER.includes(l)) : [];
  // A persona whose lane we do not recognise gets NO kind rather than being quietly
  // filed as a deal lead. The old `|| 'deal-lead'` meant any persona added later would
  // silently render someone else's home page — confidently, and wrongly. A null kind
  // makes the page admit it is not tailored, which is the honest failure.
  const kind = lanes.length ? 'lane'
    : p ? (PERSONA_KIND[p.lane] || null)
    : role === 'admin' ? 'oversight'
    : role === 'member' ? 'observer'
    : null;
  return {
    personaId: p?.id || null,
    // The persona's own short label ("Supply MD"), not the RBAC role label. A viewer
    // whose seat is Operations should not be told their desk is "Deal Team" — that is
    // their clearance, not their job.
    label: p?.short || p?.title || null,
    focus: p?.focus || null,
    lanes,
    laneLabels: lanes.map((l) => LANE_LABEL[l] || l),
    kind,
    // True when we could not bind this viewer to a persona at all, OR when we bound one
    // whose job we do not model. Either way the home page says so out loud rather than
    // silently serving the generic portfolio view as if it were tailored.
    unbound: !p || !kind,
  };
}

/**
 * The seat a demo showcase profile occupies. Demo profiles are the ONLY place a
 * persona is currently bound to an identity — in a real tenant nobody has been
 * assigned one yet, so this returns null and the home page degrades to the portfolio
 * view WITH a line admitting it is not tailored.
 *
 * Gated on demo mode being ACTIVE, for the same reason demoRegionScopeFor is. The
 * lookup keys include identity.name, and name is attacker-influenced on the demo
 * "view as" path — so without this gate a production deploy with DEMO_PROFILES off
 * would still let a caller select a seat by naming it. The seat is only a lens and
 * never widens access, so this is not the last line of defence; it is the line that
 * makes the guarantee in the caller's comment actually true.
 *
 * DEPRECATED as the entry point. Use personaForIdentity() in userPolicy.js, which tries
 * the tenant-managed bindings (PERSONA_ASSIGNMENTS, PERSONA_GROUP_IDS) FIRST and only
 * then falls back to this. Binding seats to demo profiles alone meant the feature was
 * switched off for every real tenant — a demo of something the product does not do.
 */
export function personaForDemoProfile(identity) {
  if (!identity || !demoModeActive()) return null;
  const keys = [identity.upn, identity.oid, identity.name].filter(Boolean).map((k) => String(k).toLowerCase());
  for (const k of keys) {
    const hit = demoProfileById[k];
    if (hit) return hit.personaId || null;
  }
  return null;
}
