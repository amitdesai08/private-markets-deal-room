// Report certification lifecycle (Phase 1 governance).
//
// LP-facing fund reports move through draft -> certified -> archived. Certifying
// freezes an IMMUTABLE snapshot of the current report bundle (overview + portfolio +
// value + methodology + freshness posture) together with the approver and timestamp.
// Certification is REFUSED when external sources are outside their freshness SLA
// (reportingGuard) or when required inputs are incomplete (reconciliation gate), so an
// LP-shareable artifact can never be minted from stale or incomplete data.
//
// Persistence reuses the append-only `events` store: a certify is a `report-certified`
// event carrying the frozen snapshot; an archive is a superseding `report-archived`
// event. Nothing is ever mutated, so certified snapshots are immutable by construction.

import { recordEvent, list } from './repo/index.js';

const CERTIFIED = 'report-certified';
const ARCHIVED = 'report-archived';

// Required inputs for an LP-shareable report. Missing/empty inputs block certification.
export function reportCompleteness(snapshot = {}) {
  const missing = [];
  const isObj = (o) => o && typeof o === 'object' && Object.keys(o).length > 0;
  if (!isObj(snapshot.overview)) missing.push('fund overview');
  if (!isObj(snapshot.methodology)) missing.push('metric methodology');
  if (!snapshot.reporting) missing.push('reporting-freshness posture');
  return { ok: missing.length === 0, missing };
}

// Metadata view (no heavy snapshot) for lists.
function meta(rec) {
  return {
    snapshotId: rec.snapshotId,
    state: rec.state,
    by: rec.by,
    at: rec.at,
    reason: rec.reason || null,
    archivedBy: rec.archivedBy || null,
    archivedAt: rec.archivedAt || null,
    reportingStatus: rec.snapshot?.reporting?.status || null,
  };
}

// Certify the CURRENT report bundle. `snapshot` is the frozen report; `by` is the
// approver identity label. Returns { error } when blocked, else { certification }.
export async function certifyReport({ snapshot, by, reason } = {}) {
  const reporting = snapshot?.reporting || {};
  // Block only on GENUINELY STALE data (an external source that synced but is now outside
  // its SLA). 'never' means an OPTIONAL market-data source was never configured/used — the
  // LP headline stands on the internal record, so that must not block certification.
  if (reporting.status === 'stale') {
    return { error: 'stale-sources', detail: reporting.notice || 'External source(s) are outside their freshness SLA; refresh before certifying for LP use.' };
  }
  const comp = reportCompleteness(snapshot);
  if (!comp.ok) {
    return { error: 'incomplete', detail: `Report is missing required inputs: ${comp.missing.join(', ')}.`, missing: comp.missing };
  }
  const snapshotId = `cert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const at = new Date().toISOString();
  const rec = { snapshotId, state: 'certified', by: by || 'unknown', at, reason: reason || null, snapshot };
  await recordEvent({ companyId: 'report', type: CERTIFIED, detail: rec });
  return { certification: { ...meta(rec), snapshot } };
}

// Fold the append-only events into the current certification registry (newest first).
export async function listCertifications() {
  const evs = await list('events').catch(() => []);
  const certs = new Map();
  const archives = new Map();
  for (const e of evs || []) {
    if (e?.type === CERTIFIED && e.detail?.snapshotId) certs.set(e.detail.snapshotId, e.detail);
    if (e?.type === ARCHIVED && e.detail?.snapshotId) archives.set(e.detail.snapshotId, e.detail);
  }
  const out = [];
  for (const [id, rec] of certs) {
    const arch = archives.get(id);
    out.push(meta({ ...rec, state: arch ? 'archived' : 'certified', archivedBy: arch?.by || null, archivedAt: arch?.at || null }));
  }
  out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  // ONLY ONE CERTIFICATE CAN BE THE CURRENT ONE.
  //
  // Certifying again did not retire what it replaced, so the registry showed seven live
  // certificates by the same signer, five of them within nine seconds, every one reading
  // "certified" with `archivedBy: null`. An LP asking which report is in force had seven
  // answers. A later certificate supersedes every earlier one by construction — that is
  // what certifying again means — so say so here rather than relying on somebody
  // remembering to archive the last one first.
  let current = true;
  for (const c of out) {
    if (c.state === 'archived') continue;
    if (current) {
      c.state = 'certified';
      c.current = true;
      current = false;
    } else {
      c.state = 'superseded';
      c.current = false;
      c.supersededBy = out.find((x) => x.current)?.snapshotId || null;
      c.supersededAt = out.find((x) => x.current)?.at || null;
    }
  }
  return out;
}

// The full immutable snapshot for one certification (LP export reads from here).
export async function getCertification(snapshotId) {
  const evs = await list('events').catch(() => []);
  let rec = null; let arch = null;
  for (const e of evs || []) {
    if (e?.type === CERTIFIED && e.detail?.snapshotId === snapshotId) rec = e.detail;
    if (e?.type === ARCHIVED && e.detail?.snapshotId === snapshotId) arch = e.detail;
  }
  if (!rec) return null;
  return { ...meta({ ...rec, state: arch ? 'archived' : 'certified', archivedBy: arch?.by || null, archivedAt: arch?.at || null }), snapshot: rec.snapshot };
}

// Archive a certified snapshot (supersede). The immutable snapshot is untouched.
export async function archiveCertification(snapshotId, by) {
  const cur = await getCertification(snapshotId);
  if (!cur) return { error: 'not-found' };
  if (cur.state === 'archived') return { certification: cur };
  await recordEvent({ companyId: 'report', type: ARCHIVED, detail: { snapshotId, by: by || 'unknown', at: new Date().toISOString() } });
  return { certification: { ...cur, state: 'archived', archivedBy: by || 'unknown', archivedAt: new Date().toISOString() } };
}
