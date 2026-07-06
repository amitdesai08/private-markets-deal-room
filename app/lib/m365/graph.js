// Microsoft 365 Graph client (delegated) for The Deal Room.
//
// Uses the M365 connector's delegated token — stored under provider 'm365' in the
// shared OAuth token store (lib/mcp/oauth.js) once a user connects M365 from the
// Home connectivity panel — to call Microsoft Graph on behalf of that user.
//
// Powers two things:
//   • identity  — GET /me, for the connector's real connectivity test, and
//   • Teams     — provisioning ONE real Teams channel per deal at launch, so the
//                 "Microsoft Teams" button on the deal workspace map opens a live
//                 channel for that specific deal.
//
// Every M365-dependent step goes through this module, so the single delegated
// connection is reused everywhere.

import { getAccessToken, hasLogin, NotLoggedInError } from '../mcp/oauth.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export class GraphError extends Error {}
export class M365NotConnectedError extends Error {}

// The M365 login can be OFFERED once the app registration is configured…
export function m365Configured() {
  return !!(process.env.M365_CLIENT_ID && process.env.M365_CLIENT_SECRET);
}
// …and is CONNECTED once a user has signed in (delegated token stored).
export function m365Connected() {
  return hasLogin('m365');
}

async function graph(path, { method = 'GET', body, headers = {}, expect } = {}) {
  let token;
  try {
    token = await getAccessToken('m365');
  } catch (err) {
    if (err instanceof NotLoggedInError) throw new M365NotConnectedError('M365 is not connected — sign in from the Home connectivity panel.');
    throw err;
  }
  const resp = await fetch(`${GRAPH}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new GraphError(`Graph ${method} ${path} → ${resp.status}: ${text.slice(0, 240)}`);
  }
  if (expect === 'raw') return resp;
  if (resp.status === 204) return null;
  const ct = resp.headers.get('content-type') || '';
  return ct.includes('application/json') ? resp.json() : null;
}

// The signed-in user (connector connectivity test + "connected as").
export async function me() {
  const u = await graph('/me?$select=displayName,userPrincipalName,mail,id');
  return { displayName: u.displayName, upn: u.userPrincipalName, mail: u.mail || u.userPrincipalName, id: u.id };
}

// ---- Teams provisioning (one Team per deal) ------------------------------
// A deal gets its OWN Microsoft Teams team ("Deal - <company>"), created with the
// user-consentable Team.Create permission (no tenant-admin consent needed — unlike
// Channel.Create). The team's default General channel is "the deal's channel"; the
// workspace button opens the team via its webUrl.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Team display names allow most characters but keep it clean and bounded (≤ 120).
function teamName(deal) {
  const base = `Deal - ${deal.company || deal.id}`;
  return base.replace(/\s+/g, ' ').trim().slice(0, 120) || `Deal ${String(deal.id || '').slice(0, 20)}`;
}

async function getTeam(teamId) {
  return graph(`/teams/${teamId}?$select=id,displayName,webUrl`);
}

// Idempotently ensure THIS deal has its own team; returns its live coordinates
// (webUrl opens the team / its General channel). Reuses the team recorded on the
// deal, or an existing joined team with the same name, before creating a new one.
export async function ensureDealChannel(deal, existing) {
  const name = teamName(deal);

  // 1) already recorded on the deal → verify it still exists.
  if (existing?.teamId) {
    try {
      const t = await getTeam(existing.teamId);
      if (t?.id) return { teamId: t.id, channelId: existing.channelId || null, webUrl: t.webUrl, displayName: t.displayName, createdAt: existing.createdAt || new Date().toISOString() };
    } catch { /* fall through to re-discover / recreate */ }
  }

  // 2) discover an existing joined team with the same name.
  const joined = await graph('/me/joinedTeams?$select=id,displayName').catch(() => null);
  const found = (joined?.value || []).find((t) => (t.displayName || '').toLowerCase() === name.toLowerCase());
  if (found) {
    const t = await getTeam(found.id).catch(() => null);
    return { teamId: found.id, channelId: null, webUrl: t?.webUrl || null, displayName: found.displayName, createdAt: new Date().toISOString() };
  }

  // 3) create the deal's team (202 Accepted; team id is in the Location header).
  const resp = await graph('/teams', {
    method: 'POST',
    expect: 'raw',
    body: {
      'template@odata.bind': "https://graph.microsoft.com/v1.0/teamsTemplates('standard')",
      displayName: name,
      description: `${deal.company} · ${deal.sector || ''} · ${deal.currency || '$'}${deal.dealSize || ''}M — deal diligence space (auto-provisioned at launch).`.slice(0, 1024)
    }
  });
  const loc = resp.headers.get('Location') || resp.headers.get('Content-Location') || '';
  const m = loc.match(/teams[('/]+([0-9a-fA-F-]{36})/);
  let teamId = m ? m[1] : null;

  // Poll until the new team is queryable (provisioning is asynchronous).
  for (let i = 0; i < 15; i++) {
    await sleep(3000);
    if (!teamId) {
      const j = await graph('/me/joinedTeams?$select=id,displayName').catch(() => null);
      const t = (j?.value || []).find((x) => (x.displayName || '').toLowerCase() === name.toLowerCase());
      if (t) teamId = t.id;
    }
    if (teamId) {
      try {
        const t = await getTeam(teamId);
        if (t?.id) return { teamId: t.id, channelId: null, webUrl: t.webUrl, displayName: t.displayName || name, createdAt: new Date().toISOString() };
      } catch { /* not ready yet */ }
    }
  }
  throw new GraphError('The deal team was created but did not finish provisioning in time — open it again shortly.');
}
