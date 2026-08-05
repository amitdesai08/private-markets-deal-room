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
import { demoProfiles, demoRoleIds, demoProfileById } from '../data/demoProfiles.js';
import { getRoleOverrides, getRoleAssignments, getDemoModeOverride, getDealGroups, getRegionGroups, getActingAs } from './accessConfig.js';
import { regionForDeal } from '../data/regions.js';
export const demoProfilesEnabled = /^(1|true|yes|on)$/i.test(String(process.env.DEMO_PROFILES ?? ''));

// Whether demo mode is ACTIVE right now. DEMO_PROFILES (the deploy-time / AZD toggle)
// is the hard gate: a production deploy with it off can never turn demo mode on at
// runtime. When the deploy allows it, an administrator can flip it off/on from Settings
// (persisted override); unset means "follow the deploy default" (on).
export function demoModeActive() {
  if (!demoProfilesEnabled) return false;
  const override = getDemoModeOverride();
  return override === undefined ? true : !!override;
}
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
  member:      { rank: 20,  personas: [],                                                         write: false, stage2: false },
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

// ENTRA APP ROLES (token 'roles' claim) and SECURITY GROUP object ids (token 'groups'
// claim) that map to each application role. This is the Entra-native way to grant
// application admin WITHOUT any Azure or Entra directory privilege: define an app role
// on the app registration (or a security group) and assign users/groups to it. Admin
// defaults to the app-role value 'DealRoom.Admin' so it works once assigned; override or
// extend via env (e.g. ADMIN_APP_ROLES=Administrator or ADMIN_GROUP_IDS=<group-oid>).
const APP_ROLE_CLAIMS = {
  admin:       (listEnv('ADMIN_APP_ROLES').length ? listEnv('ADMIN_APP_ROLES') : ['DealRoom.Admin']),
  partner:     listEnv('PARTNER_APP_ROLES'),
  'deal-team': listEnv('DEAL_TEAM_APP_ROLES'),
  analyst:     listEnv('ANALYST_APP_ROLES'),
};
const GROUP_IDS = {
  admin:       listEnv('ADMIN_GROUP_IDS'),
  partner:     listEnv('PARTNER_GROUP_IDS'),
  'deal-team': listEnv('DEAL_TEAM_GROUP_IDS'),
  analyst:     listEnv('ANALYST_GROUP_IDS'),
};

// ---- Territory (region) + deal-group access from Entra group membership ------
// A user's VISIBLE regions and the deals they can open are derived from the security
// groups in their token 'groups' claim. Region groups grant one-or-more base regions;
// deal groups (per-deal need-to-know teams AND admin-authored tags) grant full access
// to specific deals. Seeded from env, overridable via the admin-editable accessConfig.
function parseJsonEnv(name) { try { const v = process.env[name]; return v ? JSON.parse(v) : {}; } catch { return {}; } }
const REGION_GROUP_ENV = parseJsonEnv('REGION_GROUP_IDS');
function regionGroupMap() {
  const out = {};
  for (const [gid, regs] of Object.entries(REGION_GROUP_ENV)) out[norm(gid)] = (Array.isArray(regs) ? regs : []).map(norm);
  for (const [gid, regs] of Object.entries(getRegionGroups() || {})) out[norm(gid)] = (Array.isArray(regs) ? regs : []).map(norm);
  return out;
}
// Base regions a VERIFIED identity is scoped to, from its region-group memberships.
// Empty = unrestricted (MDs / partners / admins who are in no region group see all).
export function regionsForIdentity(identity = {}) {
  const set = new Set();
  const groups = (identity && Array.isArray(identity.groups) ? identity.groups : []).map(norm);
  if (groups.length) { const map = regionGroupMap(); for (const g of groups) for (const r of (map[g] || [])) set.add(r); }
  // Demo profiles carry a synthetic region scope so the territory model is demoable
  // via the "sign in as" switcher without provisioning real regional users.
  for (const r of demoRegionScopeFor(identity)) set.add(norm(r));
  return [...set];
}
// The region scope of a demo profile (region keys), when demo mode is active.
function demoRegionScopeFor(identity) {
  if (!demoProfilesEnabled || !identity) return [];
  const keys = [norm(identity.oid), norm(identity.upn), localPart(identity.upn), norm(identity.name)].filter(Boolean);
  for (const k of keys) { const p = demoProfileById[k]; if (p && Array.isArray(p.regionScope) && p.regionScope.length) return p.regionScope; }
  return [];
}
// The Entra group object ids that grant FULL access to a deal: its explicit access
// groups (deal.groupIds, e.g. the per-deal team channel group) plus the groups behind
// any tags the deal carries.
function effectiveDealGroupIds(deal) {
  const out = [...((deal && deal.groupIds) || [])];
  const dg = getDealGroups() || {};
  for (const t of ((deal && deal.tags) || [])) { const g = dg[String(t)] && dg[String(t)].groupId; if (g) out.push(g); }
  return out.map(norm).filter(Boolean);
}
function groupGrantsDeal(identity, deal) {
  const gids = (Array.isArray(identity && identity.groups) ? identity.groups : []).map(norm);
  if (!gids.length) return false;
  const dealGids = new Set(effectiveDealGroupIds(deal));
  return gids.some((g) => dealGids.has(g));
}

