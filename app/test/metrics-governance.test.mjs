// Advisor SC-4 durability: prove the metric dictionary is the ENFORCED single source
// of truth — ids are unique, every rendered KPI resolves through metricDef(), and the
// methodology endpoint cannot diverge from the dictionary.

import test from 'node:test';
import assert from 'node:assert/strict';
import { FUND_METRICS, FUND_METRIC_IDS, metricDef, fundMethodology } from '../lib/metrics.js';

test('metric ids are unique (no duplicate/shadowed definitions)', () => {
  assert.equal(new Set(FUND_METRIC_IDS).size, FUND_METRIC_IDS.length);
});

test('every KPI the Fund & Portfolio views render resolves through metricDef()', () => {
  // Keep this list in lock-step with the KPIs surfaced in the UI/exports; a new KPI
  // that lacks a governed definition fails CI here (no per-view bypass of metrics.js).
  const RENDERED = ['tvpi', 'dpi', 'rvpi', 'grossMoic', 'netMoic', 'grossIrr', 'netIrr', 'deployedPct', 'dryPowder', 'sectorConcentration', 'positionConcentration'];
  for (const id of RENDERED) {
    const d = metricDef(id);
    assert.ok(d, `KPI "${id}" has no governed definition in metrics.js`);
    assert.ok(d.formula && d.definition, `KPI "${id}" definition is incomplete`);
  }
});

test('metricDef returns null for an unknown metric (no silent invention)', () => {
  assert.equal(metricDef('made_up_metric'), null);
});

test('the methodology endpoint cannot diverge from the dictionary (single source)', () => {
  const m = fundMethodology();
  assert.equal(m.metrics.length, FUND_METRICS.length);
  assert.deepEqual(m.metrics.map((x) => x.id), FUND_METRIC_IDS);
});
