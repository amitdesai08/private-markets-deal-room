import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecentActivity, searchTermsFor } from '../lib/dealActivity.js';

const DEAL = { id: 'd1', company: 'Meridian Logistics' };

const CORPUS = {
  mail: [
    { subject: 'Meridian — process letter', from: 'advisor@x.example', to: 'principal', received: '2026-01-05T09:00:00Z', preview: 'Data room access refreshed.' },
  ],
  channel: {
    messages: [
      { from: 'Dana Okafor', created: '2026-01-06T09:00:00Z', preview: 'QoE lands Thursday.', personaId: 'analyst' },
    ],
  },
  files: [
    { name: 'Meridian — Returns Model.xlsx', lastModified: '2026-01-04T09:00:00Z', summary: 'Entry case and exit bridge.' },
  ],
};

test('email, chat and files arrive as one list ordered newest first', () => {
  const out = buildRecentActivity(DEAL, { corpus: CORPUS });
  assert.deepEqual(out.items.map((i) => i.kind), ['message', 'email', 'file']);
  assert.equal(out.counts.email, 1);
  assert.equal(out.counts.message, 1);
  assert.equal(out.counts.file, 1);
});

test('an item read from Microsoft 365 is marked live; a composed one is not', () => {
  const out = buildRecentActivity(DEAL, {
    corpus: CORPUS,
    liveMail: { results: [{ subject: 'Real mail', from: 'a@b.example', received: '2026-01-07T09:00:00Z', webLink: 'https://outlook.office.com/mail/id' }] },
  });
  const real = out.items.find((i) => i.title === 'Real mail');
  assert.equal(real.live, true);
  assert.equal(real.url, 'https://outlook.office.com/mail/id');
  assert.equal(out.live.mail, true);
  assert.equal(out.live.files, false);
  assert.equal(out.items.find((i) => i.title === 'Meridian — process letter').live, false);
});

test('a composed item never carries a link, so no button opens nothing', () => {
  const out = buildRecentActivity(DEAL, { corpus: CORPUS });
  assert.ok(out.items.every((i) => i.url === null));
});

test('a link is only trusted when it is an https URL Microsoft 365 gave us', () => {
  const out = buildRecentActivity(DEAL, {
    liveFiles: {
      results: [
        { name: 'ok.docx', webUrl: 'https://contoso.sharepoint.com/a.docx', lastModified: '2026-01-08T09:00:00Z' },
        { name: 'hostile.docx', webUrl: 'javascript:alert(1)', lastModified: '2026-01-08T08:00:00Z' },
        { name: 'relative.docx', webUrl: '/local/path', lastModified: '2026-01-08T07:00:00Z' },
      ],
    },
  });
  assert.equal(out.items.find((i) => i.title === 'ok.docx').url, 'https://contoso.sharepoint.com/a.docx');
  assert.equal(out.items.find((i) => i.title === 'hostile.docx').url, null);
  assert.equal(out.items.find((i) => i.title === 'relative.docx').url, null);
});

test('the live copy of a document wins over the composed one', () => {
  const out = buildRecentActivity(DEAL, {
    corpus: CORPUS,
    liveFiles: { results: [{ name: 'Meridian — Returns Model.xlsx', webUrl: 'https://contoso.sharepoint.com/m.xlsx', lastModified: '2026-01-04T10:00:00Z' }] },
  });
  const hits = out.items.filter((i) => i.kind === 'file');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].live, true);
  assert.equal(hits[0].url, 'https://contoso.sharepoint.com/m.xlsx');
});

test('what is addressed to my seat is marked for me', () => {
  const mine = buildRecentActivity(DEAL, { corpus: CORPUS, persona: 'principal' });
  assert.equal(mine.counts.forMe, 1);
  assert.equal(mine.items.find((i) => i.kind === 'email').forMe, true);

  const theirs = buildRecentActivity(DEAL, { corpus: CORPUS, persona: 'fund-cfo' });
  assert.equal(theirs.counts.forMe, 0);
});

test('no material at all is an empty answer, not a broken one', () => {
  const out = buildRecentActivity(DEAL, {});
  assert.deepEqual(out.items, []);
  assert.deepEqual(out.live, { channel: false, files: false, mail: false });
  assert.equal(out.counts.email, 0);
});

test('a Graph error is not mistaken for content', () => {
  // The route passes null for a failed call; the merge must still produce the rest.
  const out = buildRecentActivity(DEAL, { corpus: CORPUS, liveMail: null, liveFiles: null });
  assert.equal(out.items.length, 3);
  assert.equal(out.live.mail, false);
});

test('the search names the deal, and says nothing when there is nothing to name', () => {
  assert.equal(searchTermsFor({ company: 'Meridian Logistics' }), '"Meridian Logistics"');
  assert.equal(searchTermsFor({ company: 'Meridian Logistics', codeName: 'Project Atlas' }), '"Meridian Logistics" OR "Project Atlas"');
  assert.equal(searchTermsFor({ company: 'AB' }), null);
  assert.equal(searchTermsFor({}), null);
  assert.equal(searchTermsFor(null), null);
});

test('quotes in a company name cannot break out of the search term', () => {
  assert.equal(searchTermsFor({ company: 'Ace" OR "everything' }), '"Ace OR everything"');
});
