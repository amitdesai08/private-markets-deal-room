import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DEFAULT_SOURCE = path.join(ROOT, 'docs', 'demos', 'DEMO-AZURE-PORTAL-INTEGRATIONS.md');
const DEFAULT_OUTPUT = path.join(ROOT, 'docs', 'demos', 'DEMO-AZURE-PORTAL-INTEGRATIONS.docx');
const REPO_URL = 'https://github.com/amitdesai08/private-markets-deal-room/blob/main/';

const source = path.resolve(process.argv[2] || DEFAULT_SOURCE);
const output = path.resolve(process.argv[3] || DEFAULT_OUTPUT);
const markdown = await readFile(source, 'utf8');

const COLORS = {
  navy: '17365D',
  blue: '2E75B6',
  paleBlue: 'D9EAF7',
  paleGray: 'F3F5F7',
  border: 'C8D2DC',
  text: '25313C',
  muted: '5B6875',
  white: 'FFFFFF',
};

function hyperlinkTarget(target) {
  if (/^https?:\/\//i.test(target)) return target;
  const relative = path.relative(ROOT, path.resolve(path.dirname(source), target)).replaceAll('\\', '/');
  return REPO_URL + relative;
}

function inlineRuns(text, defaults = {}) {
  const runs = [];
  const token = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let cursor = 0;
  let match;
  while ((match = token.exec(text))) {
    if (match.index > cursor) runs.push(new TextRun({ text: text.slice(cursor, match.index), ...defaults }));
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], bold: true, ...defaults }));
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3], font: 'Consolas', color: COLORS.navy, ...defaults }));
    } else {
      runs.push(new ExternalHyperlink({
        link: hyperlinkTarget(match[5]),
        children: [new TextRun({ text: match[4], color: '0563C1', underline: {}, ...defaults })],
      }));
    }
    cursor = token.lastIndex;
  }
  if (cursor < text.length) runs.push(new TextRun({ text: text.slice(cursor), ...defaults }));
  return runs.length ? runs : [new TextRun({ text, ...defaults })];
}

function paragraph(text, options = {}) {
  return new Paragraph({
    spacing: { after: options.after ?? 130, line: 290 },
    alignment: options.alignment,
    indent: options.indent,
    border: options.border,
    shading: options.shading,
    bullet: options.bullet,
    numbering: options.numbering,
    keepNext: options.keepNext,
    children: inlineRuns(text, options.run || {}),
  });
}

function heading(text, level) {
  return new Paragraph({
    heading: level,
    keepNext: true,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 300 : 220, after: 100 },
    children: [new TextRun({ text, bold: true, color: level === HeadingLevel.HEADING_1 ? COLORS.navy : COLORS.blue })],
  });
}

function callout(text) {
  return paragraph(text, {
    indent: { left: 300, right: 180 },
    border: { left: { style: BorderStyle.SINGLE, color: COLORS.blue, size: 18, space: 10 } },
    shading: { type: ShadingType.CLEAR, fill: 'EDF5FB', color: 'auto' },
    run: { italics: true, color: COLORS.navy },
    after: 180,
  });
}

function codeBlock(lines) {
  return lines.map((line, index) => new Paragraph({
    spacing: { before: index === 0 ? 80 : 0, after: index === lines.length - 1 ? 160 : 0, line: 250 },
    indent: { left: 260, right: 180 },
    shading: { type: ShadingType.CLEAR, fill: COLORS.paleGray, color: 'auto' },
    children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 18, color: COLORS.text })],
  }));
}

function table(rows) {
  const border = { style: BorderStyle.SINGLE, color: COLORS.border, size: 4 };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: rows.map((row, rowIndex) => new TableRow({
      tableHeader: rowIndex === 0,
      children: row.map((cell) => new TableCell({
        shading: rowIndex === 0 ? { type: ShadingType.CLEAR, fill: COLORS.navy, color: 'auto' } : undefined,
        margins: { top: 90, bottom: 90, left: 110, right: 110 },
        width: { size: 100 / row.length, type: WidthType.PERCENTAGE },
        children: [new Paragraph({
          spacing: { after: 0, line: 260 },
          children: inlineRuns(cell, rowIndex === 0 ? { bold: true, color: COLORS.white } : {}),
        })],
      })),
    })),
  });
}

function parseTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function isTableSeparator(line) {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);
}

