// Bridge to the shared Deal Room business logic (app/lib + app/data).
//
// This is the ONLY place the Teams app reaches into the app package, and ONLY
// for Teams-specific glue — never for deal data (that always comes from the
// shared backend over HTTP). Imports are dynamic + guarded so the Teams app
// still boots if the app package/deps aren't present.

let personaCache = null;

async function loadPersonas() {
  if (personaCache) return personaCache;
  try {
    const mod = await import('../../app/data/personas.js');
    personaCache = {
      personas: mod.personas ?? [],
      personaById: mod.personaById ?? {},
    };
  } catch {
    personaCache = { personas: [], personaById: {} };
  }
  return personaCache;
}

export async function listPersonas() {
  const { personas } = await loadPersonas();
  return personas;
}

// Look up a persona record by id. `null` in, `null` out.
//
// This replaces a personaForUser(identity) that hashed the caller's object id and
// picked a seat out of the roster modulo its length. That is a demo trick, and it ran
// for everyone: a real signed-in user was handed a fictional colleague's persona and
// the top bar badged them with that character's NAME. Whether someone holds a seat is
// an access-policy question, so it is answered once, by the orchestrator
// (describeAccess -> personaForIdentity), and this function only resolves the id it
// returns into the persona record for display. Unassigned stays unassigned.
export async function personaRecord(personaId) {
  if (!personaId) return null;
  const { personaById } = await loadPersonas();
  return personaById[String(personaId)] || null;
}

// ---- Stage visibility (role-based) ------------------------------------------
// Stage 1 (Origination & Screening) is visible to everyone with app access.
// Stage 2 (Diligence & Approval) is restricted to the DEAL TEAM. Membership is
// configurable via env; the demo uses user1-4 as the deal team and user5 as an
// Analyst (Stage 1 only) to show the lockdown.
const DEAL_TEAM = (process.env.DEAL_TEAM_UPNS || 'user1,user2,user3,user4')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const ANALYSTS = (process.env.ANALYST_UPNS || 'user5')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const localPart = (u) => String(u || '').split('@')[0].toLowerCase();

export function stageAccessFor(upn) {
  const l = localPart(upn);
  if (DEAL_TEAM.includes(l)) return { role: 'deal-team', canViewStage2: true };
  if (ANALYSTS.includes(l)) return { role: 'analyst', canViewStage2: false };
  return { role: 'member', canViewStage2: false };
}
