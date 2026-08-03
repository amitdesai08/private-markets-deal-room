// Making a document name in this product do what a document name should do: open
// the document.
//
// The deal surfaces list files everywhere — IC memos, returns models, legal packs,
// vendor QoE reports — and until now most of them were text. You read the name, then
// went to find the thing somewhere else. That is exactly the chasing about this
// product exists to remove.
//
// A document a person sees here is in one of three states, and each deserves a
// different answer:
//
//   EXTERNAL — Microsoft 365 gave us a real link. Open it in SharePoint, Word or
//              Excel, where it belongs. We are the way in, not a copy of it.
//
//   GENERATE — the platform can PRODUCE this document from the live deal record.
//              The IC memo, the IC deck, the returns model and the deal model are
//              all built here already; they were simply hidden behind a separate
//              export screen, so the memo listed in the data room and the memo the
//              product could write for you were two unrelated things on two
//              different tabs. Clicking the name now builds the real Office file.
//
//   BRIEF    — a document nobody has given us a link to: the vendor's QoE, counsel's
//              mark-up, the seller's information memorandum. We will not fake a copy
//              of it. What we open instead is everything the deal record genuinely
//              holds on it — what it is, whose workstream it belongs to, the
//              diligence findings that cite it, and where the original lives — and
//              you can take that away as a Word file.
//
// Every one of the three OPENS. That matters more than it sounds: a list where two
// names are live and eight are inert reads as a broken product, and the person goes
// back to hunting through email for the attachment. So the control on every document
// says Open, and what opens is the best thing we honestly have.
//
// None of this turns on FILE FORMAT. A PDF opens exactly as readily as a Word
// document; Microsoft 365 renders it in the browser. What decides the mode is
// whether we hold a pointer to the actual file. Formats correlate only by accident:
// the four documents this platform can write are a .docx, a .pptx and two .xlsx, so
// a PDF is never a GENERATE — but plenty of Word and Excel files are briefs too.
//
// The rule that keeps this honest: a mode is only ever assigned from evidence. An
// external link must be an https URL Microsoft 365 returned. A generate offer must
// match a document this platform actually knows how to build. Everything else is a
// brief, and a brief never pretends to be the document.

import { laneLabel, ownerLabel } from './cockpit.js';

// Documents this platform builds from the live record. Order matters: "Returns
// Model" and "Deal Model" both contain the word model, so the specific patterns are
// tested before the general one.
const GENERATABLE = [
  {
    kind: 'ic-memo',
    label: 'IC memo',
    ext: 'docx',
    app: 'Word',
    match: /\bic\s*[-–—]?\s*memo\b|\binvestment\s+committee\s+memo(randum)?\b/i,
  },
  {
    kind: 'ic-deck',
    label: 'IC deck',
    ext: 'pptx',
    app: 'PowerPoint',
    match: /\bic\s*[-–—]?\s*(deck|pack|presentation)\b|\binvestment\s+committee\s+(deck|pack|presentation)\b/i,
  },
  {
    kind: 'returns',
    label: 'returns model',
    ext: 'xlsx',
    app: 'Excel',
    match: /\breturns?\s+model\b|\blbo\s+model\b|\breturns?\s+bridge\b/i,
  },
  {
    kind: 'model',
    label: 'deal model',
    ext: 'xlsx',
    app: 'Excel',
    match: /\b(deal|financial|operating)\s+model\b/i,
  },
];

const isHttps = (u) => /^https:\/\/[^\s]+$/i.test(String(u || '').trim());

/**
 * How this document should open, and why.
 *
 * Never throws and never guesses: with nothing to go on it returns a brief, which is
 * the mode that promises least.
 */
export function resolveDocOpen(doc = {}, _deal = null) {
  const url = String(doc?.webUrl || '').trim();
  if (isHttps(url)) {
    return { mode: 'external', url, label: 'Open', reason: 'Stored in Microsoft 365.' };
  }
  const name = String(doc?.name || '');
  const hit = name ? GENERATABLE.find((g) => g.match.test(name)) : null;
  if (hit) {
    return {
      mode: 'generate',
      kind: hit.kind,
      ext: hit.ext,
      label: `Open in ${hit.app}`,
      reason: `Written from this deal's current record each time you open it, so the ${hit.label} is never out of date.`,
    };
  }
  return {
    mode: 'brief',
    label: 'Open',
    reason: 'Nobody has shared the original file with us yet. Opens everything the deal record holds on this document, and where the original lives.',
  };
}