// ---- persona binding -------------------------------------------------------------
// WHICH SEAT a verified user occupies. This is deliberately separate from role: role is
// clearance (what you may see), persona is job (what you are here to do). Two people
// with identical clearance can want completely different home pages.
//
// Bound the same ways a role is, so the feature is real in a tenant rather than a
// demo-only trick. Highest-confidence source wins:
//   1. PERSONA_ASSIGNMENTS  — {"supply-md": ["oid", "upn", "alias"]} — explicit list.
//   2. PERSONA_GROUP_IDS    — {"<entra-group-oid>": "supply-md"}.
//   3. the seat the caller's ROLE confers (admin-editable, see rolesView) — the
//      tenant-managed path: assign an Entra app role or security group, that resolves
//      to a Deal Room role, and the role carries the seat its holders occupy.
//   4. demo showcase profiles, and ONLY while demo mode is active.
// An explicit binding beats a group, a group beats a role default, and a real binding
// always beats a demo one.
const PERSONA_GROUP_ENV = parseJsonEnv('PERSONA_GROUP_IDS');
const PERSONA_ASSIGN_ENV = parseJsonEnv('PERSONA_ASSIGNMENTS');

export function personaForIdentity(identity = {}) {
  if (!identity || !(identity.oid || identity.upn || identity.name)) return null;
  const valid = (p) => (ALL_PERSONAS.includes(String(p)) ? String(p) : null);
  const keys = [norm(identity.oid), localPart(identity.upn), norm(identity.upn)].filter(Boolean);

  // 1. explicit per-user assignment
  for (const [persona, ids] of Object.entries(PERSONA_ASSIGN_ENV)) {
    const list = (Array.isArray(ids) ? ids : []).map(norm);
    if (keys.some((k) => list.includes(k))) { const v = valid(persona); if (v) return v; }
  }
  // 2. Entra group membership
  const groups = (Array.isArray(identity.groups) ? identity.groups : []).map(norm);
  if (groups.length) {
    for (const [gid, persona] of Object.entries(PERSONA_GROUP_ENV)) {
      if (groups.includes(norm(gid))) { const v = valid(persona); if (v) return v; }
    }
  }
  // 3. the seat conferred by the caller's ROLE. Ranked below the two explicit bindings
  // so one person can be moved to a different seat without redefining the role, and
  // above the demo roster so a configured tenant is never overridden by the showcase.
  const roleSeat = valid(effRoles()[roleForUser(identity)]?.persona);
  if (roleSeat) return roleSeat;
  // 4. demo showcase profile. Gated on demo mode because the lookup keys include
  // identity.name, which is attacker-influenced on the demo "view as" path. The seat is
  // only a lens and never widens access, but a production deploy should not let a
  // caller select a seat by naming it.
  if (demoModeActive()) {
    const dkeys = [...keys, norm(identity.name)].filter(Boolean);
    for (const k of dkeys) { const p = demoProfileById[k]; if (p && p.personaId) { const v = valid(p.personaId); if (v) return v; } }
  }
  return null;
}

