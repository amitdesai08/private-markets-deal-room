// Advisor SC-7 hardening: prove stale-data suppression is a real gate (not just a UI
// badge) and that mixed-source records are rolled up to the weakest component.

import test from 'node:test';
import assert from 'node:assert/strict';
import { recordFreshness, guardReporting } from '../lib/reportingGuard.js';
import { markSync } from '../lib/connectors.js';

test('an output with no external sources is trivially reporting-fresh', () => {
  const g = guardReporting([]);
  assert.equal(g.ok, true);
  assert.equal(g.notice, null);
});

test('un-synced external sources BLOCK an IC/LP output when block=true', () => {
  const g = guardReporting(['edgar', 'gdelt'], { block: true }); // fresh process → both "never"
  assert.equal(g.ok, false);
  assert.equal(g.blocked, true);
  // The notice used to call a source that had NEVER been connected "outside its freshness
  // SLA", which put six market-data vendors this deployment does not subscribe to on screen
  // as though the fund's data had gone out of date. It must still refuse clearly, naming
  // the sources — it just may not describe an absent feed as a stale one.
  assert.ok(g.notice && /freshness SLA|not connected/i.test(g.notice), 'a clear notice must be attached');
  assert.ok(g.notice.includes('edgar') && g.notice.includes('gdelt'), 'the notice must name the sources');
  assert.deepEqual(g.staleSources.sort(), ['edgar', 'gdelt']);
});

test('mixed-source record is downgraded as a whole AND isolates the stale component', () => {
  markSync('edgar'); // edgar now fresh; gdelt still never
  const roll = recordFreshness(['edgar', 'gdelt']);
  assert.notEqual(roll.status, 'fresh', 'one non-fresh source must downgrade the whole record');
  const edgar = roll.components.find((c) => c.id === 'edgar');
  const gdelt = roll.components.find((c) => c.id === 'gdelt');
  assert.equal(edgar.status, 'fresh');
  assert.equal(gdelt.status, 'never');
  assert.deepEqual(roll.notFresh.map((c) => c.id), ['gdelt'], 'the stale subcomponent is isolated');
});

test('a record is reporting-fresh only when EVERY backing source is fresh', () => {
  markSync('edgar');
  markSync('gdelt');
  const g = guardReporting(['edgar', 'gdelt']);
  assert.equal(g.ok, true);
  assert.equal(g.status, 'fresh');
  assert.equal(g.notice, null);
});
