// Inbound pipeline pull + outbound IC-decision write-back for a CRM / system-of-record
// (SoR) connector — DealCloud, Salesforce FSC, Allvue/eFront, or an internal deal
// database. Implements the design in docs/integration/DATA-INTEGRATION.md Part B:
// the SoR remains authoritative for pipeline/relationships, the Deal Room for decision
// artifacts — this module is the one place those two directions cross.
//
// Deliberately vendor-agnostic: we don't know any one customer's exact schema, so the
// inbound side does best-effort field extraction across common REST/CRM export shapes
// rather than hardcoding Salesforce/DealCloud specifics we can't verify against a real
// tenant. The outbound side posts a plain JSON payload to an admin-configured path.

import { assertPublicHttpUrl } from './ssrf.js';

// Resolve a real Authorization header for a sor connector's configured credential
// (OAuth client-credentials or a plain API key). Shared by connectors.js's testSor()
// probe and the sync functions below so the auth path is proven and exercised the
// same way everywhere, not reimplemented per call site.
export async function sorAuthHeader(cfg) {
  if (cfg.authType === 'oauthClientCredentials') {
    if (!cfg.tokenUrl || !cfg.clientId || !cfg.clientSecret) throw new Error('OAuth credentials not configured');
    await assertPublicHttpUrl(cfg.tokenUrl);
    const tokenRes = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cfg.clientId, client_secret: cfg.clientSecret }),
      signal: AbortSignal.timeout(8000),
    });
    if (!tokenRes.ok) throw new Error(`Token request failed \u00b7 HTTP ${tokenRes.status}`);
    const body = await tokenRes.json().catch(() => ({}));
    if (!body.access_token) throw new Error('Token request returned no access_token');
    return `Bearer ${body.access_token}`;
  }
  if (cfg.apiKey) return `Bearer ${cfg.apiKey}`;
  throw new Error('No credentials configured');
}

// Named aliases so a firm's existing field names map onto the canonical deal shape
// without us guessing any one vendor's schema.
const FIELD_ALIASES = {
  id: ['id', 'Id', 'ID', 'dealId', 'DealId', 'recordId', 'entryId'],
  company: ['company', 'Company', 'name', 'Name', 'dealName', 'DealName', 'accountName', 'AccountName', 'companyName'],
  sector: ['sector', 'Sector', 'industry', 'Industry'],
  subSector: ['subSector', 'SubSector', 'subIndustry'],
  hq: ['hq', 'HQ', 'headquarters', 'location', 'city'],
  dealSize: ['dealSize', 'DealSize', 'amount', 'Amount', 'value', 'Value'],
  currency: ['currency', 'Currency', 'currencyIsoCode', 'CurrencyIsoCode'],
  thesis: ['thesis', 'description', 'Description', 'notes', 'Notes'],
};

function pick(rec, key) {
  for (const alias of FIELD_ALIASES[key] || [key]) {
    if (rec[alias] !== undefined && rec[alias] !== null && rec[alias] !== '') return rec[alias];
  }
  return undefined;
}

// Unwrap the handful of common REST list shapes: Salesforce wraps under `records`;
// plenty of generic APIs use `data`/`items`/`value`; some just return a bare array.
function unwrapList(body) {
  if (Array.isArray(body)) return body;
  for (const key of ['records', 'data', 'items', 'value', 'deals', 'results']) {
    if (Array.isArray(body?.[key])) return body[key];
  }
  return [];
}

// Fetch + normalise the SoR's deal list. Throws on any failure (auth, network, non-2xx)
// — the caller decides how to surface that, this never silently returns an empty list
// on an error that isn't actually "no deals".
export async function fetchSorDeals(cfg) {
  if (!cfg.baseUrl) throw new Error('No API base URL configured');
  if (!cfg.dealsPath) throw new Error('No deals-list path configured');
  await assertPublicHttpUrl(cfg.baseUrl);
  const authHeader = await sorAuthHeader(cfg);
  const url = cfg.baseUrl.replace(/\/$/, '') + cfg.dealsPath;
  const res = await fetch(url, { method: 'GET', headers: { Authorization: authHeader }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Deals-list request failed \u00b7 HTTP ${res.status}`);
  const body = await res.json().catch(() => null);
  const list = unwrapList(body);
  return list
    .map((rec) => {
      const externalId = String(pick(rec, 'id') ?? '').trim();
      const company = String(pick(rec, 'company') ?? '').trim();
      if (!externalId || !company) return null;
      return {
        externalId,
        company,
        sector: pick(rec, 'sector') || 'Other',
        subSector: pick(rec, 'subSector') || pick(rec, 'sector') || 'Other',
        hq: String(pick(rec, 'hq') || ''),
        dealSize: Number(pick(rec, 'dealSize')) || 0,
        currency: pick(rec, 'currency') || 'USD',
        thesis: String(pick(rec, 'thesis') || ''),
      };
    })
    .filter(Boolean);
}

// Push an IC decision back to the SoR — the outbound half of the bi-directional sync.
// Best-effort by design: a firm's CRM being briefly unreachable must never be able to
// block or roll back a real IC decision recorded in the Deal Room, so the caller is
// expected to fire this without awaiting it inline on the decision path, and to treat
// any thrown error as "log it, don't retry inline".
export async function pushIcDecision(cfg, payload) {
  if (!cfg.baseUrl) throw new Error('No API base URL configured');
  if (!cfg.writeBackPath) throw new Error('No write-back path configured');
  await assertPublicHttpUrl(cfg.baseUrl);
  const authHeader = await sorAuthHeader(cfg);
  const url = cfg.baseUrl.replace(/\/$/, '') + cfg.writeBackPath;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Write-back request failed \u00b7 HTTP ${res.status}`);
  return true;
}