// The showcase profile a REAL person has chosen to act as in the demo "view as"
// switcher, or null. Set from the tab and read by the CHANNEL BOT, so that switching
// profile changes who answers in Teams as well as what the tab shows — otherwise the
// presenter picks "Eleanor Shellstrop, Partner", asks the bot a question in a channel, and
// gets their own answer back, which makes the access model look like decoration.
//
// Two deliberate restrictions:
//   - demo mode only, so a production deploy has no impersonation primitive here at all;
//   - keyed on oid / upn ONLY, never display name, because a display name is
//     attacker-influenced and this swaps one identity for another.
// The stored value is re-checked against the roster on every read, so a profile that
// stops existing (or a hand-edited config document) resolves to nobody rather than to
// something arbitrary.
export function actingAsFor(identity = {}) {
  if (!demoModeActive() || !identity) return null;
  const map = getActingAs() || {};
  const keys = [norm(identity.oid), norm(identity.upn), localPart(identity.upn)].filter(Boolean);
  for (const k of keys) {
    const id = norm(map[k]);
    if (id && demoProfileById[id]) return id;
  }
  return null;
}

// Resolve a VERIFIED identity to a role. `identity` = { oid, upn, name, roles?, groups? }.
export function roleForUser(identity = {}) {
  const keys = [norm(identity.oid), localPart(identity.upn), norm(identity.upn), norm(identity.name)].filter(Boolean);
  const appRoles = (Array.isArray(identity.roles) ? identity.roles : []).map((r) => norm(r));
  const groups = (Array.isArray(identity.groups) ? identity.groups : []).map((g) => norm(g));
  const assign = getRoleAssignments() || {};
  const eff = effRoles();
  const idsFor = (id) => [...(ENV_IDS[id] || []), ...((assign[id] || []).map((s) => norm(s)))];
  const hitId = (list) => keys.some((k) => list.includes(k));
  // Entra app-role values and security-group object ids come from the deploy config AND
  // from the admin-authored role spec, so a tenant can wire up a new group from inside
  // the product instead of waiting on a redeploy. Both GRANT a role, so both are
  // admin-only to edit — enforced on the write path, not here.
  const hitRole = (id) => [...(APP_ROLE_CLAIMS[id] || []), ...((eff[id]?.appRoles) || [])].some((r) => appRoles.includes(norm(r)));
  const hitGroup = (id) => [...(GROUP_IDS[id] || []), ...((eff[id]?.groupIds) || [])].some((g) => groups.includes(norm(g)));
  // Highest-rank matching role wins. Entra app-role / group assignment (tenant-managed)
  // and the explicit id lists (env + admin-authored assignments) are all honoured.
  const ranked = Object.keys(eff).filter((r) => r !== 'member').sort((a, b) => rankOf(b) - rankOf(a));
  for (const id of ranked) if (hitRole(id) || hitGroup(id) || hitId(idsFor(id))) return id;
  return 'member';
}

// The ceiling an unidentified caller may PREVIEW up to. Not the seat they get.
//
// With no identity this returned DEFAULT_ROLE, which deploys as 'deal-team', and that was
// the seat as well as the ceiling — so an anonymous request to the public ingress, with no
// token and no header, was answered as a cleared member of every deal team: 24 deals
// including the confidential ones, and the assistant reading out Project Onyx's enterprise
// value. `confidential` is the strongest flag in this model and it was defeated by
// omitting a header.
// The role for an identity, or the deploy's default when the platform is calling itself.
//
// The default is 'deal-team', which is right for the agent and the MCP naming their own
// seat and wrong for anybody who simply reached the public ingress. That is enforced at
// the HTTP boundary rather than here — see requestingViewAs in server.js — because this
// function is also how the platform's own internal callers resolve a seat.
function actualRoleFor(identity) {
  if (identity && (identity.oid || identity.upn || identity.name)) return roleForUser(identity);
  return roleSpec(DEFAULT_ROLE) ? DEFAULT_ROLE : 'member';
}

