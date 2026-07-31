// Work IQ — Microsoft Graph backend (app-only) for The Deal Room.
//
// Backs the four governed Work IQ tools (search_files, read_channel_messages,
// search_mail, search) with REAL Microsoft 365 work data over Microsoft Graph, using
// the M365 connector app's client credentials (config.m365). This is the MICROSOFT-
// NATIVE Work IQ implementation: the app IS the Work IQ MCP backend — no third-party
// endpoint. The same functions are exposed to Copilot / Copilot Studio via the
// Streamable-HTTP MCP server in lib/mcp/workiqServer.js.
//
// Auth: OAuth2 client-credentials (application permissions) — Sites.Read.All /
// Files.Read.All (files & SharePoint search), Mail.Read (mailbox search), and
// ChannelMessage.Read.All (Teams channel messages). Because reads are app-only they
// are tenant-wide; the app keeps them READ-ONLY and (for mail) an Exchange Application
// Access Policy should scope which mailboxes are reachable (see app/graph/README.md).
//
// Every function returns a compact, bounded shape (never a raw Graph blob) and degrades
// to a structured error rather than throwing, so an agent conversation continues.

import { config } from '../config.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Work IQ's Graph backend is usable once the M365 app has a client id + secret and a
// real (GUID) tenant — the values already provisioned for the Teams connector.
export function workIqGraphConfigured() {
  const m = config.m365 || {};
  return !!(m.clientId && m.clientSecret && GUID.test(String(m.tenantId || '')));
}

// ---- app-only token (cached until ~2 min before expiry) ---------------------
let _tok = { value: '', exp: 0 };
async function appToken() {
  const now = Date.now();
  if (_tok.value && now < _tok.exp) return _tok.value;
  const m = config.m365;
  const body = new URLSearchParams({
    client_id: m.clientId,
    client_secret: m.clientSecret,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });
  const resp = await fetch(`https://login.microsoftonline.com/${m.tenantId}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  if (!resp.ok) throw new Error(`token ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 200)}`);
  const json = await resp.json();
  _tok = { value: json.access_token, exp: now + (Number(json.expires_in || 3600) - 120) * 1000 };
  return _tok.value;
}

// Every Graph call here is app-only by default. Passing a userToken switches the call
// to the signed-in person's own delegated token, so Microsoft 365 applies THEIR
// permissions rather than the application's. That distinction is the whole point for
// anything touching a Teams channel: reads should be limited to what the person can
// already see, and writes must be attributable to them.
async function graphApp(path, { method = 'GET', body, headers = {}, userToken = null } = {}) {
  const token = userToken || await appToken();
  const resp = await fetch(`${GRAPH}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`Graph ${method} ${path} → ${resp.status}: ${text.slice(0, 240)}`);
    err.status = resp.status;
    throw err;
  }
  if (resp.status === 204) return null;
  return resp.json();
}

const clip = (s, n = 400) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const cap = (n, def, max) => Math.min(Math.max(1, Number(n) || def), max);

// ---- POST /search/query (app-only: driveItem / listItem / site) -------------
// App-only search REQUIRES a region (e.g. NAM). Override with WORKIQ_SEARCH_REGION.
const SEARCH_REGION = (process.env.WORKIQ_SEARCH_REGION || 'NAM').trim();
async function searchQuery(entityTypes, queryString, size) {
  const data = await graphApp('/search/query', {
    method: 'POST',
    body: { requests: [{ entityTypes, query: { queryString }, region: SEARCH_REGION, from: 0, size }] },
  });
  const hits = data?.value?.[0]?.hitsContainers?.[0]?.hits || [];
  return hits.map((h) => {
    const r = h.resource || {};
    return {
      id: r.id,
      type: (r['@odata.type'] || '').replace('#microsoft.graph.', '') || undefined,
      name: r.name || r.displayName || r.subject || undefined,
      webUrl: r.webUrl || r.webLink || undefined,
      lastModified: r.lastModifiedDateTime || r.createdDateTime || undefined,
      summary: clip(h.summary || r.description || ''),
      size: r.size,
    };
  });
}

// search_files — SharePoint / OneDrive documents matching a query.
export async function wiSearchFiles(query, { size } = {}) {
  if (!query) return { error: 'bad-args', reason: 'query is required.' };
  try {
    const results = await searchQuery(['driveItem', 'listItem'], query, cap(size, 10, 25));
    return { source: 'graph.search', entity: 'files', query, count: results.length, results };
  } catch (e) { return graphErr('search_files', e); }
}

// search — a broad Work IQ search across files, list items and sites.
export async function wiSearch(query, { size } = {}) {
  if (!query) return { error: 'bad-args', reason: 'query is required.' };
  try {
    const results = await searchQuery(['driveItem', 'listItem', 'site'], query, cap(size, 10, 25));
    return { source: 'graph.search', entity: 'all', query, count: results.length, results };
  } catch (e) { return graphErr('search', e); }
}

// search_mail — messages in a target mailbox matching a query (app-only; needs the
// mailbox user id/UPN, and Mail.Read scoped by an Application Access Policy).
export async function wiSearchMail({ query, user, top } = {}) {
  if (!query) return { error: 'bad-args', reason: 'query is required.' };
  if (!user) return { error: 'bad-args', reason: 'user (mailbox UPN or id) is required for mailbox search.' };
  try {
    const enc = encodeURIComponent(`"${String(query).replace(/"/g, '')}"`);
    const data = await graphApp(`/users/${encodeURIComponent(user)}/messages?$search=${enc}&$select=subject,from,receivedDateTime,bodyPreview,webLink&$top=${cap(top, 10, 25)}`,
      { headers: { ConsistencyLevel: 'eventual' } });
    const results = (data?.value || []).map((m) => ({
      subject: m.subject, from: m.from?.emailAddress?.address || m.from?.emailAddress?.name,
      received: m.receivedDateTime, preview: clip(m.bodyPreview, 300), webLink: m.webLink,
    }));
    return { source: 'graph.mail', entity: 'mail', user, query, count: results.length, results };
  } catch (e) { return graphErr('search_mail', e); }
}

