// Mailbox -> CxO signal ingestion (O1 · Deal Sourcing).
//
// Transforms raw Microsoft Graph / WorkIQ message objects into the CxO
// "signal company" documents the O1 Signals explorer renders. The signal is
// email-driven: a CxO (identified from the message signature) expressing intent
// or receptivity about their company. Company is taken from the subject, the
// signatory + title from the signature block, intent from importance/keywords.
//
// This is the intelligent transform in the ingestion path. The FETCH differs by
// environment — WorkIQ MCP today (delegated user auth), a Graph service job once
// application Mail.Read consent is granted — but both feed Graph-shaped messages
// through this same function, which is what persists to Cosmos via the repo.

const TITLE_RE = /\b(chief\s+\w+\s+officer|c[efo]o|coo|co-?founder|founder|president|managing\s+director|partner|owner|head\s+of\s+\w+)\b/i;
const HIGH_INTENT_RE = /(open to|exploring|receptive|take[- ]private|recapitali[sz]|succession|minority|growth partner|strategic partner|sell|divest|carve[- ]out|no bankers|before .* process)/i;
const LEGAL_SUFFIXES = /\b(plc|inc|ltd|llc|lp|llp|gmbh|ag|sa|nv|bv|co|corp|corporation|company|group|holdings?|interactive|international|global|market|the)\b/g;

