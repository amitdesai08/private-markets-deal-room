import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDocOpen, documentBrief, withOpen, matchLiveFile, sameDocument } from '../lib/docOpen.js';

test('a real Microsoft 365 file opens where it lives', () => {
  const r = resolveDocOpen({ name: 'Anything.pdf', webUrl: 'https://contoso.sharepoint.com/a.pdf' });
  assert.equal(r.mode, 'external');
  assert.equal(r.url, 'https://contoso.sharepoint.com/a.pdf');
});

test('a real link beats a document we could otherwise build', () => {
  // The one in SharePoint is the one people are collaborating on; regenerating over
  // the top of it would hand someone a different document than their colleagues see.
  const r = resolveDocOpen({ name: 'Meridian — IC Memo.docx', webUrl: 'https://contoso.sharepoint.com/m.docx' });
  assert.equal(r.mode, 'external');
});

test('only an https link is treated as a real file', () => {
  for (const bad of ['javascript:alert(1)', '/relative/path', 'http://insecure.example/a', '', null]) {
    assert.notEqual(resolveDocOpen({ name: 'Vendor QoE.pdf', webUrl: bad }).mode, 'external');
  }
});

test('the documents this platform writes are offered as the real thing', () => {
  const cases = [
    ['Nordic Grocery Group — IC Memo (Draft).docx', 'ic-memo'],
    ['Meridian — Investment Committee Memorandum.docx', 'ic-memo'],
    ['Meridian — IC Deck.pptx', 'ic-deck'],
    ['Meridian — Investment Committee Presentation.pptx', 'ic-deck'],
    ['Meridian — Returns Model.xlsx', 'returns'],
    ['Meridian — LBO Model.xlsx', 'returns'],
    ['Meridian — Deal Model.xlsx', 'model'],
    ['Meridian — Financial Model.xlsx', 'model'],
  ];
  for (const [name, kind] of cases) {
    const r = resolveDocOpen({ name });
    assert.equal(r.mode, 'generate', `${name} should be generatable`);
    assert.equal(r.kind, kind, name);
  }
});

test('a returns model is not mistaken for the deal model', () => {
  assert.equal(resolveDocOpen({ name: 'Returns Model.xlsx' }).kind, 'returns');
  assert.equal(resolveDocOpen({ name: 'Deal Model.xlsx' }).kind, 'model');
});

test('a document held outside the platform gets a brief, never a fake open', () => {
  for (const name of [
    'Nordic Grocery Group — Information Memorandum.pdf',
    'Vendor QoE Report.pdf',
    'SPA Mark-up v4.docx',
    'Management Presentation.pptx',
  ]) {
    const r = resolveDocOpen({ name });
    assert.equal(r.mode, 'brief', name);
    assert.equal(r.url, undefined);
    assert.equal(r.kind, undefined);
  }
});

test('a document with no name at all still resolves to something safe', () => {
  assert.equal(resolveDocOpen({}).mode, 'brief');
  assert.equal(resolveDocOpen().mode, 'brief');
});

const DEAL = {
  id: 'd1',
  company: 'Meridian',
  workspace: { sharePointProvisioned: true, sharePointUrl: 'https://contoso.sharepoint.com/sites/meridian' },
  workstreams: [
    {
      lane: 'financial', owner: 'fund-cfo', status: 'amber',
      findings: [
        { text: 'Adjusted EBITDA overstated by 1.2m.', severity: 'negative', source: 'Vendor QoE Report' },
        { text: 'Working capital normalised.', severity: 'positive', source: 'Trading update' },
      ],
    },
    {
      lane: 'legal', owner: 'legal-gc',
      findings: [{ text: 'Change-of-control consents outstanding on two contracts.', severity: 'caution', source: 'SPA Mark-up' }],
    },
  ],
};

