// GLEIF — free, keyless legal-entity + ownership lookup (api.gleif.org).
//
// Supplements paid provider data for KYC / entity resolution and corporate
// ownership mapping: resolve a company name to its Legal Entity Identifier (LEI),
// then walk the ownership tree (direct + ultimate parent). No key required.

import { isConnectorEnabled } from '../connectorSettings.js';

const BASE = 'https://api.gleif.org/api/v1';
const HEADERS = { Accept: 'application/vnd.api+json' };

export function gleifConfigured() {
  return true; // free + keyless
}

function toRecord(d) {
  const e = d?.attributes?.entity || {};
  return {
    lei: d.id,
    name: e.legalName?.name,
    status: e.status,
    jurisdiction: e.jurisdiction,
    country: e.legalAddress?.country,
    registeredAs: e.registeredAs,
    category: e.category,
  };
}

// Resolve a company name to candidate LEI records (fuzzy legal-name match).
export async function leiLookup(name) {
  if (!isConnectorEnabled('gleif')) return { found: false, source: 'gleif', disabled: true, records: [] };
  const url = `${BASE}/lei-records?filter[entity.legalName]=${encodeURIComponent(name)}&page[size]=5`;
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  if (!r.ok) return { found: false, source: 'gleif', records: [] };
  const data = await r.json().catch(() => ({}));
  const records = (data.data || []).map(toRecord);
  return { found: records.length > 0, source: 'gleif', records };
}

// The ultimate parent of an LEI (corporate-hierarchy relationship), when GLEIF
// holds one. Returns null when the entity reports no ultimate parent.
export async function leiUltimateParent(lei) {
  const url = `${BASE}/lei-records/${encodeURIComponent(lei)}/ultimate-parent`;
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  if (!r.ok) return { source: 'gleif', lei, parent: null };
  const data = await r.json().catch(() => ({}));
  return { source: 'gleif', lei, parent: data?.data ? toRecord(data.data) : null };
}
