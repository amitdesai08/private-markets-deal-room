// A small PDF writer.
//
// Why write one rather than take a dependency: the document a person opens in this
// product should render in the browser the moment they click, with no download, no
// Word, and no round trip to a converter. That means a PDF. It is the one document
// format every browser and the Teams client draw natively.
//
// This produces PDF 1.4 with the three standard Helvetica faces, which every reader
// already has, so nothing is embedded and the files come out at a few kilobytes.
// It handles the things this product actually needs — a cover block, headings,
// wrapped paragraphs, bullets, key/value rows and rules — and nothing it does not.
// It is not a general typesetting engine and should not grow into one.

const PAGE = { w: 595.28, h: 841.89, margin: 56 };
const CONTENT_W = PAGE.w - PAGE.margin * 2;

// Adobe's standard widths, in 1/1000 em, for codes 32..126. Text is wrapped by
// measuring against these; get them wrong and lines run into the margin.
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];
const HELVB = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  333, 333, 584, 584, 584, 611, 975,
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  333, 278, 333, 584, 556, 333,
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500,
  389, 280, 389, 584,
];

// The typography this product actually emits — em dashes in every document name,
// curly quotes in finding text, the odd currency symbol — mapped to the single-byte
// codes WinAnsi gives them. Anything still outside the range is transliterated
// rather than dropped, because a missing character in a company name is a bug the
// reader cannot diagnose.
const WINANSI = new Map(Object.entries({
  '\u2014': 0x97, '\u2013': 0x96, '\u2012': 0x96, '\u2212': 0x96,
  '\u2018': 0x91, '\u2019': 0x92, '\u201C': 0x93, '\u201D': 0x94,
  '\u2026': 0x85, '\u2022': 0x95, '\u2020': 0x86, '\u2021': 0x87,
  '\u20AC': 0x80, '\u00A3': 0xA3, '\u00A5': 0xA5, '\u00A9': 0xA9, '\u00AE': 0xAE,
  '\u00B0': 0xB0, '\u00BD': 0xBD, '\u00E9': 0xE9, '\u00E8': 0xE8, '\u00F6': 0xF6,
  '\u00FC': 0xFC, '\u00E4': 0xE4, '\u00E5': 0xE5, '\u00F8': 0xF8, '\u00E6': 0xE6,
  '\u00C5': 0xC5, '\u00D8': 0xD8, '\u00C6': 0xC6, '\u00DF': 0xDF, '\u00F1': 0xF1,
}).map(([k, v]) => [k, v]));

function toWinAnsi(str) {
  const out = [];
  for (const ch of String(str ?? '')) {
    const code = ch.codePointAt(0);
    if (code >= 32 && code <= 126) { out.push(code); continue; }
    const mapped = WINANSI.get(ch);
    if (mapped) { out.push(mapped); continue; }
    if (code === 9) { out.push(32); continue; }
    // Unknown and unmappable: a hyphen reads better than a black box.
    if (code > 126) out.push(code < 256 ? code : 45);
  }
  return out;
}

function widthOf(bytes, bold, size) {
  const table = bold ? HELVB : HELV;
  const fallback = bold ? 611 : 556;
  let units = 0;
  for (const b of bytes) units += (b >= 32 && b <= 126) ? table[b - 32] : fallback;
  return (units * size) / 1000;
}

/** A PDF string literal: the three characters that would otherwise end it, escaped. */
function pdfString(bytes) {
  const parts = [];
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5C) parts.push(0x5C, b);
    else parts.push(b);
  }
  return Buffer.from(parts);
}

