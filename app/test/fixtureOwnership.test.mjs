// A DEAL IS ONE DOCUMENT HOLDING TWO THINGS WITH DIFFERENT OWNERS.
//
// The fixture describes the company. The record is what the firm has since done about it —
// findings, IC conditions, the activity trail, the stage it has reached. They were stored in
// the same object and the reseed replaced the object, so "refresh what the fixture says" and
// "discard everything anyone recorded" were the same operation.
//
// Measured on production before this changed: twenty-one findings and nineteen sets of IC
// conditions across the nineteen seeded deals, none of it present in the fixture. The only
// instrument for correcting a policy flag would have destroyed all of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrate, getDealRaw, listDeals, recordIssue, resyncSeededDeals } from '../lib/store.js';
import { seededDeals } from '../data/deals.js';

await hydrate();

const anySeeded = () => seededDeals[0].id;

test('refreshing the fixture keeps everything the record owns', async () => {
  const id = anySeeded();
  await recordIssue(id, { lane: 'commercial', title: 'recorded before a fixture refresh', severity: 'caution' });

  const before = getDealRaw(id);
  const issuesBefore = (before.issues || []).length;
  const stageBefore = before.stage;
  assert.ok(issuesBefore > 0, 'fixture assumption: the deal carries a recorded finding');

  resyncSeededDeals({ persona: 'admin' });

  const after = getDealRaw(id);
  assert.equal((after.issues || []).length, issuesBefore, 'a fixture refresh discarded recorded findings');
  assert.equal(after.stage, stageBefore, 'a fixture refresh moved the deal back a stage');
  assert.ok((after.issues || []).some((i) => i.title === 'recorded before a fixture refresh'),
    'the finding survived by count but not by identity');
});

test('refreshing the fixture does apply what the fixture owns', () => {
  const id = anySeeded();
  const live = getDealRaw(id);
  const demo = seededDeals.find((d) => d.id === id);
  // Policy is the fixture's to state, and the reason this instrument exists at all.
  live.pipelineVisible = !demo.pipelineVisible;
  live.company = 'Renamed By Hand';

  resyncSeededDeals({ persona: 'admin' });

  const after = getDealRaw(id);
  assert.equal(!!after.pipelineVisible, !!demo.pipelineVisible, 'the fixture did not restore its own policy flag');
  assert.equal(after.company, demo.company, 'the fixture did not restore its own reference data');
});

test('the destructive mode is still available, and is the only thing that discards', async () => {
  const id = anySeeded();
  await recordIssue(id, { lane: 'commercial', title: 'about to be discarded on purpose', severity: 'caution' });
  assert.ok((getDealRaw(id).issues || []).length > 0, 'fixture assumption: a finding exists to discard');

  resyncSeededDeals({ persona: 'admin', mode: 'full' });

  const after = getDealRaw(id);
  assert.ok(!(after.issues || []).some((i) => i.title === 'about to be discarded on purpose'),
    'mode "full" no longer resets the record — the deliberate instrument has stopped working');
});

test('a fixture refresh never changes how many deals there are', () => {
  const before = listDeals(null, 'partner').length;
  resyncSeededDeals({ persona: 'admin' });
  assert.equal(listDeals(null, 'partner').length, before,
    'a fixture refresh added or removed deals — promoted candidates are not the fixture\'s to delete');
});

// THE BOUNDARY IS THE DOCUMENT NOW, NOT A LIST I HAVE TO MAINTAIN.
//
// RECORD_OWNED made the destructive case impossible as long as somebody kept the list
// current. Work products live in their own document instead: the fixture path writes the
// deal and cannot reach the record, whatever anybody forgets to add to a list.
test('a deal document carries no work products once it has been written', async () => {
  const { recordDocFor, dealDocFor } = await import('../lib/store.js');
  const id = seededDeals[0].id;
  await recordIssue(id, { lane: 'commercial', title: 'lives in the record', severity: 'caution' });

  const deal = dealDocFor(id);
  const record = recordDocFor(id);
  assert.ok(record, 'no record document was written for the deal');
  assert.equal(record.kind, 'deal-record', 'the record is not marked as one');
  assert.equal(record.dealId, id, 'the record does not name its deal');

  for (const field of ['issues', 'conditions', 'activity', 'assumptionSnapshots', 'icOverrides']) {
    assert.ok(!(field in deal), `${field} is still on the deal document`);
  }
  assert.ok((record.issues || []).some((i) => i.title === 'lives in the record'),
    'the finding did not reach the record document');
});

test('the composed deal still looks exactly as the rest of the code expects', async () => {
  const id = seededDeals[0].id;
  await recordIssue(id, { lane: 'legal', title: 'still readable through getDealRaw', severity: 'caution' });
  const d = getDealRaw(id);
  assert.ok(Array.isArray(d.issues), 'issues are no longer readable on the deal');
  assert.ok(d.issues.some((i) => i.title === 'still readable through getDealRaw'),
    'a finding written after the split is not visible where every caller reads it');
  assert.ok(Array.isArray(d.activity), 'the activity trail is no longer readable on the deal');
});
