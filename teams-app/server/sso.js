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

// A VERIFIED identity from the Teams SSO token, or null.
//
// This used to base64-decode the payload and return it, with a comment describing that as
// "minimal ... (no network call)". It checked no signature, no issuer, no audience and no
// expiry — so `{"oid":"partner","roles":["admin"]}`, base64'd between two dots, was
// accepted as a signed-in administrator. It was the front door, and it was not locked;
// every access control downstream of it was decoration.
//
// The correct code was already in this repository, guarding /mcp. This is the same:
// signature against the tenant's JWKS, issuer, audience, and the tenant of the token
// itself, so one minted elsewhere for an app sharing our audience is refused.
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
