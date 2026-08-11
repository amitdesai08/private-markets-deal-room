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
  // NEVER CONNECTED IS NOT OUT OF DATE.
  //
  // Both states were folded into one sentence, so a panel listing Morningstar, LSEG,
  // Moody's, PitchBook, FactSet and CapIQ — none of which this deployment subscribes to —
  // told a room they held data "outside its freshness SLA", and invited the one question
  // a presenter cannot answer: are you licensed with FactSet? An optional feed nobody
  // connected says nothing about the report; a feed that synced and went stale does.
  const stale = roll.staleComponents.map((c) => c.id);
  const never = roll.neverComponents.map((c) => c.id);
  const parts = [];
  if (stale.length) parts.push(`Data from ${stale.join(', ')} is outside its freshness SLA; ${block ? 'blocked from' : 'not certified for'} IC / LP-facing use until refreshed.`);
  if (never.length) parts.push(`Optional market-data sources not connected on this deployment: ${never.join(', ')}. The figures here stand on the fund's own record and do not depend on them${block ? ', but this output was asked to require them' : ''}.`);
  const notice = ok ? null : parts.join(' ');
  return { ok, blocked: block && !ok, status: roll.status, staleSources, stale, never, notice, components: roll.components };
}