function parseMarkdown(text) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const children = [];
  let title = 'Azure Portal integration proof';
  let index = 0;

  const listText = (initial) => {
    const parts = [initial];
    while (index < lines.length) {
      const next = lines[index];
      if (!next.trim() || /^(\s*#{1,3}\s|\s*>\s|\s*```|\s*\d+\.\s|\s*-\s|\s*\|)/.test(next)) break;
      parts.push(next.trim());
      index += 1;
    }
    return parts.join(' ');
  };

  if (lines[0]?.startsWith('# ')) {
    title = lines[0].slice(2).trim();
    index = 1;
  }

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    if (line.trimStart().startsWith('```')) {
      const block = [];
      index += 1;
      while (index < lines.length && !lines[index].trimStart().startsWith('```')) block.push(lines[index++].trimStart());
      index += 1;
      children.push(...codeBlock(block));
      continue;
    }

    if (line.startsWith('|') && lines[index + 1] && isTableSeparator(lines[index + 1])) {
      const rows = [parseTableRow(line)];
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith('|')) rows.push(parseTableRow(lines[index++]));
      children.push(table(rows));
      children.push(new Paragraph({ spacing: { after: 130 } }));
      continue;
    }

    if (line.startsWith('### ')) { children.push(heading(line.slice(4).trim(), HeadingLevel.HEADING_2)); index += 1; continue; }
    if (line.startsWith('## ')) { children.push(heading(line.slice(3).trim(), HeadingLevel.HEADING_1)); index += 1; continue; }

    if (line.startsWith('> ')) {
      const quote = [];
      while (index < lines.length && lines[index].startsWith('>')) quote.push(lines[index++].replace(/^>\s?/, '').trim());
      children.push(callout(quote.join(' ')));
      continue;
    }

    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      index += 1;
      children.push(paragraph(listText(numbered[2]), { numbering: { reference: 'demo-numbering', level: 0 }, after: 70 }));
      continue;
    }

    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (bullet) {
      index += 1;
      children.push(paragraph(listText(bullet[1]), { bullet: { level: 0 }, after: 70 }));
      continue;
    }

    const body = [line.trim()];
    index += 1;
    while (index < lines.length
      && lines[index].trim()
      && !/^(#{1,3}\s|>\s|```|\d+\.\s|\s*-\s|\|)/.test(lines[index])) {
      body.push(lines[index].trim());
      index += 1;
    }
    children.push(paragraph(body.join(' ')));
  }

  return { title, children };
}

const { title, children } = parseMarkdown(markdown);
const titleBlock = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 800, after: 150 },
    children: [new TextRun({ text: title, bold: true, size: 52, color: COLORS.navy })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 90 },
    children: [new TextRun({ text: 'Technical demo companion', size: 28, color: COLORS.blue })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 460 },
    children: [new TextRun({ text: 'Read-only Azure walkthrough for architecture and security reviews', italics: true, size: 21, color: COLORS.muted })],
  }),
];

const doc = new Document({
  creator: 'The Deal Room',
  title,
  subject: 'Azure Portal integration demo workflow',
  description: 'Presenter-driven proof of the Deal Room Azure integration architecture.',
  styles: {
    default: { document: { run: { font: 'Aptos', size: 21, color: COLORS.text } } },
    paragraphStyles: [
      {
        id: 'Title',
        name: 'Title',
        basedOn: 'Normal',
        next: 'Normal',
        run: { font: 'Aptos Display', size: 52, bold: true, color: COLORS.navy },
      },
    ],
  },
  numbering: {
    config: [{
      reference: 'demo-numbering',
      levels: [{
        level: 0,
        format: 'decimal',
        text: '%1.',
        alignment: AlignmentType.START,
        style: { paragraph: { indent: { left: 420, hanging: 240 } } },
      }],
    }],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 900, bottom: 850, left: 950, right: 950 },
      },
    },
    children: [...titleBlock, ...children],
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'The Deal Room  |  Azure Portal integration proof  |  ', color: COLORS.muted, size: 17 }),
            new TextRun({ children: [PageNumber.CURRENT], color: COLORS.muted, size: 17 }),
          ],
        })],
      }),
    },
  }],
});

const buffer = await Packer.toBuffer(doc);
await writeFile(output, buffer);
console.log(`Wrote ${path.relative(ROOT, output)} (${buffer.length} bytes)`);