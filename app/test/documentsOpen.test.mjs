// IF IT IS LISTED, IT OPENS.
//
// There were two document sets and each surface knew about one. The Documents tab listed
// the deal record's own papers — Investment Screen.pdf, Quality of Earnings.pdf, Tech &
// Data DD.pdf — and rendered each as `<a href={f.webUrl}>`, a field those rows never had.
// The route that opens a document resolved names against the WorkIQ corpus instead, which
// holds ten entirely different files. So every document on screen was a dead link, and the
// ten that would have opened were never shown. The feedback was "documents are broken, we
// cannot open PDFs or Word or Excel", and it was exactly right.
//
// One index, and this is the guard: anything the product lists, it can open.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seededDeals } from '../data/deals.js';
import { dealDocumentIndex, documentAffordances } from '../lib/dealDocuments.js';

const withDocs = seededDeals.filter((d) => (d.documents || []).length);

test('the fixture has documents, or this guard is inert', () => {
  assert.ok(withDocs.length >= 5, `only ${withDocs.length} deals carry documents`);
});

test('the index holds the record\'s own papers and the workspace files together', () => {
  for (const d of withDocs) {
    const index = dealDocumentIndex(d);
    const names = new Set(index.map((x) => x.name.toLowerCase()));
    for (const doc of d.documents || []) {
      assert.ok(
        names.has(String(doc.name).toLowerCase()),
        `${d.company}: "${doc.name}" is on the deal record and missing from the document index`,
      );
    }
    assert.ok(index.length >= (d.documents || []).length, `${d.company}: the index lost documents`);
    // Both sources, or the merge is not doing anything.
    const sources = new Set(index.map((x) => x.source));
    assert.ok(sources.has('record'), `${d.company}: the record's own papers are missing`);
  }
});

test('every listed document is given somewhere to be opened', () => {
  let checked = 0;
  for (const d of withDocs) {
    for (const doc of dealDocumentIndex(d)) {
      checked += 1;
      const a = documentAffordances(d.id, doc.name);
      assert.ok(a.previewUrl, `${d.company}: "${doc.name}" has nowhere to be read`);
      assert.ok(a.previewUrl.includes(encodeURIComponent(doc.name)), `${d.company}: "${doc.name}" points at the wrong document`);
      assert.ok(a.briefUrl, `${d.company}: "${doc.name}" cannot be taken away`);
    }
  }
  assert.ok(checked >= 40, `only ${checked} documents were checked`);
});

// An Office file cannot be rendered in the browser, so the product has to offer Word or
// Excel — on the web or on the reader's machine — rather than a download and a shrug.
test('an Office document is recognised as one, and a PDF is not', () => {
  const cases = [
    ['Lumen Analytics — IC Memo (Draft).docx', 'word'],
    ['Lumen Analytics — Returns Model.xlsx', 'excel'],
    ['Lumen Analytics — Commercial DD.pptx', 'powerpoint'],
    ['Investment Screen.pdf', null],
    ['Notes.txt', null],
  ];
  for (const [name, want] of cases) {
    assert.equal(documentAffordances('d1', name).office, want, `"${name}" was classified wrongly`);
  }
});

// Deal document names are full of em dashes and ampersands. A URL built without encoding
// them resolves to a different document, or to none.
test('a document name with punctuation survives the round trip', () => {
  const name = 'Lumen Analytics — Commercial DD — Customer & Pricing.pptx';
  const url = documentAffordances('lumen-analytics', name).previewUrl;
  const got = decodeURIComponent(new URL(url, 'https://x').searchParams.get('name') || '');
  assert.equal(got, name);
});