export function entityKey(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .split('/')[0]
    .replace(/\([^)]*\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

const slug = (s) => (s || 'target').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

function decode(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"');
}

// Flatten an HTML body into newline-separated plain text lines.
function htmlToLines(html) {
  return decode(String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function bodyText(msg) {
  const b = msg?.body;
  if (b && typeof b.content === 'string') {
    return (b.contentType || '').toLowerCase() === 'html' ? htmlToLines(b.content) : decode(b.content).split('\n').map((l) => l.trim()).filter(Boolean);
  }
  return decode(msg?.bodyPreview || '').split('\n').map((l) => l.trim()).filter(Boolean);
}

// Company name from the subject (before the em/en dash or " - " separator).
function companyFromSubject(subject) {
  const s = decode(subject || '').trim();
  const m = s.split(/\s+[—–]\s+|\s+-\s+/)[0];
  return (m || s).trim();
}

// Signatory { name, title, org } parsed from the trailing signature block.
function parseSignature(lines) {
  for (let i = lines.length - 1; i >= 1; i--) {
    if (TITLE_RE.test(lines[i]) && lines[i].length <= 60) {
      return {
        title: lines[i].replace(/\s+/g, ' ').trim(),
        name: lines[i - 1].trim(),
        org: (lines[i + 1] || '').trim()
      };
    }
  }
  return { title: '', name: '', org: '' };
}

// A short human preview: first substantive paragraph, minus the greeting.
function previewFrom(lines, fallback) {
  const body = lines.filter((l) => !TITLE_RE.test(l));
  const start = body.length && /^(hi|hey|hello|dear)?\s*[\w .]{0,24},$/i.test(body[0]) ? 1 : 0;
  const text = body.slice(start).join(' ').trim();
  const cut = text || decode(fallback || '');
  return cut.length > 240 ? `${cut.slice(0, 237)}…` : cut;
}

function intentOf(msg, lines) {
  if ((msg?.importance || '').toLowerCase() === 'high') return 'high';
  return HIGH_INTENT_RE.test(lines.join(' ')) ? 'high' : 'medium';
}

// US-target enrichment. The company/CxO/intent all come from the real email;
// sector/hq are firmographics a market-data connector (Phase 2) will supply —
// a small known-target map covers the current desk, with a keyword fallback.
const KNOWN = [
  { m: /peloton/i, sector: 'Consumer · Connected Fitness', hq: 'New York, NY, USA', summary: 'Connected-fitness maker pivoting to high-margin recurring subscription revenue; board open to a strategic minority growth partner.' },
  { m: /allbird/i, sector: 'Consumer · Footwear & Apparel', hq: 'San Francisco, CA, USA', summary: 'Sustainable footwear brand exploring a take-private to rationalize retail and refocus on profitable DTC and material innovation.' },
  { m: /fairway/i, sector: 'Consumer · Grocery', hq: 'New York, NY, USA', summary: 'New York specialty grocer weighing a recapitalization and ownership succession off strong store-level EBITDA.' }
];
function guessSector(text) {
  const t = text.toLowerCase();
  if (/fitness|wellness|gym|workout/.test(t)) return 'Consumer · Fitness';
  if (/footwear|apparel|shoe|sneaker|fashion/.test(t)) return 'Consumer · Apparel';
  if (/grocery|supermarket|food|store/.test(t)) return 'Consumer · Grocery';
  if (/software|saas|platform|ai\b|analytics/.test(t)) return 'Software';
  if (/manufactur|industrial|component|factory/.test(t)) return 'Industrials';
  return 'Consumer & Retail';
}
function enrich(name, text) {
  const hit = KNOWN.find((k) => k.m.test(name) || k.m.test(text));
  if (hit) return { sector: hit.sector, hq: hit.hq, summary: hit.summary };
  return { sector: guessSector(`${name} ${text}`), hq: '—', summary: '' };
}

// Parse one Graph message into a normalized email signal item (+ company).
export function parseMessage(msg) {
  const lines = bodyText(msg);
  const sig = parseSignature(lines);
  const company = (sig.org && sig.org.length <= 40 ? sig.org : '') || companyFromSubject(msg?.subject);
  if (!company) return null;
  const intent = intentOf(msg, lines);
  return {
    company,
    key: entityKey(companyFromSubject(msg?.subject) || company),
    text: lines.join(' '),
    item: {
      id: msg?.id || `sig-${slug(company)}-${Math.random().toString(36).slice(2, 8)}`,
      from: sig.name || decode(msg?.from?.emailAddress?.name) || 'Executive',
      role: [sig.title, company].filter(Boolean).join(' · '),
      subject: decode(msg?.subject) || '(no subject)',
      preview: previewFrom(lines, msg?.bodyPreview),
      when: msg?.sentDateTime || msg?.receivedDateTime || new Date().toISOString(),
      intent,
      address: msg?.from?.emailAddress?.address || null
    }
  };
}

const rank = { high: 3, medium: 2, low: 1 };

// Transform a batch of Graph messages into signal-company documents grouped by
// company, each with its embedded CxO emails. Chats/meetings are empty until
// real Teams/calendar signals exist for the company.
export function messagesToSignals(messages) {
  const groups = new Map();
  for (const msg of messages || []) {
    const p = parseMessage(msg);
    if (!p || !p.key) continue;
    if (!groups.has(p.key)) groups.set(p.key, { company: p.company, text: p.text, items: [] });
    const g = groups.get(p.key);
    g.items.push(p.item);
    if (p.company.length > g.company.length) g.company = p.company; // prefer fuller name
    g.text += ` ${p.text}`;
  }

  const docs = [];
  for (const [key, g] of groups) {
    const emails = g.items.sort((a, b) => new Date(b.when) - new Date(a.when));
    const intent = emails.reduce((hi, e) => (rank[e.intent] > rank[hi] ? e.intent : hi), 'medium');
    const info = enrich(g.company, g.text);
    docs.push({
      id: `signal-${slug(key || g.company)}`,
      kind: 'signal',
      name: g.company,
      sector: info.sector,
      hq: info.hq,
      summary: info.summary || (emails[0] && emails[0].preview) || '',
      intent,
      emails,
      chats: [],
      meetings: [],
      crm: {
        exists: false,
        note: 'No CRM record — net-new target. A Dynamics 365 record is created automatically when the deal advances to auto-screen (O2).'
      },
      source: 'm365'
    });
  }
  return docs;
}
