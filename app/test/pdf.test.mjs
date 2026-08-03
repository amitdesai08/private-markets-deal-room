import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPdf } from '../lib/pdf.js';
import { mergeLiveFiles } from '../lib/docOpen.js';

// A PDF that "looks fine" in one reader and is refused by another is the worst
// outcome here, because the failure only shows up in front of an audience. The
// structural tests below take the file apart the way a reader does: follow
// startxref to the table, then check every offset in it lands on the object it
// claims. If that holds, any conforming reader will open it.

const latin1 = (buf) => buf.toString('latin1');

function xrefEntries(buf) {
  const s = latin1(buf);
  const m = /startxref\s+(\d+)\s+%%EOF/.exec(s);
  assert.ok(m, 'the file must end with a startxref pointing at the cross-reference table');
  const start = Number(m[1]);
  assert.equal(s.slice(start, start + 4), 'xref', 'startxref must point at the table');
  const header = /^xref\s+(\d+)\s+(\d+)\s/.exec(s.slice(start));
  assert.ok(header, 'the table must declare its range');
  const count = Number(header[2]);
  const body = s.slice(start + header[0].length);
  const out = [];
  // Entry 0 is the head of the free list and is always free; the real objects
  // follow it, twenty bytes each.
  for (let i = 1; i < count; i += 1) {
    const line = body.slice(i * 20, i * 20 + 20);
    out.push({ id: i, offset: Number(line.slice(0, 10)), kind: line[17] });
  }
  return out;
}

const SIMPLE = {
  title: 'Test',
  blocks: [
    { t: 'eyebrow', text: 'DEAL ROOM · DOCUMENT BRIEFING' },
    { t: 'title', text: 'Nordic Grocery Group — Quality of Earnings (Draft).pdf' },
    { t: 'meta', text: 'Prepared today' },
    { t: 'rule' },
    { t: 'note', text: 'The original has not been shared into the deal room.' },
    { t: 'h', text: 'Where it sits' },
    { t: 'kv', rows: [['Workstream', 'financial'], ['Owner', 'fund-cfo']] },
    { t: 'bullets', items: ['One finding', 'Another finding'] },
    { t: 'p', text: 'Body copy.' },
  ],
};

test('the file announces itself as a PDF and terminates properly', () => {
  const buf = renderPdf(SIMPLE);
  assert.ok(latin1(buf).startsWith('%PDF-1.4'));
  assert.ok(latin1(buf).trimEnd().endsWith('%%EOF'));
});

test('every cross-reference offset lands on the object it claims', () => {
  const buf = renderPdf(SIMPLE);
  const s = latin1(buf);
  const entries = xrefEntries(buf);
  assert.ok(entries.length >= 6, 'catalog, pages, three fonts, a page and its content at minimum');
  for (const e of entries) {
    assert.equal(e.kind, 'n', `object ${e.id} should be in use`);
    assert.ok(e.offset > 0 && e.offset < buf.length, `object ${e.id} offset is inside the file`);
    assert.ok(
      s.startsWith(`${e.id} 0 obj`, e.offset),
      `object ${e.id} should begin at the offset the table gives`,
    );
  }
});

test('the document has a catalog, a page tree and the fonts it references', () => {
  const s = latin1(renderPdf(SIMPLE));
  assert.match(s, /\/Type \/Catalog/);
  assert.match(s, /\/Type \/Pages/);
  assert.match(s, /\/BaseFont \/Helvetica\b/);
  assert.match(s, /\/BaseFont \/Helvetica-Bold/);
  // A page that names a font the resources do not declare renders blank.
  const used = new Set([...s.matchAll(/\/(F[123]) \d/g)].map((m) => m[1]));
  for (const f of used) assert.match(s, new RegExp(`/${f} \\d+ 0 R`), `${f} must be declared in resources`);
});

test('an em dash in a company name survives into the file', () => {
  const buf = renderPdf({ blocks: [{ t: 'p', text: 'Nordic — Grocery' }] });
  // WinAnsi puts the em dash at 0x97; dropping it would silently mangle almost
  // every document name this product handles.
  assert.ok(buf.includes(Buffer.from([0x97])), 'the em dash should be encoded, not discarded');
});