/** Greedy word wrap, measured in the face it will actually be drawn in. */
function wrap(text, { bold = false, size = 10, width = CONTENT_W }) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  if (!words.length) return [[]];
  const lines = [];
  let line = [];
  for (const word of words) {
    const candidate = line.length ? [...line, 32, ...toWinAnsi(word)] : toWinAnsi(word);
    if (line.length && widthOf(candidate, bold, size) > width) {
      lines.push(line);
      line = toWinAnsi(word);
    } else {
      line = candidate;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

const rgb = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// ---------------------------------------------------------------------------
//  Layout
// ---------------------------------------------------------------------------
// One pass, top to bottom, breaking to a new page whenever the next block will not
// fit. Blocks never split mid-paragraph across a page for the simple reason that
// these documents are short and an orphaned line looks like a fault.

class Canvas {
  constructor() {
    this.pages = [];
    this.newPage();
  }

  newPage() {
    this.ops = [];
    this.y = PAGE.h - PAGE.margin;
    this.pages.push(this.ops);
  }

  room(h) {
    if (this.y - h < PAGE.margin + 24) this.newPage();
  }

  text(lines, { size = 10, bold = false, italic = false, color = '2B2B2B', leading = 1.35, indent = 0 }) {
    const font = bold ? '/F2' : italic ? '/F3' : '/F1';
    const [r, g, b] = rgb(color);
    for (const line of lines) {
      this.room(size * leading);
      this.y -= size * leading;
      this.ops.push(
        `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`,
        `BT ${font} ${size} Tf 1 0 0 1 ${(PAGE.margin + indent).toFixed(2)} ${this.y.toFixed(2)} Tm`,
      );
      this.ops.push(Buffer.concat([Buffer.from('('), pdfString(line), Buffer.from(') Tj')]));
      this.ops.push('ET');
    }
  }

  rule(color = 'D9DEE7', thickness = 0.8) {
    this.room(10);
    this.y -= 6;
    const [r, g, b] = rgb(color);
    this.ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
    this.ops.push(`${PAGE.margin} ${this.y.toFixed(2)} ${CONTENT_W.toFixed(2)} ${thickness} re f`);
    this.y -= 4;
  }

  band(h, color) {
    const [r, g, b] = rgb(color);
    this.ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
    this.ops.push(`${PAGE.margin} ${(this.y - h + 4).toFixed(2)} 3 ${h} re f`);
  }

  gap(h = 8) { this.y -= h; }
}

/**
 * Render a document.
 *
 * `blocks` is a flat list because these documents are flat: there is no nesting to
 * express and inventing a tree would only make the callers harder to read.
 */
export function renderPdf({ title = 'Document', author = 'Deal Room', blocks = [] } = {}) {
  const c = new Canvas();

  for (const block of blocks) {
    if (!block) continue;
    const { t } = block;
    if (t === 'eyebrow') {
      c.text(wrap(block.text, { bold: true, size: 8 }), { size: 8, bold: true, color: block.color || '2F5AA8' });
      c.gap(2);
    } else if (t === 'title') {
      c.gap(2);
      c.text(wrap(block.text, { bold: true, size: 19 }), { size: 19, bold: true, color: '17202A', leading: 1.25 });
      c.gap(2);
    } else if (t === 'meta') {
      c.text(wrap(block.text, { italic: true, size: 9 }), { size: 9, italic: true, color: '6B7280' });
    } else if (t === 'rule') {
      c.gap(4); c.rule(block.color, block.thickness); c.gap(6);
    } else if (t === 'h') {
      c.gap(10);
      c.room(30);
      c.text(wrap(block.text, { bold: true, size: 12 }), { size: 12, bold: true, color: '17202A' });
      c.gap(3);
    } else if (t === 'p') {
      c.text(wrap(block.text, { size: 10 }), { size: 10, color: block.color || '2B2B2B', leading: 1.45 });
      c.gap(5);
    } else if (t === 'note') {
      // A left rule and grey text: this is the block that says what the document is
      // NOT, so it has to be visibly set apart from the findings below it.
      const lines = wrap(block.text, { size: 9.5, width: CONTENT_W - 14 });
      const h = lines.length * 9.5 * 1.45;
      c.room(h + 8);
      c.band(h, block.color || '2F5AA8');
      c.text(lines, { size: 9.5, color: '4B5563', leading: 1.45, indent: 14 });
      c.gap(6);
    } else if (t === 'bullets') {
      for (const item of block.items || []) {
        const lines = wrap(item, { size: 10, width: CONTENT_W - 14 });
        c.room(lines.length * 10 * 1.45);
        c.text([toWinAnsi('\u2022')], { size: 10, color: '6B7280' });
        c.y += 10 * 1.45; // the bullet and its first line share a baseline
        c.text(lines, { size: 10, leading: 1.45, indent: 14 });
        c.gap(2);
      }
      c.gap(4);
    } else if (t === 'kv') {
      for (const [k, v] of block.rows || []) {
        const label = wrap(k, { bold: true, size: 9.5, width: 130 });
        const value = wrap(v ?? '\u2014', { size: 9.5, width: CONTENT_W - 140 });
        const rows = Math.max(label.length, value.length);
        c.room(rows * 9.5 * 1.45 + 4);
        const top = c.y;
        c.text(label, { size: 9.5, bold: true, color: '6B7280', leading: 1.45 });
        const after = c.y;
        c.y = top;
        c.text(value, { size: 9.5, leading: 1.45, indent: 140 });
        c.y = Math.min(after, c.y);
        c.gap(3);
      }
      c.gap(4);
    } else if (t === 'gap') {
      c.gap(block.h ?? 10);
    }
  }

  return assemble(c.pages, { title, author });
}

// ---------------------------------------------------------------------------
//  File assembly
// ---------------------------------------------------------------------------
// The cross-reference table is a list of byte offsets, so everything is built into
// a buffer list and measured as it goes. Getting this wrong produces a file that
// some readers open and others refuse, which is worse than one that fails outright.

function assemble(pages, { title, author }) {
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (s) => { const b = Buffer.isBuffer(s) ? s : Buffer.from(s, 'latin1'); chunks.push(b); length += b.length; };
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n`); push(body); push('\nendobj\n'); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  const fontIds = { F1: 3, F2: 4, F3: 5 };
  const firstPage = 6;
  const pageIds = pages.map((_, i) => firstPage + i * 2);
  const contentIds = pages.map((_, i) => firstPage + i * 2 + 1);

  obj(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  obj(fontIds.F1, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
  obj(fontIds.F2, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
  obj(fontIds.F3, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>`);

  pages.forEach((ops, i) => {
    const stream = Buffer.concat(ops.map((op) => Buffer.concat([
      Buffer.isBuffer(op) ? op : Buffer.from(op, 'latin1'),
      Buffer.from('\n'),
    ])));
    obj(pageIds[i], `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w.toFixed(2)} ${PAGE.h.toFixed(2)}] `
      + `/Resources << /Font << /F1 ${fontIds.F1} 0 R /F2 ${fontIds.F2} 0 R /F3 ${fontIds.F3} 0 R >> >> `
      + `/Contents ${contentIds[i]} 0 R >>`);
    offsets[contentIds[i]] = length;
    push(`${contentIds[i]} 0 obj\n<< /Length ${stream.length} >>\nstream\n`);
    push(stream);
    push('\nendstream\nendobj\n');
  });

  const infoId = firstPage + pages.length * 2;
  obj(infoId, `<< /Title (${pdfString(toWinAnsi(title)).toString('latin1')}) /Author (${pdfString(toWinAnsi(author)).toString('latin1')}) /Producer (Deal Room) >>`);

  const maxId = infoId;
  const xref = length;
  push(`xref\n0 ${maxId + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= maxId; i += 1) {
    push(`${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  return Buffer.concat(chunks);
}
