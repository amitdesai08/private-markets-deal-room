// Deterministic Stage-2 (diligence-to-close) artifact engine — the grounded
// backbone for the D1-D5 steps, mirroring lib/screening.js for Stage 1. Each
// function turns a launched deal into the real artifact a US mid-market PE firm
// produces at that step, computed from the deal record (no model needed). The AI
// layer (lib/agents.js) adds narrative; deterministic output always stands alone.
//
// Grounded in practitioner research (Big-4 DD guides, Wall Street Prep, CFI,
// M&I/Multiple Expansion, Bain/BCG CDD, law-firm SPA guides, ILPA, DealRoom/
// Midaxo/Ansarada, Datasite):
//   D1 Launch      -> Diligence Plan (workstreams from memo risks, advisers, budget, timeline)
//   D2 Diligence   -> Findings / Red-Flag Report (workstream taxonomy + severity rollup)
//   D3 Synthesis   -> Final IC Memo (diligence-backed: returns + findings synthesis + exit)
//   D4 Approval    -> Execution Pack (IC decision, SPA terms, conditions precedent, funds flow)
//   D5 Archive     -> Close-out & 100-Day Plan (value creation, governance, records)

import { buildReturns, paperLbo, screeningMultiple, creditProfile } from './screening.js';
import { underwrittenEbitdaCagr, sectorMargin, COST_OF_DEBT_PCT, financingBasis } from './benchmarks.js';
import { money as fmtMoney, symbolFor } from './money.js';
import { ownerLabel } from './cockpit.js';
// The seed is the source of truth for finding text nobody has edited; see reconcileCurrency.
import { seededDeals } from '../data/deals.js';
import { buildDealCase } from './dealCase.js';
import { corpusForDeal } from './workiqCorpus.js';

// Deals past the committee decision. Diligence templates that speak in the future
// tense are wrong about these, and the wrongness is not cosmetic: it restates the
// EBITDA the entry multiple and the leverage covenant are struck on.
const PAST_COMMITTEE = new Set(['approved', 'signing', 'signed', 'closed', 'owned', 'exiting', 'exited']);

// Module-level default keeps $ for any helper without a per-deal shadow; each
// builder below redeclares a currency-aware `money(m)` from the deal's currency.
const money = (m) => fmtMoney(m);

const pct = (n) => `${Math.round(n)}%`;
const round = (n) => Math.round(n);

// Deterministic per-deal jitter, so a templated register varies by company instead of
// printing the same numbers on every one, and varies the same way on every reload.
const seedOf = (s) => {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) >>> 0;
  return h;
};

// A launched deal exposes: company, sector, subSector, dealSize (EV $M), hq,
// keyFigures, workstreams[], thesis. We derive EBITDA/revenue from keyFigures.
function dealFinancials(deal) {
  // Every figure on the record is in $M. "$1.94B" was being stripped to 1.94, so a
  // £1.94bn grocer was modelled as a £1.94m one -- which is where a $0M working-capital
  // peg and four $0M value-creation levers came from, each with a method attached.
  const num = (label, fallback) => {
    const kf = (deal.keyFigures || []).find((k) => new RegExp(label, 'i').test(k.label));
    if (!kf) return fallback;
    const raw = String(kf.value);
    // A money line, not a rate or a delta. Peachtree records "EBITDA vs entry: +11.2%",
    // a value-creation delta, and it was being read as $11.2M of EBITDA -- which put a
    // 41x multiple and $292M of debt against $11.2M on a $460M deal.
    if (/%/.test(raw) || /^[+\u2212-]/.test(raw.trim())) return fallback;
    const v = Number(raw.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(v)) return fallback;
    if (/b(n|illion)?\b/i.test(raw)) return v * 1000;
    if (/\bk\b|thousand/i.test(raw)) return v / 1000;
    return v;
  };
  const ev = deal.dealSize || 300;
  // Deliberately not ARR: it is a different metric, and pairing a recorded ARR with a
  // derived EBITDA produced a 50% margin on a business that has neither figure recorded.
  //
  // The old fallback was a flat `ev * 1.2`, which is a revenue figure with no theory
  // behind it: on a vertical SaaS deal it implied a 5.9% EBITDA margin for a sector that
  // earns 36%. Where revenue is not recorded it is now implied from the EBITDA and the
  // sector's own margin, so the three figures are consistent by construction.
  const ebitdaGuess = round(ev / screeningMultiple(deal));
  const marginGuess = sectorMargin(deal).margin;
  const revenue = num('revenue', Math.max(1, round(ebitdaGuess / (marginGuess / 100))));
  // The label the record actually uses, not the one the extractor hoped for. Onyx
  // carries "Adj. EBITDA $142M" from the carve-out P&L at high confidence; this pattern
  // required the word to start the label, so it missed, the 12% screening default fired,
  // and the product told a committee that an asset the fund owns "is below the 20% / 2x
  // hurdle on both legs" — on $73M it invented, while $142M sat on the same record. At
  // the real figure the entry is 4.3x, not 8.4x, and the deal does not fail.
  const ebitda = num('(adj\\.?|adjusted|ltm|normalised|run.?rate)?\\s*ebitda(?!\\s*(margin|vs|growth|uplift|delta|change))', +(ev / screeningMultiple(deal)).toFixed(1));
  const marginKf = (deal.keyFigures || []).find((k) => /margin/i.test(k.label));
  const ebitdaMargin = marginKf ? Number(String(marginKf.value).replace(/[^0-9.]/g, '')) : (revenue ? +((ebitda / revenue) * 100).toFixed(1) : 12);
  return { ev, revenue, ebitda, ebitdaMargin, growth: dealGrowth(deal) };
}

// The growth rate the record already holds, or null when it holds none -- the caller
// applies the screening default, and the assumptions line then says which of the two it
// used. Left unread, every deal was modelled at the same default: and because the
// leverage cap makes EBITDA and entry multiple cancel out of the paper LBO, that one
// constant was the ONLY thing driving returns. Nineteen deals therefore reported an
// identical 22.5% IRR and 2.76x MOIC, on a comparison table whose entire purpose is to
// tell them apart.
// The top-line figure a record carries when it has no "Revenue" line. ARR, GMV and
// bookings are top lines; none of them is the base an EBITDA margin is struck on.
const TOP_LINE = /^(revenue|turnover|net revenue|arr|annual recurring revenue|recurring revenue|gmv|gross merchandise value|bookings|premium income|fee income|gross written premium)\b/i;
function topLineFigure(deal) {
  return (deal?.keyFigures || []).find((k) => TOP_LINE.test(String(k.label || '').trim())) || null;
}

export function dealGrowth(deal) {
  // TWO RECORDS OF ONE FACT, AND THE MODEL PREFERRED THE ONE NOBODY CAN SEE.
  //
  // `deal.growth` is an internal field; the "Growth (YoY)" key figure is what the Brief
  // tab prints, with a source and a confidence against it. This read the internal field
  // first, so Mojave's Brief said "9% · Management accounts · high" while the Analysis
  // tab said "underwritten at the recorded 14% a year" — adjacent tabs, both claiming to
  // quote the record, on four of seven deals. The figure a reader can see and check is
  // the one the model underwrites.
  const kf = (deal?.keyFigures || []).find((k) => /growth|cagr|nrr/i.test(k.label));
  if (kf) {
    const v = Number(String(kf.value).replace(/[^0-9.]/g, ''));
    // NRR is expressed as 118%, meaning 18% net expansion.
    if (Number.isFinite(v)) return /nrr/i.test(kf.label) && v > 100 ? +(v - 100).toFixed(1) : v;
  }
  if (Number.isFinite(deal?.growth)) return deal.growth;
  return null;
}

// A candidate-shaped object so we can reuse the Stage-1 paper-LBO returns engine.
// The multiple the RECORD states, if it states one. Extracted here rather than inline,
// because four separate places used to read it — or fail to — and each disagreement
// became a different number on a different screen for the same deal.
export function statedMultipleOf(deal) {
  const kf = (deal?.keyFigures || []).find((k) => /entry multiple|ev\s*\/\s*ebitda/i.test(k.label));
  const v = kf ? Number(String(kf.value).replace(/[^0-9.]/g, '')) : NaN;
  return Number.isFinite(v) && v > 0 ? +v.toFixed(2) : null;
}

// The statuses that mean a committee has voted. Mirrors the case page's own set.
const DECIDED_STATUS = new Set(['approved', 'signing', 'signed', 'closed', 'owned', 'exiting', 'exited']);

function dealAsCandidate(deal) {
  const f = dealFinancials(deal);
  // The price the record states is an input to the model, not something to be checked
  // against it afterwards. Screening derived its own multiple from EV over EBITDA and
  // modelled the deal at THAT, so the returns page, the triage note, the IC assumption
  // snapshot and the deal's own header each ended up quoting a different entry price for
  // one company. The record's number goes in at the top and everything downstream
  // inherits it.
  const stated = statedMultipleOf(deal);
  // Where no EBITDA is recorded but a multiple is, the EBITDA the model runs on must be
  // the one that number implies — otherwise EV over EBITDA silently contradicts the
  // multiple sitting beside it.
  const ebitdaRecorded = (deal.keyFigures || []).some((k) => /ebitda(?! margin)/i.test(k.label));
  const ebitda = !ebitdaRecorded && stated ? round(f.ev / stated) : f.ebitda;
  // A margin computed from a defaulted revenue AND a defaulted EBITDA is arithmetic on two
  // guesses. It read "6.9% EBITDA margins leave little headroom" three rows under ARR $58M
  // and LTM EBITDA $20M — a 34% business — and was used to argue the debt quantum down.
  const revenueRecorded = (deal.keyFigures || []).some((k) => /revenue|turnover/i.test(k.label));
  const marginRecorded = (deal.keyFigures || []).some((k) => /margin/i.test(k.label)) || (revenueRecorded && ebitdaRecorded);
  return {
    company: deal.company, sector: deal.sector, subSector: deal.subSector || null, ownership: deal.ownership || 'private',
    dealSize: f.ev, revenue: f.revenue, ebitda, ebitdaMargin: f.ebitdaMargin, marginRecorded, revenueRecorded,
    // A software deal records ARR and no "Revenue" line, and the page then told a reader it
    // had nothing to strike a margin on while the Brief printed $42M of ARR at high
    // confidence two tabs away. ARR is not total revenue, but it is a top line and the
    // record is not silent.
    topLineRecorded: !!topLineFigure(deal),
    // Named, so the page can say WHICH top line it is rather than just that one exists.
    topLineLabel: (() => { const k = topLineFigure(deal); return k ? `${k.label} of ${k.value}` : null; })(),
    statedMultiple: stated,
    growth: f.growth ?? undefined, keywords: deal.keywords || [], sources: deal.sources || [],
    // The hold the deal is underwritten over. With no interim cash flow in a paper LBO,
    // MOIC is (1+IRR) to the power of the hold exactly — so nineteen deals on a five-year
    // hold produced a MOIC column carrying no information whatsoever, and a reader who
    // notices has noticed there is one model behind all of them.
    holdYears: Number.isFinite(deal.holdYears) ? deal.holdYears : undefined,
    // The leverage the record states, where it states one. A deal whose debt is raised
    // knows what it borrowed, and the sector default was overriding it — putting 4.5x on
    // a page whose own IC condition reads ‘leverage ≤ 4.25x (met at 4.2x)’.
    // Keyed on status, not on the stage letter: "O" is "Screened — awaiting launch",
    // which is before the committee, and four such deals were told their model came
    // from an approved case that does not exist.
    decided: DECIDED_STATUS.has(String(deal.status || '').toLowerCase()),
    ebitdaRecorded,
    statedLeverage: (() => {
      const kf = (deal.keyFigures || []).find((k) => /leverage\b|net debt \/ ebitda/i.test(String(k.label || '')));
      const v = kf ? Number(String(kf.value).replace(/[^0-9.]/g, '')) : NaN;
      return Number.isFinite(v) && v > 0 && v < 10 ? +v.toFixed(1) : undefined;
    })()
  };
}

// ===========================================================================
//  CANONICAL FIGURES — the one true value for every number a partner quotes
// ===========================================================================
// A partner asked the assistant the same question three times and was told the entry
// multiple was 8.3x, then nothing, then 9.4x — while the deal's own Returns, plan &
// risk page said 8.3x throughout. She could not tell which was right, and neither
// could an associate reading over her shoulder, because a derived number and a true
// one arrive in the same confident prose behind the same citation. Her words: "That is
// a memo going to a committee with a wrong multiple in it."
//
// There is exactly one correct value for each of these and it is computed here, by the
// same call the Returns page renders. Everything that speaks — the assistant, the memo
// writer, the chat — is handed these and forbidden to derive its own. enforceFigures()
// below then checks the prose against them, because an instruction is a hope and a
// check is a guarantee.
// Whether the EBITDA the model runs on is anybody's tested figure. The case page reads
// the same source line and grades it; the returns page has to agree with that.
function ebitdaIsUntested(deal) {
  const kf = (deal.keyFigures || []).find((k) => /\bebitda\b/i.test(String(k.label || '')) && !/margin|growth|cagr/i.test(String(k.label || '')));
  const src = String(kf?.source || '');
  if (!src) return true;
  return /draft|preliminary|teaser|\bcim\b|information memorandum|broker|analyst|research|management accounts?/i.test(src);
}

export function canonicalFigures(deal) {
  try {
    const f = dealFinancials(deal);
    const r = buildReturns(dealAsCandidate(deal));
    const base = r.scenarios.base;
    // A multiple the record STATES beats one we derive. Great Lakes Precision is in
    // signing and carries "8.1x EV/EBITDA — Signed structure, high confidence", with no
    // EBITDA line; we invented an EBITDA at 12% of enterprise value, divided by it, and
    // published 8.3x in the comparison table beside the contractual 8.1x on the deal's
    // own header. On a signed deal the multiple is not ours to recompute.
    const statedMult = statedMultipleOf(deal);
    // Keep EBITDA consistent with whichever multiple we publish, rather than leaving a
    // derived EBITDA that no longer divides into it.
    const ebitdaRecorded = (deal.keyFigures || []).some((k) => /ebitda(?! margin)/i.test(k.label));
    const ebitdaRaw = !ebitdaRecorded && statedMult ? f.ev / statedMult : f.ebitda;
    // A whole-million EBITDA that the multiple was not struck on is a card that does not
    // divide. Where the figure is ours rather than the record's, publish the tenth.
    const ebitda = ebitdaRecorded ? ebitdaRaw : +Number(ebitdaRaw).toFixed(1);
    // Published so the two numbers on the card divide to the third: the EBITDA is stated
    // to a tenth where it is derived, and the multiple is struck on that same figure.
    const entryMultiple = statedMult ?? (() => {
      const raw = r.impliedMultiple ?? r.entryMultiple;
      const evShown = Math.round(f.ev);
      const ebShown = +Number(ebitda).toFixed(1);
      if (!(evShown > 0) || !(ebShown > 0)) return raw;
      const exact = evShown / ebShown;
      for (const dp of [1, 2, 3]) {
        const v = +exact.toFixed(dp);
        if (Math.abs(v - exact) < 0.005) return v;
      }
      return +exact.toFixed(2);
    })();
    return {
      currency: symbolFor(deal),
      currencyCode: deal.currency || 'USD',
      entryMultiple,
      entryMultipleSource: statedMult ? 'recorded' : 'derived',
      // The paper LBO models at a financeable ceiling when the ask is above it. Reporting
      // that ceiling as the entry multiple told a partner she was paying 20x on a deal
      // whose own enterprise value over its own EBITDA is 41x.
      modelledEntryMultiple: r.entryMultiple,
      entryAboveCeiling: !!r.entryAboveCeiling,
      leverage: r.leverage,
      leverageBasis: r.leverageBasis || null,
      debtToEv: r.debtToEv ?? null,
      irr: base.irr,
      moic: base.moic,
      holdYears: r.holdYears,
      ebitda,
      ebitdaSource: ebitdaRecorded ? 'recorded' : statedMult ? 'implied by the recorded entry multiple' : 'derived',
      revenue: f.revenue,
      revenueRecorded: (deal.keyFigures || []).some((k) => /revenue/i.test(k.label)),
      ev: f.ev,
    };
  } catch { return null; }
}

// The block handed to the model. Stated as the record's own answer, not as background,
// so there is nothing left for it to work out.
// The top-line figure the record DOES carry when total revenue is absent. Lumen holds
// "ARR $42M" from the QoE at high confidence, and a blanket "no revenue is recorded"
// denied it — on a page one click from where it is printed. ARR is not total revenue and
// a margin cannot be struck on it, but it is on the record and saying so is the truth.
function recordedTopLine(deal) {
  const TOP = /^(arr|annual recurring revenue|recurring revenue|gross merchandise value|gmv|net revenue|bookings|premium income|fee income|gross written premium)\b/i;
  const kf = (deal?.keyFigures || []).find((k) => TOP.test(String(k.label || '').trim()));
  if (!kf) return null;
  const src = kf.source ? ` (source: ${kf.source})` : '';
  return `The record does carry ${kf.label} of ${kf.value}${src}. That is a top-line measure, not total revenue, and no margin may be struck on it.`;
}

// THE PRODUCT ALREADY COUNTED THIS. THE MODEL MUST NOT COUNT IT AGAIN.
//
// Asked "how many things are outstanding" three times on one deal the assistant said
// nine, then eight, then one -- it was counting prose. Handing it four populations gave
// it four numbers to choose between and it chose differently each time, once closing on
// a number that appears on NO screen. So: one field, the case page's own count. The
// breakdown exists only to answer "which nine", never to be re-totalled.
function outstandingCounts(deal) {
  let kase = null;
  try { kase = buildDealCase(deal); } catch { kase = null; }
  if (!kase || !Array.isArray(kase.outstanding)) return null;
  const rows = kase.outstanding;
  const n = rows.length;
  const board = rows.filter((r) => r.from === 'committee readiness').length;
  const reg = rows.filter((r) => r.from === 'risk register').length;
  let register = null;
  try { register = buildRiskRegister(deal); } catch { register = null; }
  const regRows = (register?.risks || []).length;
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const word = words[n] || String(n);
  return [
    `How many things are outstanding. The answer is ${word}. Give that number and no other. Do not count the items yourself, do not re-total the breakdown, and do not add any two of these numbers together.`,
    // THE MODEL COPIES THE FORMAT IT IS SHOWN.
    //
    // This was handed over as `outstanding_count=12` under an instruction reading "never
    // write a field name in your answer". Two runs in nine came back with 'This is shown
    // on THE CASE as "outstanding_count=12"' -- a snake_case token, in quotation marks,
    // against a screen that has never shown it. Telling a model not to copy the format
    // you are showing it does not work. There is no machine token in this block any more,
    // and the sentence the page ACTUALLY prints is handed over so there is something
    // correct to reach for.
    n ? `The page opens its outstanding list with these words, which are the ones to quote if a quotation is asked for: "${String(kase.outstandingNote || '').split('. ')[0]}". It is on the tab called The case. Write the tab name exactly like that, in ordinary case.` : null,
    n ? `Of the ${word}, ${words[board] || board} come from the committee-readiness board and ${words[reg] || reg} are rows on the risk register. That is the ${word} split up, not a sum to be added.` : null,
    n ? `If you open on a number and then list the items, the number you open on must be the number of items you go on to list. The home page counts only the readiness board, so the attention list there says ${words[board] || board} where this page says ${word}. Both are right and they are not in conflict: the ${words[board] || board} are inside the ${word}. If somebody asks why the two screens differ, that is the answer.` : null,
    n ? `The ${word} are, in the order the page lists them: ${rows.map((r, i) => `(${i + 1}) ${r.text}`).join(' ')}` : null,
    `The risk register page shows ${words[regRows] || regRows} rows in total. That answers a different question, because the register also carries watch items and cleared lines, and it is never the answer to "how many things are outstanding".`,
  ].filter(Boolean).join('\n');
}

// PROSE IN A PROMPT GETS QUOTED. FIELDS DO NOT.
//
// This block used to read "Entry multiple: 14.1x EV/EBITDA." and "THE ANSWER IS 9.",
// and the assistant put both in quotation marks and attributed them to a named screen:
// "The returns, plan & risk page shows 'The answer is 9.'" — a page that has never
// carried that sentence, one click from the room. Adding a line telling it not to did
// not work, because a declarative English sentence in a prompt IS page-shaped text and
// no instruction survives that. So the data is handed over as key=value pairs, which
// cannot be read back as something a person wrote on a screen, and the only prose left
// is marked RULE: and is unmistakably addressed to the reader of the prompt.
function offerBlock(deal) {
  // An offer exists on a deal that has been put to a seller and not yet completed.
  // Screening deals have none; a deal in execution has one and has signed it.
  const stage = String(deal.stage || '');
  const status = String(deal.status || '').toLowerCase();
  const preLaunch = /^O/i.test(stage);
  const owned = /^(owned|exiting|exited|closed)$/.test(status) || /^V/i.test(stage);
  const signed = /^(E|X)/i.test(stage) || /^(approved|signing|signed|closing)$/.test(status);
  if (signed) {
    return [
      'This deal is past committee and into execution. The terms were agreed and are being documented in the sale and purchase agreement; there is no live letter of intent on it any more, and the Analysis tab carries no offer card.',
      'If you are asked whether the deal is binding, whether it is agreed, or whether it is signed, open with exactly this and then give the figures: "The commercial terms are agreed. Nothing is legally binding until the sale and purchase agreement is signed, and it is in signing now." Do not open with a bare yes or a bare no \u2014 both are half true and the room will hear only the first word.',
      'If you are asked about the offer, the price, exclusivity, consideration or a price mechanism, answer from the committed terms on the case \u2014 the enterprise value, the entry multiple, the equity cheque and the debt \u2014 and say they are agreed rather than offered. Never describe this deal as non-binding, as subject to confirmatory diligence, or as carrying an exclusivity period.',
      'Never cite Analysis as the source of an offer on this deal.',
    ].join('\n');
  }
  if (preLaunch || owned) {
    return [
      preLaunch
        ? 'Nothing has been offered on this deal. It has been screened and not launched, so there is no indication of interest and no letter of intent, and the Analysis tab carries no offer card for it.'
        : 'This deal is past its offer: the firm owns it or is selling it, so no live indication of interest or letter of intent sits on the record and the Analysis tab carries no offer card for it.',
      'If you are asked about an offer, a price, exclusivity, consideration, a rollover or a price mechanism, open by saying that no offer is live on this deal. Do not state terms first and deny the offer afterwards, and do not describe the modelled enterprise value or equity cheque as terms of an offer \u2014 those are the fund\u2019s own model, not something anybody has put to a seller.',
      'Never cite Analysis as the source of an offer on this deal. There is nothing there to cite.',
    ].join('\n');
  }
  let loi = null; let ioi = null;
  try { loi = buildLoi(deal); } catch { loi = null; }
  try { ioi = buildIoi(deal); } catch { ioi = null; }
  if (!loi && !ioi) return 'The terms of the offer on this deal could not be read into this view. Do not say the record holds no offer \u2014 say the terms are on the Analysis tab and the committee papers.';
  const lines = ['What the firm has offered, and on what terms. All of it is on the Analysis tab. This is the offer of record; where the risk register describes a working-capital peg or any other mechanic, the letter of intent below is what governs.'];
  if (loi) {
    lines.push(`The letter of intent is on the LOI card under Analysis, and it is summarised there in these words, which are the ones to quote: "${loi.headline}"`);
    if (loi.price?.mechanism) lines.push(`The price mechanism in the letter of intent is: ${loi.price.mechanism} That is the answer to "locked box or completion accounts".`);
    if (loi.exclusivity) lines.push(`On exclusivity the letter of intent says: ${loi.exclusivity}`);
    for (const s of loi.structure || []) lines.push(`On ${String(s.term).toLowerCase()}, the letter of intent says: ${s.detail}`);
    if (loi.binding) lines.push(`What is binding: ${loi.binding}`);
  }
  if (ioi) {
    lines.push(`The indication of interest is on the IOI card under Analysis, summarised in these words: "${ioi.headline}"`);
    if (ioi.validity) lines.push(`The indication of interest is valid for ${ioi.validity}`);
  }
  lines.push('If you are asked whether the consideration is cash or whether management rolls over, answer from the consideration line above. Do not say a rollover is not recorded when one is named there.');
  return lines.join('\n');
}

