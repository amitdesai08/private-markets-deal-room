// User (requesting-identity) authorization for the agents — the RBAC layer that
// composes with personaPolicy. personaPolicy governs WHAT a given persona may do;
// this governs WHICH persona/scope a *verified requesting user* may act through.
//
// Identity is supplied by a trusted caller (the Teams bot passes the Bot-Framework-
// authenticated `from.aadObjectId` + name with a shared trust key; the tab passes
// its SSO-derived identity). Enforcement is server-side; a client can never widen
// its own powers. Unknown/untrusted callers fall back to DEFAULT_AGENT_ROLE.
//
// Role mapping is config-driven (env, no hardcoded tenant ids): each list matches
// a user by Entra object id OR UPN local-part OR lowercased display name, so it
// works for real Teams users AND the demo "view as" roster.

const norm = (s) => String(s || '').trim().toLowerCase();
const localPart = (u) => norm(u).split('@')[0];
const listEnv = (name, dflt = '') =>
  String(process.env[name] ?? dflt).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

// Demo profiles (one showcase identity per role) are only honoured when the
// deployer opts in via DEMO_PROFILES; a production deploy with it off never
// grants a role by demo name. When on, each role's id list is augmented with
// its demo identity ids so the "view as" roster resolves out of the box.
import { demoProfiles, demoRoleIds } from '../data/demoProfiles.js';
import { getRoleOverrides, getRoleAssignments } from './accessConfig.js';
export const demoProfilesEnabled = /^(1|true|yes|on)$/i.test(String(process.env.DEMO_PROFILES ?? ''));
const withDemo = (role, ids) => (demoProfilesEnabled ? [...ids, ...(demoRoleIds[role] || [])] : ids);

// Role → user ids, from env (real Entra object ids in production) plus the demo
// showcase identities when DEMO_PROFILES is enabled. No hardcoded tenant ids.
const ADMIN_IDS = withDemo('admin', listEnv('ADMIN_IDS'));
const PARTNER_IDS = withDemo('partner', listEnv('PARTNER_IDS'));
const DEAL_TEAM_IDS = withDemo('deal-team', listEnv('DEAL_TEAM_IDS'));
const ANALYST_IDS = withDemo('analyst', listEnv('ANALYST_IDS'));
// Day-0 "super user": the initial administrator set at deploy time. Always resolves
// to admin (independent of ADMIN_IDS / the editable config) so first-run setup has a
// guaranteed administrator who can then assign everyone else in the Admin UI.
const BOOTSTRAP_ADMIN = listEnv('BOOTSTRAP_ADMIN');
// What an unauthenticated/unknown caller gets (the tab/web paths that don't pass a
// trusted identity). Keep 'deal-team' to preserve existing demos; set 'analyst' to
// make every unidentified caller read-only.
const DEFAULT_ROLE = (process.env.DEFAULT_AGENT_ROLE || 'deal-team').trim();

// role → the personas the user may ACT AS (each then governed by personaPolicy),
// whether they may perform WRITES, and whether they may see Stage-2 (diligence) deals.
// The persona roster spans the original deal/sector-MD agents plus the wider PE
// deal-team roles (deal lead, value creation, finance, legal, investor relations).
const ALL_PERSONAS = ['analyst', 'partner', 'retail-md', 'ai-md', 'supply-md', 'principal', 'operating-partner', 'fund-cfo', 'legal-gc', 'ir-lp'];
const DEAL_TEAM_PERSONAS = ['analyst', 'retail-md', 'ai-md', 'supply-md', 'principal', 'operating-partner', 'fund-cfo', 'legal-gc'];
const BUILTIN_ROLE = {
  admin:       { rank: 100, personas: ALL_PERSONAS,       write: true,  stage2: true, all: true },
  partner:     { rank: 80,  personas: ALL_PERSONAS,       write: true,  stage2: true },
  'deal-team': { rank: 60,  personas: DEAL_TEAM_PERSONAS, write: true,  stage2: true },
  analyst:     { rank: 40,  personas: ['analyst'],                                               write: false, stage2: false },
  member:      { rank: 20,  personas: ['analyst'],                                               write: false, stage2: false },
};

