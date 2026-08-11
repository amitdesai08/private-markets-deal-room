// Every paper on a deal, from wherever it is kept.
import { corpusForDeal } from './workiqCorpus.js';

// EVERY PAPER ON THIS DEAL, FROM WHEREVER IT IS KEPT.
//
// There were two document sets and each surface knew about one of them. The Documents
// tab listed the deal record's own papers — Investment Screen.pdf, Quality of Earnings.pdf
// — and the route that opens a document resolved names against the WorkIQ corpus, which
// holds ten entirely different files. So every document in the tab 404'd on open, and the
// ten that would have opened were never listed. "Documents are broken, we cannot open
// PDFs or Word or Excel" was exactly right.
//
// One index. Anything that can be named on this deal can be opened, and anything that can
// be opened is listed.
export function dealDocumentIndex(raw) {
  const out = [];
  const seen = new Set();
  const add = (name, extra) => {
    const key = String(name || '').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ name: String(name).trim(), ...extra });
  };
  for (const d of raw?.documents || []) {
    add(d.name, { id: d.id || d.name, source: 'record', kind: d.type || null, pages: d.pages || null, status: d.status || null, owner: d.owner || null, updated: d.updatedAt || d.date || d.lastModified || null });
  }
  try {
    for (const f of corpusForDeal(raw).files || []) {
      add(f.name, { id: f.id || f.name, source: 'workspace', kind: f.kind || null, owner: f.owner || f.author || null, updated: f.lastModified || f.modified || null, preview: f.preview || null });
    }
  } catch { /* the corpus is best-effort */ }
  return out;
}

// The extension decides what a reader can be offered: a PDF renders where it stands, an
// Office file needs Word or Excel — on the web or on their machine.
export function documentAffordances(dealId, name) {
  const ext = (String(name).match(/\.([a-z0-9]{2,5})$/i) || [, ''])[1].toLowerCase();
  const q = `?name=${encodeURIComponent(name)}`;
  const base = `/api/deals/${encodeURIComponent(dealId)}`;
  return {
    ext,
    // Always available: the deal's own record of what this paper says, rendered as a PDF
    // the browser and the Teams client both display without downloading anything.
    previewUrl: `${base}/document-brief.pdf${q}`,
    briefUrl: `${base}/document-brief.docx${q}`,
    previewable: true,
    office: /^(docx?|xlsx?|pptx?)$/.test(ext) ? (ext.startsWith('doc') ? 'word' : ext.startsWith('xls') ? 'excel' : 'powerpoint') : null,
  };
}
