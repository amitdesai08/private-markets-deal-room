// SC-4 (metric lineage) + SC-7 (freshness) evidence: the fund metric dictionary is
// complete and lineage-stamped, and connector freshness is computed against an SLA.

import test from 'node:test';
import assert from 'node:assert/strict';
import { FUND_METRICS, fundMethodology, withFundMeta } from '../lib/metrics.js';
import { connectorFreshness } from '../lib/connectors.js';

test('every fund metric has id, label, formula, definition, unit and category', () => {
  assert.ok(FUND_METRICS.length >= 8, 'expected the core fund KPIs to be defined');
  for (const m of FUND_METRICS) {
    for (const k of ['id', 'label', 'formula', 'definition', 'unit', 'category']) {
      assert.ok(m[k] !== undefined && m[k] !== '', `metric ${m.id || '?'} missing ${k}`);
    }
  }
  // the KPIs the Fund view renders must all be defined
  for (const id of ['tvpi', 'dpi', 'rvpi', 'grossMoic', 'netMoic', 'grossIrr', 'netIrr', 'sectorConcentration', 'positionConcentration']) {
    assert.ok(FUND_METRICS.some((m) => m.id === id), `missing definition for ${id}`);
  }
});

test('methodology stamps a valid as-of, source-of-record and refresh cadence', () => {
  const m = fundMethodology();
  assert.ok(!Number.isNaN(Date.parse(m.asOf)), 'asOf is not a valid timestamp');
  assert.ok(m.sourceOfRecord && m.refreshCadence, 'lineage fields missing');
  assert.equal(m.metrics.length, FUND_METRICS.length);
});

test('fund payloads are stamped with lineage meta (as-of + methodology link)', () => {
  const stamped = withFundMeta({ tvpi: 1.9 });
  assert.equal(stamped.tvpi, 1.9, 'payload shape preserved');
  assert.ok(stamped._meta, 'no _meta stamp');
  assert.ok(!Number.isNaN(Date.parse(stamped._meta.asOf)));
  assert.equal(stamped._meta.methodology, '/api/fund/methodology');
});

test('connector freshness is SLA-based (never before any successful sync)', () => {
  const f = connectorFreshness('edgar');
  assert.ok(f, 'freshness should be computed for a built-in connector');
  assert.equal(f.status, 'never', 'no sync yet on a fresh process');
  assert.ok(f.slaMs > 0, 'an SLA must be defined');
});
