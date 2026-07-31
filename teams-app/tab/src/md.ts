// Tiny, dependency-free, XSS-safe Markdown renderer for agent replies.
// Escapes all HTML first, then applies a limited, safe set of Markdown rules
// (headings, bold/italic, inline code, fenced code, lists, links, tables, paragraphs).

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(s: string): string {
  let t = escapeHtml(s);
  // inline code
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  // bold then italic
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  // links [text](http…) — only http/https targets. The URL charset excludes
  // quotes, angle brackets, parens and whitespace so a crafted URL can never break
  // out of the href="…" attribute (attribute-injection XSS).
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s"'<>]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return t;
}

// ---------------------------------------------------------------------------
// Tables. Agents answer comparison questions — comps, returns cases, lane status,
// deal-by-deal breakdowns — in pipe tables. Without this they fell through to the
// paragraph rule, which joins consecutive lines with a space and turns a table into
// one run of pipe-separated text: technically rendered, practically unreadable.
//
// Cells go through inline(), which escapes HTML before applying its own limited
// rules, so cell content is no more privileged than any other text.
const ROW = /^\s*\|(.+)\|\s*$/;
// A delimiter row is what actually distinguishes a table from a line that merely
// contains pipes, so it is required rather than inferred.
const DELIM = /^\s*\|[\s:|-]*-[\s:|-]*\|\s*$/;

function cells(line: string): string[] {
  // Split on unescaped pipes only, so a literal \| inside a cell survives.
  return line.replace(ROW, '$1').split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
}

function alignments(delim: string): (string | null)[] {
  return cells(delim).map((c) => {
    const left = c.startsWith(':');
    const right = c.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';   // numeric columns read far better right-aligned
    if (left) return 'left';
    return null;
  });
}

function renderTable(header: string, delim: string, body: string[]): string {
  const align = alignments(delim);
  const at = (i: number) => (align[i] ? ` style="text-align:${align[i]}"` : '');
  const head = cells(header).map((c, i) => `<th${at(i)}>${inline(c)}</th>`).join('');
  const rows = body.map((r) => `<tr>${cells(r).map((c, i) => `<td${at(i)}>${inline(c)}</td>`).join('')}</tr>`).join('');
  // The scroll wrapper matters in a 380px chat rail: a wide table scrolls within
  // itself instead of widening the whole panel.
  return `<div class="mdtable"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function renderMarkdown(src: string): string {
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inCode = false;
  const code: string[] = [];
  let para: string[] = [];

  const flushList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };
  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      if (inCode) { out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code.length = 0; inCode = false; }
      else { flushPara(); flushList(); inCode = true; }
      continue;
    }
    if (inCode) { code.push(line); continue; }

    // A table is only a table when a delimiter row follows the header, so an ordinary
    // sentence containing pipes still renders as prose.
    if (ROW.test(line) && i + 1 < lines.length && DELIM.test(lines[i + 1])) {
      flushPara(); flushList();
      const body: string[] = [];
      let j = i + 2;
      while (j < lines.length && ROW.test(lines[j])) { body.push(lines[j]); j++; }
      out.push(renderTable(line, lines[i + 1], body));
      i = j - 1;
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);

    if (h) {
      flushPara(); flushList();
      const level = Math.min(h[1].length + 2, 6); // h1->h3
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
    } else if (ul) {
      flushPara();
      if (listType !== 'ul') { flushList(); out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${inline(ul[1])}</li>`);
    } else if (ol) {
      flushPara();
      if (listType !== 'ol') { flushList(); out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${inline(ol[1])}</li>`);
    } else if (line.trim() === '') {
      flushPara(); flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  if (inCode) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  flushPara(); flushList();
  return out.join('\n');
}
