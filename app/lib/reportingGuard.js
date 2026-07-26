// Reporting freshness guard (advisor SC-7 hardening) — the SINGLE decision every
// IC-, LP- or export-facing output path uses before emitting a figure that depends
// on external sources. It rolls a record up to the freshness of its WEAKEST backing
// source (mixed-source records are downgraded as a whole AND the offending components
// are isolated), and either BLOCKS the output or attaches a machine-readable notice so
// stale third-party data can never silently feed a decision or LP report.

import { connectorFreshness } from './connectors.js';

// External sources whose staleness would compromise an IC-/LP-facing figure.
export const REPORTING_SOURCE_IDS = [
  'morningstar', 'lseg', 'moodys', 'edgar', 'gdelt', 'web',
  'fabric-agent', 'pitchbook', 'factset', 'capitaliq',
];

// Roll multiple sources up to the freshness of the weakest component: overall is
// 'fresh' only when EVERY backing source is fresh; otherwise the whole record is
// downgraded ('stale' if any source is stale, else 'never') and the non-fresh
// components are isolated so a consumer can label or exclude just those subcomponents.
export function recordFreshness(sourceIds = []) {
  const components = (sourceIds || []).map((id) => {
    const f = connectorFreshness(id) || { status: 'never', slaMs: null, ageMs: null, lastSync: null };
    return { id, status: f.status, ageMs: f.ageMs, slaMs: f.slaMs, lastSync: f.lastSync };
  });
  const notFresh = components.filter((c) => c.status !== 'fresh');
  const stale = components.filter((c) => c.status === 'stale');
  const never = components.filter((c) => c.status === 'never');
  const status = notFresh.length === 0 ? 'fresh' : stale.length ? 'stale' : 'never';
  return { status, components, staleComponents: stale, neverComponents: never, notFresh };
}

// Canonical gate. When block=true a non-fresh record is refused (ok:false, blocked:true);
// otherwise a clear notice is returned so the output is labelled "not certified for
// IC/LP use". Either way the output is never silently emitted from stale data.
export function guardReporting(sourceIds = [], { block = false } = {}) {
  const roll = recordFreshness(sourceIds);
  const ok = roll.status === 'fresh';
  const staleSources = roll.notFresh.map((c) => c.id);
  const notice = ok
    ? null
    : `Contains data from source(s) outside their freshness SLA (${staleSources.join(', ') || 'none synced'}); ${block ? 'blocked from' : 'not certified for'} IC / LP-facing use until refreshed.`;
  return { ok, blocked: block && !ok, status: roll.status, staleSources, notice, components: roll.components };
}
