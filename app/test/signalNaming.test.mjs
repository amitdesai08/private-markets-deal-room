// THE COMPANY AN EMAIL IS ABOUT IS NOT THE COMPANY THE SENDER WORKS FOR.
//
// The signal parser preferred the org line in the sender's signature block over the
// subject line. A banker at a large listed asset manager writing about a private grocer
// therefore produced a sourcing target named after his employer — and that target went to
// the SEC filings connector, which resolved the name entirely correctly and attached the
// asset manager's 10-K and 10-Q to a fictional private company on the sourcing desk. A
// reviewer walking the demo saw real filings for a real listed firm sitting under a target
// that does not exist.
//
// The connector was not wrong. It was asked about the wrong company.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage, messagesToSignals } from '../lib/ingest/signals.js';

const message = ({ subject, body }) => ({
  id: `m-${Math.random().toString(36).slice(2, 8)}`,
  subject,
  sentDateTime: new Date().toISOString(),
  from: { emailAddress: { name: 'Daniel Hersh', address: 'daniel.hersh@example.com' } },
  body: { contentType: 'text', content: body },
});

const bankerAboutAGrocer = message({
  subject: 'Nordic Grocery Group — founder open to a conversation',
  body: [
    'Hi team,',
    '',
    'The founder is open to a conversation about a majority sale in the new year.',
    '',
    'Daniel Hersh',
    'Managing Director, Consumer',
    'T. Rowe Price',
  ].join('\n'),
});

test('a signal is named for the company in the subject, not the sender\'s employer', () => {
  const p = parseMessage(bankerAboutAGrocer);
  assert.ok(p, 'the message did not parse at all');
  assert.equal(p.company, 'Nordic Grocery Group', `the signal was filed under "${p.company}"`);
  assert.equal(p.sourceOrg, 'T. Rowe Price', 'who told us was thrown away rather than recorded separately');
});

test('the grouped signal document carries the target, and records the source alongside it', () => {
  const docs = messagesToSignals([bankerAboutAGrocer]);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].name, 'Nordic Grocery Group', `the document is named "${docs[0].name}"`);
  assert.deepEqual(docs[0].sourceOrgs, ['T. Rowe Price'], 'the introducing firm is not on the record');
});

// "Prefer the fuller name" renamed a whole group to whichever signature org happened to be
// longest, so a second mail on the same thread from a different firm could rename the
// target again.
test('a second mail from a different firm does not rename the target', () => {
  const second = message({
    subject: 'Nordic Grocery Group — management pack',
    body: [
      'Attaching the pack.',
      '',
      'Priya Raman',
      'Partner, Consumer & Retail',
      'Some Very Long Advisory Partners LLP',
    ].join('\n'),
  });
  const docs = messagesToSignals([bankerAboutAGrocer, second]);
  assert.equal(docs.length, 1, 'the two mails did not group onto one target');
  assert.equal(docs[0].name, 'Nordic Grocery Group', `the target was renamed to "${docs[0].name}"`);
  assert.equal(docs[0].sourceOrgs.length, 2, 'both introducing firms should be recorded');
});

// The subject is not always usable, and falling back to the signature is better than
// dropping the signal — but only as a fallback.
test('with no usable subject the sender\'s firm is still better than nothing', () => {
  const noSubject = message({
    subject: '',
    body: ['Quick note.', '', 'Ana Ruiz', 'Head of Corporate Development', 'Frostbite Foods'].join('\n'),
  });
  const p = parseMessage(noSubject);
  assert.equal(p && p.company, 'Frostbite Foods');
});
