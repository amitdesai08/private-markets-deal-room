// The home page opened with four consecutive follow-ups from the same person about the
// same workstream, across four different companies. Each card was defensible; the run of
// them told a room of buyers the data was machine-made, which is the one thing a record
// of who promised what must not do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { corpusForDeal } from '../lib/workiqCorpus.js';
import { detectCommitments } from '../lib/dealDesk.js';
import { seededDeals } from '../data/deals.js';

const commitmentsFor = (deal) => detectCommitments(corpusForDeal(deal).channel?.messages || [], { source: 'Teams' });

test('follow-ups across the book are not all from one person on one workstream', () => {
  const rows = seededDeals.flatMap((d) => commitmentsFor(d).map((c) => ({ deal: d.company, from: c.author, lane: c.lane })));
  assert.ok(rows.length >= 8, `only ${rows.length} follow-ups detected, which proves nothing`);
  const people = new Set(rows.map((r) => r.from));
  assert.ok(people.size >= 3, `every follow-up is from one of ${people.size} people: ${[...people].join(', ')}`);
  // No single voice may dominate the page.
  const counts = {};
  for (const r of rows) counts[r.from] = (counts[r.from] || 0) + 1;
  const top = Math.max(...Object.values(counts));
  assert.ok(top / rows.length < 0.55, `one person owns ${top} of ${rows.length} follow-ups`);
});

test('a message is signed by a person, not by a job title', () => {
  // 'Finance MD' resolved to the role title "Finance Partner", and a Teams message signed
  // "Finance Partner" sat next to one signed "James Whitfield".
  const senders = new Set(seededDeals.flatMap((d) => (corpusForDeal(d).channel?.messages || []).map((m) => m.from)));
  for (const s of senders) {
    assert.doesNotMatch(String(s), /\b(Partner|MD|Director|Counsel|Officer)$/i, `"${s}" is a job title, not a person`);
  }
});
