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

import { buildReturns, paperLbo } from './screening.js';
import { money as fmtMoney, symbolFor } from './money.js';
import { ownerLabel } from './cockpit.js';

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
  const revenue = num('revenue', round(ev * 1.2));
  const ebitda = num('^\\s*ebitda(?!\\s*(margin|vs|growth|uplift|delta|change))', round(ev * 0.12));
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
export function dealGrowth(deal) {
  if (Number.isFinite(deal?.growth)) return deal.growth;
  const kf = (deal?.keyFigures || []).find((k) => /growth|cagr|nrr/i.test(k.label));
  if (kf) {
    const v = Number(String(kf.value).replace(/[^0-9.]/g, ''));
    // NRR is expressed as 118%, meaning 18% net expansion.
    if (Number.isFinite(v)) return /nrr/i.test(kf.label) && v > 100 ? +(v - 100).toFixed(1) : v;
  }
  return null;
}

// A candidate-shaped object so we can reuse the Stage-1 paper-LBO returns engine.
function dealAsCandidate(deal) {
  const f = dealFinancials(deal);
  return {
    company: deal.company, sector: deal.sector, ownership: deal.ownership || 'private',
    dealSize: f.ev, revenue: f.revenue, ebitda: f.ebitda, ebitdaMargin: f.ebitdaMargin,
    growth: f.growth ?? undefined, keywords: deal.keywords || [], sources: deal.sources || []
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
    const statedMult = (() => {
      const kf = (deal.keyFigures || []).find((k) => /entry multiple|ev\s*\/\s*ebitda/i.test(k.label));
      const v = kf ? Number(String(kf.value).replace(/[^0-9.]/g, '')) : NaN;
      return Number.isFinite(v) && v > 0 ? +v.toFixed(1) : null;
    })();
    const entryMultiple = statedMult ?? (r.impliedMultiple ?? r.entryMultiple);
    // Keep EBITDA consistent with whichever multiple we publish, rather than leaving a
    // derived EBITDA that no longer divides into it.
    const ebitdaRecorded = (deal.keyFigures || []).some((k) => /ebitda(?! margin)/i.test(k.label));
    const ebitda = !ebitdaRecorded && statedMult ? round(f.ev / statedMult) : f.ebitda;
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
export function figuresBlock(deal) {
  const c = canonicalFigures(deal);
  if (!c) return '';
  const m = (n) => fmtMoney(round(n), c.currency);
  return [
    'AUTHORITATIVE FIGURES — these are the deal\'s own numbers, as shown on its Returns, plan & risk page.',
    'Quote them exactly. Do not recalculate, adjust, round differently, or convert the currency.',
    `Entry multiple: ${c.entryMultiple}x EV/EBITDA. Leverage: ${c.leverage}. Hold: ${c.holdYears} years.`,
    c.entryAboveCeiling
      ? `The ask at ${c.entryMultiple}x is above what this structure can finance; the returns below are modelled at a ${c.modelledEntryMultiple}x entry and only hold if the price can be reset. Say so whenever you quote them.`
      : null,
    `Base case: ${c.irr}% IRR, ${c.moic}x MOIC.`,
    // Revenue is only stated when the record actually holds it. Where it does not, the
    // model was handed a placeholder of 1.2x enterprise value under the words "the deal's
    // own numbers" -- and it duly told a partner "Revenue: $288M", then, asked where that
    // came from, produced a verbatim quotation of a page that has never shown it.
    c.revenueRecorded
      ? `LTM EBITDA: ${m(c.ebitda)}. Revenue: ${m(c.revenue)}. Enterprise value: ${m(c.ev)}.`
      : `LTM EBITDA: ${m(c.ebitda)}. Enterprise value: ${m(c.ev)}. NO REVENUE FIGURE IS RECORDED for this company — do not state one, do not estimate one, and if asked say it is not on the record.`,
    `Reporting currency: ${c.currencyCode}. Where a diligence document states a figure in another currency, keep that document's currency and say which document it came from.`,
  ].join('\n');
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
  const PROTECTED = /\b(downside|upside|hurdle|range|target|between|from|scenario|sensitivit|at exit|threshold)\b/i;
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
  { key: 'financial', label: 'Financial / Quality of Earnings', adviser: 'Big-4 QoE (Deloitte / PwC / EY / KPMG)', scope: 'Normalise EBITDA, validate addbacks, revenue quality, NWC peg, net-debt items.', priorityBase: 5 },
  { key: 'commercial', label: 'Commercial DD', adviser: 'Strategy consultant (Bain / BCG / L.E.K. / OC&C)', scope: 'Market size & growth, competitive position, customer concentration, voice-of-customer, pricing.', priorityBase: 5 },
  { key: 'legal', label: 'Legal DD', adviser: 'Deal counsel (Kirkland / Goodwin / DLA Piper)', scope: 'Corporate, material contracts, change-of-control, litigation, IP, employment, regulatory.', priorityBase: 4 },
  { key: 'tax', label: 'Tax DD & structuring', adviser: 'Tax adviser (Big-4 / RSM)', scope: 'Income + non-income taxes (sales/use, employment), NOLs, exposures, acquisition structure.', priorityBase: 3 },
  { key: 'operational', label: 'Operational DD', adviser: 'Ops specialist (AlixPartners / A&M)', scope: 'Supply chain, procurement, manufacturing footprint, operational KPIs, cost-out.', priorityBase: 3 },
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
export function reconcileFindingText(text, deal) {
  const s = String(text || '');
  if (!/entry multiple/i.test(s)) return s;
  let entry = null;
  try { entry = canonicalFigures(deal)?.entryMultiple ?? null; } catch { entry = null; }
  if (entry == null) return s;
  return s.replace(/moves the entry multiple from\s*([\d.]+)x\s*to\s*([\d.]+)x/gi, (m, from, to) => {
    const a = Number(from);
    const b = Number(to);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return m;
    if (Math.abs(a - entry) < 0.05) return m;
    const delta = Math.abs(b - a).toFixed(1);
    return `would raise the entry multiple by roughly ${delta}x against the ${entry}x on the returns page`;
  });
}

function workstreamFindings(deal) {
  const f = dealFinancials(deal);
  // Currency-aware money so figures match the deal's reporting currency
  // (e.g. a £ deal never reads "$131M" in its red-flag report).
  const money = (m) => fmtMoney(m, symbolFor(deal));
  const out = [];
  const add = (workstream, severity, finding, impact, basis = 'templated') => out.push({ workstream, severity, finding, impact, basis });
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
  const haircut = f.ebitdaMargin < 10 ? 18 : f.ebitdaMargin < 15 ? 12 : 6;
  const adjEbitda = round(f.ebitda * (1 - haircut / 100));
  const entryOnReported = +(f.ev / Math.max(1, f.ebitda)).toFixed(1);
  const entryOnAdjusted = +(f.ev / Math.max(1, adjEbitda)).toFixed(1);
  if (decided) {
    add('financial', 'clear',
      `QoE completed. Unsupported add-backs and owner-comp normalisation were removed before the figures were fixed, so ${money(f.ebitda)} is the adjusted EBITDA the entry multiple and leverage are struck on.`,
      'Settled — carried into the SPA completion mechanism.', 'templated');
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
    add('financial', haircut >= 15 ? 'reprice' : 'condition',
      // The number an IC member reaches for and could never find: what the price becomes
      // if the provision proves out. Stating the allowance and not its consequence left
      // the entry multiple quoted on an EBITDA the same page says is overstated.
      `Allowance carried for QoE normalisation: ${haircut}% of EBITDA (${money(f.ebitda)} → ${money(adjEbitda)}), covering unsupported add-backs and owner-comp normalisation. This is the modelled provision, not a QoE result. If it proves out, the ${entryOnReported}x entry becomes ${entryOnAdjusted}x on the adjusted figure.${qoeFinding ? ` The financial workstream has already recorded one specific driver: ${String(qoeFinding.text).replace(/\s+$/, '')} That figure is quoted in the currency of the document it came from and is one component of the allowance above, not a second view of it.` : ''}`,
      haircut >= 15 ? `Repricing lever — reset entry EV against ${money(adjEbitda)} adjusted EBITDA.` : 'Reflected in the model and the SPA net-working-capital peg.');
  }
  add('financial', 'condition', `Net-working-capital peg set at ~${money(round(f.revenue * 0.12))} from a 12–24 month seasonality analysis.`, 'Becomes the SPA true-up mechanism at close.');

  // Commercial — customer concentration is the classic binary risk.
  //
  // This read "~31% of revenue" on an analytics platform, a grocery group, a timber
  // business and an energy-services company, in the same words, in the same position. A
  // room comparing two deals sees the same register twice and stops believing either.
  // Vary it off the deal's own record: a 3.1M-member grocery chain is not concentrated
  // the way a four-account enterprise software business is.
  const concBase = f.ebitdaMargin > 15 ? 22 : 31;
  const conc = Math.max(8, Math.min(46, concBase + (seedOf(`${deal.id}:conc`) % 13) - 6));
  add('commercial', conc >= 30 ? 'reprice' : 'monitor',
    `Top-customer concentration ~${conc}% of revenue${conc >= 30 ? ' without a long-term contract — a binary revenue risk.' : ' — within tolerance but monitored.'}`,
    conc >= 30 ? 'Mitigated via contract protection or an escrow/holdback.' : 'Track post-close; diversify in the 100-day plan.');
  // No voice-of-customer programme has been run. Asserting twenty calls that did not
  // happen, and citing them into the memo synthesis, is the fastest way to lose a
  // practitioner permanently.
  add('commercial', 'monitor', `Voice-of-customer work has not been commissioned yet — the growth thesis for ${deal.sector} rests on the CIM and desk research until it is.`, 'Commission reference calls before the pack is finalised.');

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
  const pick = (key, options) => options[seedOf(`${deal.id}:${key}`) % options.length];

  // Legal — contracts change-of-control.
  if (laneStarted('legal')) {
    add('legal', 'condition', `Change-of-control consents required on ${pick('legalConsents', ['2–3', 'four', 'a handful of', 'two'])} material customer/supplier contracts.`, 'Listed as conditions precedent in the SPA.');
    add('legal', 'clear', 'No material undisclosed litigation or government investigation identified.', 'Clean — no legal deal-stopper.');
  } else {
    add('legal', decided ? 'monitor' : 'condition', 'Legal diligence has not started, so there is no basis on the record for an opinion on litigation, title or change-of-control consents.', 'Instruct counsel; consents on material contracts are usually the long pole.');
  }

  // Tax.
  if (laneStarted('tax')) {
    add('tax', 'monitor', `${pick('tax', ['VAT and transfer-pricing', 'Transfer-pricing', 'Indirect-tax and withholding', 'Historic VAT'])} exposure identified; quantify and structure as a covered risk.`, 'Backstopped by W&I insurance and addressed in deal structuring.');
  } else {
    add('tax', decided ? 'monitor' : 'condition', 'Tax diligence has not started; no exposure has been quantified either way.', 'Scope the tax review before the pack is finalised.');
  }

  // Operational.
  add('operational', 'monitor', `Cost-out opportunity identified in procurement & footprint (~${money(round(f.revenue * 0.02))} run-rate).`, 'Folded into the value-creation plan.');

  // Tech.
  if (laneStarted('techai')) {
    add('tech', 'monitor', pick('tech', [
      'Manageable tech debt; core systems scale to the growth plan. Cyber posture adequate with gaps to close.',
      'Core platform scales to the plan; the integration layer carries most of the debt and the cyber gaps are the closeable kind.',
      'Tech debt concentrated in reporting and billing rather than the product itself; cyber posture is adequate.',
    ]), 'Addressed by the post-close IT roadmap in the 100-day plan.');
  } else {
    add('tech', decided ? 'monitor' : 'condition', 'Technology diligence has not started; neither the scalability of the platform nor the cyber posture has been examined.', 'Scope a technical review — this lane sets the 100-day IT roadmap.');
  }

  // HR / management. There is no people workstream on this record, so the register can
  // note the dependency but must not report referencing that nobody commissioned.
  const founderLed = deal.ownership && /founder/i.test(deal.ownership);
  add('hr', founderLed ? 'condition' : 'monitor',
    founderLed
      ? `Key-person dependency on the founder/CEO, who holds ${pick('hrFounder', ['the customer relationships', 'the technical roadmap', 'the supplier relationships', 'most of the institutional knowledge'])}. No structured management referencing has been commissioned.`
      : pick('hr', [
        'The management team has not been referenced and the second layer below the CEO has not been assessed.',
        `No structured referencing has been commissioned, so the depth of the ${deal.sector || 'sector'} team below the CEO is unknown.`,
        'Succession below the CEO is undocumented on the record, and no management referencing has been commissioned.',
        'Retention terms for the senior team are not on the record, and no referencing has been commissioned.',
      ]),
    'Commission references, and address the dependency via retention and management-incentive (MIP) structuring pre-close.');

  // ESG / environmental.
  //
  // A Phase I environmental assessment that nobody commissioned cannot identify anything,
  // and citing ASTM E1527-21 and CERCLA safe harbour over it dressed an absence of work
  // as a clean result. The reverse is also wrong: printing "no Phase I has been
  // commissioned" on a deal whose ESG lane reads COMPLETE contradicts its own board.
  if (laneStarted('esg')) {
    add('esg', 'monitor', pick('esg', [
      'Environmental review complete; no recognised environmental condition was identified at any operating site.',
      'Environmental review complete. Site conditions are within tolerance; the reporting obligations are the part that needs work.',
      'Environmental review complete; the gaps are in ESG data collection rather than in site condition.',
    ]), 'Carried into the 100-day plan as a reporting workstream.');
  } else {
    add('esg', decided ? 'monitor' : 'condition', 'No Phase I environmental assessment has been commissioned. Until one is, there is no basis on the record for a clean environmental opinion.', 'Commission a Phase I ESA; a Phase II follows only if it identifies a recognised condition.');
  }

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
    execSummary: `${deal.company} — final IC recommendation: ${recommendation}. A ${money(f.ev)} ${deal.sector.toLowerCase()} buyout at ~${returns.entryMultiple}x LTM EBITDA. Base case ${returns.scenarios.base.moic}x / ${returns.scenarios.base.irr}% IRR over a ${returns.holdYears}-year hold. ${fr.headline}`,
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
      exitMultiple: `${returns.entryMultiple}x (no multiple expansion assumed in base)`
    },
    ask: fr.counts.stopper
      ? 'No authorization sought — recommend declining or restructuring around the deal-stopper.'
      : `Authorize up to ${money(round(returns.scenarios.base.entryEV))} EV at ${returns.entryMultiple}x reported LTM EBITDA, a ${money(equityCheck)} equity check from the fund, and committed debt at ~${returns.leverage} leverage.`,
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
      { term: 'Purchase price', detail: `${money(ev)} enterprise value at ${returns.entryMultiple}x reported LTM EBITDA (cash-free / debt-free).` },
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
  // The sponsor equity check funds the fee load too, so sources balance uses
  // (EV + fees). Rollover is a portion of the sponsor's own equity.
  const sponsorEquity = Math.max(0, base.equityIn + fees - mgmtRollover);
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
  const cagrRows = [g - 0.03, g, g + 0.03];
  const exitCols = [entryMult - 1, entryMult, entryMult + 1];
  const sensitivity = {
    rowLabel: 'EBITDA CAGR', colLabel: 'Exit EV/EBITDA',
    cols: exitCols.map((m) => `${m.toFixed(1)}x`),
    rows: cagrRows.map((cg) => ({
      cagr: `${(cg * 100).toFixed(0)}%`,
      irr: exitCols.map((xm) => paperLbo(cand, { entryMult, leverageMult: lev, ebitdaCagr: cg, exitMult: xm }).irr),
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
      const haircut = f.ebitdaMargin < 10 ? 18 : f.ebitdaMargin < 15 ? 12 : 6;
      const adj = round(f.ebitda * (1 - haircut / 100));
      const onAdjusted = +(f.ev / Math.max(1, adj)).toFixed(1);
      return {
        haircutPct: haircut,
        adjustedEbitda: adj,
        entryOnAdjusted: onAdjusted,
        note: `These returns are struck on reported LTM EBITDA. The risk register carries a ${haircut}% QoE provision; if it proves out, EBITDA is ${money(adj)} and the entry becomes ${onAdjusted}x. No QoE work has been commissioned yet.`,
      };
    })(),
    indicative: dealGrowth(deal) === null,
    indicativeNote: dealGrowth(deal) === null
      ? 'Indicative only: no growth rate is recorded for this company, so the model runs on the fund default. Every deal without a growth rate returns these same figures — treat them as a placeholder until one is on the record.'
      : null,
    entry: { evEbitda: shownMult, impliedEvEbitda: r.impliedMultiple, modelledEvEbitda: r.entryMultiple, leverage: r.leverage, entryEV: base.entryEV, ebitda: canon?.ebitda ?? f.ebitda, holdYears: r.holdYears },
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
    sensitivity,
    headline: `${shownMult}x entry · ${r.leverage} leverage · base ${base.irr}% IRR / ${base.moic}x MOIC${
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
        })()}`,
  };
}

// ===========================================================================
//  VALUE-CREATION PLAN — EBITDA bridge + levers (Operating Partner · 100-day)
// ===========================================================================
export function buildValueCreationPlan(deal) {
  const money = (m) => fmtMoney(m, symbolFor(deal));
  const f = dealFinancials(deal);
  const cand = dealAsCandidate(deal);
  const r = buildReturns(cand);
  const base = r.scenarios.base;
  const entryEbitda = f.ebitda;
  const exitEbitda = base.exitEbitda;
  const deltaEbitda = Math.max(0, exitEbitda - entryEbitda);
  const ebitdaComponents = [
    { lever: 'Organic revenue growth', contribution: round(deltaEbitda * 0.45), owner: 'operating-partner' },
    { lever: 'Margin expansion (pricing + cost-out)', contribution: round(deltaEbitda * 0.30), owner: 'operating-partner' },
    { lever: 'Buy-and-build / bolt-ons', contribution: round(deltaEbitda * 0.25), owner: 'principal' },
  ];
  const sizedLevers = [
    { name: 'Pricing optimisation', workstream: 'commercial', impact: round(f.revenue * 0.015), timeline: 'Days 1–100', owner: 'Operating Partner + Commercial MD' },
    { name: 'Procurement & COGS cost-out', workstream: 'operational', impact: round(f.revenue * 0.02), timeline: 'Months 3–12', owner: 'Operating Partner + Supply MD' },
    { name: 'SG&A efficiency', workstream: 'operational', impact: round(f.revenue * 0.01), timeline: 'Months 3–9', owner: 'Operating Partner' },
    { name: 'AI / digital productivity', workstream: 'tech', impact: round(f.revenue * 0.01), timeline: 'Months 6–18', owner: 'AI MD' },
  ];
  // The card headlines "$92M → $129M (+$37M)" and then lists levers adding to $22M with
  // buy-and-build showing nothing at all, so the plan appeared to be $15M short of its
  // own target with no explanation. Bolt-ons genuinely are not sized at this stage --
  // they depend on which targets are available -- so the line carries the residual and
  // says outright that it is a residual rather than a bottom-up number.
  const leverResidual = round(Math.max(0, deltaEbitda - sizedLevers.reduce((s, l) => s + (l.impact || 0), 0)));
  const levers = [
    ...sizedLevers,
    { name: 'Buy-and-build platform', workstream: 'commercial', impact: leverResidual || null,
      impactBasis: leverResidual ? 'Residual to plan — not yet sized bottom-up' : null,
      timeline: 'Year 1+', owner: 'Principal' },
  ];
  const valueBridge = [
    { source: 'EBITDA growth', value: round((exitEbitda - entryEbitda) * r.entryMultiple) },
    { source: 'Multiple expansion', value: Math.max(0, round(base.exitEV - base.exitEbitda * r.entryMultiple)) },
    { source: 'Debt paydown', value: round(base.debt * 0.5) },
  ];
  return {
    kind: 'vcp', company: deal.company, owner: 'operating-partner',
    ebitdaBridge: { entry: entryEbitda, exit: exitEbitda, delta: deltaEbitda, components: ebitdaComponents },
    valueBridge,
    levers,
    hundredDay: [
      { window: 'Days 1–30 · Stabilize', focus: ['Board & reporting cadence', 'Key customer/vendor continuity', 'KPI baseline'] },
      { window: 'Days 31–60 · Diagnose', focus: ['Validate levers with management', 'Finalize org & key hires', 'IT/systems roadmap'] },
      { window: 'Days 61–100 · Execute', focus: ['Launch procurement/cost-out', 'Commercial growth workstream', 'Open the bolt-on pipeline'] },
    ],
    headline: `Value-creation plan targets ${money(deltaEbitda)} EBITDA uplift over the hold via pricing, cost-out, AI and buy-and-build.`,
  };
}

// ===========================================================================
//  RISK REGISTER — consolidated severity × likelihood across the lanes
// ===========================================================================
export function buildRiskRegister(deal) {
  const wsLabel = Object.fromEntries(WORKSTREAMS.map((w) => [w.key, w.label]));
  const likelihoodFor = (sev) => ({ stopper: 'High', reprice: 'High', condition: 'Medium', monitor: 'Low' }[sev] || 'Medium');
  const risks = workstreamFindings(deal)
    .filter((fnd) => fnd.severity !== 'clear')
    .sort((a, b) => (SEVERITY[b.severity]?.rank || 0) - (SEVERITY[a.severity]?.rank || 0))
    .map((fnd, i) => ({
      id: `R${i + 1}`,
      workstream: wsLabel[fnd.workstream] || fnd.workstream,
      risk: fnd.finding,
      severity: fnd.severity,
      severityLabel: SEVERITY[fnd.severity]?.label || fnd.severity,
      likelihood: likelihoodFor(fnd.severity),
      mitigation: fnd.impact || 'Owner to define mitigation and track to resolution before signing.',
      // The department, not a person: the item most likely to cost money was the one row
      // with nobody's name on it, while the workstream board two tabs away named them.
      owner: ownerLabel(null, fnd.workstream) || wsLabel[fnd.workstream] || 'Deal team',
      basis: fnd.basis || 'templated',
    }));
  const counts = { stopper: 0, reprice: 0, condition: 0, monitor: 0 };
  for (const rk of risks) if (counts[rk.severity] != null) counts[rk.severity]++;
  const status = counts.stopper ? 'red' : counts.reprice ? 'amber' : 'green';
  return {
    kind: 'risk-register', company: deal.company, owner: 'principal',
    risks, counts, status, total: risks.length,
    legend: Object.fromEntries(Object.entries(SEVERITY).map(([k, v]) => [k, v.label])),
    headline: (() => {
      const parts = [];
      if (counts.stopper) parts.push(`${counts.stopper} deal-stopper${counts.stopper === 1 ? '' : 's'} open — resolve or walk`);
      // "1 repricing risks" — singular count, plural noun — and it omitted the four closing
      // conditions sitting in the same payload.
      if (counts.reprice) parts.push(`${counts.reprice} repricing risk${counts.reprice === 1 ? '' : 's'} to reflect before signing`);
      if (counts.condition) parts.push(`${counts.condition} closing condition${counts.condition === 1 ? '' : 's'}`);
      if (!parts.length) return risks.length ? `${risks.length} open risk${risks.length === 1 ? '' : 's'} tracked; none deal-stopping.` : 'No open risks recorded — run the diligence lanes.';
      return `${parts.join('; ')}.`;
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
  const evLow = round(f.ebitda * Math.max(5, r.entryMultiple - 1));
  const evMid = round(f.ebitda * r.entryMultiple);
  const evHigh = round(f.ebitda * (r.entryMultiple + 1));
  const founder = /founder/i.test(deal.ownership || '');
  return {
    kind: 'ioi', company: deal.company, owner: 'principal',
    type: 'Non-binding Indication of Interest',
    valuation: { low: evLow, mid: evMid, high: evHigh, basis: `${r.entryMultiple}x EV/EBITDA on ~${money(f.ebitda)} reported LTM EBITDA (cash-free / debt-free).` },
    structure: [
      { term: 'Consideration', detail: 'All-cash on a cash-free / debt-free basis with a normalised NWC peg.' },
      { term: 'Financing', detail: `Sponsor equity + ~${r.leverage} senior leverage; no financing contingency.` },
      { term: 'Rollover', detail: founder ? 'Meaningful management/founder rollover encouraged.' : 'Management rollover / incentive plan post-close.' },
    ],
    diligence: '6–8 week confirmatory diligence (QoE, commercial, legal, tax, ops) subject to access & exclusivity.',
    conditions: ['Management meeting & data-room access', 'Board / IC support to proceed', 'No material adverse change'],
    validity: '30 days from submission.',
    // The range was headlined against a single multiple, so "$552M–$736M EV (7x
    // EV/EBITDA)" invited the reader to divide and find neither end matched. State the
    // multiple as a range too, since that is what an indication of interest is.
    headline: `Non-binding IOI at ${money(evLow)}–${money(evHigh)} EV (${(evLow / Math.max(1, f.ebitda)).toFixed(1)}x–${(evHigh / Math.max(1, f.ebitda)).toFixed(1)}x EV/EBITDA), all-cash, subject to confirmatory diligence.`,
  };
}

// ===========================================================================
//  LOI — Letter of Intent / Term Sheet (Partner · LOI gate)
// ===========================================================================
export function buildLoi(deal) {
  const money = (m) => fmtMoney(m, symbolFor(deal));
  const cand = dealAsCandidate(deal);
  const r = buildReturns(cand);
  const base = r.scenarios.base;
  const ev = base.entryEV;
  return {
    kind: 'loi', company: deal.company, owner: 'partner',
    type: 'Non-binding Letter of Intent / Term Sheet',
    price: { enterpriseValue: ev, multiple: `${r.entryMultiple}x EV/EBITDA`, mechanism: 'Cash-free / debt-free with a completion-accounts NWC true-up to the agreed peg.' },
    structure: [
      { term: 'Buyer', detail: 'A newco acquisition vehicle of the fund.' },
      { term: 'Consideration', detail: `${money(ev)} enterprise value, all-cash at close.` },
      { term: 'Financing', detail: `~${money(base.debt)} senior debt (TLB + RCF) + ${money(base.equityIn)} sponsor equity; no financing condition.` },
      { term: 'Management', detail: 'Rollover + a 10–15% management incentive plan.' },
    ],
    exclusivity: '45–60 days of exclusivity from signing this LOI.',
    keyTerms: [
      { term: 'Reps & warranties', detail: 'Customary fundamental + business warranties; W&I insurance primary.' },
      { term: 'Escrow / holdback', detail: '~0.5–1.0% for fundamental / specific items.' },
      { term: 'Conditions', detail: 'Confirmatory DD, financing, merger control clearance (if triggered), third-party consents.' },
      { term: 'Break provisions', detail: 'No-shop during exclusivity; expense reimbursement on a defined seller breach.' },
    ],
    binding: 'Non-binding except exclusivity, confidentiality and expenses.',
    headline: `Non-binding LOI at ${money(ev)} EV (${r.entryMultiple}x), all-cash, with 45–60 days' exclusivity.`,
  };
}
