// Generate the enriched documents from LIVE deal data, save them, and extract their
// text so the pe-platform-advisor agent can review the content.
import { buildIcMemoDocx, buildDealModelXlsx, buildReturnsXlsx, buildIcDeckPptx } from '../lib/m365/officeRich.js';
import JSZip from 'jszip';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = 'https://ca-dealhub-orch-green.niceisland-36753373.swedencentral.azurecontainerapps.io';
const id = process.argv[2] || 'sterling';
const TEMP = os.tmpdir();
const j = async (p) => { const r = await fetch(base + p); if (!r.ok) throw new Error(`${p} -> ${r.status}`); return r.json(); };

const deal = await j(`/api/deals/${id}`);
const returns = await j(`/api/deals/${id}/returns`).catch(() => ({}));
const valueCreation = await j(`/api/deals/${id}/value-creation`).catch(() => ({}));
const risks = await j(`/api/deals/${id}/risk-register`).catch(() => ({}));
const ic = await j(`/api/deals/${id}/ic-readiness`).catch(() => ({}));
const artifacts = { returns, valueCreation, risks, ic };

const memo = await buildIcMemoDocx(deal, artifacts);
const model = await buildDealModelXlsx(deal, artifacts);
const ret = await buildReturnsXlsx(returns, artifacts);
const deck = await buildIcDeckPptx(deal, artifacts);

writeFileSync(path.join(TEMP, 'sample_IC_Memo.docx'), memo);
writeFileSync(path.join(TEMP, 'sample_Deal_Model.xlsx'), model);
writeFileSync(path.join(TEMP, 'sample_Returns_Model.xlsx'), ret);
writeFileSync(path.join(TEMP, 'sample_IC_Deck.pptx'), deck);

async function docxText(buf) {
  const z = await JSZip.loadAsync(buf);
  const x = await z.file('word/document.xml').async('string');
  return x.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '  ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#\d+;/g, '').replace(/\n{2,}/g, '\n').trim();
}
async function pptxText(buf) {
  const z = await JSZip.loadAsync(buf);
  const names = Object.keys(z.files).filter((n) => /ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => (a.match(/\d+/)[0] - b.match(/\d+/)[0]));
  let out = '';
  let i = 1;
  for (const n of names) {
    const x = await z.file(n).async('string');
    out += `\n[Slide ${i++}] ` + x.replace(/<\/a:p>/g, ' / ').replace(/<[^>]+>/g, '').replace(/\s{2,}/g, ' ').trim();
  }
  return out.trim();
}
async function xlsxText(buf) {
  const z = await JSZip.loadAsync(buf);
  const wbx = await z.file('xl/workbook.xml').async('string');
  const sheets = [...wbx.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => m[1]);
  let out = 'Sheets: ' + sheets.join(', ') + '\nContent: ';
  const ss = z.file('xl/sharedStrings.xml');
  if (ss) { const x = await ss.async('string'); out += [...x.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]).join(' | '); }
  return out;
}

const combined = [
  '=== IC MEMORANDUM (Word) ===', await docxText(memo),
  '\n=== DEAL MODEL (Excel) ===', await xlsxText(model),
  '\n=== LBO / RETURNS MODEL (Excel) ===', await xlsxText(ret),
  '\n=== IC DECK (PowerPoint) ===', await pptxText(deck),
].join('\n');
writeFileSync(path.join(TEMP, 'enriched_docs_text.txt'), combined);
console.log(`deal=${id} memo=${memo.length}b model=${model.length}b returns=${ret.length}b deck=${deck.length}b`);
console.log(`combined text = ${combined.length} chars -> ${path.join(TEMP, 'enriched_docs_text.txt')}`);
