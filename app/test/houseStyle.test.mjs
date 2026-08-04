// Every case below was read by somebody on a live screen before it was fixed. They are
// all the same fault in different clothes: a substitution written as though it were the
// only thing on the line. Spell out one code and the sentence around it stops making
// sense; clean up the mess and the rule that makes the mess runs afterwards.
//
// The pattern is worth naming because it keeps coming back — "IC IC papers" in round
// 21, "Stage this stage" in round 24, "ready for committee for committee" in round 25.
// These assertions are what stops it coming back a fourth time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { houseStyle } from '../lib/ai.js';

test('a step code never reaches the reader as vocabulary', () => {
  assert.doesNotMatch(houseStyle('Current step is D3 and the memo is open.'), /\bD3\b/);
  assert.doesNotMatch(houseStyle('Finalise the E1 pack.'), /\bE1\b/);
});

test('"Stage this stage" never appears', () => {
  const out = houseStyle('Deal size $240M; Stage: D3. Owner is unassigned.');
  assert.doesNotMatch(out, /Stage this stage/i);
  assert.doesNotMatch(out, /Stage:?\s*this stage/i);
  assert.match(out, /Deal size \$240M/);
  assert.match(out, /Owner is unassigned/);
});

test('the readiness enum is not spelled out twice in a row', () => {
  for (const md of [
    'IC readiness: NOT-READY: NOT-READY; 4 required items outstanding.',
    'NOT-READY. NOT-READY — 4 required items outstanding.',
    'NOT-READY — the record shows: NOT-READY; 4 required items outstanding.',
    'Status NOT-READY, and again NOT-READY: 4 required items outstanding.',
  ]) {
    const out = houseStyle(md);
    assert.equal((out.match(/not ready for committee/gi) || []).length, 1, out);
    assert.match(out, /4 required items outstanding/, out);
    assert.doesNotMatch(out, /[:;\u2014,]\s*[:;,\u2014]/, `punctuation left behind: ${out}`);
    assert.doesNotMatch(out, /\w\u2014/, `a dash with no air in front of it: ${out}`);
  }
});

// The model quotes the field verbatim, quotation marks and all, as though it were
// citing a source rather than reading the deal's own record. The quotes hid the
// repetition from the rule that collapses it.
test('quotation marks around the readiness field do not hide the repetition', () => {
  const out = houseStyle('IC readiness: NOT-READY — "NOT-READY — 4 required items outstanding: Final IC memo".');
  assert.equal((out.match(/not ready for committee/gi) || []).length, 1, out);
  assert.match(out, /4 required items outstanding/);
  assert.doesNotMatch(out, /"/, `a stray quotation mark was left behind: ${out}`);
});

test('the record is read, not cited -- no quotation marks around its own fields', () => {
  const out = houseStyle('Blocked: "2 workstreams blocking: Legal DD, ESG / Environmental".');
  assert.doesNotMatch(out, /"/, out);
  assert.match(out, /2 workstreams blocking: Legal DD, ESG \/ Environmental/);
});

test('a contradiction between two fields is left visible, not tidied away', () => {
  const out = houseStyle('Status: NOT-READY. IC-READY per the board.');
  assert.match(out, /not ready for committee/i);
  assert.match(out, /(?<!not )ready for committee/i);
});

test('"ready for committee for committee" never appears', () => {
  assert.doesNotMatch(houseStyle('The deal is IC-ready for committee.'), /for committee for committee/i);
  assert.doesNotMatch(houseStyle('It is NOT-READY for committee.'), /for committee for committee/i);
});

test('a label is not restated as the unit of its own value', () => {
  assert.equal(houseStyle('Base-case IRR: 22.5% IRR'), 'Base-case IRR: 22.5%');
  assert.equal(houseStyle('Base-case MOIC: 2.76x MOIC'), 'Base-case MOIC: 2.76x');
});

test('"IC IC" is never re-manufactured by a later rule', () => {
  assert.doesNotMatch(houseStyle('The IC artifacts are drafted.'), /\bIC IC\b/);
  assert.doesNotMatch(houseStyle('The IC IC papers papers are drafted.'), /\b(IC IC|papers papers)\b/);
});

test('ordinary prose with the word ready in it is untouched', () => {
  const md = 'The team is ready to travel and the data room is ready for the buyer.';
  assert.equal(houseStyle(md), md);
});
