// Report certification lifecycle guard. Certifying must be refused on stale sources
// or incomplete inputs; a certified snapshot must be listable, retrievable, archivable,
// and IMMUTABLE (the frozen data never changes, even after archive). Runs on the
// in-memory events store (no datastore needed).

import test from 'node:test';
import assert from 'node:assert/strict';
import { certifyReport, listCertifications, getCertification, archiveCertification, reportCompleteness } from '../lib/reportCert.js';

const fresh = { ok: true, status: 'fresh' };
const stale = { ok: false, status: 'stale', notice: 'source X outside SLA' };
const fullSnap = (reporting) => ({ overview: { committed: 2600, invested: 46 }, methodology: { metrics: [{ id: 'moic' }] }, portfolio: [], value: {}, reporting });

test('certification is refused when external sources are stale', async () => {
  const r = await certifyReport({ snapshot: fullSnap(stale), by: 'Eleanor · Partner' });
  assert.equal(r.error, 'stale-sources');
});

test('a never-synced OPTIONAL source does not block certification (internal report)', async () => {
  const never = { ok: false, status: 'never' };
  const r = await certifyReport({ snapshot: fullSnap(never), by: 'Eleanor · Partner' });
  assert.ok(r.certification?.snapshotId, 'never-synced optional sources still allow certify');
});

test('certification is refused when required inputs are incomplete', async () => {
  const r = await certifyReport({ snapshot: { reporting: fresh }, by: 'Eleanor · Partner' });
  assert.equal(r.error, 'incomplete');
  assert.ok(r.missing.includes('fund overview'));
  assert.ok(r.missing.includes('metric methodology'));
});

test('reportCompleteness flags missing inputs and passes a full snapshot', () => {
  assert.equal(reportCompleteness({}).ok, false);
  assert.equal(reportCompleteness(fullSnap(fresh)).ok, true);
});

test('certify -> list -> get -> archive, with an immutable frozen snapshot', async () => {
  const c = await certifyReport({ snapshot: fullSnap(fresh), by: 'Eleanor · Partner', reason: 'Q2 LP pack' });
  assert.ok(c.certification?.snapshotId, 'certify returns a snapshotId');
  const id = c.certification.snapshotId;

  const listed = (await listCertifications()).find((x) => x.snapshotId === id);
  assert.ok(listed, 'appears in the certification list');
  assert.equal(listed.state, 'certified');
  assert.equal(listed.by, 'Eleanor · Partner');

  const full = await getCertification(id);
  assert.equal(full.snapshot.overview.committed, 2600, 'snapshot is retrievable');

  const arch = await archiveCertification(id, 'Eleanor · Partner');
  assert.equal(arch.certification.state, 'archived');

  const after = await getCertification(id);
  assert.equal(after.state, 'archived');
  assert.equal(after.snapshot.overview.committed, 2600, 'archiving never mutates the frozen snapshot');
});