// Two names, one document?
//
// A document listed on the deal and the real file sitting in SharePoint are usually
// the same thing under slightly different punctuation — an em dash here, a version
// suffix there. Until they are matched, the listed name stays unopenable while the
// real file appears further down the page as a second, unexplained row.
//
// The bar is deliberately high, because a WRONG link is worse than no link: send
// someone to the wrong QoE and they will read it. So: compare on letters and digits
// only, require real substance, and accept a difference only where one name is the
// other plus a suffix ("… v3", "… FINAL") and still most of the same name.
const MIN_NAME = 8;
const PREFIX_RATIO = 0.6;

export function normaliseDocName(name) {
  return String(name || '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function sameDocument(a, b) {
  const x = normaliseDocName(a);
  const y = normaliseDocName(b);
  if (x.length < MIN_NAME || y.length < MIN_NAME) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (!long.startsWith(`${short} `)) return false;
  return short.length >= long.length * PREFIX_RATIO;
}

/**
 * The real Microsoft 365 file behind a listed document name, if it is among these
 * search results. Only ever returns something with a usable https link.
 */
export function matchLiveFile(name, live = []) {
  if (!name || !Array.isArray(live)) return null;
  return live.find((f) => isHttps(f?.webUrl) && sameDocument(name, f?.name)) || null;
}

/**
 * Fold what Microsoft 365 returned into the documents the deal lists.
 *
 * Returns the listed documents with a real link attached wherever one was found, and
 * separately the live files that matched nothing so they can still be shown. Without
 * this the same paper appears twice — once as the name the deal knows it by and once
 * as the file SharePoint knows it by — and the reader cannot tell which to trust.
 */
export function mergeLiveFiles(files = [], live = []) {
  const listed = Array.isArray(files) ? files : [];
  const found = Array.isArray(live) ? live : [];
  const claimed = new Set();
  const merged = listed.map((f) => {
    if (isHttps(f?.webUrl)) return f;
    const hit = found.find((l) => !claimed.has(l) && isHttps(l?.webUrl) && sameDocument(f?.name, l?.name));
    if (!hit) return f;
    claimed.add(hit);
    // The deal's own name for the document wins: it is the one used in the findings,
    // the emails and the channel. What we take from Microsoft 365 is the way in.
    return { ...f, webUrl: hit.webUrl, lastModified: hit.lastModified || hit.modified || f.lastModified };
  });
  return { files: merged, extra: found.filter((l) => !claimed.has(l)) };
}

// The lane a document belongs to, inferred from its name. Deliberately keyword-based
// and deliberately incomplete: an unmatched document gets no lane rather than a
// wrong one, because attributing counsel's mark-up to the finance workstream sends
// someone to the wrong colleague.
const LANE_WORDS = [
  ['financial', /\bqoe\b|quality of earnings|\bfinancial|\bebitda\b|audit|\btrading\b|\bbudget\b/i],
  ['legal', /\blegal\b|\bspa\b|\bsha\b|counsel|contract|consent|litigat|\bcompliance\b/i],
  ['commercial', /commercial|market|customer|pricing|\bcohort\b|churn|revenue/i],
  ['operational', /operation|supply|logistic|manufactur|\bplant\b|\bsite\b/i],
  ['tech', /\btech|\bit\b|\bsoftware\b|\bplatform\b|\bcyber|\bdata\b/i],
  ['esg', /\besg\b|sustainab|carbon|emission|environment/i],
  ['hr', /\bhr\b|people|management team|organisation|organization|payroll/i],
  ['tax', /\btax\b|transfer pricing|\bvat\b/i],
];

function laneForName(name) {
  const n = String(name || '');
  for (const [lane, re] of LANE_WORDS) if (re.test(n)) return lane;
  return null;
}

// Does this finding actually concern this document? Two forms of evidence, both
// checkable: the finding names the document as its source, or the finding's lane is
// the lane the document's own name puts it in. Anything looser produces a reading
// view full of findings that have nothing to do with what you clicked.
function findingMatches(f, name, lane) {
  const src = String(f.source || '').trim().toLowerCase();
  const n = String(name || '').toLowerCase();
  if (src.length > 3 && (n.includes(src) || src.includes(n.replace(/\.[a-z0-9]+$/i, '').trim()))) return true;
  return !!lane && f.lane === lane;
}

/**
 * What the deal record genuinely holds about a document we cannot open.
 *
 * Everything here is restated from the deal, never composed: the findings really do
 * cite it, the owner really is the person on that workstream. `basis` says which of
 * the two links was made so the reader can judge it.
 */
export function documentBrief(doc = {}, deal = null) {
  const name = String(doc?.name || '');
  const lane = laneForName(name);
  const workstreams = Array.isArray(deal?.workstreams) ? deal.workstreams : [];
  const ws = lane ? workstreams.find((w) => w.lane === lane) : null;

  const findings = workstreams
    .flatMap((w) => (Array.isArray(w.findings) ? w.findings.map((f) => ({ ...f, lane: w.lane, owner: w.owner })) : []))
    .filter((f) => findingMatches(f, name, lane))
    .slice(0, 6)
    .map((f) => ({
      text: f.text,
      severity: f.severity || null,
      source: f.source || null,
      basis: String(f.source || '').length > 3 && name.toLowerCase().includes(String(f.source).toLowerCase())
        ? 'Cites this document'
        : 'From the same workstream',
    }));

  return {
    name,
    summary: withoutRepeats(doc?.summary, findings),
    lane,
    owner: ws?.owner || null,
    // The same two facts as a person would say them. The raw keys stay above
    // because code matches on them; a briefing that may be forwarded to a lender
    // should not read "fund-cfo" or "techai".
    laneName: lane ? laneLabel(lane) : null,
    ownerName: ws?.owner ? ownerLabel(ws.owner, lane) : null,
    laneStatus: readable(ws?.status),
    findings,
    // Where the real file lives, when the deal has a data room to point at.
    dataRoomUrl: deal?.workspace?.sharePointProvisioned ? (deal?.workspace?.sharePointUrl || null) : null,
  };
}

/**
 * A stored status as a person would write it.
 *
 * The record keeps `in_progress` because that is what code compares against; a
 * document that a partner may forward to a lender should not show the machine's
 * spelling of it.
 */
function readable(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const words = s.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The summary with any finding it already quotes taken back out.
 *
 * A document's stored summary tends to end with the workstream's headline finding,
 * which is fine in a one-line list. The briefing prints the findings in full a few
 * lines further down, so left alone the same sentence appears twice on one page and
 * the paper reads as though nobody proof-read it. The finding stays; the copy of it
 * goes.
 */
function withoutRepeats(summary, findings = []) {
  let s = String(summary || '').trim();
  if (!s) return null;
  for (const f of findings) {
    const t = String(f.text || '').trim();
    // Short texts can legitimately recur; only lift out something substantial.
    if (t.length > 24 && s.includes(t)) s = s.replace(t, '');
  }
  s = s.replace(/\s+/g, ' ').replace(/[\s—–-]+$/, '').trim();
  return s || null;
}

/**
 * Attach the open descriptor to a list of documents.
 *
 * `live` is whatever Microsoft 365 returned for this deal. A listed document that we
 * hold no link for is checked against it first, because the seller's memorandum sat
 * in the data room all along — it was only ever the punctuation of the name that
 * stopped us joining the two up.
 */
export function withOpen(docs = [], deal = null, live = []) {
  return (Array.isArray(docs) ? docs : []).map((d) => {
    const real = isHttps(d?.webUrl) ? null : matchLiveFile(d?.name, live);
    const doc = real ? { ...d, webUrl: real.webUrl } : d;
    return { ...doc, open: resolveDocOpen(doc, deal) };
  });
}