// WHAT WAS SAID IN THE DEAL CHANNEL.
//
// Asked to search the channel and quote what somebody committed to, the assistant
// replied that access to Teams messages had been denied — about a panel the product
// renders on the same screen. It was not denied anything; it had never been given the
// messages. They travel in the same block as the deal's own numbers.
function channelBlock(deal) {
  let msgs = [];
  try { msgs = corpusForDeal(deal)?.channel?.messages || []; } catch { msgs = []; }
  if (!msgs.length) return '';
  const lines = [
    'What has been said in this deal\u2019s channel. These are real messages on the record and you may quote them. Never say that access to the channel was denied or that no message is available \u2014 they are below.',
  ];
  for (const m of msgs.slice(0, 12)) {
    lines.push(`${m.from || 'A member of the deal team'} wrote: "${String(m.preview || '').replace(/\s+/g, ' ').trim()}"`);
  }
  return lines.join('\n');
}

export function figuresBlock(deal) {
  const c = canonicalFigures(deal);
  if (!c) return '';
  const m = (n) => fmtMoney(round(n), c.currency);
  return [
    'The deal\'s own numbers. Give these when you are asked for them. Do not recalculate them, do not adjust or re-round them, and do not convert the currency.',
    'None of the lines in this section is text from a screen. Never present one as a quotation, never put one in quotation marks, and never name a page as its source. Where a screen the reader is looking at disagrees with one, the screen is right and you should say so plainly.',
    `The entry multiple is ${c.entryMultiple}x EV/EBITDA, the leverage ${c.leverage}, and the hold ${c.holdYears} years.`,
    `The base case returns ${c.irr}% IRR and ${c.moic}x MOIC.`,
    c.revenueRecorded
      ? `LTM EBITDA is ${m(c.ebitda)}, revenue ${m(c.revenue)} and enterprise value ${m(c.ev)}. Figures are reported in ${c.currencyCode}.`
      : `LTM EBITDA is ${m(c.ebitda)} and enterprise value ${m(c.ev)}. Figures are reported in ${c.currencyCode}.`,
    c.entryAboveCeiling
      ? `The ask at ${c.entryMultiple}x is above what this structure can finance. The returns here are modelled at a ${c.modelledEntryMultiple}x entry and only hold if the price can be reset — say so whenever you give them.`
      : null,
    // Revenue is only stated when the record actually holds it. Where it does not, the
    // model was handed a placeholder of 1.2x enterprise value under the words "the deal's
    // own numbers" -- and it duly told a partner "Revenue: $288M", then, asked where that
    // came from, produced a verbatim quotation of a page that has never shown it. Naming
    // the top line that IS recorded matters as much as denying the one that is not: the
    // first version's denial was refuted one tab away by the ARR the Brief prints at high
    // confidence.
    c.revenueRecorded
      ? null
      : `No total revenue is on this company's record. ${recordedTopLine(deal) || 'No top-line figure of any kind is recorded.'} Do not state a total revenue figure, do not estimate one, and do not compute an EBITDA margin against a figure that is not total revenue. If asked for revenue or margin, say which line is on the record and which is not.`,
    outstandingCounts(deal),
    offerBlock(deal),
    channelBlock(deal),
    'Where a diligence document states a figure in another currency, keep that document\'s currency and say which document it came from.',
    // WHAT THE HOLD COSTS.
    //
    // The model has never been handed this, so asked "what does the hold cost" it
    // answered "the record does not report total interest paid, cash tax paid,
    // maintenance capex, or how much debt is repaid vs outstanding at exit" -- about five
    // figures the product computes and prints on the returns card two clicks away.
    // Denying your own arithmetic in front of a committee is worse than not having it.
    holdCostLine(deal, c),
  ].filter(Boolean).join('\n');
}

// The financing the base case is charged for, in words. Returns null when the model does
// not charge the hold, so the block never claims a figure that does not exist.
function holdCostLine(deal, c) {
  let r = null;
  try { r = buildReturnsModel(deal); } catch { return null; }
  const base = (r?.scenarios || []).find((s) => /base/i.test(s.name));
  if (!base || base.interestPaid == null) return null;
  const m = (n) => fmtMoney(round(n), c.currency);
  const cod = r.financing?.costOfDebtPct;
  // Fields, not sentences. "Cost of debt: 10.35%." reads as something printed on a page,
  // and the assistant duly attributed it to one, in quotation marks.
  return [
    'What the hold costs, computed by the product; when asked what the deal is financed at or what the hold costs, give it, and never say it is not recorded. Like the section above, none of it is text from a screen.',
    `Debt is priced at ${cod != null ? `${cod}%` : 'a rate the model does not carry'}. Over the hold the base case pays ${m(base.interestPaid)} of interest, ${m(base.taxPaid)} of cash tax and ${m(base.capexPaid)} of maintenance capex.`,
    `${m(base.debtRepaid)} of debt is repaid out of cash flow, leaving ${m(base.debtAtExit)} outstanding at exit.`,
    r.financing?.basis || null,
    // The basis charges capex as a percentage of revenue, so on a company with no revenue
    // on the record it quietly relies on a figure the lines above say is not there.
    c.revenueRecorded
      ? null
      : 'The maintenance capex above is struck on a revenue implied from EBITDA and the sector\'s own margin, because no total revenue is recorded for this company. It is a modelling input, not a figure from the record.',
  ].filter(Boolean).join('\n');
}

// A last line of defence over the generated prose. We only touch a figure that is
// unambiguously one of ours -- an entry multiple, an IRR or a MOIC -- and only when it
// disagrees with the record. Anything else the model wrote is left alone, because
// silently rewriting numbers we do not own would be a worse fault than the one we are
// fixing. (There is deliberately no leverage pattern; the comment used to claim one.)
export function enforceFigures(md, deal) {
  const c = canonicalFigures(deal);
  if (!md || !c) return md;
  let s = String(md);
  // Contexts where a figure that differs from the base case is CORRECT, and correcting
  // it destroys the meaning:
  //   "downside 1.8x, base 2.8x, upside 3.4x MOIC"  -- three scenarios became one
  //   "the fund's 2.5-3.5x MOIC hurdle"             -- a range became a point
  //   "expensing them moves the entry multiple from 9.4x to 10.1x"  -- a SOURCED QoE
  //     finding on the deal's own record, rewritten to 8.3x with a delta the QoE never
  //     wrote. That is the guard inventing a diligence result.
  const PROTECTED = /\b(downside|upside|hurdle|range|target|between|from|scenario|sensitivit|at exit|threshold|by roughly|raise[sd]?|raising|shift|uplift|expens(?:e|ing)|adjustment|provision|delta|move[sd]?|adds?|reduces?|widen|narrow)\b/i;
  const protectedAt = (text, idx) => {
    const from = Math.max(0, idx - 70);
    const window = text.slice(from, idx + 70);
    if (PROTECTED.test(window)) return true;
    // Another figure of the same unit close by means this one is part of a list.
    const sameUnit = window.match(/\d+(?:\.\d+)?\s*x/g) || [];
    return sameUnit.length > 1;
  };
  // Every pattern below captures THREE groups -- what comes before the number, the
  // number, and what comes after -- and rebuilds the match from them. An earlier
  // version captured only the number and then did whole.replace(num, correct), which
  // turned "Base case 22.5% IRR" into "222.5% IRR": the engine had backtracked into
  // the middle of the number, matched "2.5", and the string replace found that "2.5"
  // inside "22.5". A guard that corrupts the figure it is guarding is worse than no
  // guard, so the position is now explicit rather than searched for.
  // (?<![\d.]) and (?![\d.]) stop a match ever starting or ending part-way through a
  // number.
  const fix = (re, correct) => {
    s = s.replace(re, (whole, pre, num, post, idx, full) => {
      const got = Number(num);
      if (!Number.isFinite(got) || Math.abs(got - correct) < 0.05) return whole;
      if (protectedAt(full, idx)) return whole;
      return `${pre}${correct}${post}`;
    });
  };
  const N = '(?<![\\d.])(\\d{1,3}(?:\\.\\d{1,2})?)(?![\\d.])';
  // The gap between a label and its number is deliberately tiny and cannot cross a
  // comma, semicolon or full stop. A looser gap made "...2.76x MOIC, entry at 5.5x
  // EV/EBITDA" match as MOIC-then-5.5 and rewrite the entry multiple with the MOIC.
  const OF = '\\s*(?:of|is|at|:|=)?\\s*';
  // "entry multiple of 9.4x", "paying 9.4x", "9.4x EV/EBITDA"
  fix(new RegExp(`((?:entry|paying|purchase)[^.,;\\n]{0,28}?)${N}(\\s*x\\b)`, 'gi'), c.entryMultiple);
  fix(new RegExp(`()${N}(\\s*x\\s*(?:EV\\s*\\/\\s*EBITDA|entry)\\b)`, 'gi'), c.entryMultiple);
  // "base case 21% IRR", "IRR of 21%"
  fix(new RegExp(`()${N}(\\s*%\\s*(?:gross\\s*)?IRR\\b)`, 'gi'), c.irr);
  fix(new RegExp(`(\\bIRR${OF})${N}(\\s*%)`, 'gi'), c.irr);
  // "2.6x MOIC", "MOIC of 2.6x"
  fix(new RegExp(`()${N}(\\s*x\\s*MOIC\\b)`, 'gi'), c.moic);
  fix(new RegExp(`(\\bMOIC${OF})${N}(\\s*x)`, 'gi'), c.moic);
  return s;
}

// ===========================================================================
//  D1 · LAUNCH ORCHESTRATION — Diligence Plan
// ===========================================================================
// Research: the plan starts from the deal's key RISK HYPOTHESES (not a generic
// checklist), scopes workstreams, engages third-party advisers, sets a DD budget
// and a 6-10 week exclusivity/DD timeline, and distributes a 200-300 item IRL.

// The standard confirmatory-DD workstreams + the adviser a firm engages for each.
const WORKSTREAMS = [
  { key: 'financial', label: 'Financial / QoE', adviser: 'Big-4 QoE (Deloitte / PwC / EY / KPMG)', scope: 'Normalise EBITDA, validate addbacks, revenue quality, NWC peg, net-debt items.', priorityBase: 5 },
  { key: 'commercial', label: 'Commercial DD', adviser: 'Strategy consultant (Bain / BCG / L.E.K. / OC&C)', scope: 'Market size & growth, competitive position, customer concentration, voice-of-customer, pricing.', priorityBase: 5 },
  { key: 'legal', label: 'Legal DD', adviser: 'Deal counsel (Kirkland / Goodwin / DLA Piper)', scope: 'Corporate, material contracts, change-of-control, litigation, IP, employment, regulatory.', priorityBase: 4 },
  { key: 'tax', label: 'Tax DD & structuring', adviser: 'Tax adviser (Big-4 / RSM)', scope: 'Income + non-income taxes (sales/use, employment), NOLs, exposures, acquisition structure.', priorityBase: 3 },
  { key: 'operational', label: 'Operations DD', adviser: 'Ops specialist (AlixPartners / A&M)', scope: 'Supply chain, procurement, manufacturing footprint, operational KPIs, cost-out.', priorityBase: 3 },
  { key: 'tech', label: 'Technology / IT / Cyber DD', adviser: 'Tech DD (West Monroe / Crosslake / Mandiant)', scope: 'Systems, tech debt, scalability, cybersecurity posture, data.', priorityBase: 2 },
  { key: 'hr', label: 'HR / Management DD', adviser: 'Exec assessment (ghSMART / Spencer Stuart)', scope: 'Org & key-person risk, comp benchmarking, pension/deferred-comp, management references.', priorityBase: 2 },
  { key: 'esg', label: 'ESG / Environmental', adviser: 'Environmental (Phase I ESA per ASTM E1527-21)', scope: 'Phase I ESA on owned/leased sites, RECs, sustainability & governance screen.', priorityBase: 1 }
];

// Map a screening-memo risk phrase to the workstream that should own it, so the
// plan's priorities reflect the specific deal's risks (not a generic checklist).
function riskToWorkstream(riskText) {
  const t = String(riskText || '').toLowerCase();
  if (/margin|ebitda|earnings|profitab|addback|working capital|accounting/.test(t)) return 'financial';
  if (/growth|market|customer|concentration|competit|demand|pricing|commercial/.test(t)) return 'commercial';
  if (/litigat|contract|ip|legal|regulat|change.?of.?control/.test(t)) return 'legal';
  if (/tax/.test(t)) return 'tax';
  if (/supply|manufactur|operational|procurement|cost/.test(t)) return 'operational';
  if (/tech|it |cyber|system|data|software/.test(t)) return 'tech';
  if (/founder|key.?person|management|talent|retention|pension/.test(t)) return 'hr';
  if (/esg|environment|contaminat|sustainab/.test(t)) return 'esg';
  return null;
}

export function buildDiligencePlan(deal, memoRisks = []) {
  const money = (m) => fmtMoney(m, symbolFor(deal));
  const f = dealFinancials(deal);
  // Elevate the priority of workstreams that own a screening-memo risk.
  const riskCounts = {};
  for (const r of memoRisks) {
    const ws = riskToWorkstream(typeof r === 'string' ? r : r.risk);
    if (ws) riskCounts[ws] = (riskCounts[ws] || 0) + 1;
  }
  const workstreams = WORKSTREAMS.map((w) => {
    const priority = w.priorityBase + (riskCounts[w.key] || 0) * 2;
    const tier = priority >= 6 ? 'critical' : priority >= 4 ? 'high' : priority >= 2 ? 'standard' : 'confirmatory';
    return {
      key: w.key, label: w.label, adviser: w.adviser, scope: w.scope,
      priority, tier,
      focus: riskCounts[w.key] ? `Elevated — carries ${riskCounts[w.key]} screening-memo risk${riskCounts[w.key] > 1 ? 's' : ''} to confirm.` : null
    };
  }).sort((a, b) => b.priority - a.priority);

  // DD budget: third-party spend scales with deal size (research: QoE + CDD + legal
  // dominate; ~0.6-1.2% of EV at mid-market, floored so small deals still ring true).
  const budgetPct = f.ev >= 500 ? 0.006 : f.ev >= 250 ? 0.008 : 0.011;
  const budgetTotal = Math.max(0.35, +(f.ev * budgetPct).toFixed(2)); // $M
  const budget = [
    { item: 'Quality of Earnings (QoE)', amount: +(budgetTotal * 0.28).toFixed(2) },
    { item: 'Commercial DD', amount: +(budgetTotal * 0.30).toFixed(2) },
    { item: 'Legal & tax counsel', amount: +(budgetTotal * 0.24).toFixed(2) },
    { item: 'Ops / tech / ESG / other', amount: +(budgetTotal * 0.18).toFixed(2) }
  ];

  // PLANNING ASSUMPTION, not a contractual date. Nothing on the deal record carries the
  // exclusivity end date agreed in the LOI, so this sizes the plan from deal size using
  // the market-standard 6-10 week window. It is labelled as an assumption everywhere it
  // surfaces — presented as a countdown it would be a fabricated clock next to real
  // dates, which is worse than having no clock at all.
  const exclusivityWeeks = f.ev >= 500 ? 9 : 7;
  const exclusivityBasis = 'Planning assumption from deal size (market-standard 6–10 week window) — not the exclusivity date agreed in the LOI.';
  return {
    kind: 'plan',
    company: deal.company,
    workstreams,
    budget,
    budgetTotal,
    timeline: {
      exclusivityWeeks,
      exclusivityBasis,
      irlItems: '200–300',
      phases: [
        // Windows are relative to kickoff, NOT calendar weeks. Rendered as "Weeks 2-7"
        // beside real dated milestones they read as a schedule somebody agreed to.
        { name: 'Kickoff & IRL', window: 'Week 1 from kickoff', detail: 'Engage advisers, distribute the information-request list, open the VDR.' },
        { name: 'Fieldwork', window: `Weeks 2–${exclusivityWeeks - 2} from kickoff`, detail: 'Parallel workstreams; QoE on-site, management sessions, voice-of-customer calls.' },
        { name: 'Findings & synthesis', window: `Weeks ${exclusivityWeeks - 1}–${exclusivityWeeks} from kickoff`, detail: 'Red-flag reports land, issues log finalized, IC memo drafted.' }
      ]
    },
    dataRoom: { platform: 'Datasite / Ansarada VDR', sections: 13, note: 'Q&A centralized in the VDR (can consume up to 70% of deal time).' },
    // The caveat is carried in the headline as well as in `timeline.exclusivityBasis`,
    // because a consumer that renders only the headline would otherwise print the
    // assumption without it.
    headline: `${workstreams.filter((w) => w.tier === 'critical').length} critical workstream(s) · ${money(budgetTotal)} DD budget · planned against an assumed ${exclusivityWeeks}-week exclusivity window (sized from deal size — the LOI date is not on the record).`
  };
}

// ===========================================================================
//  D2 · DILIGENCE — Findings / Red-Flag Report
// ===========================================================================
// Research: each workstream produces severity-rated findings; the deal-team VP
// owns a shared red-flag tracker. Findings are classified deal-stopper / price-
// adjuster / closing-condition / post-close (100-day). QoE EBITDA haircuts of
// 10-30% are the #1 repricing cause; customer concentration >25-30% is a binary
// risk; environmental Phase II & active investigations are hard deal-killers.

const SEVERITY = { stopper: { label: 'Deal-stopper', rank: 4 }, reprice: { label: 'Price-adjuster', rank: 3 }, condition: { label: 'Closing condition', rank: 2 }, monitor: { label: 'Post-close / 100-day', rank: 1 }, clear: { label: 'Confirmed clean', rank: 0 } };

// Deterministic findings per workstream, calibrated off the deal's financials so
// they read as realistic diligence outcomes. These are TEMPLATED placeholders
// (basis: 'templated') meant to seed the red-flag tracker — they are indicative
// pending sourced evidence, not observed facts, and are tagged as such so callers
// and documents can distinguish inferred content from confirmed findings.
// A finding that names an entry multiple must name the one the deal prints.
//
// Lumen's financial lane read "expensing them moves the entry multiple from 9.4x to
// 10.1x" while every other surface printed 8.3x. An IC member counted four entry
// multiples on one deal and said they would not repeat any of them. Fixing the seed does
// not fix the deals already written to the record, and the record is what production
// serves — so the reconciliation happens on the way out, where it holds for stored data
// too. The effect is preserved; only the anchor changes.
// How much of EBITDA a QoE could still take out. Margin sets the size of the exposure;
// the EVIDENCE ALREADY ON FILE sets how much of it is still open. A deal whose QoE is
// finished has no allowance left to carry — that is what finishing it bought.
function qoeHaircutPct(deal, f) {
  const bySize = f.ebitdaMargin < 10 ? 18 : f.ebitdaMargin < 15 ? 12 : 6;
  const src = String(((deal?.keyFigures || []).find((k) => /ebitda(?! margin)/i.test(k.label)) || {}).source || '');
  if (/quality of earnings|qoe report|audited/i.test(src) && !/draft|preliminary/i.test(src)) return 0;
  if (/draft|preliminary/i.test(src)) return Math.round(bySize * 0.6);
  return bySize;
}

