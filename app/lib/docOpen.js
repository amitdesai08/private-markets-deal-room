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
//   BRIEF    — a document that exists in the deal's world but not in ours: the
//              vendor's QoE, counsel's mark-up, the seller's information memorandum.
//              We will not fake an open. Instead we show what we genuinely hold
//              about it — what it is, whose workstream it belongs to, and the
//              diligence findings that cite it — so the click is still worth making
//              and the person knows precisely where the real file lives.
//
// The rule that keeps this honest: a mode is only ever assigned from evidence. An
// external link must be an https URL Microsoft 365 returned. A generate offer must
// match a document this platform actually knows how to build. Everything else is a
// brief, and a brief never pretends to be the document.

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
    label: 'What we know',
    reason: 'This document is held outside the platform, so we show what the deal record says about it rather than a copy of it.',
  };
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
    summary: doc?.summary || null,
    lane,
    owner: ws?.owner || null,
    laneStatus: ws?.status || null,
    findings,
    // Where the real file lives, when the deal has a data room to point at.
    dataRoomUrl: deal?.workspace?.sharePointProvisioned ? (deal?.workspace?.sharePointUrl || null) : null,
  };
}

/** Attach the open descriptor to a list of documents. */
export function withOpen(docs = [], deal = null) {
  return (Array.isArray(docs) ? docs : []).map((d) => ({ ...d, open: resolveDocOpen(d, deal) }));
}
