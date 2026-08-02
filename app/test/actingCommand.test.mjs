// Switching who you are asking as, from inside the channel.
//
// The tab's switcher and this share one record, but a demo happens in the conversation:
// alt-tabbing to a dashboard to change who is speaking breaks the story being told. It
// also makes the whole path testable without a Teams channel, which is the only part of
// this feature that could not otherwise be exercised here.
//
// Resolving a spoken name to a person is the part that can quietly go wrong, so it is
// pulled out and tested directly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { matchProfile } from '../../teams-app/server/bot.js';

// A faithful slice of the real roster — several titles contain the word "Partner",
// which is exactly the collision the matcher has to survive.
const ROSTER = [
  { id: 'admin', name: 'Michael Realman', title: 'The Architect — Administrator', role: 'admin' },
  { id: 'partner', name: 'Eleanor Shellstrop', title: 'Partner — Deal Sponsor & IC Chair', role: 'partner' },
  { id: 'ai-md', name: 'Janet', title: 'AI Partner — Tech & Digital Value', role: 'deal-team' },
  { id: 'supply-md', name: 'Doug Forcett', title: 'Supply Chain Partner — Operations', role: 'deal-team' },
  { id: 'fund-cfo', name: 'Mindy St. Claire', title: 'Finance Partner — Fund CFO', role: 'deal-team' },
  { id: 'analyst', name: 'Chidi Anagonye', title: 'Analyst — Northeast desk', role: 'analyst' },
];

test('an exact profile id wins over every title that mentions the same word', () => {
  // Four of the six titles contain "Partner". Without the id taking precedence, asking
  // to act as the partner would be ambiguous — or worse, silently pick the AI lead.
  const { match } = matchProfile('partner', ROSTER);
  assert.equal(match?.id, 'partner');
  assert.equal(matchProfile('fund-cfo', ROSTER).match?.id, 'fund-cfo');
});

test('a person can be named the way a presenter would say it', () => {
  assert.equal(matchProfile('Eleanor', ROSTER).match?.id, 'partner');
  assert.equal(matchProfile('doug', ROSTER).match?.id, 'supply-md', 'a first name is enough when it is unambiguous');
  assert.equal(matchProfile('Chidi Anagonye', ROSTER).match?.id, 'analyst');
});

test('an ambiguous name is handed back, never guessed at', () => {
  // Showing the wrong person's deals mid-demo is worse than one extra question.
  const r = matchProfile('supply chain', ROSTER);
  assert.equal(r.match?.id, 'supply-md', 'still resolves when only one title matches');
  const amb = matchProfile('Finance', [...ROSTER, { id: 'ir-lp', name: 'Jane Doe', title: 'Finance — Investor Relations', role: 'partner' }]);
  assert.equal(amb.match, null, 'two candidates must not silently become one');
  assert.equal(amb.options.length, 2, 'and the caller is told which two');
});

test('a name nobody has resolves to nobody', () => {
  const r = matchProfile('Gandalf', ROSTER);
  assert.equal(r.match, null);
  assert.equal(r.options.length, 0, 'no near-misses to offer');
  assert.equal(matchProfile('', ROSTER).match, null);
  assert.equal(matchProfile(null, ROSTER).match, null);
});

test('a partial word does not select a person', () => {
  // 'part' must not become 'partner'; a substring match would make almost any typo
  // resolve to somebody, which is the failure mode this replaced.
  assert.equal(matchProfile('part', ROSTER).match, null);
  assert.equal(matchProfile('an', ROSTER).match, null);
});

test('punctuation in a name cannot break the matcher', () => {
  // The roster is authored data today, but the phrase is not — it is whatever someone
  // typed into a channel, and it is compiled into a regular expression.
  assert.doesNotThrow(() => matchProfile('St. Claire', ROSTER));
  assert.equal(matchProfile('St. Claire', ROSTER).match?.id, 'fund-cfo');
  assert.doesNotThrow(() => matchProfile('(*.+[', ROSTER));
  assert.equal(matchProfile('(*.+[', ROSTER).match, null);
});