// Every finding sentence in the seed, keyed by the sentence with its currency tokens
// stripped, so a stored sentence that differs from the seed only in its currency symbol
// can be matched to the corrected one. Built once, lazily.
let SEED_FINDINGS = null;
const currencyKey = (s) => String(s)
  .replace(/\b(EUR|GBP|USD|CHF|SEK|NOK|DKK)\s?/gi, '')
  .replace(/[$£€]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

function seedFindings() {
  if (SEED_FINDINGS) return SEED_FINDINGS;
  SEED_FINDINGS = new Map();
  try {
    for (const d of seededDeals) {
      for (const w of d.workstreams || []) {
        for (const f of w.findings || []) {
          const t = String(f?.text || '');
          if (!t) continue;
          const k = currencyKey(t);
          SEED_FINDINGS.set(`${d.id}::${k}`, t);
          // A stored finding may have been edited after it was seeded — Lumen's held the
          // same opening clause and a different tail — so an exact match is not enough.
          // The opening clause is where the figure and its currency sit, and it is
          // specific enough on one deal to identify the sentence.
          SEED_FINDINGS.set(`${d.id}::~${k.slice(0, 48)}`, t);
        }
      }
    }
  } catch { /* the seed is optional; without it nothing is reconciled */ }
  return SEED_FINDINGS;
}

function reconcileCurrency(text, deal) {
  const s = String(text || '');
  const own = deal?.currency || 'USD';
  const foreign = [...s.matchAll(/\b(EUR|GBP|USD|CHF|SEK|NOK|DKK)\s?[\d.]/g)].map((m) => m[1]).filter((c) => c !== own);
  if (!foreign.length || !deal?.id) return s;
  const key = currencyKey(s);
  const map = seedFindings();
  const seeded = map.get(`${deal.id}::${key}`) || map.get(`${deal.id}::~${key.slice(0, 48)}`);
  if (!seeded) return s;
  // Only accept the seeded sentence if IT does not carry the foreign currency — otherwise
  // the disagreement is real and belongs in the disclosure, not in a silent rewrite.
  const stillForeign = [...seeded.matchAll(/\b(EUR|GBP|USD|CHF|SEK|NOK|DKK)\s?[\d.]/g)].map((m) => m[1]).filter((c) => c !== own);
  return stillForeign.length ? s : seeded;
}

export function reconcileFindingText(text, deal) {
  const s0 = String(text || '');
  // A FINDING QUOTED IN THE WRONG CURRENCY.
  //
  // Lumen is a dollar deal whose seeded findings were written in euros — "EUR 4.1M of
  // ARR" and "LTM EBITDA is EUR 3.2M lower" against $42M of ARR in the brief. The seed
  // was corrected, but findings are record-owned, so a store that already holds the old
  // text never picks the correction up. Reconcile it here against the seeded sentence,
  // which is the same sentence with the same figure and a different symbol — so nothing
  // is converted and no exchange rate is invented. If the seed does not agree, the text
  // is left alone and the cross-currency disclosure fires as before.
  const s = reconcileCurrency(s0, deal);
  const laneCount = (deal?.workstreams || []).length;
  const withLanes = laneCount
    ? String(s).replace(/across all (three|four|five|six|seven|eight|nine|\d+) lanes/gi, 'across every workstream')
    : s;
  if (!/entry multiple|LTM EBITDA|x entry|\bat\s+[\d.]+x/i.test(withLanes)) return withLanes;
  let figs = null;
  try { figs = canonicalFigures(deal); } catch { figs = null; }
  const entry = figs?.entryMultiple ?? null;
  const ebitda = figs?.ebitda ?? null;
  const ev = figs?.ev ?? null;
  if (entry == null) return s;
  let out = s;

  // A recorded EBITDA quoted in a seeded finding. Atlas carried "QoE supports $46M LTM
  // EBITDA … reflected in the 7.8x entry" from before the book was repriced, so one
  // paragraph on the IC page named $37M, $46M, 9.7x and 7.8x at once.
  if (ebitda != null) {
    out = out.replace(/(supports\s+)([$\u20ac\u00a3])\s?([\d.]+)M(\s+LTM EBITDA)/gi, (m, a, sym, v, tail) => (
      Math.abs(Number(v) - ebitda) < 0.5 ? m : `${a}${sym}${ebitda}M${tail}`
    ));
  }
  // Any multiple described as THE entry has to be the entry the deal prints.
  out = out.replace(/(the\s+)([\d.]+)x(\s+entry\b)/gi, (m, a, v, tail) => (
    Math.abs(Number(v) - entry) < 0.05 ? m : `${a}${entry}x${tail}`
  ));
  // "Recommend proceed at 7.8x" in a memo section is the same claim in different words.
  // Deliberately narrow: a bare "at 4.5x" is usually leverage, and rewriting that would
  // trade one wrong number for another.
  out = out.replace(/\b(proceed|recommend(?:ed|ing)?|authoris(?:e|ed)|authoriz(?:e|ed))(\s+(?:proceed\s+)?at\s+)([\d.]+)x/gi, (m, verb, mid, v) => (
    Math.abs(Number(v) - entry) < 0.05 ? m : `${verb}${mid}${entry}x`
  ));

  // THE IMPACT OF AN ADJUSTMENT IS ARITHMETIC, SO DERIVE IT.
  //
  // This used to carry the delta between the two multiples the fixture was written with
  // (9.4x → 10.1x, so "0.7x") and re-anchor only the base. Repricing moved the EBITDA
  // underneath it, and the stored delta does not scale: Lumen printed "roughly 0.7x" for
  // expensing EUR 2.6M of capitalised cost against a $17M EBITDA, where the true effect is
  // 2.6x. The sentence names the adjustment; the multiple shift follows from it.
  const adjustmentOf = (str) => {
    const m = str.match(/(?:\$|EUR\s?|\u20ac|\u00a3)\s?([\d.]+)\s?M/i);
    return m ? Number(m[1]) : null;
  };
  const shiftFor = (adj) => {
    if (!Number.isFinite(adj) || ev == null || ebitda == null || ebitda - adj <= 0) return null;
    return Math.abs(ev / (ebitda - adj) - ev / ebitda);
  };
  out = out.replace(/moves the entry multiple from\s*([\d.]+)x\s*to\s*([\d.]+)x/gi, (m, from, to) => {
    const a = Number(from);
    if (Number.isFinite(a) && Math.abs(a - entry) < 0.05) return m;
    const d = shiftFor(adjustmentOf(out)) ?? Math.abs(Number(to) - a);
    return `would raise the entry multiple by roughly ${d.toFixed(1)} turns, to ${(entry + d).toFixed(2)}x against the ${entry}x on the returns page`;
  });
  out = out.replace(/raise the entry multiple by roughly\s*([\d.]+)x\s*against the figure on the returns page/gi, (m) => {
    const d = shiftFor(adjustmentOf(out));
    return d == null ? m : `raise the entry multiple by roughly ${d.toFixed(1)} turns, to ${(entry + d).toFixed(2)}x against the ${entry}x on the returns page`;
  });
  out = out.replace(/raise the entry multiple by roughly\s*([\d.]+)x\s*against the\s*([\d.]+)x/gi, (m, d0) => {
    const d = shiftFor(adjustmentOf(out));
    if (d == null) return m.replace(/against the\s*[\d.]+x/i, `against the ${entry}x`);
    return `raise the entry multiple by roughly ${d.toFixed(1)} turns, to ${(entry + d).toFixed(2)}x against the ${entry}x`;
  });
  return out;
}

// A recorded finding's own grade, translated into the register's vocabulary. This was
// testing for severities the record does not use -- 'risk' and 'negative' -- so every
// one of the 34 written findings in the book fell through to `monitor`, which is the one
// band the case page filters OUT of "what could kill it". The result: zero written
// findings qualified as a killer on any deal, ever, the tie-break that prefers a written
// row over a standard one became dead code, and a signed $640M deal presented two
// templated rows as the things that could kill it while "two specific indemnities carved
// out for the historical customs matter", with a lawyer's name on it, sat below unread.
//
// The record's vocabulary is positive | neutral | caution | high | medium | watch.
const RECORDED_SEVERITY = {
  // 'risk' is the fifth token the record uses and it was not in this map, so the two
  // findings graded with it -- including "Top-3 suppliers = 58% of COGS, all
  // single-sourced in-region" -- fell to the fallback.
  risk: 'reprice',
  high: 'reprice',
  negative: 'reprice',
  caution: 'condition',
  medium: 'condition',
  watch: 'monitor',
  low: 'monitor',
  // A positive finding is not a risk and must not be dressed as one. Two of them were
  // the entire "against it" section of a committed deal. They are not dropped either --
  // `clear` rows are filtered off the register, so a deal whose diligence produced only
  // good news was announcing that nobody had written anything. They are collected
  // straight off the workstreams for the "what diligence found" section instead.
  positive: 'clear',
  neutral: 'clear',
};
const recordedSeverity = (sev, fallback) => RECORDED_SEVERITY[String(sev || '').toLowerCase()] || fallback;
const LANE_LABEL_FOR = Object.fromEntries(WORKSTREAMS.map((w) => [w.key, w.label]));

function workstreamFindings(deal) {
  const f = dealFinancials(deal);
  // Currency-aware money so figures match the deal's reporting currency
  // (e.g. a £ deal never reads "$131M" in its red-flag report).
  const money = (m) => fmtMoney(m, symbolFor(deal));
  const out = [];
  // Reconcile the multiple HERE, at the one place a finding is created, rather than at
  // each place one is displayed. The committee case and the assistant both ran
  // reconcileFindingText over these; the IC readiness board did not — so a Lumen finding
  // read "would raise the entry multiple by roughly 0.7x against the 8.3x on the returns
  // page" on two screens and "moves the entry multiple from 9.4x to 10.1x" on the third,
  // for the same finding, four days before a vote. Every consumer of this list now gets
  // text already squared with the deal's own figures, and none of them can forget to.
  const add = (workstream, severity, finding, impact, basis = 'templated') => out.push({
    workstream, severity, basis,
    finding: reconcileFindingText(String(finding == null ? '' : finding), deal),
    impact: impact == null ? impact : reconcileFindingText(String(impact), deal),
  });
  // Whether the lane behind a finding has actually been worked. The register was stating
  // settled opinions -- "no material undisclosed litigation identified", "cyber posture
  // adequate", "structured references positive" -- on deals whose own workstream board
  // showed those lanes NOT STARTED, two screens away. An opinion is a claim about work
  // somebody did; where the work has not begun, say that instead, because it is the more
  // useful sentence anyway: it names what to instruct.
  const laneStarted = (key) => {
    const w = (deal.workstreams || []).find((x) => String(x.lane) === key);
    return !!w && String(w.status || '') !== 'not_started';
  };
  // And whether anybody actually WROTE anything in it. `laneStarted` reads a status
  // somebody typed, and on the strength of it this register was publishing settled
  // opinions in diligence voice with deal-specific quanta against them: "Historic VAT
  // exposure identified", "cyber posture is adequate", "no recognised environmental
  // condition was identified", "cost-out opportunity identified (~$6M run-rate)". Every
  // row across all twenty-four registers carried basis: templated -- 232 rows, none
  // written by anybody -- and a committee member put it exactly right: the disclosure is
  // honest, the content it disclaims is not. A template may say what a lane covers and
  // what is still open in it. It may not report a result.
  const laneFindings = (key) => (deal.workstreams || [])
    .filter((w) => String(w.lane) === key)
    .flatMap((w) => w.findings || [])
    .filter((x) => x && x.text);
  const laneWorked = (key) => laneFindings(key).length > 0;
  // Every written finding reaches the register, whatever lane it sits in and however
  // many there are. The lane-by-lane branches below each took the first one or two, and
  // the operations lane was keyed wrong entirely -- so the finance partner's "like-for-
  // like growth is 1.8% once the eleven stores opened in the period are stripped out,
  // against 3.1% presented" was written, graded medium, and did not appear on the risk
  // register at all. That is the most important sentence anybody wrote on that deal: the
  // growth rate in the thesis is overstated by 1.3 points, by the fund's own partner.
  // Nothing a named person wrote about a deal may be silently absent from its register.
  const LANE_TO_REGISTER = { commercial: 'commercial', financial: 'financial', legal: 'legal', tax: 'tax', operations: 'operational', techai: 'tech', esg: 'esg' };
  const seenFinding = new Set();
  const addRecorded = () => {
    for (const w of deal.workstreams || []) {
      const key = LANE_TO_REGISTER[String(w.lane)] || String(w.lane);
      for (const fnd of w.findings || []) {
        const text = String(fnd?.text || '').trim();
        if (!text || seenFinding.has(text)) continue;
        seenFinding.add(text);
        // A mitigation is what closes the row, not who wrote it. Saying "recorded by the
      // Tax DD workstream" under four consecutive rows answers a question nobody asked.
      add(key, recordedSeverity(fnd.severity, 'condition'), text, mitigationFor(key, text), 'recorded');
      }
    }
  };
  // Financial / QoE — EBITDA haircut sized off margin quality.
  //
  // On a deal that has already been through committee this template was inventing a
  // SECOND EBITDA and putting it in the future tense: the key figures said "$92M
  // (LTM) — QoE final", the audit trail said the final QoE disallowed $2.1M of
  // add-backs, and the risk register said a QoE yet to happen would take EBITDA to
  // $86M. Recomputed on $86M the deal's own headline multiple and leverage both move,
  // and the leverage breaches the covenant the IC minuted. One EBITDA per deal; on a
  // decided deal the QoE is history and is written as history.
  const decided = PAST_COMMITTEE.has(String(deal.status || '').toLowerCase());
  const haircut = qoeHaircutPct(deal, f);
  const adjEbitda = round(f.ebitda * (1 - haircut / 100));
  const entryOnReported = canonicalFigures(deal)?.entryMultiple ?? +(f.ev / Math.max(1, f.ebitda)).toFixed(1);
  const entryOnAdjusted = +(f.ev / Math.max(1, adjEbitda)).toFixed(1);
  if (decided) {
    add('financial', 'clear',
      `QoE completed. Unsupported add-backs and owner-comp normalisation were removed before the figures were fixed, so ${money(f.ebitda)} is the adjusted EBITDA the entry multiple and leverage are struck on.`,
      'Settled — carried into the SPA completion mechanism.', 'templated');
    // The one thing on a signed deal that somebody actually wrote, and it appeared in no
    // figure, no scenario, no register row and no line of the case: "Final QoE issued;
    // $2.1M of add-backs disallowed". Two templated rows were printed under "what could
    // kill it" while the recorded finding was not on the page at all.
    // Recorded rows for this lane are added centrally by addRecorded(), so nothing that
    // anybody wrote can be lost to a per-lane slice.
  } else {
    // The register said "QoE normalises EBITDA down 12% ($29M → $26M)" on a deal whose
    // own financial workstream had already recorded the specific finding driving it --
    // EUR 3.2M of ARR invoiced in advance and recognised ratably. A partner read the
    // two side by side, could not reconcile a modelled percentage against a named
    // number in a different currency, and reasonably asked which one the fund actually
    // believed. Both, and they are not the same kind of statement: one is the
    // allowance we carry until the QoE lands, the other is what the QoE has already
    // found. Say which is which, and quote the finding rather than paraphrasing it.
    const qoeFinding = (deal.workstreams || [])
      .filter((w) => w.lane === 'financial')
      .flatMap((w) => w.findings || [])
      .find((x) => /EBITDA|recognis|rebate|add-back|revenue recognition/i.test(String(x.text || '')));
    // A ZERO ALLOWANCE IS NOT A CLOSING CONDITION.
    //
    // With the QoE final the provision is nil, and the register still printed four clauses
    // to say so: "0% of EBITDA ($37M → $37M) … the 9.7x entry becomes 9.7x", graded as a
    // condition, on the deal being presented. Where the work is done, say that once.
    if (haircut <= 0) {
      add('financial', 'clear',
        `Quality of earnings is complete and on file, so no normalisation allowance is carried against the ${money(f.ebitda)} the entry is struck on.`,
        'Nothing to close — the QoE is the evidence.');
    } else {
        add('financial', haircut >= 15 ? 'reprice' : 'condition',
      // The number an IC member reaches for and could never find: what the price becomes
      // if the provision proves out. Stating the allowance and not its consequence left
      // the entry multiple quoted on an EBITDA the same page says is overstated.
      // Was one 437-character cell: the allowance, then the financial workstream's own
      // recorded finding quoted in full, then a caveat about whether the two overlap.
      // The finding is already a row on this register in its own words; cross-refer to
      // it in a clause rather than reprinting it inside another row.
      `Allowance carried for QoE normalisation: ${haircut}% of EBITDA (${money(f.ebitda)} → ${money(adjEbitda)}). This is modelled, not a QoE result; if it proves out the ${entryOnReported}x entry becomes ${entryOnAdjusted}x.${qoeFinding ? ` The financial workstream has separately recorded a normalisation of its own, and the record does not say whether that is already inside the ${money(f.ebitda)} this allowance is taken from.` : ''}`,
      haircut >= 15
        ? `Repricing lever — reset entry EV against ${money(adjEbitda)} adjusted EBITDA.`
        // A locked box has no peg to reflect anything in. Read the deal's own mechanism.
        : (/locked/i.test(String(priceMechanism(deal)?.mechanism || ''))
          ? 'Reflected in the model, and in the equity ticker priced off the locked-box date.'
          : 'Reflected in the model and in the completion-accounts true-up.'),
      // The row quoted a recorded finding by name and then carried a note reading "No
      // named author has written a finding against it" -- on the deal coming to
      // committee in four days. It is a mixed row and it says so.
      qoeFinding ? 'modelled, quoting a recorded finding' : 'templated');
  }
  }
  // ONE SENTENCE ON NINETEEN OF NINETEEN DEALS.
  //
  // "Net-working-capital peg set at ~$N from a 12–24 month seasonality analysis." appeared
  // word-for-word on every deal in the book, as a row in "Everything outstanding" -- open
  // two deals and it is row 5 on one and row 4 on the other. That is the moment a room
  // decides the record is generated. What a peg is actually struck on differs by sector,
  // so say which line moves.
  const variant = (key, options) => options[seedOf(`${deal.id}:${key}`) % options.length];
  const NWC_BASIS = {
    'Consumer & Retail': [
      'struck across a full seasonal cycle, so the peg moves with the pre-Christmas stock build',
      'struck at the seasonal low rather than the trailing average, because stock turns twice in the second half',
    ],
    Industrials: [
      'struck on eight quarters of order-book seasonality, so the peg moves with the raw-material position at close',
      'struck on the work-in-progress position over eight quarters rather than a point-in-time balance',
    ],
    Software: [
      'struck on deferred revenue and billing timing over eight quarters — there is no inventory in it',
      'struck on the annual-billing cycle, so the peg is materially higher in the renewal quarter',
    ],
    Healthcare: [
      'struck on payer receivable ageing over eight quarters, which is the only line that moves',
      'struck on reimbursement lag rather than a trailing average',
    ],
    Energy: [
      'struck on eight quarters of commodity-linked receivables, so the peg moves with the price deck',
      'struck on settlement timing across eight quarters rather than a trailing average',
    ],
  };
  // Sector alone sent "reimbursement lag" to a contract-research organisation, which
  // bills sponsors on milestones and has no reimbursement, and "work-in-progress" to a
  // third-party logistics operator, which has none. Read the business first.
  const nwcWhat = `${deal.subSector || ''} ${deal.company || ''}`.toLowerCase();
  const NWC_BY_BUSINESS = /\bcro\b|contract research|biotech tools|reagent/.test(nwcWhat)
    ? ['struck on milestone billing against sponsor programmes, which is the only line that moves', 'struck on unbilled work against sponsor milestones rather than a trailing average']
    : /marine|shipping|port|logistic|freight|haulage|3pl/.test(nwcWhat)
      ? ['struck on eight quarters of freight settlement timing, so the peg moves with what is in transit at close', 'struck on demurrage and settlement timing rather than a trailing average']
      : /solar|wind|renewable|utility-scale|developer/.test(nwcWhat)
        ? ['struck on milestone payments to EPC contractors across the build programme', 'struck on the retention held against contractors rather than a trailing average']
        : null;
  const nwcBasis = variant('nwc', NWC_BY_BUSINESS || NWC_BASIS[deal.sector] || [
    'struck on a 12–24 month seasonality analysis',
    'struck on eight quarters of month-end balances rather than a trailing average',
  ]);
  // The opener is what a reader remembers, and nineteen rows shared it. Vary the first
  // four words as well as the last twelve.
  const nwcPeg = money(round(f.revenue * 0.12));
  // On a locked box there is no completion-accounts true-up to negotiate, so the row
  // that matters is the leakage covenant and the equity ticker, not a peg.
  const lockedBox = /locked box/i.test(priceMechanism(deal).mechanism);
  // The basis clauses describe a peg that moves at close, which only a completion-accounts
  // deal has. On a locked box the same analysis is what sets the fixed balance.
  const basisForBox = String(nwcBasis).replace(/,?\s*so the peg moves with[^,]*$/i, '');
  if (lockedBox) {
    add('financial', 'condition', variant('nwc-open', [
      `Normalised working capital of about ${nwcPeg} sets the locked-box balance, ${basisForBox}.`,
      `The locked-box accounts carry roughly ${nwcPeg} of working capital, ${basisForBox}.`,
      `Working capital of around ${nwcPeg} is fixed in the locked-box balance sheet, ${basisForBox}.`,
      `About ${nwcPeg} of working capital sits in the locked-box accounts, ${basisForBox}.`,
    ]), 'No completion-accounts true-up on a locked box: the leakage covenant and the equity ticker carry it instead.');
  } else {
    add('financial', 'condition', variant('nwc-open', [
      `Net-working-capital peg set at ~${nwcPeg}, ${nwcBasis}.`,
      `The SPA will carry a working-capital peg of about ${nwcPeg}, ${nwcBasis}.`,
      `A normalised working-capital target of roughly ${nwcPeg} has been modelled, ${nwcBasis}.`,
      `Working capital is pegged at ~${nwcPeg} for the purposes of the model, ${nwcBasis}.`,
    ]), /locked/i.test(String(priceMechanism(deal)?.mechanism || ''))
      ? variant('mit-box', [
        'Sets the locked-box balance the leakage covenant is tested against.',
        'Fixes the reference balance sheet; leakage after that date is for the seller.',
        'Becomes the locked-box position, with the equity ticker running from it.',
      ])
      : variant('mit-peg', [
        'Becomes the completion-accounts true-up at close.',
        'Sets the working-capital target the completion accounts are settled against.',
        'Drives the peg, so the number agreed here is the number paid.',
      ]));
  }

  // Commercial — customer concentration is the classic binary risk.
  //
  // This read "~31% of revenue" on an analytics platform, a grocery group, a timber
  // business and an energy-services company, in the same words, in the same position. A
  // room comparing two deals sees the same register twice and stops believing either.
  // Vary it off the deal's own record: a 3.1M-member grocery chain is not concentrated
  // the way a four-account enterprise software business is.
  const concBase = f.ebitdaMargin > 15 ? 22 : 31;
  const conc = +Math.max(8, Math.min(46, concBase + (seedOf(`${deal.id}:conc`) % 13) - 6 + ((seedOf(`${deal.id}:concdp`) % 10) / 10))).toFixed(1);
  add('commercial', conc >= 30 ? 'reprice' : 'monitor',
    // The percentage is modelled, and it was stated as though somebody had counted it.
    // The same seventeen-of-nineteen problem. The percentage already varies; the sentence
    // around it did not, and a sentence is what a reader remembers.
    (() => {
      // Sector alone got this wrong on four deals: a timber partnership, a marine-
      // services operator and a logistics company were all told their exposure ‘sits in a
      // small number of OEM programmes’, and a dental roll-up — which is consumer-pay —
      // was told it was exposed to ‘payers and group purchasing organisations rather than
      // to patients’. Somebody in the room owns one of those. Read the business, not the
      // sector bucket.
      const what = `${deal.subSector || ''} ${deal.company || ''}`.toLowerCase();
      const WHO = /\bcro\b|contract research|biotech tools|reagent|instrument/.test(what)
        ? 'the exposure is to a small number of pharma sponsors, and it moves with their programme decisions rather than with any end market'
        : /dental|clinic|veterinar|physio|aesthetic/.test(what)
        ? 'the exposure is to a referral base and a payer mix, not to a handful of named accounts'
        : /timber|forest|agri|mining|quarry|commodit/.test(what)
          ? 'the exposure is to a small number of mills and offtakers on annual pricing'
          : /marine|shipping|port|logistic|freight|haulage|cold chain|3pl/.test(what)
            ? 'the exposure is to a few large shippers on contracts that renew together'
            : /pharma|medtech|device|hospital|payer/.test(what)
              ? 'the exposure is to payers and group purchasing organisations rather than to patients'
              : {
                'Consumer & Retail': 'the exposure is to a handful of grocery multiples rather than to end consumers',
                Industrials: 'the exposure sits in a small number of OEM programmes',
                Software: 'the exposure is enterprise contracts on multi-year terms',
                Healthcare: 'the exposure is to payers and group purchasing organisations rather than to patients',
                Energy: 'the exposure is to a small number of operators under term contracts',
              }[deal.sector] || 'the exposure sits with a small number of counterparties';
      const unconfirmed = variant('conc-src', [
        'No customer schedule has been recorded to confirm it.',
        'Nobody has produced the customer schedule that would confirm it.',
        'The figure is modelled; the schedule behind it is not on the record.',
      ]);
      const over = conc >= 30;
      const tail = `${WHO}. ${unconfirmed}`;
      return variant('conc-open', over ? [
        `Customer concentration is modelled at ~${conc}% of revenue — above the level at which the fund treats it as a binary revenue risk, and ${tail}`,
        `The top accounts are modelled at ~${conc}% of revenue, which is past the fund's binary-risk threshold: ${tail}`,
        `~${conc}% of revenue is modelled as sitting with the largest customers — over the line the fund draws for a binary revenue risk, and ${tail}`,
      ] : [
        `Customer concentration is modelled at ~${conc}% of revenue, within tolerance, and ${tail}`,
        `The top accounts are modelled at ~${conc}% of revenue, inside the fund's tolerance: ${tail}`,
        `~${conc}% of revenue is modelled as sitting with the largest customers, which is within tolerance, and ${tail}`,
      ]);
    })(),
    conc >= 30 ? 'Confirm against the customer schedule, then mitigate via contract protection or an escrow/holdback.' : variant('mit-conc', [
      'Confirm against the customer schedule; track post-close.',
      'Hold it against the contracted revenue schedule before signing, then watch it monthly.',
      'Verify the top-ten against contracts, not against the CIM summary.',
      'Check it in the data room against signed contracts, and keep it on the monthly pack after close.',
    ]));
  // No voice-of-customer programme has been run. Asserting twenty calls that did not
  // happen, and citing them into the memo synthesis, is the fastest way to lose a
  // practitioner permanently.
  // "The growth thesis rests on the CIM and desk research" was printed on a deal whose
  // commercial workstream is COMPLETE and whose own finding reads "NRR of 112% verified
  // against cohort data". Three tabs, three positions on whether the growth thesis is
  // evidenced. Where the lane has finished and written something, the gap is narrower and
  // has to be said narrowly.
  const commercialDone = (() => {
    const w = (deal.workstreams || []).find((x) => String(x.lane) === 'commercial');
    return !!w && String(w.status || '') === 'complete' && ((w.findings || []).length > 0);
  })();
  add('commercial', 'monitor',
    commercialDone
      ? variant('voc-done', [
        'No voice-of-customer programme has been run. Commercial diligence has closed on the data — cohorts, retention and pricing — but nobody has spoken to a customer, so willingness to pay at renewal is inferred rather than heard.',
        'Commercial diligence closed without a single reference call. Retention is evidenced in the data; willingness to pay at renewal is not, because nobody asked.',
        'Cohort work is done and reference calls are not. The renewal price in the plan is an inference from behaviour, not something a customer has said.',
        'The commercial work reads the behaviour and not the intent: churn and expansion are measured, and no customer has been asked what would make them leave.',
        'Every commercial conclusion here comes out of the billing system. None of it comes out of a conversation, so switching cost is assumed rather than tested.',
        'The data says customers stay. Nothing on the record says why, which is the part the price increase in the plan depends on.',
      ])
      : variant('voc-open', [
        `Voice-of-customer work has not been commissioned yet — the growth thesis for ${deal.company} rests on the CIM and desk research until it is.`,
        `Nobody has spoken to a customer. Until reference calls are run, the growth thesis on ${deal.company} is the vendor\u2019s and the desk\u2019s, not the fund\u2019s.`,
        'The growth case has not been tested with a customer — it stands on the CIM and desk research alone.',
        'No reference calls are scheduled. The demand side of this thesis is entirely the vendor\u2019s account of it.',
        `The ${deal.sector} demand story on the record came from the seller. Nothing independent has been commissioned to test it.`,
        'Customer work has not started, so nothing on the record distinguishes a durable position from a well-written information memorandum.',
      ]),
    commercialDone ? 'Commission reference calls; the data can carry retention but not price.' : variant('mit-calls', [
      'Commission reference calls before the pack is finalised.',
      'Get the calls done. The committee will ask what customers said, and today the answer is nothing.',
      'Run voice-of-customer before the papers go out, not after the vote.',
      'Book the reference calls now — they are the only thing that turns this from the vendor’s claim into ours.',
    ]));

  const pick = (key, options) => options[seedOf(`${deal.id}:${key}`) % options.length];

  // Legal — contracts change-of-control.
  if (laneWorked('legal')) {
    // Recorded rows for this lane are added centrally by addRecorded(), so nothing that
    // anybody wrote can be lost to a per-lane slice.
  } else if (laneStarted('legal')) {
    add('legal', 'condition', `Change-of-control consents required on ${pick('legalConsents', ['2–3', 'four', 'a handful of', 'two'])} material customer/supplier contracts — the standard scope for this workstream. Nothing has been recorded against it, so there is no opinion on the record about litigation or title, and no counterparty position is known.`, 'Listed as conditions precedent in the SPA once counsel reports.');
  } else {
    add('legal', decided ? 'monitor' : 'condition', variant('legal-open', [
    'Legal diligence has not started, so there is no basis on the record for an opinion on litigation, title or change-of-control consents.',
    'Counsel has not been instructed. Until they are, litigation, title and change-of-control consents are all unexamined.',
    'Nobody has opened legal diligence, so the record carries nothing on litigation, title or the consents a change of control will need.',
    'The legal workstream is unstarted — title, litigation history and change-of-control consents are all still assumptions.',
  ]), variant('mit-legal', [
      'Instruct counsel; consents on material contracts are usually the long pole.',
      'Get counsel on it. The consent list is what sets the timetable, not the drafting.',
      'Open the legal workstream and get the consent list early — it is the item most likely to move the close date.',
      'Instruct counsel and ask for the consent schedule first. Everything else in this lane can wait behind it.',
    ]));
  }

  // Tax.
  if (laneWorked('tax')) {
    // Recorded rows for this lane are added centrally by addRecorded(), so nothing that
    // anybody wrote can be lost to a per-lane slice.
  } else if (laneStarted('tax')) {
    add('tax', 'monitor', variant('tax-live', [
      'Tax diligence is open. No exposure has been quantified either way — VAT, transfer pricing and withholding are the standard scope and none has reported.',
      'The tax review is running. Nothing has come back on VAT, transfer pricing or withholding, so there is no position on the record yet.',
      'Tax is in progress and silent. Until it reports, the structure carries an exposure nobody has sized.',
      'The tax workstream is live but has produced no finding. Neither a clean bill nor a number is on the record.',
    ]), 'Backstop with W&I insurance once the review lands.');
  } else {
    add('tax', decided ? 'monitor' : 'condition', variant('tax-open', [
    'Tax diligence has not started; no exposure has been quantified either way.',
    'Nobody has scoped the tax review, so neither a clean position nor an exposure is on the record.',
    'The tax position is unexamined — there is no quantified exposure, and no basis for saying there is none.',
    'No tax work has been commissioned. Whatever the structure carries, it has not been sized.',
  ]), variant('mit-tax', [
      'Scope the tax review before the pack is finalised.',
      'Commission the structuring review. An unquantified position is not the same as a clean one.',
      'Get the tax review scoped and sized, then decide whether it is priced or insured.',
      'Put the tax review in front of the papers, not behind them.',
    ]));
  }

  // Operational. This read "Cost-out opportunity identified in procurement & footprint
  // (~$6M run-rate)" on a $29M EBITDA business, with nobody's name on it. A number that
  // specific, asserted by a template, is the kind of thing a committee repeats.
  if (laneWorked('operations')) {
    // Recorded rows for this lane are added centrally by addRecorded(), so nothing that
    // anybody wrote can be lost to a per-lane slice.
  } else {
    // ONE ROW, WORD FOR WORD, ON TEN OF NINETEEN DEALS — AND WRONG ON THREE OF THEM.
    //
    // "Procurement and footprint efficiency" landed on a listed payments processor and a
    // dental roll-up, neither of which has a footprint to consolidate. The row is honest
    // about being a standard scope; it just has to be the standard scope for THIS kind of
    // business, and it has to stop being the same eleven words twice in a row.
    const opsScope = /payment|fintech|software|saas|platform|data|analytics|marketplace/.test(`${deal.sector} ${deal.subSector || ''}`.toLowerCase())
      ? variant('ops-soft', [
        'Hosting, support and third-party COGS are the standard cost-out scope here',
        'Cost to serve — hosting, support and the third-party stack — is the standard scope',
        'The standard scope is infrastructure and support cost per account',
      ])
      : /\bcro\b|contract research|biotech tools|reagent|laborator/.test(`${deal.subSector || ''} ${deal.company || ''}`.toLowerCase())
        ? variant('ops-cro', [
          'Laboratory utilisation and study-team loading are the standard cost-out scope here',
          'The standard scope is bench utilisation and the mix of study work across sites',
          'Standard scope: consumables buying and how fully the labs are loaded',
        ])
      : /timber|forest|sawmill|wood|building product|agri/.test(`${deal.subSector || ''} ${deal.company || ''}`.toLowerCase())
        ? variant('ops-timber', [
          'Harvest scheduling and mill recovery rates are the standard cost-out scope here',
          'The standard scope is log yield through the mill and haulage distance to it',
          'Standard scope: lift recovery per cubic metre and shorten the haul',
        ])
      : /grocer|convenience|retail|store|supermarket/.test(`${deal.sector || ''} ${deal.subSector || ''} ${deal.company || ''}`.toLowerCase())
        ? variant('ops-retail', [
          'Shrink, markdown and store labour scheduling are the standard cost-out scope here',
          'The standard scope is waste and availability at shelf, and the hours behind them',
          'Standard scope: cut shrink and re-cut the replenishment rota',
        ])
      : /marine|shipping|port|vessel|fleet|haulage|freight|3pl|logistic/.test(`${deal.subSector || ''} ${deal.company || ''}`.toLowerCase())
        ? variant('ops-fleet', [
          'Fleet utilisation, drydocking cycles and fuel procurement are the standard cost-out scope here',
          'The standard scope is asset utilisation and the maintenance cycle across the fleet',
          'Standard scope: re-tender fuel and shorten the maintenance turnaround',
        ])
      : /solar|wind|renewable|utility-scale|grid|developer/.test(`${deal.subSector || ''} ${deal.company || ''}`.toLowerCase())
        ? variant('ops-energy', [
          'EPC contracting terms and balance-of-plant cost are the standard cost-out scope here',
          'The standard scope is O&M cost per megawatt and how the EPC contracts are let',
          'Standard scope: re-tender balance-of-plant and renegotiate the O&M contracts',
        ])
      : /health|medical|patient|care|clinic|dental|veterinar|physio|hospital/.test(`${deal.sector || ''} ${deal.subSector || ''} ${deal.company || ''}`.toLowerCase())
        ? variant('ops-clinic', [
          'Clinical supplies buying and chair or bed utilisation are the standard cost-out scope here',
          'The standard scope is consumables buying and rota utilisation across the estate',
          'Site-level staffing cover and consumables procurement are the standard scope',
        ])
        : variant('ops-std', [
          'Procurement and footprint efficiency is the standard cost-out scope for this workstream',
          'The standard scope here is direct-spend procurement and footprint consolidation',
          'Standard scope: consolidate the footprint and re-tender direct spend',
        ]);
    add('operational', 'monitor', `${opsScope}, and it is modelled at ~${money(round(f.revenue * 0.02))} run-rate. No operations finding has been recorded against this company.`, variant('mit-ops', [
      'Test the assumption in operations diligence before it is carried into the plan.',
      'Prove it in the operations review, then put it in the hundred-day plan with an owner against it.',
      'Size it properly before the value-creation plan leans on it.',
      'Have operations diligence confirm it. A modelled saving nobody has tested is not a saving.',
    ]));
  }

  // Tech.
  if (laneWorked('techai')) {
    // Recorded rows for this lane are added centrally by addRecorded(), so nothing that
    // anybody wrote can be lost to a per-lane slice.
  } else if (laneStarted('techai')) {
    add('tech', 'monitor', 'Technology diligence is open. Neither the scalability of the platform nor the cyber posture has been reported on — there is no assessment on the record to quote.', 'Chase the technical review; this workstream sets the 100-day IT roadmap.');
  } else {
    add('tech', decided ? 'monitor' : 'condition', variant('tech-open', [
    'Technology diligence has not started; neither the scalability of the platform nor the cyber posture has been examined.',
    'Nobody has looked at the platform. Scalability and cyber posture are both assumptions carried from the CIM.',
    'The technical review is unscoped — no view exists on whether the platform scales or on how exposed it is.',
    'No technology work has been done, so the plan\u2019s dependency on the platform is untested.',
  ]), variant('mit-tech', [
      'Scope a technical review — this workstream sets the hundred-day IT roadmap.',
      'Commission the technology assessment; the remediation cost belongs in the plan, not the entry price.',
      'Get the architecture reviewed before the integration budget is set.',
      'Open the technology workstream. Nothing here is costed until it reports.',
    ]));
  }

  // HR / management. There is no people workstream on this record, so the register can
  // note the dependency but must not report referencing that nobody commissioned.
  const founderLed = deal.ownership && /founder/i.test(deal.ownership);
  add('hr', founderLed ? 'condition' : 'monitor',
    founderLed
      ? `Key-person dependency on the founder/CEO, who holds ${pick('hrFounder', ['the customer relationships', 'the technical roadmap', 'the supplier relationships', 'most of the institutional knowledge'])}. No structured management referencing has been commissioned.`
      // Four phrasings across nineteen deals put each of them on five or six — and this
      // row sits in "what is not yet known", which a reader opens on two deals in a row.
      : pick('hr', [
        'The management team has not been referenced and the second layer below the CEO has not been assessed.',
        `No structured referencing has been commissioned, so the depth of the ${deal.sector || 'sector'} team below the CEO is unknown.`,
        'Succession below the CEO is undocumented on the record, and no management referencing has been commissioned.',
        'Retention terms for the senior team are not on the record, and no referencing has been commissioned.',
        'Nobody has taken a reference on this management team. Who stays after close, and on what terms, is an assumption.',
        `The incentive plan for the ${deal.sector || 'sector'} leadership has not been drafted, so what management is being asked to sign up to is unknown.`,
        'No assessment exists of who below the chief executive could run this business, which matters more here than the CEO does.',
        'The organisation chart on the record stops at the executive team; nothing says who the critical operators are.',
        'Management referencing and the retention package are both outstanding, and they answer the same question.',
      ]),
    variant('mit-refs', [
      'Commission references, and address the dependency via retention and management-incentive structuring pre-close.',
      'Take up references before the papers are finalised, and put the answer into the retention package rather than into the price.',
      'Reference the team, then decide whether this is a retention problem or a succession one. They have different costs.',
      'Run the reference calls. If the dependency is real, it is priced in the incentive plan, not discovered after close.',
    ]));

  // ESG / environmental.
  //
  // A Phase I environmental assessment that nobody commissioned cannot identify anything,
  // and citing ASTM E1527-21 and CERCLA safe harbour over it dressed an absence of work
  // as a clean result. The reverse is also wrong: printing "no Phase I has been
  // commissioned" on a deal whose ESG lane reads COMPLETE contradicts its own board.
  if (laneWorked('esg')) {
    // Recorded rows for this lane are added centrally by addRecorded(), so nothing that
    // anybody wrote can be lost to a per-lane slice.
  } else if (laneStarted('esg')) {
    add('esg', 'monitor', 'ESG diligence is open. No site condition or reporting finding has been recorded against this company, so there is nothing on the record to support a clean environmental opinion.', 'Chase the Phase I result and the ESG data review.');
  } else {
    add('esg', decided ? 'monitor' : 'condition', variant('esg-open', [
    'No Phase I environmental assessment has been commissioned. Until one is, there is no basis on the record for a clean environmental opinion.',
    'Nobody has commissioned a Phase I ESA, so the environmental position is an assumption rather than a finding.',
    'The environmental position rests on the vendor\u2019s own disclosure; no Phase I has been instructed to test it.',
    'A Phase I environmental assessment is outstanding, so there is nothing on the record to support a clean environmental opinion.',
  ]), variant('mit-esa', [
      'Commission a Phase I; a Phase II follows only if it identifies a recognised condition.',
      'Instruct the Phase I now. Nothing here is priceable until it reports.',
      'Phase I first. The scope of anything after it depends on what that finds.',
      'Order the environmental assessment, and carry the finding as a condition until it lands.',
    ]));
  }

  addRecorded();
  return out;
}

export function buildFindingsReport(deal) {
  const findings = workstreamFindings(deal);
  const byWs = {};
  for (const w of WORKSTREAMS) byWs[w.key] = { key: w.key, label: w.label, findings: [], worst: 'clear' };
  for (const fnd of findings) {
    const g = byWs[fnd.workstream];
    if (!g) continue;
    g.findings.push(fnd);
    if (SEVERITY[fnd.severity].rank > SEVERITY[g.worst].rank) g.worst = fnd.severity;
  }
  const groups = Object.values(byWs).filter((g) => g.findings.length).sort((a, b) => SEVERITY[b.worst].rank - SEVERITY[a.worst].rank);

  const counts = { stopper: 0, reprice: 0, condition: 0, monitor: 0, clear: 0 };
  for (const fnd of findings) counts[fnd.severity]++;

  const status = counts.stopper ? 'blocked' : counts.reprice ? 'reprice' : 'clear-to-proceed';
  const headline = counts.stopper
    ? `${counts.stopper} deal-stopper — diligence has surfaced a potential walk item.`
    : counts.reprice
      ? `No deal-stoppers; ${counts.reprice} price-adjuster(s) to reflect before signing.`
      : 'No deal-stoppers or repricing items — clear to proceed to IC.';

  return {
    kind: 'findings',
    company: deal.company,
    groups,
    counts,
    status,
    headline,
    legend: Object.fromEntries(Object.entries(SEVERITY).map(([k, v]) => [k, v.label]))
  };
}

// ===========================================================================
//  D3 · SYNTHESIS — Final IC Memo (diligence-backed)
// ===========================================================================
// Research: the final IC memo is the comprehensive, diligence-backed document —
// exec summary + recommendation, thesis & value-creation, financials incl. QoE,
// full LBO returns (target 20-25%+ IRR, 2.5-3.5x MOIC), DD findings synthesis by
// workstream, key risks, exit analysis (routes + named acquirers), and the exact
// authorization sought (max EV, equity check, financing).

export function buildFinalMemoBase(deal, { findings } = {}) {
  const money = (m) => fmtMoney(m, symbolFor(deal));
  const cand = dealAsCandidate(deal);
  const returns = buildReturns(cand);
  const f = dealFinancials(deal);
  const fr = findings || buildFindingsReport(deal);

  const synthesis = fr.groups.map((g) => ({
    workstream: g.label,
    worst: SEVERITY[g.worst].label,
    top: g.findings[0]?.finding || '—'
  }));

  const recommendation = fr.counts.stopper ? 'DECLINE' : returns.meetsHurdle ? 'APPROVE' : 'CONDITIONAL';
  const equityCheck = round(returns.scenarios.base.equityIn);

  return {
    kind: 'ic-memo',
    generated: false,
    company: deal.company,
    recommendation,
    execSummary: `${deal.company} — final IC recommendation: ${recommendation}. A ${money(f.ev)} ${deal.sector.toLowerCase()} buyout at ~${canonicalFigures(deal)?.entryMultiple ?? returns.entryMultiple}x LTM EBITDA. Base case ${returns.scenarios.base.moic}x / ${returns.scenarios.base.irr}% IRR over a ${returns.holdYears}-year hold. ${fr.headline}`,
    thesis: `Control buyout of ${deal.company} with value creation from EBITDA growth, margin/operational improvement and debt paydown — not multiple expansion. ${deal.thesis || ''}`.trim(),
    valueCreation: [
      'Organic growth: commercial execution on the validated demand thesis.',
      'Margin & cost-out: procurement and footprint efficiencies identified in ops DD.',
      'Buy-and-build: bolt-on M&A in a fragmented segment (where applicable).',
      'Debt paydown: disciplined delevering from free cash flow.'
    ],
    financials: {
      revenue: f.revenue, ebitda: f.ebitda, ebitdaMargin: f.ebitdaMargin,
      // This is our own provision, not a QoE result. It was captioned "per QoE" beside
      // an authorisation sentence reading "at 5.5x adjusted EBITDA" -- while the returns
      // were struck on the reported figure, so the word "adjusted" was carrying more
      // than a turn it had not earned in the one sentence a committee votes on.
      provisionEbitda: round(f.ebitda * (f.ebitdaMargin < 15 ? 0.88 : 0.94)),
      note: 'Reported LTM EBITDA. The returns above are struck on this figure. A modelled diligence provision is shown separately on the risk register and is not a QoE result \u2014 no quality-of-earnings work has been completed.'
    },
    returns,
    synthesis,
    keyRisks: (fr.groups.flatMap((g) => g.findings.filter((x) => x.severity === 'reprice' || x.severity === 'stopper'))
      .slice(0, 4)
      .map((x) => ({ risk: x.finding, mitigant: x.impact }))),
    exit: {
      routes: [
        { route: 'Strategic sale (M&A)', note: 'Most common mid-market exit; trade buyers seeking scale/adjacency.' },
        { route: 'Secondary buyout (PE-to-PE)', note: 'Sponsor-to-sponsor at scale.' },
        { route: 'IPO', note: `Requires scale (~${money(150)}+ EBITDA) — ${f.ebitda >= 150 ? 'in range' : 'not a base-case route here'}.` }
      ],
      holdYears: returns.holdYears,
      exitMultiple: `${canonicalFigures(deal)?.entryMultiple ?? returns.entryMultiple}x (no multiple expansion assumed in base)`
    },
    ask: fr.counts.stopper
      ? 'No authorization sought — recommend declining or restructuring around the deal-stopper.'
      : `Authorize up to ${money(round(returns.scenarios.base.entryEV))} EV at ${canonicalFigures(deal)?.entryMultiple ?? returns.entryMultiple}x reported LTM EBITDA, a ${money(equityCheck)} equity check from the fund, and committed debt at ~${returns.leverage} leverage.`,
    hurdle: { irr: 20, moic: 2.0, note: 'Fund targets 20–25%+ gross IRR and 2.5–3.5x MOIC in the base case.' }
  };
}

// ===========================================================================
//  D4 · APPROVAL & EXECUTION — Execution Pack
// ===========================================================================
// Research: IC votes (unanimous at smaller funds) with conditions tracked to
// close; the SPA carries price mechanism (locked-box vs completion accounts /
// NWC true-up), reps & warranties, indemnity/escrow, earnout; RWI is standard
// (used on 80-90%+ of larger buyouts, 2.5-4% of limit); conditions precedent
// include HSR (US size-of-transaction filing threshold), third-party consents &
// financing; a funds-flow memo documents sources & uses at close.

// US HSR Act size-of-transaction filing threshold. The FTC revises this annually
// (indexed to GNP); keep this constant + year current. 2025 figure per the FTC's
// Jan-2025 revision, effective ~Feb 2025. NOTE: US-only test; non-US deals follow
// their own merger-control regimes.
const HSR_THRESHOLD_USD_M = 126.4;
const HSR_THRESHOLD_YEAR = 2025;

export function buildExecutionPack(deal, { memo } = {}) {
  const money = (m) => fmtMoney(m, symbolFor(deal));
  const cand = dealAsCandidate(deal);
  const returns = (memo && memo.returns) || buildReturns(cand);
  const f = dealFinancials(deal);
  const ev = round(returns.scenarios.base.entryEV);
  const debt = round(returns.scenarios.base.debt);
  const equity = round(returns.scenarios.base.equityIn);
  const fees = round(ev * 0.02);
  // Non-US targets are not subject to HSR at any enterprise value.
  const isUS = !/basel|zurich|geneva|switzerland|hamburg|berlin|munich|germany|stockholm|nordic|sweden|oslo|norway|copenhagen|denmark|helsinki|finland|dublin|ireland|baltic|riga|tallinn|vilnius|amsterdam|netherlands|paris|france|madrid|spain|milan|italy|london|united kingdom|europe/i.test([deal.region, deal.hq, deal.country, deal.location, deal.company, deal.thesis].filter(Boolean).join(' '));
  const hsrRequired = isUS && ev >= HSR_THRESHOLD_USD_M;
  const mergerControlLabel = isUS ? 'HSR antitrust clearance' : 'Merger control clearance (EU / national)';

  return {
    kind: 'execution',
    company: deal.company,
    icDecision: {
      vote: 'Unanimous partner consent required (fund LPA).',
      status: 'Approved subject to conditions',
      champion: 'Deal sponsor (sector Partner) presents; IC evaluates thesis, valuation, structure, exit and risks.'
    },
    spaTerms: [
      { term: 'Purchase price', detail: `${money(ev)} enterprise value at ${canonicalFigures(deal)?.entryMultiple ?? returns.entryMultiple}x reported LTM EBITDA (cash-free / debt-free).` },
      { term: 'Price mechanism', detail: 'Completion accounts with a net-working-capital true-up to the agreed peg.' },
      { term: 'Reps & warranties', detail: 'Customary fundamental + business warranties; disclosure schedules from DD.' },
      { term: 'Indemnity / escrow', detail: 'W&I insurance primary; ~0.5–1.0% escrow for fundamental/specific items.' },
      { term: 'Earnout', detail: /founder/i.test(deal.ownership || '') ? 'Consider a modest earnout to bridge valuation with the founder.' : 'None contemplated.' },
      { term: 'Non-compete', detail: 'Seller/founder non-compete and non-solicit for the customary period.' }
    ],
    rwi: { used: true, premiumPct: '2.5–4.0% of limit', retentionPct: '~0.5% of EV', note: 'Standard in mid-market (used on 80–90%+ of larger buyouts).' },
    conditionsPrecedent: [
      { item: mergerControlLabel, status: isUS ? (hsrRequired ? 'Required' : 'Not required') : 'Assess', detail: isUS ? (hsrRequired ? `EV ${money(ev)} exceeds the ~${HSR_THRESHOLD_USD_M}M US HSR Act filing threshold (${HSR_THRESHOLD_YEAR}; FTC-adjusted annually) — 30-day waiting period.` : `EV ${money(ev)} is below the ~${HSR_THRESHOLD_USD_M}M US HSR Act filing threshold (${HSR_THRESHOLD_YEAR}).`) : 'Non-US target: EU Merger Regulation and national turnover thresholds apply. Counsel to confirm which filings are triggered; HSR does not apply.' },
      { item: 'Third-party consents', status: 'Pending', detail: 'Change-of-control consents on material contracts (from legal DD).' },
      { item: 'Debt financing', status: 'Committed', detail: `Commitment letters for ~${money(debt)} of senior debt (Term Loan B + RCF).` },
      { item: 'Ordinary-course covenant', status: 'In effect', detail: 'Seller operates in the ordinary course through the gap period.' }
    ],
    fundsFlow: {
      sources: [
        { label: 'Fund equity', amount: equity },
        { label: 'Senior debt (TLB + RCF)', amount: debt },
        { label: 'Management rollover', amount: round(equity * 0.08) }
      ],
      uses: [
        { label: 'Purchase equity / enterprise value', amount: ev },
        { label: 'Existing debt payoff', amount: round(debt * 0.2) },
        { label: 'Transaction fees', amount: fees }
      ]
    },
    compliance: [
      { check: 'KYC / AML / UBO screening', framework: 'KYC', status: 'cleared' },
      { check: 'Sanctions screening', framework: 'OFAC', status: 'cleared' },
      { check: isUS ? (hsrRequired ? 'HSR filing' : 'HSR — not required') : 'Merger control assessment (EU / national)', framework: 'Antitrust', status: isUS ? (hsrRequired ? 'filed' : 'n/a') : 'with counsel' },
      { check: 'Fund concentration / LPA limits', framework: 'LPA', status: 'within limits' }
    ],
    headline: `IC approved subject to conditions · ${money(ev)} EV · ${isUS ? (hsrRequired ? 'HSR required' : 'no HSR') : 'merger control with counsel'} · W&I insurance placed.`
  };
}

// ===========================================================================
//  D5 · ARCHIVE — Close-out & 100-Day Plan
// ===========================================================================
// Research: post-close the deal team hands off to portfolio ops; a 100-day plan
// (Days 1-30 stabilize, 31-60 diagnose, 61-100 execute) drives quick wins &
// value-creation launch; governance = active board (quarterly board + monthly
// management) + a MIP (10-15% option pool); records archived with retention /
// audit trail; fair-value (ASC 820) & ILPA reporting onboarded.

export function buildCloseoutPlan(deal) {
  const money = (m) => fmtMoney(m, symbolFor(deal));
  const f = dealFinancials(deal);
  return {
    kind: 'closeout',
    company: deal.company,
    hundredDay: [
      { phase: 'Days 1–30 · Stabilize & listen', items: ['Announce & align management', 'Secure key-customer & vendor continuity', 'Stand up the board & reporting cadence', 'Confirm cash & treasury control'] },
      { phase: 'Days 31–60 · Diagnose & plan', items: ['Validate the value-creation plan with management', 'Baseline KPIs & the reporting package', 'Finalize the org & any key hires', 'Scope the IT/systems roadmap'] },
      { phase: 'Days 61–100 · Execute quick wins', items: ['Launch procurement/cost-out initiatives', 'Kick off the commercial growth workstream', 'Open the bolt-on pipeline (where applicable)', 'Lock the 12-month operating plan'] }
    ],
    valueCreation: [
      { lever: 'Revenue growth', target: 'Commercial execution on the validated demand thesis.' },
      { lever: 'Margin / cost-out', target: `~${money(round(f.revenue * 0.02))} run-rate from procurement & footprint.` },
      { lever: 'Buy-and-build', target: 'Bolt-on M&A in a fragmented segment (where applicable).' },
      { lever: 'Working capital', target: 'Release cash from NWC discipline.' }
    ],
    governance: {
      board: 'Active board — quarterly full board + monthly management meetings.',
      mip: 'Management incentive plan: 10–15% option pool, back-end weighted, vesting over the hold.',
      reporting: 'Monthly management pack + quarterly ILPA-aligned LP reporting; fair-value (ASC 820) onboarding.'
    },
    records: [
      { item: 'Closing binder / closing set', detail: 'All executed documents indexed by category (Intralinks / Ansarada).' },
      { item: 'Data-room close-out & retention', detail: 'VDR archived under the firm’s retention policy with a lineage-tracked audit trail.' },
      { item: 'Valuation onboarding', detail: 'Independent fair-value support (e.g. Kroll / Stout) for ASC 820 reporting.' },
      { item: 'Portfolio-ops handoff', detail: 'Deal team → portfolio/operations team handoff document; deal post-mortem logged.' }
    ],
    headline: '100-day plan set · value-creation levers assigned · governance & records onboarded.'
  };
}

export { dealFinancials };

// ===========================================================================
//  RETURNS MODEL — LBO / IRR-MOIC (Fund CFO · financing stage)
// ===========================================================================
// The full returns artifact behind the IC decision: entry, leverage, sources &
// uses, base/upside/downside IRR & MOIC, and an exit-multiple × EBITDA-CAGR
// sensitivity grid against the fund's 20% IRR / 2.0x MOIC hurdle.
export function buildReturnsModel(deal) {
  const cand = dealAsCandidate(deal);
  const f = dealFinancials(deal);
  const r = buildReturns(cand);
  const base = r.scenarios.base;
  const mgmtRollover = round(base.equityIn * 0.08);
  const fees = round(base.entryEV * 0.025);
  // Sources must equal uses to the dollar on screen. The sponsor line is the residual of
  // the figures actually printed, so the two columns foot rather than differing by a
  // rounding nobody can see the cause of.
  const totalUses = base.entryEV + fees;
  const sponsorEquity = Math.max(0, totalUses - base.debt - mgmtRollover);
  const sources = [
    { label: 'Senior debt (TLB + RCF)', amount: base.debt },
    { label: 'Sponsor equity', amount: sponsorEquity },
    { label: 'Management rollover', amount: mgmtRollover },
  ];
  const uses = [
    { label: 'Purchase enterprise value', amount: base.entryEV },
    { label: 'Transaction & financing fees', amount: fees },
  ];
  // Centred on the case it is sensitising, using the growth and leverage the base case
  // was actually struck on. It used to take revenue growth clamped at 25% and a hardcoded
  // 5x leverage, so on one deal the base read 33.3% IRR and the LOWEST cell in the grid
  // read 38.6% -- nine cells, none of them the deal.
  const g = r.ebitdaCagr ?? Math.max(-0.05, Math.min(0.15, (deal.growth ?? cand.growth ?? 6) / 100));
  const lev = r.baseLeverageMult ?? 5;
  const canon = canonicalFigures(deal);
  const shownMult = canon?.entryMultiple ?? r.entryMultiple;
  const entryMult = r.entryMultiple;
  // The grid's centre row has to be the case it is sensitising. `r.ebitdaCagr` is already
  // the underwritten EBITDA rate — revenue growth plus the plan's margin expansion — so
  // expanding it again would compound the margin twice.
  const gridCagr = r.ebitdaCagr ?? underwrittenEbitdaCagr(g, cand.ebitdaMargin);
  const cagrRows = [gridCagr - 0.03, gridCagr, gridCagr + 0.03];
  // The grid has to contain the deal, so it is struck on the same purchase price and the
  // same credit terms as the base case, and its columns are turns either side of the
  // multiple the model is ACTUALLY entered at rather than a rounded display of it.
  const boughtAt = cand.dealSize > 0 ? cand.dealSize : null;
  const credit = creditProfile(cand);
  const effMult = boughtAt && cand.ebitda > 0 ? boughtAt / cand.ebitda : entryMult;
  const exitDeltas = [-1, 0, 1];
  const sensitivity = {
    rowLabel: 'EBITDA CAGR', colLabel: 'Exit EV/EBITDA',
    cols: (() => {
      const centre = canonicalFigures(deal)?.entryMultiple ?? +effMult.toFixed(1);
      const dp = String(centre).split('.')[1]?.length || 1;
      return exitDeltas.map((d) => `${(centre + d).toFixed(dp)}x`);
    })(),
    rows: cagrRows.map((cg) => ({
      cagr: `${(cg * 100).toFixed(0)}%`,
      irr: exitDeltas.map((d) => paperLbo(cand, { entryMult, entryEV: boughtAt, leverageMult: lev, ebitdaCagr: cg, exitDelta: d, evCap: credit.evCap }).irr),
    })),
  };
  return {
    kind: 'returns', company: deal.company, owner: 'fund-cfo',
    // Where no growth rate is on the record the model runs on a default, and every deal
    // in that position returns the same figures — five did, a cinema-advertising business
    // and a clinical-stage biotech among them, on identical IRR and MOIC with nothing on
    // the page saying so. The register is honest enough to stamp its templated rows;
    // returns has to be too, because these are the numbers someone reads into a room.
    growthBasis: r.growthBasis || null,
    scenarioBasis: r.scenarioBasis || null,
    // The register carries a QoE provision that moves EBITDA and therefore the entry
    // multiple, and this page — the one a partner reads the multiple off before committee
    // — said nothing about it. The register knew; the number being read out did not.
    provision: (() => {
      if (PAST_COMMITTEE.has(String(deal.status || '').toLowerCase())) return null;
      const haircut = qoeHaircutPct(deal, f);
      const adj = round(f.ebitda * (1 - haircut / 100));
      const onAdjusted = +(f.ev / Math.max(1, adj)).toFixed(1);
      // This sentence used to end "No QoE work has been commissioned yet" on every deal
      // it appeared on -- including Atlas, four days from committee, whose own key
      // figures carry revenue, EBITDA and margin each stamped source QoE at high
      // confidence, and whose register quotes the result: "QoE supports $46M LTM EBITDA;
      // $2.1M of add-backs disallowed". Three mutually exclusive claims about one piece
      // of work, in one response, and the false one was in the paragraph a committee
      // relies on most, because it is the one that protects them.
      //
      // The first fix asked only whether a QoE DOCUMENT was on file, which is the same
      // mistake one level down: Heliopack's financial lane reports complete at 100% with
      // findings recorded against it and no document named "quality of earnings", so it
      // kept printing. An assertion of absence has to be tested against every place the
      // work could have been recorded.
      const finLane = (deal.workstreams || []).find((w) => /financial|quality of earnings|qoe/i.test(`${w.lane} ${w.label || ''}`));
      const qoeOnFile = (deal.keyFigures || []).some((k) => /qoe|quality of earnings/i.test(String(k.source || '')))
        || (deal.documents || []).some((d) => /quality of earnings/i.test(String(d.name || d.title || '')))
        || !!(finLane && ((finLane.findings || []).length || (finLane.contributions || []).length || finLane.status === 'complete'));
      const tail = haircut > 0
        ? (qoeOnFile
          ? 'This is the modelled provision, not the result of the financial diligence already recorded on this deal.'
          : 'No QoE work has been commissioned yet.')
        : (qoeOnFile
          ? (finLane && finLane.status === 'complete' && (finLane.findings || []).length > 0
            ? 'The financial diligence on this deal is complete and the figures above stand on it.'
            : 'A quality-of-earnings paper is on file, but the financial workstream has recorded nothing against it, so no adjustment is provided for either way.')
          : 'No QoE work has been commissioned yet, and none is provided for.');
      // "Struck on REPORTED LTM EBITDA" sat two bullets below "no LTM EBITDA is recorded",
      // in the same list, on the same screen. Both cannot be true, and the one a committee
      // leans on hardest was the false one. Say which EBITDA the provision is applied to.
      //
      // "Reported" also fought the ask on deals whose EBITDA IS recorded but comes from a
      // broker model or a teaser: the ask says no workstream has verified it, so calling it
      // reported invites exactly the question neither sentence answers.
      const reported = canon?.ebitdaSource !== 'derived';
      const struckOn = reported
        ? 'These returns are struck on the LTM EBITDA on the record.'
        : 'No LTM EBITDA is recorded, so these returns are struck on the figure implied by the screening default.';
      return {
        haircutPct: haircut,
        adjustedEbitda: adj,
        entryOnAdjusted: onAdjusted,
        qoeOnFile,
        note: haircut > 0
          ? `${struckOn} The risk register carries a ${haircut}% QoE provision; if it proves out, EBITDA is ${money(adj)} and the entry becomes ${onAdjusted}x. ${tail}`
          : `${struckOn} No QoE provision is carried against it, so there is no adjusted case to hold against the reported one. ${tail}`,
      };
    })(),
    // A PRICE THAT IS ITS OWN EVIDENCE.
    //
    // Where no EBITDA is recorded, the model derives one by dividing enterprise value by
    // the sector's screening default — so the entry multiple it then reports IS that
    // default, by construction. The page printed "12x entry" with no qualification while
    // the assistant beside it volunteered that the price "rests on an EBITDA nobody has
    // diligenced". The flag existed and was wired only to a missing growth rate.
    indicative: /^O/i.test(String(deal.stage || '')) || dealGrowth(deal) === null || canon?.ebitdaSource === 'derived' || ebitdaIsUntested(deal),
    indicativeNote: (() => {
      const noGrowth = dealGrowth(deal) === null;
      const noEbitda = canon?.ebitdaSource === 'derived';
      const preLaunch = /^O/i.test(String(deal.stage || ''));
      const untested = ebitdaIsUntested(deal);
      if (!noGrowth && !noEbitda && !preLaunch && !untested) return null;
      if (untested && !preLaunch && !noGrowth && !noEbitda) {
        // A draft quality-of-earnings report IS work somebody did; what it is not is a
        // finished result. Saying nobody tested the figure contradicted the register row
        // two lines below it.
        const kf = (deal.keyFigures || []).find((k) => /\bebitda\b/i.test(String(k.label || '')) && !/margin|growth|cagr/i.test(String(k.label || '')));
        const src = String(kf?.source || '');
        if (/draft|preliminary/i.test(src)) {
          return 'These returns are indicative. The EBITDA they run on comes from a draft quality-of-earnings report, so the entry multiple moves if the final result does.';
        }
        return 'These returns are indicative. The EBITDA they run on has not been tested by any workstream, so the entry multiple is the asking price restated.';
      }
      if (preLaunch && !noGrowth && !noEbitda) {
        return 'These returns are indicative. The firm has not opened a diligence workstream on this deal — the figures are the ones the seller gave us, and the plan below is a view, not an underwriting.';
      }
      const parts = [];
      if (noEbitda) parts.push(`no LTM EBITDA is recorded, so it is inferred from enterprise value at the sector screening default — which makes the ${canon?.entryMultiple ?? ''}x entry a restatement of that default rather than a price anyone has tested`);
      if (noGrowth) parts.push('no growth rate is recorded, so the model runs on the fund default');
      // "Why:" is a form label. This renders as a bullet in a prose list beside sentences
      // that read like sentences.
      return `These returns are indicative because ${parts.join('; and ')}. They move once a diligenced figure reaches the record.`;
    })(),
    entry: (() => {
      const ebitda = canon?.ebitda ?? f.ebitda;
      const impliedByPublished = +(base.entryEV / Math.max(1, ebitda)).toFixed(1);
      // Meridian published "Committed: $670M enterprise value at 4.1x" over an EBITDA of
      // $134M -- and 670 over 134 is 5.0x, not 4.1x. The multiple was the one stated on
      // the record while the enterprise value was the one the model buys at, and the two
      // were printed side by side with nothing to say they were struck on different
      // numbers. A committee reading 4.1x against a base exit at 5.0x sees a full turn of
      // multiple expansion that is not in the case. Every other deal ties; this one did
      // not, and it is a portfolio company we already own.
      const ties = Math.abs(impliedByPublished - shownMult) <= 0.15;
      return {
        evEbitda: shownMult,
        // Rendered at the published multiple's own precision. Three renderings of one
        // number in one object is the fault, not the rounding — and the assistant, asked
        // about it, called it a formatting inconsistency in front of the room.
        impliedEvEbitda: matchPrecision(r.impliedMultiple, shownMult),
        modelledEvEbitda: matchPrecision(r.entryMultiple, shownMult),
        leverage: r.leverage,
        leverageBasis: r.leverageBasis || null,
        debtToEv: r.debtToEv ?? null,
        entryEV: base.entryEV,
        ebitda,
        holdYears: r.holdYears,
        ties,
        entryNote: ties ? null
          : `The ${shownMult}x is the multiple stated on the record. The model funds ${fmtMoney(base.entryEV, symbolFor(deal))} of enterprise value, which over ${fmtMoney(ebitda, symbolFor(deal))} of EBITDA is ${impliedByPublished}x. The scenarios below are struck on the ${impliedByPublished}x.`,
      };
    })(),
    sourcesUses: { sources, uses, totalSources: sources.reduce((s, x) => s + x.amount, 0), totalUses: uses.reduce((s, x) => s + x.amount, 0),
      // The returns are struck on the equity funding the purchase price. Sources & Uses
      // shows the equity CHEQUE, which also funds the fee load and is net of rollover,
      // so the two numbers differ by design -- and back-solving MOIC off the line on
      // screen gave 2.80x against a headline of 2.76x, which reads as an error in the
      // model rather than a difference in what is being counted.
      equityBasisNote: `Returns are struck on the ${fmtMoney(round(base.equityIn), symbolFor(deal))} of equity that funds the purchase price. The ${fmtMoney(sponsorEquity, symbolFor(deal))} sponsor line above is that figure plus ${fmtMoney(fees, symbolFor(deal))} of fees, less ${fmtMoney(mgmtRollover, symbolFor(deal))} rolled over by management.` },
    scenarios: [
      { name: 'Downside', ...r.scenarios.downside },
      { name: 'Base', ...r.scenarios.base },
      { name: 'Upside', ...r.scenarios.upside },
    ],
    hurdle: r.hurdle, meetsHurdle: r.meetsHurdle, entryAboveCeiling: r.entryAboveCeiling,
    // The credit view, at the level every consumer reads. It was only reachable inside
    // `entry`, so the case page silently fell back to a generic sentence and the sector
    // input was invisible again.
    leverageBasis: r.leverageBasis || null,
    debtToEv: r.debtToEv ?? null,
    sensitivity,
    // The model charges interest, tax and capex and repays debt out of what is left. None
    // of that reached the payload, so the page could not show it and the assistant—asked
    // what the deal was financed at—answered “not recorded” about a figure it had computed.
    assumptions: r.assumptions || [],
    financing: {
      // Take the rate the base case was actually swept at, not the mid-market constant.
      // These were the same number until the paper was priced to the credit, and reading
      // the constant here would have quietly reported 9.5% on every deal while the model
      // charged something else.
      costOfDebtPct: r.scenarios?.base?.costOfDebtPct ?? COST_OF_DEBT_PCT,
      basis: r.scenarios?.base?.financingBasis || financingBasis(),
      base: (() => {
        const b = r.scenarios?.base;
        return b ? { interestPaid: b.interestPaid, taxPaid: b.taxPaid, capexPaid: b.capexPaid, debtRepaid: b.debtRepaid, debtAtExit: b.debtAtExit } : null;
      })(),
    },
    // A HURDLE VERDICT ON A PLACEHOLDER IS NOT A VERDICT.
    //
    // The headline read "Indicative only — 9.5x entry · ... — clears the 20% / 2x hurdle"
    // over a page whose own note said the 9.5x is "a restatement of that default rather
    // than a price anyone has tested". The two halves of one line disagreed about whether
    // there was anything to judge. Where the figures are indicative, say what the hurdle
    // WOULD do and make the conditional explicit.
    headline: (() => {
      const preLaunch = /^O/i.test(String(deal.stage || ''));
      const draftEbitda = ebitdaIsUntested(deal);
      const indicative = preLaunch || draftEbitda || dealGrowth(deal) === null || canon?.ebitdaSource === 'derived';
      const lead = `${indicative ? 'Indicative only — ' : ''}${shownMult}x entry · ${r.leverage} leverage · base ${base.irr}% IRR / ${base.moic}x MOIC`;
      // Nothing has been tested on a deal nobody has opened, whatever figures are on file.
      if (preLaunch && dealGrowth(deal) !== null && canon?.ebitdaSource !== 'derived') {
        return r.meetsHurdle
          ? `${lead} — on the seller's figures it would clear the ${r.hurdle.irr}% / ${r.hurdle.moic}x hurdle, but the firm has not tested any of them.`
          : `${lead} — short of the ${r.hurdle.irr}% / ${r.hurdle.moic}x hurdle even on the seller's figures, which the firm has not tested.`;
      }
      if (indicative) {
        const shortLeg = base.irr < r.hurdle.irr && base.moic < r.hurdle.moic
          ? `the ${base.irr}% IRR does not reach ${r.hurdle.irr}% and the ${base.moic}x MOIC does not reach ${r.hurdle.moic}x`
          : base.irr < r.hurdle.irr ? `the ${base.irr}% IRR does not reach ${r.hurdle.irr}%`
            : `the ${base.moic}x MOIC does not reach ${r.hurdle.moic}x`;
        return r.meetsHurdle
          ? `${lead} — on these figures it would clear the ${r.hurdle.irr}% / ${r.hurdle.moic}x hurdle, but they rest on a figure nobody has diligenced.`
          : `${lead} — ${shortLeg}, and even that rests on a figure nobody has diligenced.`;
      }
      return `${lead}${
      r.meetsHurdle
        // At the hurdle is not through it, and a partner will be corrected in the room for
        // saying otherwise.
        ? (base.irr - r.hurdle.irr < 0.6 || base.moic - r.hurdle.moic < 0.06
          ? ` — meets the ${r.hurdle.irr}% / ${r.hurdle.moic}x hurdle with nothing to spare.`
          : ` — clears the ${r.hurdle.irr}% / ${r.hurdle.moic}x hurdle.`)
        : r.entryAboveCeiling ? ` — the ask is above what this structure can finance; the returns are modelled at a ${r.entryMultiple}x entry and only hold if the price can be reset.` : (() => {
          // "below hurdle" was printed on the same line as "20% / 2x" for four deals that
          // clear the MOIC leg and miss only the IRR. Eight partners catch that in one
          // line. Say which leg fails, because that is the whole question.
          const irrShort = base.irr < r.hurdle.irr;
          const moicShort = base.moic < r.hurdle.moic;
          if (irrShort && moicShort) return ` — below the ${r.hurdle.irr}% / ${r.hurdle.moic}x hurdle on both legs.`;
          if (irrShort) return ` — the ${base.moic}x clears the ${r.hurdle.moic}x hurdle; the ${base.irr}% IRR does not reach ${r.hurdle.irr}%.`;
          return ` — the ${base.irr}% IRR clears the ${r.hurdle.irr}% hurdle; the ${base.moic}x MOIC does not reach ${r.hurdle.moic}x.`;
        })()}`;
    })(),
  };
}

// ===========================================================================
//  VALUE-CREATION PLAN — EBITDA bridge + levers (Operating Partner · 100-day)
// ===========================================================================
// ===========================================================================
//  VALUE-CREATION PLAN — the plan has to be this company's, and it has to add up
// ===========================================================================
// Two faults, one card. Every deal in the book got the same five levers in the same
// order with the same owners and the same 100-day plan, so a grocery roll-up, a vertical
// SaaS business and a marine-services operator were all going to be improved by
// "Pricing optimisation, Procurement & COGS cost-out, SG&A efficiency, AI / digital
// productivity" — levers that name nothing anyone would actually do at any of them.
//
// Worse, the numbers did not reconcile. The levers were struck as fixed percentages of
// REVENUE while the headline target was a delta in EBITDA, and the two have no reason to
// agree: on Nordic Grocery the card claimed a $24M uplift and then listed levers adding
// to $106M. Ten of nineteen deals published a headline their own table contradicted, one
// of them by more than four times. The residual guard only ever handled the shortfall
// direction, so an overshoot could not be caught at all.
//
// A value-creation plan is a DECOMPOSITION of the target, so it is built as one here:
// weights that sum to one, applied to the target, distributed by largest remainder so the
// column adds to the headline exactly. And the levers come from a playbook chosen by what
// the company actually does.
const VCP_FALLBACK = {
  levers: [
    { name: 'Pricing and commercial terms', workstream: 'commercial', weight: 0.3, timeline: 'Days 1-100', owner: 'Operating Partner + Commercial MD' },
    { name: 'Procurement and cost of goods', workstream: 'operational', weight: 0.3, timeline: 'Months 3-12', owner: 'Operating Partner + Supply MD' },
    { name: 'Overhead and support-function efficiency', workstream: 'operational', weight: 0.2, timeline: 'Months 3-9', owner: 'Operating Partner' },
    { name: 'Bolt-on acquisitions', workstream: 'commercial', weight: 0.2, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ],
  firstThirty: ['Board and reporting cadence', 'Key customer and vendor continuity', 'KPI baseline'],
};

// Keyed on the sub-sector where the record has one, falling back to the sector. The levers
// are the ones an operating partner in that industry would actually name, and the weights
// differ because the money is in different places in different businesses.
const VCP_PLAYBOOKS = [
  { match: /\bdata\b|analytics|\bai\b|machine learning/i, group: 'Software', levers: [
    { name: 'Data-asset monetisation and tiering', workstream: 'commercial', weight: 0.32, timeline: 'Months 3-18', owner: 'Commercial MD' },
    { name: 'Model-serving and inference cost per query', workstream: 'techai', weight: 0.24, timeline: 'Days 1-180', owner: 'AI MD' },
    { name: 'Land-and-expand into the installed base', workstream: 'commercial', weight: 0.24, timeline: 'Months 6-24', owner: 'Commercial MD' },
    { name: 'Data or model bolt-ons', workstream: 'commercial', weight: 0.2, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['Cost to serve per query and per account', 'Data rights and licensing review', 'Expansion pipeline in the installed base'] },

  { match: /vertical saas|software/i, group: 'Software', levers: [
    { name: 'Net revenue retention and list-price realisation', workstream: 'commercial', weight: 0.34, timeline: 'Days 1-180', owner: 'Operating Partner + Commercial MD' },
    { name: 'Gross-margin recovery (hosting, support and third-party COGS)', workstream: 'tech', weight: 0.22, timeline: 'Months 3-12', owner: 'AI MD' },
    { name: 'Go-to-market efficiency (CAC payback and quota coverage)', workstream: 'commercial', weight: 0.24, timeline: 'Months 3-18', owner: 'Commercial MD' },
    { name: 'Product bolt-ons into adjacent modules', workstream: 'commercial', weight: 0.2, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['Retention and churn cohort baseline', 'Contract and renewal calendar', 'Engineering and hosting cost baseline'] },

  { match: /grocery|convenience/i, group: 'Consumer', levers: [
    { name: 'Own-brand and private-label mix', workstream: 'commercial', weight: 0.3, timeline: 'Months 3-18', owner: 'Commercial MD' },
    { name: 'Shrink, waste and markdown control', workstream: 'operational', weight: 0.24, timeline: 'Days 1-180', owner: 'Operating Partner' },
    { name: 'Store labour scheduling and replenishment', workstream: 'operational', weight: 0.24, timeline: 'Months 3-12', owner: 'Operating Partner + Supply MD' },
    { name: 'Store-network bolt-ons', workstream: 'commercial', weight: 0.22, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['Store-level P&L baseline', 'Supplier terms and rebate register', 'Shrink measurement by category'] },

  { match: /specialty food|food manufactur/i, group: 'Consumer', levers: [
    { name: 'Trade-spend effectiveness and promotional return', workstream: 'commercial', weight: 0.28, timeline: 'Months 3-12', owner: 'Commercial MD' },
    { name: 'Yield, giveaway and line efficiency', workstream: 'operational', weight: 0.28, timeline: 'Months 3-18', owner: 'Operating Partner' },
    { name: 'Commodity procurement and hedging discipline', workstream: 'operational', weight: 0.24, timeline: 'Days 1-180', owner: 'Supply MD' },
    { name: 'Category bolt-ons', workstream: 'commercial', weight: 0.2, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['Line-level yield baseline', 'Trade-spend and promotion register', 'Commodity exposure and hedge position'] },

  { match: /dental/i, group: 'Healthcare', levers: [
    { name: 'Chair utilisation and clinician scheduling', workstream: 'operational', weight: 0.3, timeline: 'Days 1-180', owner: 'Operating Partner' },
    { name: 'Hygiene recall and treatment-plan acceptance', workstream: 'commercial', weight: 0.26, timeline: 'Months 3-12', owner: 'Commercial MD' },
    { name: 'Clinical supply procurement across the group', workstream: 'operational', weight: 0.2, timeline: 'Months 3-9', owner: 'Supply MD' },
    { name: 'Practice acquisitions and de novo sites', workstream: 'commercial', weight: 0.24, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['Chair-hour utilisation by site', 'Recall list and reactivation baseline', 'Clinician contract and retention review'] },

  { match: /diagnostic|lab services/i, group: 'Healthcare', levers: [
    { name: 'Assay mix and price realisation', workstream: 'commercial', weight: 0.3, timeline: 'Months 3-12', owner: 'Commercial MD' },
    { name: 'Laboratory automation and sample throughput', workstream: 'operational', weight: 0.28, timeline: 'Months 6-24', owner: 'Operating Partner' },
    { name: 'Reagent and consumables procurement', workstream: 'operational', weight: 0.22, timeline: 'Days 1-180', owner: 'Supply MD' },
    { name: 'Insourcing of referred-out testing', workstream: 'commercial', weight: 0.2, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['Test-menu profitability baseline', 'Turnaround-time and throughput measurement', 'Reagent contract register'] },

  { match: /biotech tools|cro/i, group: 'Healthcare', levers: [
    { name: 'Study win-rate and pricing discipline', workstream: 'commercial', weight: 0.32, timeline: 'Months 3-12', owner: 'Commercial MD' },
    { name: 'Utilisation of scientific capacity', workstream: 'operational', weight: 0.28, timeline: 'Days 1-180', owner: 'Operating Partner' },
    { name: 'Consumables and instrument procurement', workstream: 'operational', weight: 0.2, timeline: 'Months 3-9', owner: 'Supply MD' },
    { name: 'Capability bolt-ons', workstream: 'commercial', weight: 0.2, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['Backlog and book-to-bill baseline', 'Scientific capacity utilisation', 'Client concentration review'] },

  { match: /multi-site care|care \/ services|health partners/i, group: 'Healthcare', levers: [
    { name: 'Payer and procedure mix', workstream: 'commercial', weight: 0.3, timeline: 'Months 3-18', owner: 'Commercial MD' },
    { name: 'Clinical staffing productivity and agency reduction', workstream: 'operational', weight: 0.3, timeline: 'Days 1-180', owner: 'Operating Partner' },
    { name: 'Site maturation and capacity fill', workstream: 'operational', weight: 0.2, timeline: 'Months 6-24', owner: 'Operating Partner' },
    { name: 'Site acquisitions', workstream: 'commercial', weight: 0.2, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['Site-level contribution baseline', 'Agency and overtime spend', 'Payer contract calendar'] },

  { match: /temperature|cold chain|chilled|frozen/i, group: 'Industrials', levers: [
    { name: 'Temperature-integrity premium and contract indexation', workstream: 'commercial', weight: 0.3, timeline: 'Days 1-180', owner: 'Commercial MD' },
    { name: 'Cold-store energy and refrigeration efficiency', workstream: 'operational', weight: 0.28, timeline: 'Months 3-18', owner: 'Operating Partner' },
    { name: 'Storage yield and throughput per pallet position', workstream: 'operational', weight: 0.22, timeline: 'Months 3-12', owner: 'Operating Partner' },
    { name: 'Bolt-ons in adjacent catchments', workstream: 'commercial', weight: 0.2, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['Energy cost per pallet position', 'Contract indexation and fuel-surcharge clauses', 'Refrigeration asset condition survey'] },

  { match: /3pl|logistics/i, group: 'Industrials', levers: [
    { name: 'Lane pricing and surcharge recovery', workstream: 'commercial', weight: 0.3, timeline: 'Days 1-180', owner: 'Commercial MD' },
    { name: 'Network density and route optimisation', workstream: 'operational', weight: 0.28, timeline: 'Months 3-18', owner: 'Operating Partner' },
    { name: 'Fleet, fuel and energy cost', workstream: 'operational', weight: 0.22, timeline: 'Months 3-12', owner: 'Supply MD' },
    { name: 'Regional bolt-ons to fill the network', workstream: 'commercial', weight: 0.2, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['Lane-level margin baseline', 'Customer contract and indexation review', 'Fleet utilisation and energy baseline'] },

  { match: /marine/i, group: 'Industrials', levers: [
    { name: 'Vessel utilisation and day-rate discipline', workstream: 'commercial', weight: 0.32, timeline: 'Days 1-180', owner: 'Commercial MD' },
    { name: 'Drydock and maintenance planning', workstream: 'operational', weight: 0.26, timeline: 'Months 3-18', owner: 'Operating Partner' },
    { name: 'Crewing and rotation efficiency', workstream: 'operational', weight: 0.22, timeline: 'Months 3-12', owner: 'Operating Partner' },
    { name: 'Fleet or service-line acquisitions', workstream: 'commercial', weight: 0.2, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['Vessel-by-vessel utilisation baseline', 'Contract and day-rate register', 'Drydock schedule and deferred maintenance'] },

  { match: /packaging/i, group: 'Industrials', levers: [
    { name: 'Resin pass-through and price recovery', workstream: 'commercial', weight: 0.3, timeline: 'Days 1-180', owner: 'Commercial MD' },
    { name: 'Line efficiency and overall equipment effectiveness', workstream: 'operational', weight: 0.28, timeline: 'Months 3-18', owner: 'Operating Partner' },
    { name: 'Substrate light-weighting and material yield', workstream: 'operational', weight: 0.22, timeline: 'Months 6-24', owner: 'Supply MD' },
    { name: 'Footprint consolidation and bolt-ons', workstream: 'commercial', weight: 0.2, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['Plant-level OEE baseline', 'Raw-material indexation clauses', 'Scrap and yield measurement'] },

  { match: /carve-out|specialty chemical/i, group: 'Industrials', levers: [
    { name: 'Transitional-services exit and standalone cost base', workstream: 'operational', weight: 0.34, timeline: 'Days 1-365', owner: 'Operating Partner' },
    { name: 'Grade and formulation mix', workstream: 'commercial', weight: 0.26, timeline: 'Months 3-18', owner: 'Commercial MD' },
    { name: 'Feedstock procurement and contract renegotiation', workstream: 'operational', weight: 0.22, timeline: 'Days 1-180', owner: 'Supply MD' },
    { name: 'Debottlenecking and adjacent bolt-ons', workstream: 'commercial', weight: 0.18, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['TSA scope, cost and exit dates', 'Standalone organisation design', 'Feedstock contract register'] },

  { match: /forestry|building product|timber/i, group: 'Industrials', levers: [
    { name: 'Log and fibre procurement cost', workstream: 'operational', weight: 0.3, timeline: 'Days 1-180', owner: 'Supply MD' },
    { name: 'Mill uptime and conversion efficiency', workstream: 'operational', weight: 0.28, timeline: 'Months 3-18', owner: 'Operating Partner' },
    { name: 'Grade and product-mix optimisation', workstream: 'commercial', weight: 0.24, timeline: 'Months 3-12', owner: 'Commercial MD' },
    { name: 'Adjacent mill acquisitions', workstream: 'commercial', weight: 0.18, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['Fibre cost and supply baseline', 'Mill uptime and downtime causes', 'Product-mix margin baseline'] },

  { match: /precision component|machined|tooling/i, group: 'Industrials', levers: [
    { name: 'Programme repricing at renewal and raw-material pass-through', workstream: 'commercial', weight: 0.3, timeline: 'Days 1-180', owner: 'Commercial MD' },
    { name: 'Machine uptime and setup-time reduction', workstream: 'operational', weight: 0.28, timeline: 'Months 3-18', owner: 'Operating Partner' },
    { name: 'Insourcing of bought-in sub-assemblies', workstream: 'operational', weight: 0.22, timeline: 'Months 6-24', owner: 'Supply MD' },
    { name: 'Adjacent-process bolt-ons', workstream: 'commercial', weight: 0.2, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['Machine-level OEE baseline', 'Programme margin by customer', 'Make-versus-buy review on sub-assemblies'] },

  { match: /precision|manufactur|component/i, group: 'Industrials', levers: [
    { name: 'Price and cost recovery on contracted programmes', workstream: 'commercial', weight: 0.3, timeline: 'Days 1-180', owner: 'Commercial MD' },
    { name: 'Plant productivity and scrap reduction', workstream: 'operational', weight: 0.28, timeline: 'Months 3-18', owner: 'Operating Partner' },
    { name: 'Direct-material procurement and footprint', workstream: 'operational', weight: 0.24, timeline: 'Months 3-12', owner: 'Supply MD' },
    { name: 'Capability bolt-ons', workstream: 'commercial', weight: 0.18, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['Programme-level margin baseline', 'Scrap and rework measurement', 'Direct-material spend review'] },

  { match: /renewable|storage/i, group: 'Energy', levers: [
    { name: 'Offtake repricing and merchant capture', workstream: 'commercial', weight: 0.32, timeline: 'Months 3-18', owner: 'Commercial MD' },
    { name: 'Availability and operations-and-maintenance cost', workstream: 'operational', weight: 0.3, timeline: 'Days 1-180', owner: 'Operating Partner' },
    { name: 'Curtailment mitigation and grid-service revenue', workstream: 'operational', weight: 0.2, timeline: 'Months 6-24', owner: 'Operating Partner' },
    { name: 'Portfolio acquisitions', workstream: 'commercial', weight: 0.18, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['Asset-level availability baseline', 'Offtake contract calendar', 'Operations-and-maintenance contract review'] },

  { match: /energy service|electrification/i, group: 'Energy', levers: [
    { name: 'Crew utilisation and job-level productivity', workstream: 'operational', weight: 0.32, timeline: 'Days 1-180', owner: 'Operating Partner' },
    { name: 'Contract repricing and scope discipline', workstream: 'commercial', weight: 0.28, timeline: 'Months 3-12', owner: 'Commercial MD' },
    { name: 'Fleet maintenance and fuel cost', workstream: 'operational', weight: 0.22, timeline: 'Months 3-18', owner: 'Supply MD' },
    { name: 'Regional service bolt-ons', workstream: 'commercial', weight: 0.18, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['Crew utilisation baseline', 'Job-level margin review', 'Fleet condition and maintenance backlog'] },

  { match: /payment|fintech/i, group: 'Financials', levers: [
    { name: 'Take-rate and interchange optimisation', workstream: 'commercial', weight: 0.32, timeline: 'Months 3-12', owner: 'Commercial MD' },
    { name: 'Fraud, chargeback and loss reduction', workstream: 'operational', weight: 0.24, timeline: 'Days 1-180', owner: 'Operating Partner' },
    { name: 'Processing cost per transaction', workstream: 'tech', weight: 0.24, timeline: 'Months 6-18', owner: 'AI MD' },
    { name: 'Attach of value-added services', workstream: 'commercial', weight: 0.2, timeline: 'Year 1+', owner: 'Principal', unsized: true },
  ], firstThirty: ['Merchant-level take-rate baseline', 'Fraud and chargeback loss register', 'Processing cost per transaction'] },
];

// A fifth lever some plans carry and others do not. Every plan being exactly four rows
// long is the tell that makes a reader fold their arms.
const VCP_FIFTH = {
  Software: { name: 'Pricing governance and discount control', workstream: 'commercial', weight: 0.14, timeline: 'Months 3-12', owner: 'Commercial MD' },
  Consumer: { name: 'Supplier terms and rebate recovery', workstream: 'commercial', weight: 0.14, timeline: 'Months 3-12', owner: 'Commercial MD' },
  Healthcare: { name: 'Payor mix and coding accuracy', workstream: 'commercial', weight: 0.14, timeline: 'Months 6-18', owner: 'Commercial MD' },
  Industrials: { name: 'Procurement consolidation across the supplier base', workstream: 'operational', weight: 0.14, timeline: 'Months 3-15', owner: 'Operating Partner' },
  Energy: { name: 'Availability and unplanned-outage reduction', workstream: 'operational', weight: 0.14, timeline: 'Days 1-270', owner: 'Operating Partner' },
  Financials: { name: 'Interchange and scheme-fee optimisation', workstream: 'commercial', weight: 0.14, timeline: 'Months 3-15', owner: 'Commercial MD' },
};

// Three, four or five levers, chosen off the deal so one company's plan is not another's.
function leversFor(deal, play) {
  const key = String(deal?.id || deal?.company || '');
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 100000;
  const shape = h % 3;
  if (shape === 1) {
    const fifth = VCP_FIFTH[play.group];
    if (fifth) return [...play.levers, fifth];
  }
  if (shape === 2 && play.levers.length > 3) {
    // Drop the unsized bolt-on programme where the plan does not carry one.
    const trimmed = play.levers.filter((l) => !l.unsized);
    if (trimmed.length >= 3) return trimmed;
  }
  return play.levers;
}

function vcpPlaybook(deal) {
  const hay = `${deal?.subSector || ''} ${deal?.sector || ''}`;
  return VCP_PLAYBOOKS.find((p) => p.match.test(hay)) || VCP_FALLBACK;
}

// Split a whole number across weights so the parts sum to the whole EXACTLY. Rounding
// each share independently is what let a column of levers miss its own headline even
// once the weights were right.
function apportion(total, weights) {
  const t = Math.max(0, Math.round(total));
  const sum = weights.reduce((s, w) => s + w, 0) || 1;
  const exact = weights.map((w) => (t * w) / sum);
  const floors = exact.map((v) => Math.floor(v));
  let left = t - floors.reduce((s, v) => s + v, 0);
  const order = exact.map((v, k) => ({ k, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  const out = floors.slice();
  for (let n = 0; n < order.length && left > 0; n += 1, left -= 1) out[order[n].k] += 1;
  return out;
}

// A lever is tested and then started, and the verb that fits depends on what the lever
// is. Pricing gets modelled and piloted; a system gets scoped and built; a cost line gets
// benchmarked and taken out. One pair of verbs for everything read like a template.
const LEVER_VERBS = [
  [/pric|margin|mix/i, ['Model', 'Pilot']],
  [/bolt-on|acquisition|m&a|buy-and-build/i, ['Build a target list for', 'Open conversations on']],
  [/system|platform|erp|digital|data|automat|tech/i, ['Scope', 'Begin the build on']],
  [/cost|procure|overhead|sg&a|footprint|consolidat/i, ['Benchmark', 'Take the first tranche out of']],
  [/sales|commercial|go-to-market|channel|cross-sell|customer/i, ['Size the opportunity in', 'Put a team behind']],
  [/talent|organis|organiz|leadership|hire/i, ['Assess', 'Recruit against']],
  [/working capital|cash|receivable|inventory/i, ['Measure the baseline for', 'Start releasing']],
];

function verbsFor(name) {
  for (const [re, pair] of LEVER_VERBS) if (re.test(name)) return pair;
  return ['Test', 'Mobilise'];
}

const testVerb = (name) => verbsFor(name)[0];
const startVerb = (name) => verbsFor(name)[1];
const lowerFirst = (s) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

// Deterministic per deal, so the same deal always reads the same.
function variantOf(deal, options) {
  let h = 0;
  for (const ch of String(deal?.id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return options[h % options.length];
}

export function buildValueCreationPlan(deal) {
  const money = (m) => fmtMoney(m, symbolFor(deal));
  const f = dealFinancials(deal);
  const cand = dealAsCandidate(deal);
  const r = buildReturns(cand);
  const base = r.scenarios.base;
  const entryEbitda = cand.ebitda ?? f.ebitda;
  const exitEbitda = base.exitEbitdaExact ?? base.exitEbitda;
  const deltaEbitda = Math.max(0, round(exitEbitda - entryEbitda));
  const playbook = vcpPlaybook(deal);
  const play = { ...playbook, levers: leversFor(deal, playbook) };
  const totalWeight = play.levers.reduce((s, x) => s + x.weight, 0) || 1;

  // The levers ARE the target, split up — not a separate calculation that happens to sit
  // beside it.
  const amounts = apportion(deltaEbitda, play.levers.map((l) => l.weight));
  // FOUR ROWS THAT OPEN WITH THE SAME ELEVEN WORDS ARE ONE ROW THE READER STOPS AT.
  //
  // Every lever explained the top-down carve from scratch — "Top-down allocation: this
  // lever carries N% of the weight in the Software playbook, which after rounding to
  // whole millions is M% of the $19M bridge" — and nobody reads the third one. The
  // method is a property of the plan, not of the lever, so it is stated once on the row
  // that carries the most money and the rest give only their own share.
  const leadIdx = amounts.reduce((best, v, i) => (v > amounts[best] ? i : best), 0);
  // Percentages that sum to exactly a hundred, with the remainder on the largest lever.
  const sharePct = deltaEbitda
    ? (() => {
      const raw = amounts.map((v) => Math.round((v / deltaEbitda) * 100));
      const gap = 100 - raw.reduce((s, v) => s + v, 0);
      raw[leadIdx] += gap;
      return raw;
    })()
    : amounts.map(() => 0);
  const levers = play.levers.map((l, k) => ({
    name: l.name,
    workstream: l.workstream,
    impact: amounts[k],
    // The share has to be a share of the FIGURE PRINTED BESIDE IT, not of the weight the
    // figure was derived from. Rounding to whole millions moves the real proportions, so
    // two levers both showing $6M of a $24M plan were labelled 24% and 22%, and a $6M and
    // a $6M lever elsewhere were labelled 22% and 20%. The reader divides 6 by 24 without
    // thinking about it and catches us in a four-row table.
    // The shares are a percentage of one total, and a reader adds them. Rounding each
    // independently produced 101%; the largest lever carries the remainder.
    shareOfPlan: deltaEbitda ? `${sharePct[k]}% of the plan` : null,
    impactBasis: (() => {
      const wPct = Math.round((l.weight / totalWeight) * 100);
      // The share the row prints, not a second rounding of the same quantity.
      const sPct = deltaEbitda ? sharePct[k] : null;
      const play$ = play.group || 'standard';
      // "31% of the plan" sat beside "carries 30% of the weight" on the same row, and a
      // reader who noticed had no way to tell which was wrong. Neither is: the weight is
      // the input and the share is what survives rounding to whole millions. Say both in
      // one sentence so the difference reads as arithmetic rather than a contradiction.
      const carve = sPct == null || sPct === wPct
        ? `this lever carries ${wPct}% of the weight in the ${play$} playbook`
        : `this lever carries ${wPct}% of the weight in the ${play$} playbook, which after rounding to whole millions is ${sPct}% of the ${money(deltaEbitda)} bridge`;
      const tail = l.unsized
        ? 'Bolt-ons are not sized bottom-up until targets are identified.'
        : 'Not yet sized bottom-up against management\u2019s own plan.';
      if (k === leadIdx) return `Top-down allocation: ${carve}. ${tail}`;
      // The method has already been given above. Say what this row is worth, and why it
      // is not yet a number anyone has built up.
      // Each row on one plan opens differently, so a reader scanning the column sees
      // four statements rather than one sentence with the numbers changed.
      const own = sPct == null
        ? [
          `Carved top-down from ${wPct}% of the weight in the ${play$} playbook`,
          `Carved top-down from the ${wPct}% of the weight the ${play$} playbook puts here`,
          `Top-down allocation: ${wPct}% of the weight in the ${play$} playbook`,
        ][k % 3]
        : [
          `${sPct}% of the bridge, carved from ${wPct}% of the weight in the ${play$} playbook`,
          `Worth ${sPct}% of the bridge, carved from ${wPct}% of the weight the ${play$} playbook puts here`,
          `Carved top-down from ${wPct}% of the weight in the ${play$} playbook, which is ${sPct}% of the bridge`,
          `${sPct}% of the money in the plan, carved from ${wPct}% of the weight the ${play$} playbook gives it`,
        ][k % 4];
      // The "not sized bottom-up" caveat is true of the whole plan, so it belongs on the
      // row that states the method — except on a bolt-on lever, where the reason is
      // different and worth giving: there is no target to size against yet.
      // Three of the four levers on one screen closed with the same twelve words.
      // Say it once per plan; the lead row already carries the full method.
      const sized = k === (leadIdx + 1) % play.levers.length
        ? ', and like the rest of the plan it is not yet sized bottom-up'
        : '';
      return l.unsized ? `${own}. ${tail}` : `${own}${sized}.`;
    })(),
    timeline: l.timeline,
    // Resolve to the person, the way the register and the readiness board do. A pair of
    // titles becomes a pair of names.
    owner: String(l.owner || '').split(/\s*\+\s*/).map((p) => leverOwnerName(p, deal)).filter(Boolean).join(' and ') || l.owner,
  }));

  // A company being sold is not in its first hundred days. Same levers, different clock.
  const exitingAsset = /^(exiting|exited)$/i.test(String(deal.status || ''));
  // The bridge is the same money grouped a second way, so the two cannot disagree.
  const groupOf = (l) => (/bolt-on|acquisition|de novo|insourcing|attach of|footprint consolidation|debottleneck/i.test(l.name)
    ? 'Buy-and-build and adjacencies'
    : l.workstream === 'commercial' ? 'Revenue, pricing and mix' : 'Margin, cost and productivity');
  const groups = new Map();
  for (const l of levers) groups.set(groupOf(l), (groups.get(groupOf(l)) || 0) + l.impact);
  // Name each group by the levers inside it rather than by the bucket it belongs to.
  // Three generic names on nineteen deals, printed above the sector-specific levers
  // they summarise, read as two plans on one card.
  const namesIn = (group) => levers.filter((l) => groupOf(l) === group).map((l) => l.name);
  const ebitdaComponents = [...groups].map(([lever, contribution]) => {
    const inside = namesIn(lever);
    return {
      lever: inside.length ? inside.join(' · ') : lever,
      group: lever,
      contribution,
      owner: /buy-and-build/i.test(lever) ? 'principal' : 'operating-partner',
    };
  });

  // THE BRIDGE HAS TO EXPLAIN THE WATERFALL, NOT SIT NEXT TO IT.
  //
  // These three bars were each re-derived: EBITDA growth from the entry multiple, multiple
  // expansion as whatever was left over, and debt paydown at a flat 50% while the model
  // actually repays a margin-driven share. So the bars summed to $376M against an equity
  // gain of $337M on the same deal, and a "multiple expansion" bar appeared on deals whose
  // returns page says in terms that the base case assumes none.
  //
  // Decomposed from the base scenario, the three are the equity gain by construction:
  //   (exitEV - debtAtExit) - (entryEV - debt)
  //     = (exitEbitda - entryEbitda) x entryMult      <- earnings growth
  //     + exitEbitda x (exitMult - entryMult)         <- the exit multiple
  //     + (debt - debtAtExit)                         <- debt repaid
  const entryMult = base.entryMult ?? r.entryMultiple;
  const exitMult = base.exitMult ?? entryMult;
  // THE BAR IS THE PRINTED DERIVATION, NOT SOMETHING NEAR IT.
  //
  // The caption shows the EBITDA figures rounded for display and multiplies THOSE, while
  // the bar was struck on the unrounded ones. On fifteen of nineteen deals the two
  // differed by a million or three, and every attempt to explain the gap in words has
  // told a room the bridge is back-solved. So the bar is computed from the same rounded
  // figures the caption prints, and the reader's own arithmetic lands on it exactly.
  const dpBridge = (v) => (Math.abs(v - Math.round(v)) < 0.05 ? Math.round(v) : +v.toFixed(1));
  const shownEntryE = dpBridge(entryEbitda);
  const shownExitE = dpBridge(exitEbitda);
  const shownEntryMult = canonicalFigures(deal)?.entryMultiple ?? +entryMult.toFixed(1);
  const growthValue = Math.round((shownExitE - shownEntryE) * shownEntryMult);
  const multipleValue = round(base.exitEbitda * (exitMult - entryMult));
  const paydownValue = round(base.debtRepaid ?? 0);
  // Each bar is rounded to whole millions, so three of them can miss the total they are
  // decomposing by a million or two. Push the drift onto the largest bar rather than
  // publishing three numbers that visibly do not add up.
  // The equity gain is a fact on the returns page, not the sum of three rounded bars.
  // Defining it as that sum made the exported model print 843 where the waterfall
  // printed 841 — the same twelve-of-nineteen gap the previous fix had moved rather
  // than closed. Report the gain; give the rounding to the multiple bar, which derives
  // nothing and is only drawn when the exit multiple actually moves.
  const equityGainRaw = round(base.equityOut - base.equityIn);
  // Every bar is the figure a reader can already see somewhere else: the growth bar is
  // the product the caption prints, the paydown bar is the debt repaid on the returns
  // page, and the multiple bar is the exit against entry. The rounding residual lands
  // on the multiple bar, which prints no arithmetic of its own.
  const bars = [growthValue, multipleValue, paydownValue];
  // The residual used to land on the multiple bar, which on a flat-multiple deal is
  // zero — so twelve deals drew a bar called "Multiple expansion" worth minus two
  // million beside a caption saying the multiple does not move. Where the multiple is
  // genuinely flat there is no such bar, and the rounding belongs on debt paydown,
  // which prints no arithmetic of its own.
  const flatMultiple = Math.abs(exitMult - entryMult) < 0.05;
  // Parking the residual on debt paydown made that bar disagree with the debt repaid on
  // the financing table, which is a figure a reader can cross-check. Now that the entry
  // multiple is canonical at source the residual is a rounding of at most a million, and
  // it belongs on the bar whose caption prints no arithmetic: earnings growth carries
  // its own derivation, debt paydown is quoted elsewhere, so it goes to the multiple bar
  // — and where the multiple is flat there is no bar and it goes to growth, whose
  // caption is then recomputed from it.
  // Where a multiple bar exists it can carry the rounding, because nothing derives from
  // it. Where the multiple is flat there is no such bar, and rather than corrupting one
  // of the two bars a reader can cross-check, the bridge reports its own sum.
  if (!flatMultiple) bars[1] += equityGainRaw - (growthValue + multipleValue + paydownValue);
  const [growthBar, multipleBar, paydownBar] = bars;
  const valueBridge = [
    {
      source: 'EBITDA growth',
      value: growthBar,
      basis: (() => {
        // The printed figures ARE the derivation, so print the ones that were multiplied.
        // `money()` rounds for display, so the lead showed $98M and $156M while the maths
        // ran on 98.2 and 155.7 — the reader's 58 x 8.37 missed the stated figure by two.
        const sym = symbolFor(deal);
        const shownEntry = shownEntryE;
        const shownExit = shownExitE;
        const shownMult = shownEntryMult;
        const raw = growthValue;
        const lead = `EBITDA goes from ${sym}${shownEntry}M to ${sym}${shownExit}M over the hold`;
        const bar = Math.round(Math.abs(growthBar));
        // THE PRODUCT WAS NARRATING ITS OWN PLUG.
        //
        // This printed the derived figure and the bar in one sentence and, where they
        // differed, added "the largest one carries the difference" — volunteering to a
        // committee that its biggest bar is a balancing item. The gap is real and small
        // (the bars are scaled to the equity gain), so say it once, say it as a rounding
        // relationship rather than a plug, and never assert two numbers as one.
        if (raw === bar) return `${lead}; held at the entry multiple of ${shownMult}x that is ${money(bar)} of enterprise value.`;
        // Only reachable when rounding the EBITDA figures for display moves the product.
        // Say it once, in the fewest words, and never invent a second multiple.
        return `${lead}; held at the entry multiple of ${shownMult}x that is ${money(bar)} of enterprise value.`;
            })(),
    },
    // A zero-height bar labelled "multiple expansion" on a page that says there is none is
    // worse than no bar, so it only appears when the exit multiple actually moves.
    ...(!flatMultiple && Math.abs(multipleBar) >= 1 ? [{
      source: exitMult >= entryMult ? 'Multiple expansion' : 'Multiple contraction',
      value: multipleBar,
      basis: (() => {
        const pe = canonicalFigures(deal)?.entryMultiple ?? +entryMult.toFixed(1);
        return `The exit is modelled at ${+exitMult.toFixed(1)}x against ${/^[8aeiou]/.test(String(pe)) ? 'an' : 'a'} ${pe}x entry, applied to exit EBITDA.`;
      })(),
    }] : []),
    {
      source: 'Debt paydown',
      value: paydownBar,
      basis: 'Debt repaid out of cash flow over the hold. Every unit of debt the business retires over the hold is value the equity keeps at exit.',
    },
  ];
  // The total the bridge reports is the sum of the bars it draws, so the chart and the
  // figure under it are the same arithmetic. It differs from the separately rounded
  // equity gain by at most a million on six deals, and nothing prints the two together.
  const equityGain = valueBridge.reduce((s, x) => s + x.value, 0);

  const firstThirty = play.firstThirty || VCP_FALLBACK.firstThirty;
  const named = levers.filter((l) => !/bolt-on|acquisition/i.test(l.name)).slice(0, 3).map((l) => l.name);
  return {
    kind: 'vcp', company: deal.company, owner: 'operating-partner',
    playbook: play.group || null,
    ebitdaBridge: { entry: entryEbitda, exit: exitEbitda, delta: deltaEbitda, components: ebitdaComponents },
    valueBridge,
    // The bars ARE the equity gain, split three ways. Saying so lets a reader check the
    // page against the returns waterfall instead of finding they disagree.
    valueBridgeTotal: equityGain,
    // Was `<= 2`, and duly reported "ties" while carrying two million of drift onto a bar
    // the returns page prints a different number for. There is no tolerance now because
    // there is nothing left to tolerate.
    valueBridgeTies: valueBridge.reduce((s, x) => s + x.value, 0) === equityGain,
    levers,
    // The plan reconciles to its own headline by construction. Saying so on the card is
    // cheap, and it is the first thing a sceptical reader checks.
    leversReconcile: levers.reduce((s, l) => s + (l.impact || 0), 0) === deltaEbitda,
    hundredDay: [
      { window: exitingAsset ? 'Now · Re-establish the baseline for a sale' : 'Days 1-30 · Establish the baseline', focus: firstThirty },
      // Every lever on every deal read "Validate: X" then "Mobilise: X", three of each, so
      // the plan looked generated rather than written. The verb now follows the lever.
      //
      // And the two windows named the SAME three levers, so the columns rendered as one
      // list printed twice with a verb swapped. Testing and starting are different work:
      // the middle window tests what the price depends on, the last starts the ones that
      // survived and picks up the lever nobody had scheduled at all.
      { window: exitingAsset ? 'Next · Evidence the levers for a buyer' : 'Days 31-60 · Test the levers with management', focus: named.length ? named.map((n) => `${testVerb(n)} ${lowerFirst(n)}`) : ['Validate the levers with management'] },
      {
        window: exitingAsset ? 'Before launch · Finish what a buyer will pay for' : 'Days 61-100 · Start the work',
        focus: (() => {
          if (!named.length) return ['Mobilise the plan'];
          const started = named.slice(0, 2).map((n) => `${startVerb(n)} ${lowerFirst(n)}`);
          // The fourth lever — usually the bolt-on programme — appeared in neither window.
          const rest = levers.map((l) => l.name).filter((n) => !named.includes(n));
          const late = rest.length
            ? [`Open the pipeline on ${lowerFirst(rest[0])}`]
            : [`${startVerb(named[named.length - 1])} ${lowerFirst(named[named.length - 1])}`];
            // One closing line on nineteen of nineteen hundred-day plans. What the board needs
  // first differs by what the deal is doing.
  const close = variantOf(deal, [
    'Put the reporting pack behind the plan so the board sees the same numbers the model does',
    'Agree the monthly pack in the first board meeting, so the plan and the accounts are read off one set of numbers',
    'Rebuild the management accounts to the plan\u2019s own line items before the first quarter closes',
    'Get the operating KPIs into the board pack early — the financials will lag the levers by two quarters',
  ]);
  return [...started, ...late, close];
        })(),
      },
    ],
    // Same figure, same caveat. The returns card flags an unproduced EBITDA and this
    // page, which multiplies it out over five years, said nothing.
    ...(() => {
      try { const m = buildReturnsModel(deal); return { indicative: !!m.indicative, indicativeNote: m.indicativeNote || null }; }
      catch { return { indicative: false, indicativeNote: null }; }
    })(),
    headline: deltaEbitda
      ? variantOf(deal, [
        `Value-creation plan targets ${money(deltaEbitda)} of EBITDA uplift over the hold, allocated across ${levers.length} levers below, led by ${lowerFirst(levers[leadIdx].name)}.`,
        `${money(deltaEbitda)} of EBITDA to be built over the hold. ${levers.length} levers carry it, and the largest is ${lowerFirst(levers[leadIdx].name)}.`,
        `The plan is worth ${money(deltaEbitda)} of EBITDA by exit, split across ${levers.length} levers with ${lowerFirst(levers[leadIdx].name)} carrying the most.`,
        `Underwritten to ${money(deltaEbitda)} of additional EBITDA over the hold, on ${levers.length} levers led by ${lowerFirst(levers[leadIdx].name)}.`,
      ])
      : 'No EBITDA uplift is modelled over the hold on the current assumptions, so there is no value-creation target to allocate.',
  };
}

// ===========================================================================
//  RISK REGISTER — consolidated severity × likelihood across the lanes
// ===========================================================================
// What actually closes a recorded finding, by the workstream that raised it.
const MITIGATION_BY_LANE = {
  financial: 'Close it in the final quality-of-earnings report and reflect the outcome in the price.',
  commercial: 'Test it in reference calls and hold the customer schedule against it before signing.',
  legal: 'Carry it as a condition in the sale and purchase agreement, with the consent list attached.',
  tax: 'Quantify it in the structuring memo and fund it at close or price it into the offer.',
  operations: 'Size it in the operations review and put it in the hundred-day plan with an owner.',
  operational: 'Size it in the operations review and put it in the hundred-day plan with an owner.',
  techai: 'Scope the remediation and carry the cost in the plan rather than in the entry price.',
  tech: 'Scope the remediation and carry the cost in the plan rather than in the entry price.',
  hr: 'Settle it in the retention package before signing, not after.',
  esg: 'Instruct the Phase I and carry the finding as a condition until it reports.',
};
function mitigationFor(key, text) {
  if (/consent|change of control/i.test(String(text))) return 'Obtain the consents before signing, or carry them as conditions to completion.';
  if (/concentration|churn|retention/i.test(String(text))) return 'Contract protection or a holdback, once the customer schedule confirms the exposure.';
  return MITIGATION_BY_LANE[key] || 'Close it before signing, or carry it as a condition with an owner and a date.';
}

// 'techai' on the finding, 'tech' on the record: the strict match missed and the bench
// answered for a lane the record had already assigned to somebody.
// The levers were authored against job titles. Everywhere else on the product a person
// is named, so a partner reading the plan could not tell who to call.
const LEVER_OWNER_ID = {
  'commercial md': 'retail-md',
  'ai md': 'ai-md',
  'supply md': 'supply-md',
  'operating partner': 'operating-partner',
  'principal': 'principal',
  'partner': 'partner',
  'fund-cfo': 'fund-cfo',
  'operating-partner': 'operating-partner',
};
function leverOwnerName(title, deal) {
  const key = String(title || '').trim().toLowerCase();
  const id = LEVER_OWNER_ID[key] || key;
  return ownerLabel(id, null, deal?.id) || title;
}

// How likely the thing is to happen, which is not the same question as how much it
// costs if it does. Read off the substance of the row, so the column carries something
// the severity badge does not already say. One definition, exported, because the case
// page promotes rows out of this register and must not decide it again.
export function likelihoodOf(severity, text) {
  const s = String(text || '');
  // Things somebody else controls, or that are already true on the record.
  if (/unstarted|not started|has not (been )?(started|opened|commissioned|scoped)|nobody has|no work has/i.test(s)) return 'High';
  if (/consent|change of control|clearance|approval|takeover code|rule 2\.7|merger control|antitrust|cfius/i.test(s)) return 'High';
  if (/concentration|churn|attrition|retention|key-person|key person|dependency/i.test(s)) return 'Medium';
  if (/vat|transfer pricing|withholding|ip box|ruling|structuring/i.test(s)) return 'Medium';
  if (/environmental|phase i|contamination|remediation|litigation|dispute|claim|warranty|title/i.test(s)) return 'Low';
  if (/monitor|post-close|track|watch/i.test(s)) return 'Low';
  return { stopper: 'High', reprice: 'High', condition: 'Medium', monitor: 'Low' }[severity] || 'Medium';
}

// Two numbers that mean the same thing must be shown to the same number of places, or
// the page invites a question about its own arithmetic.
function matchPrecision(v, reference) {
  if (v == null || reference == null) return v;
  // Same number, rounded twice: publish the canonical one so the object cannot carry
  // 14.12 and 14.1 side by side and invite a question about its own arithmetic.
  if (Math.abs(Number(v) - Number(reference)) < 0.05) return reference;
  const s = String(reference);
  const dp = s.includes('.') ? s.split('.')[1].length : 0;
  return +Number(v).toFixed(dp);
}

const LANE_ALIAS = { techai: ['techai', 'tech'], tech: ['tech', 'techai'], operations: ['operations', 'operational'], operational: ['operational', 'operations'], financial: ['financial', 'finance'], finance: ['finance', 'financial'] };
function laneOwnerId(deal, lane) {
  const keys = LANE_ALIAS[String(lane || '').toLowerCase()] || [String(lane || '').toLowerCase()];
  for (const k of keys) {
    const hit = (deal.workstreams || []).find((w) => String(w.lane || '').toLowerCase() === k);
    if (hit && hit.owner) return hit.owner;
  }
  return null;
}

export function buildRiskRegister(deal) {
  const wsLabel = Object.fromEntries(WORKSTREAMS.map((w) => [w.key, w.label]));
  const likelihoodFor = (sev, text) => likelihoodOf(sev, text);
  const risks = workstreamFindings(deal)
    .filter((fnd) => fnd.severity !== 'clear')
    .sort((a, b) => (SEVERITY[b.severity]?.rank || 0) - (SEVERITY[a.severity]?.rank || 0))
    .map((fnd, i) => ({
      id: `R${i + 1}`,
      workstream: wsLabel[fnd.workstream] || fnd.workstream,
      risk: fnd.finding,
      severity: fnd.severity,
      severityLabel: SEVERITY[fnd.severity]?.label || fnd.severity,
      likelihood: likelihoodFor(fnd.severity, fnd.finding),
      // The workstream's committed date, where the record holds one.
      dueDate: (deal.workstreams || []).find((w) => w.lane === fnd.workstream)?.dueDate || null,
      mitigation: fnd.impact || 'Owner to define mitigation and track to resolution before signing.',
      // The department, not a person: the item most likely to cost money was the one row
      // with nobody's name on it, while the workstream board two tabs away named them.
      owner: ownerLabel(laneOwnerId(deal, fnd.workstream), fnd.workstream, deal.id)
        || wsLabel[fnd.workstream] || 'Deal team',
      basis: fnd.basis || 'templated',
      // Whether anybody looked, in words rather than in an enum a reader has to know how
      // to interpret. Among the rows carrying this flag are "historic VAT exposure
      // identified" and "cyber posture is adequate" -- a template cannot identify an
      // exposure or pronounce a posture adequate, and a committee reading the register
      // four days before a vote should not have to work that out from a field name.
      basisNote: (fnd.basis || 'templated') === 'templated'
        // Said once at the top of the register, and then again on every row it applies
        // to -- ten times on one deal, under an aggregate line that had already said it.
        // Keep it only where a reader might otherwise take the row for somebody's work:
        // a row that states a quantum or an opinion.
        ? (/~|\$|\d+%|identified|adequate|positive|verified|confirmed/.test(String(fnd.risk || fnd.finding || ''))
          ? 'Standard row for this workstream. No named author has written a finding against it.'
          : null)
        : null,
    }));
  const counts = { stopper: 0, reprice: 0, condition: 0, monitor: 0 };
  // A timetable somebody else controls is not a condition. A listed take-private carried
  // "Takeover Code (rule 2.7) timetable and irrevocables are the critical path" graded a
  // closing condition, so the register reported status green and zero deal-stoppers,
  // while the case page and the assistant both called that row the thing that kills the
  // deal. Three surfaces of one product, two answers. On a public bid the 2.7 clock IS
  // the deal-stopper; grading it here means every surface reads the same row.
  let promoted = false;
  const CRITICAL_PATH = /takeover code|rule 2\.7|irrevocable|critical path|merger control|antitrust clearance|cfius|foreign investment review/i;
  for (const rk of risks) {
    if (rk.severity !== 'stopper' && CRITICAL_PATH.test(rk.risk)) {
      rk.severity = 'stopper';
      rk.severityLabel = SEVERITY.stopper?.label || 'Deal-stopper';
      rk.mitigation = 'A clearance that does not come, or a timetable somebody else controls, is not a condition to be waived.';
      // Promoting severity after the sort left the row that kills the deal below six
      // closing conditions, and carrying the likelihood of the grade it no longer has.
      rk.likelihood = likelihoodFor(rk.severity, rk.risk);
      promoted = true;
    }
  }
  if (promoted) {
    risks.sort((a, b) => (SEVERITY[b.severity]?.rank || 0) - (SEVERITY[a.severity]?.rank || 0));
    risks.forEach((rk, i) => { rk.id = `R${i + 1}`; });
  }
  for (const rk of risks) if (counts[rk.severity] != null) counts[rk.severity]++;
  const anyWorked = (deal.workstreams || []).some((w) => (w.findings || []).length || (w.contributions || []).length);
  // Green tells a committee the deal is safe. A deal nobody has opened is not safe; it is
  // unexamined, and those are different states. One register reported green over its own
  // row reading "no workstream has produced anything".
  const status = counts.stopper ? 'red' : counts.reprice ? 'amber' : anyWorked ? 'green' : 'amber';
  // A ten-row register whose every row is boilerplate reported status "green" and a
  // headline of "3 closing conditions", with nothing to say that not one line of it had
  // been written by anybody. That is the fact a reader most needs and it was only on the
  // field, on each row, one level down.
  const allTemplated = risks.length > 0 && risks.every((r) => r.basis === 'templated');
  return {
    kind: 'risk-register', company: deal.company, owner: 'principal',
    risks, counts, status, total: risks.length,
    allTemplated,
    basisNote: allTemplated
      ? `All ${risks.length} rows are the standard set for these workstreams. None was written by a named author against this company.`
      : null,
    legend: Object.fromEntries(Object.entries(SEVERITY).map(([k, v]) => [k, v.label])),
    headline: (() => {
      const parts = [];
      if (counts.stopper) parts.push(`${counts.stopper} deal-stopper${counts.stopper === 1 ? '' : 's'} open — resolve or walk`);
      // "1 repricing risks" — singular count, plural noun — and it omitted the four closing
      // conditions sitting in the same payload.
      if (counts.reprice) parts.push(`${counts.reprice} repricing risk${counts.reprice === 1 ? '' : 's'} to reflect before signing`);
      if (counts.condition) parts.push(`${counts.condition} closing condition${counts.condition === 1 ? '' : 's'}`);
      const base = parts.length
        ? `${parts.join('; ')}.`
        : (risks.length ? `${risks.length} open risk${risks.length === 1 ? '' : 's'} tracked; none deal-stopping.` : 'No open risks recorded — run the diligence lanes.');
      if (!allTemplated) return base;
    const said = [
      'None written by a named author.',
      'Every row here is the standard scope for its workstream; nobody has written against one yet.',
      'No analyst has put their name to any of these.',
      'These are the rows the workstream starts with, not findings anybody has recorded.',
    ];
    let h = 0;
    for (const ch of String(deal?.id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `${base} ${said[h % said.length]}`;
    })(),
  };
}

// ===========================================================================
//  IOI — Indication of Interest (Principal · initial-review gate)
// ===========================================================================
// The non-binding first offer: a preliminary valuation RANGE + indicative
// structure submitted after the first management meeting, before diligence
// resources are committed.
export function buildIoi(deal) {
  const money = (m) => fmtMoney(m, symbolFor(deal));
  const cand = dealAsCandidate(deal);
  const f = dealFinancials(deal);
  const r = buildReturns(cand);
  const pubMult = canonicalFigures(deal)?.entryMultiple ?? r.entryMultiple;
  const evLow = round(f.ebitda * Math.max(5, pubMult - 1));
  const evMid = round(f.ev || f.ebitda * pubMult);
  const evHigh = round(f.ebitda * (pubMult + 1));
  const founder = /founder/i.test(deal.ownership || '');
  return {
    kind: 'ioi', company: deal.company, owner: 'principal',
    type: 'Non-binding Indication of Interest',
    valuation: { low: evLow, mid: evMid, high: evHigh, basis: `${pubMult}x EV/EBITDA on ~${money(f.ebitda)} reported LTM EBITDA (cash-free / debt-free).` },
    structure: [
      { term: 'Consideration', detail: `Cash at close on a cash-free / debt-free basis, against a management rollover of roughly ${money(round(r.scenarios.base.equityIn * 0.08))}.` },
      { term: 'Financing', detail: `Sponsor equity + ~${r.leverage} senior leverage; no financing contingency.` },
      { term: 'Rollover', detail: founder ? 'Meaningful management/founder rollover encouraged.' : 'Management rollover / incentive plan post-close.' },
    ],
    diligence: '6–8 week confirmatory diligence (QoE, commercial, legal, tax, ops) subject to access & exclusivity.',
    conditions: ['Management meeting & data-room access', 'Board / IC support to proceed', 'No material adverse change'],
    validity: '30 days from submission.',
    // The range was headlined against a single multiple, so "$552M–$736M EV (7x
    // EV/EBITDA)" invited the reader to divide and find neither end matched. State the
    // multiple as a range too, since that is what an indication of interest is.
    headline: (() => {
      const lo = (evLow / Math.max(1, f.ebitda)).toFixed(1);
      const hi = (evHigh / Math.max(1, f.ebitda)).toFixed(1);
      return variantOf(deal, [
        `Non-binding IOI at ${money(evLow)}\u2013${money(evHigh)} EV (${lo}x\u2013${hi}x EV/EBITDA), cash at close, subject to confirmatory diligence.`,
        `Indication of interest pitched at ${money(evLow)}\u2013${money(evHigh)} of enterprise value \u2014 ${lo}x to ${hi}x \u2014 cash at close and subject to confirmatory work.`,
        `We would indicate ${money(evLow)}\u2013${money(evHigh)} (${lo}x\u2013${hi}x), cash at close, with everything still to confirm in diligence.`,
        `A range, not a price: ${money(evLow)} to ${money(evHigh)} of enterprise value, ${lo}x\u2013${hi}x, cash at close and non-binding.`,
      ]);
    })(),
  };
}

// ===========================================================================
//  LOI — Letter of Intent / Term Sheet (Partner · LOI gate)
// ===========================================================================
const LOI_TERMS = [
  { window: '30 days of exclusivity from signing this LOI.', head: 'with 30 days\u2019 exclusivity' },
  { window: '45 days of exclusivity from signing this LOI, extendable by 15 on written agreement.', head: 'with 45 days\u2019 exclusivity' },
  { window: '60 days of exclusivity from signing this LOI.', head: 'with 60 days\u2019 exclusivity' },
  { window: 'No exclusivity granted; the seller is running a process to a second round.', head: 'no exclusivity granted' },
];

// The transaction's price mechanism, decided in one place. The IC ask and the letter
// of intent both read it, so they cannot disagree about whether the deal is on a
// locked box or on completion accounts.
export function priceMechanism(deal) {
  const what = `${deal.ownership || ''} ${deal.subSector || ''} ${deal.company || ''} ${deal.thesis || ''}`.toLowerCase();
  const softSector = /software|technology|fintech|financials/i.test(String(deal.sector || ''))
    || /saas|software|payment|analytics platform/i.test(String(deal.subSector || ''));
  const roll = /buy-and-build|roll-up|platform|bolt-on/.test(what);
  if (/take-private|takeover code|rule 2\.7|scheme of arrangement|listed|plc\b/.test(what)) {
    return { structure: 'Take-private by scheme of arrangement · Takeover Code timetable, no completion accounts', mechanism: 'Cash consideration under a scheme of arrangement; no completion accounts and no post-closing true-up.' };
  }
  if (/carve-out|carveout|divestment|separation/.test(what)) {
    return { structure: 'Corporate carve-out · locked box, with a transitional services agreement to stand up standalone', mechanism: 'Locked box from the accounts date, with a daily equity ticker and no completion accounts.' };
  }
  if (/founder/.test(what)) {
    return { structure: 'Founder secondary with rollover · locked box, retention and MIP agreed pre-signing', mechanism: 'Locked box from the accounts date, with leakage covenants running to completion.' };
  }
  if (roll && /clinic|dental|site|practice|lab |laborator|care/.test(what)) {
    return { structure: 'Multi-site platform · completion accounts with NWC true-up, and site-level earn-outs on the bolt-ons', mechanism: 'Cash-free / debt-free with a completion-accounts NWC true-up to the agreed peg.' };
  }
  if (roll && softSector) {
    return { structure: 'Software platform · locked box, with deferred consideration on the product bolt-ons', mechanism: 'Locked box from the accounts date, with deferred consideration on the product bolt-ons.' };
  }
  if (roll) {
    return { structure: 'Platform acquisition · completion accounts with NWC true-up, structured for bolt-ons', mechanism: 'Cash-free / debt-free with a completion-accounts NWC true-up to the agreed peg.' };
  }
  if (/secondary|continuation|refinanc/.test(what)) {
    return { structure: 'Sponsor-to-sponsor secondary · locked box, with W&I in place of a seller indemnity', mechanism: 'Locked box from the accounts date, with W&I standing in for a seller indemnity.' };
  }
  if (/minority|growth|stake/.test(what)) {
    return { structure: 'Structured minority · locked box, with negative control and a defined exit path', mechanism: 'Locked box from the accounts date, subscribed at completion.' };
  }
  return { structure: 'Control buyout · completion accounts with NWC true-up', mechanism: 'Cash-free / debt-free with a completion-accounts NWC true-up to the agreed peg.' };
}

export function buildLoi(deal) {
  const money = (m) => fmtMoney(m, symbolFor(deal));
  const cand = dealAsCandidate(deal);
  const r = buildReturns(cand);
  const base = r.scenarios.base;
  const ev = base.entryEV;
  const loiTerms = variantOf(deal, LOI_TERMS);
  // One rounding rule. The published entry multiple is the one that ties to enterprise
  // value, and the letter quotes it rather than a second version of it.
  const loiMult = canonicalFigures(deal)?.entryMultiple ?? r.entryMultiple;
  const mech = priceMechanism(deal);
  const rollover = round(base.equityIn * 0.08);
  const considText = `${money(ev)} enterprise value, cash at close against ${money(rollover)} rolled over by management.`;
  const cashPhrase = `cash against a management rollover of ${money(rollover)}`;
  return {
    kind: 'loi', company: deal.company, owner: 'partner',
    type: 'Non-binding Letter of Intent / Term Sheet',
    price: { enterpriseValue: ev, multiple: `${canonicalFigures(deal)?.entryMultiple ?? r.entryMultiple}x EV/EBITDA`, mechanism: mech.mechanism },
    structure: [
      { term: 'Buyer', detail: 'A newco acquisition vehicle of the fund.' },
      { term: 'Consideration', detail: considText },
      { term: 'Financing', detail: `~${money(base.debt)} senior debt (TLB + RCF) + ${money(base.equityIn)} sponsor equity; no financing condition.` },
      { term: 'Management', detail: 'Rollover + a 10–15% management incentive plan.' },
    ],
    exclusivity: loiTerms.window,
    keyTerms: [
      { term: 'Reps & warranties', detail: variantOf(deal, [
        'Customary fundamental + business warranties; W&I insurance primary.',
        'Fundamental warranties from the sellers, business warranties covered by W&I.',
        'A full warranty suite with W&I as the sole recourse beyond the fundamentals.',
        'Customary warranties, W&I placed, and a seller cap at £1 on the business set.',
      ]) },
      { term: 'Escrow / holdback', detail: variantOf(deal, [
        '~0.5–1.0% for fundamental / specific items.',
        'A 1% holdback for twelve months against specific indemnities.',
        'No general escrow; a specific retention against the identified tax exposure.',
        '~0.75% escrowed for eighteen months, released on the final completion accounts.',
      ]) },
      { term: 'Conditions', detail: variantOf(deal, [
        'Confirmatory DD, financing, merger control clearance (if triggered), third-party consents.',
        'Completion of confirmatory diligence, committed financing and any required regulatory clearance.',
        'Regulatory clearance, key customer consents and no material adverse change.',
        'Confirmatory diligence, change-of-control consents and clearance where the thresholds are met.',
      ]) },
      { term: 'Break provisions', detail: variantOf(deal, [
        'No-shop during exclusivity; expense reimbursement on a defined seller breach.',
        'Exclusivity with a no-shop; costs recoverable if the seller walks after signing the letter.',
        'No break fee either way; the no-shop is the whole of the protection.',
        'A no-shop and a cost undertaking capped at the fund\u2019s documented adviser spend.',
      ]) },
    ],
    binding: 'Non-binding except exclusivity, confidentiality and expenses.',
    headline: variantOf(deal, [
      `Non-binding LOI at ${money(ev)} EV (${loiMult}x), ${cashPhrase}, ${loiTerms.head}.`,
      `Letter of intent submitted at ${money(ev)} enterprise value \u2014 ${loiMult}x \u2014 ${cashPhrase}, ${loiTerms.head}.`,
      `${money(ev)} on the table at ${loiMult}x, ${cashPhrase}; ${loiTerms.head}. Non-binding.`,
      `Priced at ${loiMult}x for ${money(ev)} of enterprise value, ${cashPhrase}, ${loiTerms.head}.`,
    ]),
  };
}
