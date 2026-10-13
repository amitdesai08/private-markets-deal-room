// Teams SSO — On-Behalf-Of token exchange.
//
// The tab acquires a Teams SSO token (getAuthToken via @microsoft/teams-js) and
// posts it here; the server exchanges it for a Microsoft Graph token using the
// OBO flow, so calls run as the signed-in user. Demo mode (no SSO config) skips
// the exchange and returns null so the tab still works with anonymous data.

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config, isSsoConfigured } from './config.js';

// The tab's own identifier URI is a valid audience for a Teams SSO token, and it is
// hostname-shaped, so it is derived rather than pasted.
const TAB_AUDIENCES = String(process.env.TEAMS_TAB_AUDIENCE || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

let tabJwks = null;
function getTabJwks() {
  if (!tabJwks && config.entra.tenantId) {
    tabJwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${config.entra.tenantId}/discovery/v2.0/keys`),
    );
  }
  return tabJwks;
}

let cca = null;

async function getClient() {
  if (cca) return cca;
  // Imported lazily so the app still boots without @azure/msal-node installed.
  const { ConfidentialClientApplication } = await import('@azure/msal-node');
  cca = new ConfidentialClientApplication({
    auth: {
      clientId: config.entra.tabClientId,
      authority: `https://login.microsoftonline.com/${config.entra.tenantId}`,
      clientSecret: config.entra.tabClientSecret,
    },
  });
  return cca;
}

// Exchange a Teams SSO token for a downstream (Graph) access token.
export async function exchangeOnBehalfOf(ssoToken, scopes = ['https://graph.microsoft.com/User.Read']) {
  if (!isSsoConfigured() || !ssoToken) return null;
  const client = await getClient();
  const result = await client.acquireTokenOnBehalfOf({ oboAssertion: ssoToken, scopes });
  return result?.accessToken ?? null;
}

// A VERIFIED identity from the Teams SSO token, or null. Must check signature, issuer,
// audience and tenant — an unverified decode of the payload is not an identity.
export async function identityFromSsoToken(ssoToken) {
  if (!ssoToken || typeof ssoToken !== 'string' || ssoToken.split('.').length !== 3) return null;
  // Unconfigured means unenforceable, and unenforceable must not mean "believe it".
  if (!config.entra.tenantId || !config.entra.tabClientId) return null;
  try {
    const { payload } = await jwtVerify(ssoToken, getTabJwks(), {
      issuer: [
        `https://login.microsoftonline.com/${config.entra.tenantId}/v2.0`,
        `https://sts.windows.net/${config.entra.tenantId}/`,
      ],
      audience: [config.entra.tabClientId, `api://${config.entra.tabClientId}`, ...TAB_AUDIENCES],
    });
    if (payload.tid && payload.tid !== config.entra.tenantId) return null;
    return {
      oid: payload.oid ?? payload.sub ?? null,
      name: payload.name ?? null,
      upn: payload.preferred_username ?? payload.upn ?? null,
      tid: payload.tid ?? null,
      // Entra APP ROLES ('roles') + SECURITY GROUP object ids ('groups') the user is
      // assigned in THIS app registration — the governed, tenant-managed way to grant
      // application roles (e.g. admin) with no Azure/Entra directory privilege.
      roles: Array.isArray(payload.roles) ? payload.roles : [],
      groups: Array.isArray(payload.groups) ? payload.groups : [],
      verified: true,
    };
  } catch {
    return null;
  }
}

const CLAIM = Object.freeze({
  oid: ['oid', 'http://schemas.microsoft.com/identity/claims/objectidentifier'],
  name: ['name', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'],
  upn: ['preferred_username', 'upn', 'unique_name', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn'],
  tid: ['tid', 'http://schemas.microsoft.com/identity/claims/tenantid'],
  roles: ['roles', 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'],
  groups: ['groups', 'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups'],
});

// Container Apps Easy Auth validates the session before proxying the request and
// supplies this principal header. Callers cannot opt into this path: index.js only
// trusts it when WEB_AUTH_ENABLED was set by the same Bicep deployment as authConfigs.
export function identityFromEasyAuthPrincipal(encodedPrincipal) {
  if (!encodedPrincipal || typeof encodedPrincipal !== 'string') return null;
  try {
    const principal = JSON.parse(Buffer.from(encodedPrincipal, 'base64').toString('utf8'));
    const claims = Array.isArray(principal?.claims) ? principal.claims : [];
    const values = (types) => claims
      .filter((claim) => types.includes(String(claim?.typ || '')))
      .map((claim) => String(claim?.val || '').trim())
      .filter(Boolean);
    const first = (types, fallback = null) => values(types)[0] || fallback;
    const oid = first(CLAIM.oid, principal?.user_id || null);
    const upn = first(CLAIM.upn, principal?.user_details || null);
    if (!oid && !upn) return null;
    return {
      oid,
      name: first(CLAIM.name, principal?.user_details || null),
      upn,
      tid: first(CLAIM.tid),
      roles: values(CLAIM.roles),
      groups: values(CLAIM.groups),
      verified: true,
    };
  } catch {
    return null;
  }
}
