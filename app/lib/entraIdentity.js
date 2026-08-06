// WHO IS ASKING, ESTABLISHED RATHER THAN ASSERTED.
//
// The right code for this was already in the repository and guarded one endpoint. The
// comment at the top of lib/mcp/entraAuth.js says so in as many words: "This guards ONLY
// the /mcp endpoint — the rest of the app (the SPA and /api/*) stays anonymous by design."
// So /mcp verified a signature against the tenant's JWKS while every other surface took
// the caller's word for who they were, and teams-app/server/sso.js base64-decoded a JWT
// payload and returned it — no signature, no issuer, no audience, no expiry. A forged
// token was indistinguishable from a real one, and `roles: ["admin"]` was a string anybody
// could type.
//
// Eleven rounds of access review found leak after leak downstream of that. They were all
// real, and none of them was the problem: the front door did not lock. This is the lock,
// and it is the same lock /mcp has always used.
//
// Config (env):
//   ENTRA_TENANT_ID     tenant GUID — issuer and JWKS source
//   API_AUDIENCE        comma-separated accepted audiences for platform tokens; falls
//                       back to MCP_AUDIENCE so a deployment that already configured the
//                       MCP audience does not have to be touched twice
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './config.js';

const TENANT_ID = config.mcpAuth.tenantId;
const AUDIENCES = (() => {
  const raw = String(process.env.API_AUDIENCE || '').trim();
  const extra = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return [...new Set([...extra, ...config.mcpAuth.audiences])];
})();

const ISSUERS = TENANT_ID
  ? [`https://login.microsoftonline.com/${TENANT_ID}/v2.0`, `https://sts.windows.net/${TENANT_ID}/`]
  : [];

let jwks = null;
function getJwks() {
  if (!jwks && TENANT_ID) {
    jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`));
  }
  return jwks;
}

export function entraConfigured() {
  return !!(TENANT_ID && AUDIENCES.length);
}

export function entraIdentityInfo() {
  return { tenantConfigured: !!TENANT_ID, audienceConfigured: AUDIENCES.length > 0, enforcing: entraConfigured() };
}

export function bearerFrom(req) {
  const raw = String(req?.headers?.authorization || '');
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return m ? m[1].trim() : null;
}

// A verified identity, or null. Never throws: a bad token is an absent identity, and the
// caller decides what that means. `tid` is checked so a token minted in somebody else's
// tenant for an app that happens to share our audience is not accepted.
export async function verifiedIdentity(token) {
  if (!token || !entraConfigured()) return null;
  try {
    const { payload } = await jwtVerify(token, getJwks(), { issuer: ISSUERS, audience: AUDIENCES });
    if (payload.tid && payload.tid !== TENANT_ID) return null;
    const oid = payload.oid || payload.sub || null;
    if (!oid) return null;
    return {
      oid,
      upn: payload.preferred_username || payload.upn || payload.email || null,
      name: payload.name || null,
      // Only what the token actually carries. These are the claims Entra signs, and they
      // are the ONLY source of a role — `roleForUser` reads them and has always been able
      // to, which is why no policy change is needed to start trusting the right thing.
      roles: Array.isArray(payload.roles) ? payload.roles : [],
      groups: Array.isArray(payload.groups) ? payload.groups : [],
      verified: true,
    };
  } catch {
    return null;
  }
}