test('the brief only shows findings that genuinely concern the document', () => {
  const b = documentBrief({ name: 'Vendor QoE Report.pdf', summary: 'Sell-side quality of earnings.' }, DEAL);
  assert.equal(b.lane, 'financial');
  assert.equal(b.owner, 'fund-cfo');
  assert.ok(b.findings.some((f) => f.text.includes('EBITDA overstated')));
  // The legal finding belongs to another workstream and must not appear.
  assert.ok(!b.findings.some((f) => f.text.includes('consents outstanding')));
});

test('the brief says how each finding was linked, so the reader can judge it', () => {
  const b = documentBrief({ name: 'Vendor QoE Report.pdf' }, DEAL);
  const cited = b.findings.find((f) => f.text.includes('EBITDA overstated'));
  assert.equal(cited.basis, 'Cites this document');
  const sameLane = b.findings.find((f) => f.text.includes('Working capital'));
  assert.equal(sameLane.basis, 'From the same workstream');
});

test('an unrecognised document is given no lane rather than a wrong one', () => {
  const b = documentBrief({ name: 'Photographs of the depot.zip' }, DEAL);
  assert.equal(b.lane, null);
  assert.equal(b.owner, null);
  assert.deepEqual(b.findings, []);
});

test('the briefing reads in words, not in the keys the record stores', () => {
  // This paper can be saved and forwarded to a lender. "fund-cfo", "financial" and
  // "in_progress" are how the record talks to itself, not how a partner writes.
  const b = documentBrief({ name: 'Vendor QoE Report.pdf' }, {
    ...DEAL,
    workstreams: [{ ...DEAL.workstreams[0], status: 'in_progress' }],
  });
  assert.equal(b.laneName, 'Financial / QoE');
  assert.equal(b.ownerName, 'David Osei');
  assert.equal(b.laneStatus, 'In progress');
  // The keys themselves stay, because code still matches on them.
  assert.equal(b.lane, 'financial');
  assert.equal(b.owner, 'fund-cfo');
});

test('a document nobody owns claims no owner and no workstream', () => {
  const b = documentBrief({ name: 'Photographs of the depot.zip' }, DEAL);
  assert.equal(b.laneName, null);
  assert.equal(b.ownerName, null);
  assert.equal(b.laneStatus, null);
});

test('the briefing does not print the same sentence twice', () => {
  // Stored summaries end with the workstream's headline finding, which the briefing
  // also lists in full further down the page.
  const b = documentBrief({
    name: 'Vendor QoE Report.pdf',
    summary: 'Sell-side quality of earnings. Workstream 45% complete — Adjusted EBITDA overstated by 1.2m.',
  }, DEAL);
  assert.equal(b.summary, 'Sell-side quality of earnings. Workstream 45% complete');
  assert.ok(b.findings.some((f) => f.text.includes('EBITDA overstated')), 'the finding itself must survive');
});

test('a summary that is only a finding does not become an empty heading', () => {
  const b = documentBrief({ name: 'Vendor QoE Report.pdf', summary: 'Adjusted EBITDA overstated by 1.2m.' }, DEAL);
  assert.equal(b.summary, null);
});

test('the brief points at the data room only when there is one', () => {
  assert.equal(
    documentBrief({ name: 'x.pdf' }, DEAL).dataRoomUrl,
    'https://contoso.sharepoint.com/sites/meridian',
  );
  assert.equal(documentBrief({ name: 'x.pdf' }, { id: 'd2' }).dataRoomUrl, null);
  assert.equal(
    documentBrief({ name: 'x.pdf' }, { workspace: { sharePointProvisioned: false, sharePointUrl: 'https://x.example' } }).dataRoomUrl,
    null,
  );
});

test('the brief survives a deal with no workstreams', () => {
  const b = documentBrief({ name: 'Vendor QoE Report.pdf' }, null);
  assert.deepEqual(b.findings, []);
  assert.equal(b.name, 'Vendor QoE Report.pdf');
});

