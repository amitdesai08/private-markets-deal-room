// Group-driven territory + deal access: a user's visible REGIONS and the deals they
// may open are derived from their Entra security-group memberships (token 'groups').
// Region scoping only ever NARROWS (empty = see all); tag/deal groups grant full access.

import test from 'node:test';
import assert from 'node:assert/strict';
import { regionForDeal, expandRegionScope } from '../data/regions.js';
import { dealAccessLevel, regionsForIdentity } from '../lib/userPolicy.js';
import { setRegionGroup, upsertDealGroup } from '../lib/accessConfig.js';

test('regionForDeal infers a stable region from the deal hq', () => {
  assert.equal(regionForDeal({ hq: 'Austin, Texas' }), 'southcentral');
  assert.equal(regionForDeal({ hq: 'New York, NY' }), 'northeast');
  assert.equal(regionForDeal({ hq: 'London, United Kingdom' }), 'international');
  assert.equal(regionForDeal({ region: 'northwest' }), 'northwest'); // explicit wins
  assert.equal(regionForDeal({ hq: '' }), ''); // unassigned = visible to all
});

test('a grouped region (West Coast) expands to its base regions', () => {
  assert.deepEqual(expandRegionScope('west-coast').sort(), ['northwest', 'southwest']);
  assert.deepEqual(expandRegionScope('northeast'), ['northeast']);
});

// The fixtures carry pipelineVisible because the subject here is the REGION wall. Without
// it they are hidden by the origination default and the test would pass on the wrong
// reason \u2014 every assertion below would be about awareness rather than about territory.
test('region-group membership scopes visibility; users in no region group see all', async () => {
  await setRegionGroup('grp-ne', ['northeast']);
  const neUser = { oid: 'u-ne', groups: ['grp-ne'] };
  assert.deepEqual(regionsForIdentity(neUser), ['northeast']);
  assert.equal(dealAccessLevel(neUser, { hq: 'Dallas, Texas', stage: 'O1', pipelineVisible: true }), 'none', 'out-of-region hidden');
  assert.notEqual(dealAccessLevel(neUser, { hq: 'Boston, MA', stage: 'O1', pipelineVisible: true }), 'none', 'in-region visible');

  const anyUser = { oid: 'u-any', groups: [] };
  assert.deepEqual(regionsForIdentity(anyUser), []);
  assert.notEqual(dealAccessLevel(anyUser, { hq: 'Dallas, Texas', stage: 'O1', pipelineVisible: true }), 'none', 'no region group = all regions');
});

test('a grouped-region manager sees every deal in the territory', async () => {
  await setRegionGroup('grp-west', ['northwest', 'southwest']);
  const mgr = { oid: 'u-mgr', groups: ['grp-west'] };
  assert.deepEqual(regionsForIdentity(mgr).sort(), ['northwest', 'southwest']);
  assert.notEqual(dealAccessLevel(mgr, { hq: 'Seattle, Washington', stage: 'O1', pipelineVisible: true }), 'none'); // NW
  assert.notEqual(dealAccessLevel(mgr, { hq: 'Los Angeles, California', stage: 'O1', pipelineVisible: true }), 'none'); // SW
  assert.equal(dealAccessLevel(mgr, { hq: 'Boston, MA', stage: 'O1', pipelineVisible: true }), 'none'); // outside territory
});

test('tag/deal-group membership grants FULL access to tagged deals', async () => {
  await upsertDealGroup('project-atlas', { label: 'Project Atlas', groupId: 'grp-atlas' });
  const tagged = { id: 'd1', hq: 'Dallas, Texas', stage: 'D2', tags: ['project-atlas'] };
  const member = { oid: 'u-tag', groups: ['grp-atlas'] };  // in the deal group
  const outsider = { oid: 'u-out', groups: [] };
  assert.equal(dealAccessLevel(member, tagged), 'full', 'deal-group member gets the workspace');
  // This used to expect 'status'. An outsider was shown the row with its detail stripped,
  // which still disclosed that the deal existed, what the company was called and roughly
  // what it was worth. A restricted deal is now absent unless it opts into being known.
  assert.equal(dealAccessLevel(outsider, tagged), 'none', 'an outsider is not told the deal exists');
  assert.equal(
    dealAccessLevel(outsider, { ...tagged, pipelineVisible: true }),
    'status',
    'a deal that opts into firm-wide awareness is listed, without its detail',
  );
});