test('brackets and backslashes in a document name cannot break the file', () => {
  const buf = renderPdf({ blocks: [{ t: 'p', text: 'Quality of Earnings (Draft) \\ v2 )(' }] });
  const s = latin1(buf);
  const stream = s.slice(s.indexOf('stream'), s.indexOf('endstream'));
  const drawn = /\((.*)\) Tj/.exec(stream);
  assert.ok(drawn, 'the text should still be drawn');
  // Remove every escape pair; if a bare bracket is left, the string literal ends
  // early and the remainder of the page is read as operators.
  const bare = drawn[1].replace(/\\[\s\S]/g, '');
  assert.ok(!bare.includes('(') && !bare.includes(')'), 'no unescaped bracket may reach the content stream');
  xrefEntries(buf);
});

test('a long document runs onto more pages rather than off the bottom of one', () => {
  const long = { blocks: Array.from({ length: 120 }, (_, i) => ({ t: 'p', text: `Finding ${i} — ${'detail '.repeat(20)}` })) };
  const buf = renderPdf(long);
  const s = latin1(buf);
  const count = /\/Count (\d+)/.exec(s);
  assert.ok(Number(count[1]) > 1, 'this much copy cannot fit on one page');
  const kids = /\/Kids \[([^\]]+)\]/.exec(s)[1].trim().split(/\s+0 R\s*/).filter(Boolean);
  assert.equal(kids.length, Number(count[1]), 'the page count must match the kids it lists');
  xrefEntries(buf);
});

test('an empty document is still a valid file', () => {
  const buf = renderPdf({ blocks: [] });
  assert.ok(latin1(buf).startsWith('%PDF'));
  xrefEntries(buf);
});

// ---------------------------------------------------------------------------
//  Folding real files into the listed ones
// ---------------------------------------------------------------------------

test('a matched file gives the listed document its link instead of a second row', () => {
  const { files, extra } = mergeLiveFiles(
    [{ name: 'Nordic Grocery Group — Information Memorandum.pdf' }],
    [{ name: 'Nordic Grocery Group - Information Memorandum.pdf', webUrl: 'https://contoso.sharepoint.com/im.pdf', lastModified: '2026-01-02' }],
  );
  assert.equal(files.length, 1);
  assert.equal(files[0].webUrl, 'https://contoso.sharepoint.com/im.pdf');
  assert.equal(files[0].name, 'Nordic Grocery Group — Information Memorandum.pdf', 'the deal keeps its own name for the document');
  assert.deepEqual(extra, [], 'the real file must not also appear on its own');
});

test('a real file the deal does not list is still shown', () => {
  const { files, extra } = mergeLiveFiles(
    [{ name: 'Nordic Grocery Group — Legal DD Report.docx' }],
    [{ name: 'Board minutes March.pdf', webUrl: 'https://contoso.sharepoint.com/b.pdf' }],
  );
  assert.equal(files[0].webUrl, undefined);
  assert.equal(extra.length, 1);
});

test('one real file cannot be claimed by two listed documents', () => {
  const { files, extra } = mergeLiveFiles(
    [
      { name: 'Meridian — Quality of Earnings.pdf' },
      { name: 'Meridian — Quality of Earnings.pdf' },
    ],
    [{ name: 'Meridian - Quality of Earnings.pdf', webUrl: 'https://contoso.sharepoint.com/q.pdf' }],
  );
  assert.equal(files[0].webUrl, 'https://contoso.sharepoint.com/q.pdf');
  assert.equal(files[1].webUrl, undefined);
  assert.deepEqual(extra, []);
});

test('a document that already has its own link is left alone', () => {
  const { files } = mergeLiveFiles(
    [{ name: 'Meridian — Legal DD Report.docx', webUrl: 'https://contoso.sharepoint.com/original.docx' }],
    [{ name: 'Meridian - Legal DD Report.docx', webUrl: 'https://contoso.sharepoint.com/other.docx' }],
  );
  assert.equal(files[0].webUrl, 'https://contoso.sharepoint.com/original.docx');
});

test('merging survives nothing to merge', () => {
  assert.deepEqual(mergeLiveFiles(), { files: [], extra: [] });
  assert.deepEqual(mergeLiveFiles(null, null), { files: [], extra: [] });
});