test('every document in a list comes back with a way to open it', () => {
  const out = withOpen([
    { name: 'Meridian — IC Memo.docx' },
    { name: 'Vendor QoE.pdf' },
    { name: 'Real.docx', webUrl: 'https://contoso.sharepoint.com/r.docx' },
  ], DEAL);
  assert.deepEqual(out.map((d) => d.open.mode), ['generate', 'brief', 'external']);
  assert.equal(withOpen(null).length, 0);
});

// ---------------------------------------------------------------------------
//  Joining a listed name to the real file
// ---------------------------------------------------------------------------
// The deal lists "Nordic Grocery Group — Information Memorandum.pdf"; SharePoint
// holds "Nordic Grocery Group - Information Memorandum.pdf". Same paper, different
// dash. Until they are matched the listed name stays inert while the real file sits
// unexplained further down the page.

test('a listed document is matched to the real file through punctuation and version suffixes', () => {
  const live = [
    { name: 'Nordic Grocery Group - Information Memorandum v3.pdf', webUrl: 'https://contoso.sharepoint.com/im.pdf' },
  ];
  const hit = matchLiveFile('Nordic Grocery Group — Information Memorandum.pdf', live);
  assert.equal(hit?.webUrl, 'https://contoso.sharepoint.com/im.pdf');
});

test('the extension is never what decides a match', () => {
  const live = [{ name: 'Meridian Legal DD Report.pdf', webUrl: 'https://contoso.sharepoint.com/l.pdf' }];
  assert.ok(matchLiveFile('Meridian — Legal DD Report.docx', live));
});

test('a different document is never passed off as the one that was clicked', () => {
  const live = [
    { name: 'Nordic Grocery Group — Legal DD Report.pdf', webUrl: 'https://contoso.sharepoint.com/l.pdf' },
    { name: 'Board pack.pdf', webUrl: 'https://contoso.sharepoint.com/b.pdf' },
  ];
  assert.equal(matchLiveFile('Nordic Grocery Group — Quality of Earnings.pdf', live), null);
  // A short name is not enough to go on, however well it overlaps.
  assert.equal(sameDocument('Q1.pdf', 'Q1.pdf'), false);
  // One name being a prefix of a much longer one is a coincidence, not a match.
  assert.equal(sameDocument('Tax Memo.docx', 'Tax Memo on the German holding structure and treaty position.docx'), false);
});

test('a match is only made when the real file can actually be opened', () => {
  assert.equal(matchLiveFile('Meridian — Legal DD Report.docx', [{ name: 'Meridian — Legal DD Report.docx' }]), null);
  assert.equal(matchLiveFile('Meridian — Legal DD Report.docx', [{ name: 'Meridian — Legal DD Report.docx', webUrl: 'javascript:alert(1)' }]), null);
  assert.equal(matchLiveFile('x', null), null);
});

test('a PDF opens for real once Microsoft 365 has been searched', () => {
  const live = [{ name: 'Meridian - Quality of Earnings.pdf', webUrl: 'https://contoso.sharepoint.com/qoe.pdf' }];
  const [doc] = withOpen([{ name: 'Meridian — Quality of Earnings.pdf' }], DEAL, live);
  assert.equal(doc.open.mode, 'external');
  assert.equal(doc.open.url, 'https://contoso.sharepoint.com/qoe.pdf');
  // Without the search result the same PDF still opens — just onto what we know.
  const [alone] = withOpen([{ name: 'Meridian — Quality of Earnings.pdf' }], DEAL, []);
  assert.equal(alone.open.mode, 'brief');
});

test('every document offers to open, whatever we hold', () => {
  const out = withOpen([
    { name: 'Meridian — IC Memo.docx' },
    { name: 'Vendor Quality of Earnings.pdf' },
    { name: 'Real.docx', webUrl: 'https://contoso.sharepoint.com/r.docx' },
  ], DEAL);
  assert.ok(out.every((d) => d.open.label.startsWith('Open')));
});
