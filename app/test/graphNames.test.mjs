// The company name becomes a SharePoint folder name. SharePoint's rules are not
// the same as a filesystem's, and the difference was costing real deals their data
// room: "Voyager Therapeutics, Inc." ends in a period, which Graph rejects with a
// bare 400 invalidRequest, so the deal's documents tab came up empty forever.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeDocName } from '../lib/m365/graph.js';

test('a trailing period is removed — SharePoint rejects it outright', () => {
  assert.equal(safeDocName('Voyager Therapeutics, Inc.'), 'Voyager Therapeutics, Inc');
  assert.equal(safeDocName('Acme Holdings Ltd.'), 'Acme Holdings Ltd');
  assert.equal(safeDocName('Something Odd...'), 'Something Odd');
});

test('a leading period is removed — it makes a hidden-looking folder', () => {
  assert.equal(safeDocName('.Stealth Co'), 'Stealth Co');
});

test('characters SharePoint forbids become a single space', () => {
  assert.equal(safeDocName('Nordic/Grocery: Group*'), 'Nordic Grocery Group');
  assert.equal(safeDocName('A#1 %Capital%'), 'A 1 Capital');
});

test('an ordinary name is left alone', () => {
  assert.equal(safeDocName('Helvetia Diagnostics'), 'Helvetia Diagnostics');
  assert.equal(safeDocName('Grupo Añejo S.A. de C.V'), 'Grupo Añejo S.A. de C.V');
});

test('a name that sanitises away falls back rather than sending an empty folder name', () => {
  assert.equal(safeDocName('...'), 'Deal');
  assert.equal(safeDocName('///'), 'Deal');
  assert.equal(safeDocName(''), 'Deal');
  assert.equal(safeDocName(null), 'Deal');
  assert.equal(safeDocName(undefined), 'Deal');
});

test('a very long name is truncated and still cannot end in a period', () => {
  const name = safeDocName('X'.repeat(118) + ' Inc.');
  assert.ok(name.length <= 120, `expected <= 120 chars, got ${name.length}`);
  assert.ok(!name.endsWith('.'), `must not end in a period: ${name}`);
});