const BUILTIN_LABEL = {
  admin: 'Administrator', partner: 'Partner / Deal Sponsor', 'deal-team': 'Deal Team', analyst: 'Analyst', member: 'Member',
};

// Effective roles = built-in defaults merged with admin-authored overrides / custom
// roles from accessConfig (persisted). Empty config = built-in behavior unchanged.
function effRoles() {
  const out = {};
  for (const [id, base] of Object.entries(BUILTIN_ROLE)) out[id] = { ...base };
  const ov = getRoleOverrides() || {};
  for (const [id, patch] of Object.entries(ov)) out[id] = { ...(out[id] || {}), ...(patch || {}) };
  return out;
}
const roleSpec = (id) => effRoles()[id];
const labelOf = (id) => (roleSpec(id)?.label) || BUILTIN_LABEL[id] || id;
const rankOf = (role) => (roleSpec(role)?.rank ?? 0);

// Env-based id lists for the four built-in assignable roles.
const ENV_IDS = { admin: [...ADMIN_IDS, ...BOOTSTRAP_ADMIN], partner: PARTNER_IDS, 'deal-team': DEAL_TEAM_IDS, analyst: ANALYST_IDS };

// Resolve a VERIFIED identity to a role. `identity` = { oid, upn, name }.
export function roleForUser(identity = {}) {
  const keys = [norm(identity.oid), localPart(identity.upn), norm(identity.upn), norm(identity.name)].filter(Boolean);
  const assign = getRoleAssignments() || {};
  const idsFor = (id) => [...(ENV_IDS[id] || []), ...((assign[id] || []).map((s) => norm(s)))];
  const hit = (list) => keys.some((k) => list.includes(k));
  // Highest-rank matching role wins (covers custom roles + config assignments).
  const ranked = Object.keys(effRoles()).filter((r) => r !== 'member').sort((a, b) => rankOf(b) - rankOf(a));
  for (const id of ranked) if (hit(idsFor(id))) return id;
  return 'member';
}

// The actual role for an identity (or the default role when identity is absent).
function actualRoleFor(identity) {
  return identity && (identity.oid || identity.upn || identity.name)
    ? roleForUser(identity)
    : (roleSpec(DEFAULT_ROLE) ? DEFAULT_ROLE : 'member');
}

// Roles a user may impersonate DOWN to — their own role and every lower one. Powers a
// "view as" so a senior reviewer sees exactly what a junior role would (never up).
export function viewAsRolesFor(identity) {
  const mine = rankOf(actualRoleFor(identity));
  return Object.keys(effRoles()).filter((r) => rankOf(r) <= mine).sort((a, b) => rankOf(b) - rankOf(a));
}

// Full access profile. When `viewAsRole` is at or below the caller's actual rank the
// profile is computed AS THAT lower role (view-as); an out-of-range/unknown viewAsRole
// is ignored — you can never elevate your own access.
export function accessFor(identity, viewAsRole = null) {
  const actualRole = actualRoleFor(identity);
  let role = actualRole;
  if (viewAsRole && roleSpec(viewAsRole) && rankOf(viewAsRole) <= rankOf(actualRole)) role = viewAsRole;
  const spec = roleSpec(role) || roleSpec('member') || BUILTIN_ROLE.member;
  return {
    role,
    actualRole,
    viewingAs: role !== actualRole ? role : null,
    roleLabel: labelOf(role),
    actualRoleLabel: labelOf(actualRole),
    isAdmin: !!(roleSpec(actualRole)?.all),
    allowedPersonas: spec.personas || [],
    canWrite: !!spec.write,
    canViewStage2: !!spec.stage2,
    // Data sovereignty: allowed deal regions / jurisdictions (empty = all).
    regions: spec.regions || [],
    // Workflow management: may advance the pipeline, and the stages this role may act
    // in (empty = all). advanceWorkflow defaults to the role's write capability.
    advanceWorkflow: spec.advanceWorkflow === undefined ? !!spec.write : !!spec.advanceWorkflow,
    allowedStages: spec.allowedStages || [],
  };
}