const anonymous = (identity) => !(identity && (identity.oid || identity.upn || identity.name));

// The demo roster identity for a role, so "view as partner" previews a partner rather than
// clamping to the deploy default. Only reachable for a caller that has proved it is the
// app: the bot key is the trust boundary, and previewing a seat is what the roster exists
// for. Without this, asking to be a partner answered as deal-team and opened the page with
// "No specialist role is assigned to you yet" — a permissions apology, to a partner.
export function demoIdentityForRole(role) {
  if (!demoModeActive()) return null;
  const id = (demoRoleIds[String(role || '').trim()] || [])[0];
  if (!id) return null;
  const p = demoProfileById(id);
  return { upn: id, name: p?.name || id };
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
  // A seat we do not recognise is a refusal, not a no-op. Asking to be viewed as "guest"
  // used to be ignored, which left the caller on the default -- so a typo, or a probe,
  // was answered with MORE access than the role it named.
  else if (viewAsRole && !roleSpec(viewAsRole)) role = 'member';
  const spec = roleSpec(role) || roleSpec('member') || BUILTIN_ROLE.member;
  // View-as may only ever NARROW, and that is enforced here rather than left to the
  // rank comparison above.
  //
  // Rank ordering is data: getRoleOverrides() lets an administrator author a role with
  // any rank and any capabilities. A role defined with a low rank but stage2/write true
  // would pass the rank test for every caller and hand out capabilities their real role
  // does not have — the escalation would be a configuration mistake rather than a code
  // change, which is the kind that ships quietly. Intersecting with the ACTUAL role's
  // spec makes "view-as cannot elevate" structural: previewing a seat can only ever
  // subtract.
  const actualSpec = roleSpec(actualRole) || roleSpec('member') || BUILTIN_ROLE.member;
  const narrowed = (key) => !!spec[key] && !!actualSpec[key];
  const previewing = role !== actualRole;
  return {
    role,
    actualRole,
    viewingAs: previewing ? role : null,
    roleLabel: labelOf(role),
    actualRoleLabel: labelOf(actualRole),
    isAdmin: !!(roleSpec(actualRole)?.all),
    allowedPersonas: previewing
      ? (spec.personas || []).filter((p) => (actualSpec.all ? true : (actualSpec.personas || []).includes(p)))
      : (spec.personas || []),
    canWrite: previewing ? narrowed('write') : !!spec.write,
    canViewStage2: previewing ? narrowed('stage2') : !!spec.stage2,

    // Data sovereignty: allowed deal regions / jurisdictions (empty = all). Sourced
    // from the role spec AND the caller's Entra region-group memberships (need-to-know).
    regions: [...new Set([...(spec.regions || []).map((x) => norm(x)), ...regionsForIdentity(identity)])],
    // Workflow management: may advance the pipeline, and the stages this role may act
    // in (empty = all). advanceWorkflow defaults to the role's write capability.
    advanceWorkflow: previewing
      ? (spec.advanceWorkflow === undefined ? narrowed('write') : !!spec.advanceWorkflow)
        && (actualSpec.advanceWorkflow === undefined ? !!actualSpec.write : !!actualSpec.advanceWorkflow)
      : (spec.advanceWorkflow === undefined ? !!spec.write : !!spec.advanceWorkflow),

    allowedStages: spec.allowedStages || [],
  };
}

// The per-user access summary the UI consumes (which agents to show + view-as roles).
export function describeAccess(identity, viewAsRole = null) {
  const demo = demoModeActive();
  return {
    ...accessFor(identity, viewAsRole),
    // The demo-only affordances ("view as ROLE") are suppressed when demo mode is off
    // so a production tab shows only the caller's real role.
    viewAsRoles: demo ? viewAsRolesFor(identity).map((r) => ({ role: r, label: labelOf(r) })) : [],
    // The seat this identity is actually BOUND to, or null. The single source of truth
    // for "which persona is this?" — the Teams app used to derive it by hashing the
    // user's object id, which handed real signed-in users a fictional colleague's seat.
    // A persona is assigned (PERSONA_ASSIGNMENTS / PERSONA_GROUP_IDS, or a demo profile
    // while demo mode is on) or it does not exist.
    persona: personaForIdentity(identity),
    demoMode: demo,
  };
}