// read_channel_messages — recent messages in a specific Teams channel. App-only by
// default; with a userToken the read runs as the signed-in person, so they see exactly
// what their own Microsoft 365 permissions allow and nothing more.
export async function wiReadChannel({ team_id, channel_id, top, userToken = null } = {}) {
  if (!team_id || !channel_id) return { error: 'bad-args', reason: 'team_id and channel_id are required.' };
  try {
    const data = await graphApp(`/teams/${encodeURIComponent(team_id)}/channels/${encodeURIComponent(channel_id)}/messages?$top=${cap(top, 15, 30)}`, { userToken });
    const results = (data?.value || []).map((m) => ({
      // The real Graph message id, carried through so a person can reply to a
      // specific message rather than only start a new one.
      id: m.id || null,
      from: m.from?.user?.displayName || m.from?.application?.displayName || 'unknown',
      created: m.createdDateTime,
      preview: clip((m.body?.content || '').replace(/<[^>]+>/g, ' '), 300),
      webUrl: m.webUrl,
    }));
    return { source: 'graph.teams', entity: 'channel', team_id, channel_id, count: results.length, results, asUser: !!userToken };
  } catch (e) { return graphErr('read_channel_messages', e, userToken); }
}

// post_channel_message — say something in the deal's Teams channel.
//
// DELEGATED ONLY, deliberately. There is no app-only fallback and there must never be
// one: a message sent with application credentials arrives in the channel attributed to
// the Deal Room, and a deal channel is a record that ends up in front of an investment
// committee. Anything written there has to be traceable to a person. Because we send
// with the signed-in user's own On-Behalf-Of token, the message IS from them — same
// author, same audit trail, same retention and eDiscovery treatment as if they had
// typed it in Teams. The app is the surface; the user is the speaker.
//
// Body is sent as PLAIN TEXT (contentType 'text'), not HTML, so nothing a user types
// can be interpreted as markup in anyone else's client.
export async function wiPostChannelMessage({ team_id, channel_id, text, reply_to = null, userToken = null } = {}) {
  if (!team_id || !channel_id) return { error: 'bad-args', reason: 'team_id and channel_id are required.' };
  const content = String(text ?? '').trim();
  if (!content) return { error: 'bad-args', reason: 'text is required.' };
  if (content.length > 4000) return { error: 'bad-args', reason: 'Message is too long (4000 character limit).' };
  if (!userToken) {
    return {
      error: 'delegated-required',
      reason: 'Sending requires your own Microsoft 365 sign-in. The Deal Room will not post to a deal channel as the application, because a message in a deal channel must be attributable to a person.',
    };
  }
  const base = `/teams/${encodeURIComponent(team_id)}/channels/${encodeURIComponent(channel_id)}/messages`;
  const path = reply_to ? `${base}/${encodeURIComponent(reply_to)}/replies` : base;
  try {
    const m = await graphApp(path, { method: 'POST', body: { body: { contentType: 'text', content } }, userToken });
    return {
      source: 'graph.teams', entity: 'channel-message', team_id, channel_id, sent: true, asUser: true,
      message: {
        id: m?.id || null,
        from: m?.from?.user?.displayName || 'you',
        created: m?.createdDateTime || new Date().toISOString(),
        preview: clip((m?.body?.content || content).replace(/<[^>]+>/g, ' '), 300),
        webUrl: m?.webUrl || null,
        replyTo: reply_to || null,
      },
    };
  } catch (e) { return graphErr('post_channel_message', e, userToken); }
}

// Connectivity probe for the connector test / config surface.
export async function wiConnectivity() {
  if (!workIqGraphConfigured()) return { ok: false, reason: 'Work IQ Graph backend not configured (M365 app client id/secret/tenant).' };
  try {
    const org = await graphApp('/organization?$select=displayName,id');
    const o = org?.value?.[0];
    return { ok: true, tenant: o?.displayName, tenantId: o?.id };
  } catch (e) { return { ok: false, reason: String(e?.message || e).slice(0, 200) }; }
}

function graphErr(tool, e, userToken = null) {
  const status = e?.status;
  if (tool === 'post_channel_message' && (status === 403 || status === 401)) {
    return {
      error: 'forbidden', tool, asUser: true,
      reason: 'Microsoft 365 declined to post as you. Either you are not a member of this channel, or the delegated ChannelMessage.Send permission has not been consented for the Deal Room.',
    };
  }
  // A 403 means very different things in the two modes, and telling them apart is the
  // difference between "ask your admin to consent" and "you personally do not have
  // access to this content" — which is a correct, expected outcome.
  if (status === 403) {
    return userToken
      ? { error: 'forbidden', tool, asUser: true, reason: 'Microsoft 365 declined this read for the signed-in user. Either the user does not have access to this content, or the delegated Work IQ scopes have not been consented.' }
      : { error: 'forbidden', tool, asUser: false, reason: 'The Work IQ app lacks admin-consented Graph permission for this read. Grant Sites.Read.All / Files.Read.All / Mail.Read / ChannelMessage.Read.All (application) + admin consent.' };
  }
  return { error: 'graph-call-failed', tool, asUser: !!userToken, detail: String(e?.message || e).slice(0, 240) };
}