// The per-user access summary the UI consumes (which agents to show + view-as roles).
export function describeAccess(identity, viewAsRole = null) {
  return {
    ...accessFor(identity, viewAsRole),
    viewAsRoles: viewAsRolesFor(identity).map((r) => ({ role: r, label: labelOf(r) })),
  };
}

// The demo showcase roster (empty unless DEMO_PROFILES is enabled), each enriched
// with the access its role confers so the "view as" switcher can show, e.g.,
// "Eleanor Bishop · Partner · 5 agents" vs "Maya Olsen · Analyst · 1 agent".
export function describeDemoProfiles() {
  if (!demoProfilesEnabled) return [];
  return demoProfiles.map((p) => {
    const a = accessFor({ name: p.id });
    const n = a.allowedPersonas.length;
    return {
      id: p.id, upn: p.id, name: p.name, title: p.title, initials: p.initials, color: p.color,
      personaId: p.personaId, blurb: p.blurb,
      role: a.role, roleLabel: a.roleLabel, isAdmin: a.isAdmin,
      allowedPersonas: a.allowedPersonas, agentCount: n,
      canWrite: a.canWrite, canViewStage2: a.canViewStage2,
      label: `${p.name} · ${a.roleLabel} · ${n} agent${n === 1 ? '' : 's'}`,
    };
  });
}

// May this identity act through `requestedPersona`? Returns the EFFECTIVE persona
// (downgraded to read-only 'analyst' when not authorized) + a reason on denial.
export function authorizePersona(identity, requestedPersona, viewAsRole = null) {
  const access = accessFor(identity, viewAsRole);
  const want = requestedPersona || 'analyst';
  if (access.allowedPersonas.includes(want)) return { ok: true, persona: want, access };
  return {
    ok: false,
    persona: 'analyst',
    access,
    reason: `As ${access.roleLabel}, you can’t act as the ${want} agent. That’s reserved for the ${want === 'partner' ? 'Partner / Deal Sponsor' : 'deal team'}. I’ll answer as the analyst (read-only) instead.`,
  };
}

// Gate access to a specific deal by its stage (Stage-2 diligence = deal-team/partner only).
export function authorizeDealAccess(identity, dealStageOrName, viewAsRole = null, region = null) {
  const access = accessFor(identity, viewAsRole);
  const s = String(dealStageOrName || '');
  const isStage2 = /^d/i.test(s) || /diligence|approval/i.test(s);
  if (isStage2 && !access.canViewStage2) {
    return { ok: false, access, reason: `This deal is in Stage 2 (Diligence & Approval), which is restricted to the deal team. As ${access.roleLabel} you don’t have access.` };
  }
  // Data sovereignty: when the role restricts regions, a deal tagged to another
  // region is not visible (empty regions = no restriction).
  if (region && access.regions.length && !access.regions.map((x) => String(x).toLowerCase()).includes(String(region).toLowerCase())) {
    return { ok: false, access, reason: `This opportunity is in a data-residency region (${region}) your role (${access.roleLabel}) is not cleared for.` };
  }
  return { ok: true, access };
}

// Admin view of the effective roles (built-in defaults + admin overrides / custom
// roles) for the in-app role builder. Includes which are built-in and current
// config assignments.
export function rolesView() {
  const eff = effRoles();
  const assign = getRoleAssignments() || {};
  return Object.entries(eff).map(([id, r]) => ({
    id,
    label: labelOf(id),
    rank: r.rank ?? 0,
    personas: r.personas || [],
    write: !!r.write,
    stage2: !!r.stage2,
    advanceWorkflow: r.advanceWorkflow === undefined ? !!r.write : !!r.advanceWorkflow,
    allowedStages: r.allowedStages || [],
    regions: r.regions || [],
    isAdminRole: !!r.all,
    builtin: !!BUILTIN_ROLE[id],
    assignments: assign[id] || [],
    envAssignedCount: (ENV_IDS[id] || []).length,
  })).sort((a, b) => b.rank - a.rank);
}

export const ALL_PERSONA_IDS = ALL_PERSONAS;