// The demo showcase roster (empty unless DEMO_PROFILES is enabled), each enriched
// with the access its role confers so the "view as" switcher can show, e.g.,
// "Eleanor Shellstrop · Partner · 5 agents" vs "Maya Olsen · Analyst · 1 agent".
export function describeDemoProfiles() {
  if (!demoModeActive()) return [];
  return demoProfiles.map((p) => {
    const a = accessFor({ name: p.id });
    const n = a.allowedPersonas.length;
    return {
      id: p.id, upn: p.id, name: p.name, title: p.title, initials: p.initials, color: p.color,
      personaId: p.personaId, blurb: p.blurb,
      role: a.role, roleLabel: a.roleLabel, isAdmin: a.isAdmin,
      allowedPersonas: a.allowedPersonas, agentCount: n,
      canWrite: a.canWrite, canViewStage2: a.canViewStage2,
      // Dropdown label shows the SPECIFIC persona/title (e.g. "AI Partner — Tech &
      // Digital Value"), not just the coarse RBAC role, so each showcase profile is
      // distinguishable. Falls back to the role label when a profile has no title.
      label: `${p.name} \u2014 ${p.title || a.roleLabel}`,
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
  // Post-screening stages — Diligence (D*), Execution (E*) and Ownership (V*) — are
  // restricted to the deal team (diligence findings, signed terms, financing & exit
  // valuations). Origination / screening (O*, SCR) stay open to all roles.
  const isRestricted = /^[dev]/i.test(s) || /diligence|approval|execution|closing|signing|financing|value|monitoring|ownership|exit/i.test(s);
  if (isRestricted && !access.canViewStage2) {
    return { ok: false, access, reason: `This deal has advanced past screening (${s || 'restricted stage'}) and is restricted to the deal team. As ${access.roleLabel} you don’t have access.` };
  }
  // Data sovereignty: when the role restricts regions, a deal tagged to another
  // region is not visible (empty regions = no restriction).
  if (region && access.regions.length && !access.regions.map((x) => String(x).toLowerCase()).includes(String(region).toLowerCase())) {
    return { ok: false, access, reason: `This opportunity is in a data-residency region (${region}) your role (${access.roleLabel}) is not cleared for.` };
  }
  return { ok: true, access };
}

// ---- Two-tier deal access + deal-team need-to-know ---------------------------
// A deal may carry a `team` (user ids on the deal), a `confidential` flag and a
// `pipelineVisible` flag. Access resolves to one of three levels:
//   'full'   — the confidential workspace (financials, findings, terms, valuations, docs)
//   'status' — metadata only (company, sector, stage, status, size) for pipeline
//              awareness. Only ever reached by a deal that opts in with
//              `pipelineVisible`, because the company name and the size of an
//              unannounced transaction are themselves the sensitive part.
//   'none'   — not visible at all, and this is the DEFAULT for a restricted deal you
//              are not cleared for. It is absent from lists, counts and search rather
//              than present-and-locked.

const RESTRICTED_STAGE_RE = /^[dev]/i;
const RESTRICTED_NAME_RE = /diligence|approval|execution|closing|signing|financing|value|monitoring|ownership|exit/i;

// Is this identity (or its view-as) on a deal's team? Matches by oid / upn-local / upn /
// name, like roleForUser.
export function onDealTeam(identity, team) {
  const list = (team || []).map((s) => norm(s));
  if (!list.length || !identity) return false;
  const keys = [norm(identity.oid), localPart(identity.upn), norm(identity.upn), norm(identity.name)].filter(Boolean);
  return keys.some((k) => list.includes(k));
}

// Everyone the record puts ON the deal. Only `team` counts. `leadAnalyst` looks like the
// answer and is not: it carries the same default on eighteen of nineteen deals, so
// honouring it would have put the analyst on essentially every deal in the fund and
// undone the need-to-know boundary entirely. A field that is never varied is not a
// statement about who is on a deal.
export function dealTeamOf(deal) {
  return ((deal && deal.team) || []).filter(Boolean);
}

// The effective access level for a specific deal: 'full' | 'status' | 'none'.
export function dealAccessLevel(identity, deal, viewAsRole = null) {
  const access = accessFor(identity, viewAsRole);
  const s = String((deal && (deal.stage || deal.stageName)) || '');
  const restricted = RESTRICTED_STAGE_RE.test(s) || RESTRICTED_NAME_RE.test(s);
  const confidential = !!(deal && deal.confidential);
  const named = dealTeamOf(deal).map((x) => norm(x));
  // A role is not a person. Deal teams in this record are written as role slugs
  // ('analyst', 'legal-gc'), so matching the reader's role admits everyone holding it —
  // right for a deal the firm is running normally, wrong for one it has marked
  // confidential. Those keep needing a name, which is why Project Onyx stays shut.
  const roleNamed = !confidential && !!access.role && named.includes(norm(access.role));
  const team = onDealTeam(identity, named) || roleNamed || groupGrantsDeal(identity, deal);
  // Data sovereignty: a region-restricted user can't see out-of-region deals at all
  // (region inferred from the deal's hq when not explicitly tagged). Admins and named
  // team / deal-group members bypass the territory wall.
  const region = regionForDeal(deal);
  if (region && access.regions.length && !access.isAdmin && !team && !access.regions.map((x) => String(x).toLowerCase()).includes(String(region).toLowerCase())) return 'none';
  // Base level (ignoring confidential): admins + deal-team members (need-to-know) + open
  // (origination) stages get the full workspace; deal-team-tier roles get full on
  // restricted stages; everyone else gets status-only on restricted stages.
  let level;
  if (access.isAdmin || team) level = 'full';
  else if (!restricted) level = 'full';
  else if (access.canViewStage2) level = 'full';
  // A deal you are not cleared for is not listed at all. It used to be listed with its
  // detail stripped, which told everyone in the firm that Project Onyx existed, who was
  // on it and roughly how big it was — the company name and the deal size ARE the
  // sensitive part of an unannounced transaction, and a row saying "you cannot open
  // this" is an invitation to go and ask someone who can.
  //
  // Awareness is now something the deal opts into rather than something the reader has
  // to be denied. `pipelineVisible` marks a deal the firm wants known internally — so
  // two teams do not court the same target — and only that flag produces the status
  // tier. `confidential` still overrides it, so a deal can never be made visible by
  // accident.
  else if (deal && deal.pipelineVisible) level = 'status';
  else level = 'none';
  if (confidential && level === 'status') return 'none';
  return level;
}

// Content gate for a deal's workspace (documents, actions, agent chat). ok only at 'full'.
export function authorizeDealContent(identity, deal, viewAsRole = null) {
  const access = accessFor(identity, viewAsRole);
  const level = dealAccessLevel(identity, deal, viewAsRole);
  if (level === 'full') return { ok: true, access, level };
  const reason = level === 'none'
    ? 'This deal is restricted to its named team.'
    : `This deal has advanced past screening and its workspace is restricted to the deal team. As ${access.roleLabel} you can see its status but not its detail.`;
  return { ok: false, access, level, reason };
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
    // How a tenant grants this role, and the seat it confers. `appRoles`/`groupIds` are
    // the admin-editable half; the env-configured half is reported as a count so the
    // screen can say "+2 from the deploy configuration" rather than pretending the list
    // it shows is everything that grants the role.
    appRoles: r.appRoles || [],
    groupIds: r.groupIds || [],
    persona: r.persona || null,
    envAppRoleCount: (APP_ROLE_CLAIMS[id] || []).length,
    envGroupCount: (GROUP_IDS[id] || []).length,
    isAdminRole: !!r.all,
    builtin: !!BUILTIN_ROLE[id],
    assignments: assign[id] || [],
    envAssignedCount: (ENV_IDS[id] || []).length,
  })).sort((a, b) => b.rank - a.rank);
}

export const ALL_PERSONA_IDS = ALL_PERSONAS;
