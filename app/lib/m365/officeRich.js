// Enriched Office document builders for The Deal Room — institutional-grade IC memo
// (Word), deal & LBO/returns models (Excel) and IC deck (PowerPoint), all built from
// the LIVE deal record PLUS the decision artifacts (returns, value-creation, risk
// register, IC readiness). Supersedes the lean builders in office.js: denser content,
// full financial + diligence + value-creation + IC-decision sections, so the output is
// presentation-ready with only minor tweaks.
//
// The niche/live variants (web-query live model, HTML/CSV sources) are re-exported
// from office.js unchanged.

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  Header, Footer, PageNumber, VerticalAlign, TabStopType,
} from 'docx';
import ExcelJS from 'exceljs';
import { renderPptx } from './pptx.js';
import { buildLiveModelXlsx, buildModelHtml, buildModelCsv, OFFICE_MIME } from './office.js';
import { getDocTemplate } from '../accessConfig.js';

export { buildLiveModelXlsx, buildModelHtml, buildModelCsv, OFFICE_MIME };

// ---- formatting helpers -----------------------------------------------------
const CURSYM = { USD: '$', EUR: '€', GBP: '£' };
const money = (deal) => {
  const sym = CURSYM[deal?.currency] || (deal?.currency ? `${deal.currency} ` : '$');
  const n = Number(deal?.dealSize);
  return Number.isFinite(n) ? `${sym}${n}M` : '—';
};
const pct = (n) => (Number.isFinite(Number(n)) ? `${Number(n)}%` : '—');
const dash = (v) => (v === 0 || v ? String(v) : '—');
const m$ = (v) => (Number.isFinite(Number(v)) ? `$${Number(v)}M` : '—');
const x$ = (v) => (Number.isFinite(Number(v)) ? `${Number(v)}x` : '—');
const p$ = (v) => (Number.isFinite(Number(v)) ? `${Number(v)}%` : '—');
// Prettify raw persona / role slugs (e.g. 'retail-md', 'operating-partner') into readable
// role labels; values that already read as names/titles are left untouched.
const ROLE_LABELS = {
  partner: 'Deal Partner', analyst: 'Deal Analyst', principal: 'Principal', vp: 'Vice President',
  'operating-partner': 'Operating Partner', 'commercial-md': 'Commercial MD',
  'retail-md': 'Sector MD', 'finance-md': 'Finance MD', 'legal-md': 'Legal MD',
  'tax-md': 'Tax MD', 'ai-md': 'AI MD', 'supply-md': 'Supply Chain MD', 'esg-md': 'ESG MD',
};
const ROLE_ABBR = new Set(['MD', 'AI', 'ESG', 'IT', 'HR', 'VP', 'IC', 'DD', 'QOE', 'ERP', 'CEO', 'CFO', 'CTO', 'COO', 'CIO', 'CMO', 'GC', 'GP', 'LP']);
function prettyRole(v) {
  if (v == null || v === '') return '—';
  const s = String(v).trim();
  const key = s.toLowerCase();
  if (ROLE_LABELS[key]) return ROLE_LABELS[key];
  // Already a human label (contains a space or an internal capital) — leave as-is.
  if (/\s/.test(s) || /[A-Z]/.test(s)) return s;
  return s.split(/[-_]+/).filter(Boolean)
    .map((w) => (ROLE_ABBR.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
// Word-aware clip with an ellipsis, so tight deck cells read as intentional summaries
// rather than mid-word truncations.
const clip = (s, n) => {
  const t = String(s ?? '').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n); const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s.,;:—–-]+$/, '') + '…';
};
// Normalize workstream keys to one consistent label set across every document, so the
// two internal taxonomies (e.g. 'tech'/'techai', 'operational'/'operations') never read
// inconsistently in the memo, models and deck.
const WS_LABELS = {
  financial: 'Financial', finance: 'Financial',
  commercial: 'Commercial',
  legal: 'Legal',
  tax: 'Tax',
  operational: 'Operations', operations: 'Operations', ops: 'Operations',
  tech: 'Technology / AI', techai: 'Technology / AI', 'tech-ai': 'Technology / AI', technology: 'Technology / AI',
  hr: 'HR / Management', management: 'HR / Management', people: 'HR / Management',
  esg: 'ESG',
};
function prettyWorkstream(v) {
  if (v == null || v === '') return '—';
  const s = String(v).trim();
  const key = s.toLowerCase();
  if (WS_LABELS[key]) return WS_LABELS[key];
  // Already a human label (contains a space or an internal capital) — leave as-is.
  if (/\s/.test(s) || /[A-Z]/.test(s)) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// Normalize status tokens (e.g. 'in_progress') to readable labels.
function prettyStatus(v) {
  if (v == null || v === '') return 'In progress';
  const s = String(v).trim().replace(/[_-]+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const dateStr = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
};

// ---- palette (INK/ACCENT are white-labelable via the template config) -------
const DEFAULT_INK = '1F3864', DEFAULT_ACCENT = '2E74B5';
const DEFAULT_BRAND = 'The Deal Room', DEFAULT_CONF = 'CONFIDENTIAL', DEFAULT_EYEBROW = 'INVESTMENT COMMITTEE MEMORANDUM';
const DEFAULT_DISCLAIMER = 'This memorandum is generated from the live deal record, drawing on the returns model, value-creation plan, risk register and IC-readiness assessment. Figures reflect the state of diligence at generation time and are provided for committee discussion on a strictly confidential basis.';
const DEFAULT_SECTIONS = Object.freeze({ merits: true, financials: true, valuation: true, valueCreation: true, findings: true });

let INK = DEFAULT_INK, ACCENT = DEFAULT_ACCENT;
const MUTE = '6B7280', LINE = 'D9DEE7', BAND = 'EEF2F7';
let BRAND = DEFAULT_BRAND, FOOTER_CONF = DEFAULT_CONF, EYEBROW = DEFAULT_EYEBROW;
let DISCLAIMER = DEFAULT_DISCLAIMER;
let SECTIONS = { ...DEFAULT_SECTIONS };
// Resolve branding from the single, platform-wide admin template on EVERY build.
// Idempotent by design: it always RESETS to defaults first and then applies the
// template, so brand state can never drift or leak from a prior render. Safe under
// concurrency because (a) getDocTemplate() is a single platform-wide config, not a
// per-firm/per-deal value, and (b) each builder resolves branding and then constructs
// the whole document synchronously — completing before any await — so two in-flight
// builds cannot interleave and observe each other's brand state.
function applyBrand() {
  let t; try { t = getDocTemplate(); } catch { t = null; }
  t = t || {};
  INK = t.inkColor || DEFAULT_INK; ACCENT = t.accentColor || DEFAULT_ACCENT;
  XNAVY = 'FF' + INK; XACC = 'FF' + ACCENT;
  P_INK = INK; P_ACCENT = ACCENT;
  BRAND = t.fundName || DEFAULT_BRAND; FOOTER_CONF = t.confidentialLabel || DEFAULT_CONF; EYEBROW = t.coverEyebrow || DEFAULT_EYEBROW; DISCLAIMER = t.disclaimer || DEFAULT_DISCLAIMER;
  SECTIONS = { ...DEFAULT_SECTIONS, ...(t.sections || {}) };
}
const GREEN = '0A8A5A', AMBER = 'B26A00', RED = 'B23B3B';
const NOFILL = { style: BorderStyle.NONE };

// ---- shared deal atoms ------------------------------------------------------
function summaryRows(deal, evStr) {
  return [
    ['Company', deal.company || deal.id || '—'],
    ['Sector', [deal.sector, deal.subSector].filter(Boolean).join(' · ') || '—'],
    ['Headquarters', deal.hq || deal.region || '—'],
    ['Enterprise value', evStr || money(deal)],
    ['Stage', [deal.stage, deal.stageName].filter(Boolean).join(' — ') || '—'],
    ['Status', deal.status || '—'],
    ['IC readiness', pct(deal.readiness)],
    ['Target IC date', dateStr(deal.targetICDate || deal.projectedICDate)],
    ['Days to IC', dash(deal.daysToIC)],
    ['Deal lead', prettyRole(deal.leadAnalyst)],
    ['Sponsor', prettyRole(deal.sponsorPersona)],
    ['Diligence progress', pct(deal.diligenceProgress)],
    ['Compliance', `${dash(deal.complianceCleared)} / ${dash(deal.complianceTotal)} cleared`],
    ['IC memo', `${dash(deal.memoProgress)} / ${dash(deal.memoTotal)} sections${deal.memoApproved ? ' · approved' : ''}`],
  ];
}
function recommendationText(readiness) {
  const r = Number(readiness) || 0;
  if (r >= 60) return 'Advance to Investment Committee. Diligence is materially complete; finalise the confirmatory workstreams and circulate the binding proposal ahead of the committee date.';
  if (r >= 25) return 'Continue diligence. Close the open workstreams below and re-assess IC readiness before scheduling the committee.';
  return 'Early diligence. Prioritise the commercial and financial workstreams to establish the core thesis before committing further resource.';
}

// The single, verdict-driven IC ask — used identically across the memo and deck so the
// recommendation never contradicts itself or the readiness verdict.
function askFor(verdict, readiness) {
  const s = (verdict && verdict.state) || '';
  if (s === 'READY') return { title: 'Advance to Investment Committee', ask: 'Approve the investment and authorise proceeding to a binding offer.', word: 'advance to Investment Committee and proceed to a binding offer' };
  if (s === 'CONDITIONAL') return { title: 'Advance subject to conditions', ask: 'Approve advancing to Investment Committee subject to the conditions below.', word: 'advance to Investment Committee subject to the conditions below' };
  if (s === 'NOT-READY') return { title: 'Not yet IC-ready', ask: 'Do not yet schedule IC — close the outstanding items below, then return for approval.', word: 'close the outstanding items below before scheduling committee' };
  const r = Number(readiness) || 0;
  if (r >= 60) return { title: 'Advance to Investment Committee', ask: 'Approve advancing to Investment Committee.', word: 'advance to Investment Committee' };
  if (r >= 25) return { title: 'Continue diligence', ask: 'Approve continued diligence toward IC.', word: 'continue confirmatory diligence' };
  return { title: 'Early diligence', ask: 'Endorse the thesis and resource early diligence.', word: 'progress early-stage diligence' };
}

// Currency symbol for a deal (all monetary figures use ONE symbol per document).
function curSymbol(deal) { return CURSYM[deal && deal.currency] || (deal && deal.currency ? `${deal.currency} ` : '$'); }

// Decision-grade risk framing: when in the deal a risk is resolved, and residual risk
// after the stated mitigation.
function riskTiming(r) {
  const s = (r.severity || '').toLowerCase(), l = (r.severityLabel || '').toLowerCase();
  if (s === 'stopper' || /gat/.test(l)) return 'Gating — pre-IC';
  if (/sign/.test(l)) return 'Signing condition';
  if (s === 'condition' || /clos/.test(l)) return 'Closing condition';
  if (s === 'monitor' || /post|100/.test(l)) return 'Post-close / 100-day';
  return r.severityLabel || 'Monitor';
}
function riskResidual(r) {
  const s = (r.severity || '').toLowerCase();
  if (s === 'stopper') return 'High — unmitigated';
  if (s === 'condition') return 'Low — post-condition';
  if (s === 'monitor') return 'Low — monitored';
  return 'Medium';
}
// Artifacts THIS memorandum itself fulfils — excluded from the "outstanding" list so the
// paper never contradicts itself (it IS the draft IC paper + recommendation).
const MEMO_FULFILS = new Set(['D3', 'memo', 'recommendation']);

// Normalise the four artifacts into convenient locals.
function derive(deal, extras = {}) {
  const { returns = {}, valueCreation = {}, risks = {}, ic = {} } = extras;
  const scen = (n) => (returns.scenarios || []).find((s) => s.name === n) || {};
  return {
    returns, valueCreation, risks, ic,
    base: scen('Base'), up: scen('Upside'), down: scen('Downside'),
    entry: returns.entry || {}, hurdle: returns.hurdle || {},
    bridge: valueCreation.ebitdaBridge || {},
    levers: Array.isArray(valueCreation.levers) ? valueCreation.levers : [],
    hundredDay: Array.isArray(valueCreation.hundredDay) ? valueCreation.hundredDay : [],
    riskItems: Array.isArray(risks.risks) ? risks.risks : [],
    verdict: ic.verdict || {},
    reqItems: (ic.requiredArtifacts && ic.requiredArtifacts.items) || [],
    blocking: ic.blockingWorkstreams || [],
    workstreams: Array.isArray(deal.workstreams) ? deal.workstreams : [],
    figures: Array.isArray(deal.keyFigures) ? deal.keyFigures : [],
  };
}

// =============================================================================
// WORD — Investment Committee Memorandum
// =============================================================================
function rule(color = LINE, size = 6) {
  return new Paragraph({ spacing: { before: 40, after: 140 }, border: { bottom: { color, style: BorderStyle.SINGLE, size, space: 1 } } });
}
function sectionHeading(text) {
  return new Paragraph({ spacing: { before: 260, after: 80 }, keepNext: true, children: [new TextRun({ text, bold: true, color: INK, size: 24 })] });
}
function subHead(text) {
  return new Paragraph({ spacing: { before: 120, after: 50 }, keepNext: true, children: [new TextRun({ text, bold: true, color: ACCENT, size: 19 })] });
}
function body(text, opts = {}) {
  return new Paragraph({ spacing: { after: 110, line: 288 }, children: [new TextRun({ text: String(text), size: 21, color: '2B2B2B', ...opts })] });
}
function bullets(items) {
  return items.filter(Boolean).map((t) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 50, line: 276 }, children: [new TextRun({ text: String(t), size: 21, color: '2B2B2B' })] }));
}
function cellP(text, opts = {}) { return new Paragraph({ children: [new TextRun({ text: text === 0 || text ? String(text) : '—', size: 20, ...opts })] }); }
function cell(children, { w, shade } = {}) {
  return new TableCell({
    width: w ? { size: w, type: WidthType.PERCENTAGE } : undefined,
    shading: shade ? { type: ShadingType.CLEAR, color: 'auto', fill: shade } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 54, bottom: 54, left: 110, right: 110 },
    children: Array.isArray(children) ? children : [children],
  });
}
function kvTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.SINGLE, size: 2, color: LINE }, bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE }, left: NOFILL, right: NOFILL, insideVertical: NOFILL, insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'EDF1F6' } },
    rows: rows.map(([k, v], i) => new TableRow({ children: [
      cell(cellP(k, { bold: true, color: MUTE }), { w: 34, shade: i % 2 ? 'FFFFFF' : 'F8FAFC' }),
      cell(cellP(v, { color: '2B2B2B' }), { w: 66, shade: i % 2 ? 'FFFFFF' : 'F8FAFC' }),
    ] })),
  });
}
function dataTable(headers, rows, widths) {
  const head = new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(cellP(h, { bold: true, color: 'FFFFFF' }), { w: widths?.[i], shade: INK })) });
  const bodyRows = rows.map((r, ri) => new TableRow({ children: r.map((c, i) => cell(cellP(c, i === 0 ? { bold: false } : {}), { w: widths?.[i], shade: ri % 2 ? BAND : 'FFFFFF' })) }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.SINGLE, size: 2, color: LINE }, bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE }, left: NOFILL, right: NOFILL, insideVertical: NOFILL, insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'EDF1F6' } },
    rows: [head, ...bodyRows],
  });
}
function callout(title, text, accent = ACCENT) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: NOFILL, bottom: NOFILL, right: NOFILL, insideHorizontal: NOFILL, insideVertical: NOFILL, left: { style: BorderStyle.SINGLE, size: 18, color: accent } },
    rows: [new TableRow({ children: [cell([
      new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: title, bold: true, color: INK, size: 20 })] }),
      new Paragraph({ children: [new TextRun({ text, size: 21, color: '2B2B2B' })] }),
    ], { shade: BAND })] })],
  });
}

export async function buildIcMemoDocx(deal, extras = {}) {
  applyBrand();
  const company = deal.company || deal.id || 'Deal';
  const subtitle = [deal.sector, deal.subSector, deal.hq || deal.region].filter(Boolean).join('  ·  ');
  const readiness = Number(deal.readiness) || 0;
  const sec = deal.sector || 'target';
  const d = derive(deal, extras);
  const { base, up, down, entry: e, hurdle, bridge, levers, hundredDay, riskItems, verdict, reqItems, blocking, workstreams, figures } = d;
  const R = d.returns;
  const cur = curSymbol(deal);
  const m$ = (v) => (Number.isFinite(Number(v)) ? `${cur}${Number(v)}M` : '—');
  const evStr = e.entryEV != null ? m$(e.entryEV) : money(deal);
  const A = askFor(verdict, readiness);

  const firstSentence = String(deal.thesis || '').split(/(?<=\.)\s/)[0];
  const recWord = A.word;

  const execParas = [
    `${company}${[deal.sector, deal.subSector].filter(Boolean).length ? ` (${[deal.sector, deal.subSector].filter(Boolean).join(', ')})` : ''} is under evaluation for acquisition at an enterprise value of ${evStr}. ${deal.thesis ? firstSentence : `The investment thesis is being finalised from sourcing and diligence findings in the ${sec} sector.`}`,
    base.irr != null
      ? `The base case underwrites ${base.moic}x MOIC / ${base.irr}% IRR over a ${dash(e.holdYears)}-year hold${hurdle.irr ? `, ${R.meetsHurdle ? 'clearing' : 'falling short of'} the fund's ${hurdle.moic}x / ${hurdle.irr}% hurdle` : ''}. The downside case holds at ${down.moic != null ? `${down.moic}x / ${down.irr}%` : '—'} and the upside reaches ${up.moic != null ? `${up.moic}x / ${up.irr}%` : '—'}.`
      : 'Returns are being modelled; entry economics and the financing structure will be confirmed ahead of committee.',
    `Diligence is ${pct(deal.diligenceProgress)} complete across ${workstreams.length || 'the'} workstreams, compliance is ${dash(deal.complianceCleared)}/${dash(deal.complianceTotal)} cleared, and IC readiness stands at ${pct(deal.readiness)}. On the evidence to date the recommendation is to ${recWord}${Number.isFinite(Number(deal.daysToIC)) ? `, targeting committee in ${deal.daysToIC} days` : ''}.`,
  ];

  const decisionRows = [
    ['Recommendation', A.title],
    ['Enterprise value', evStr],
    ['Entry EV / EBITDA', e.evEbitda != null ? `${e.evEbitda}x${e.impliedEvEbitda != null ? ` (implied ${e.impliedEvEbitda}x)` : ''}` : '—'],
    ['Leverage', e.leverage || '—'],
    ['Base case', base.irr != null ? `${base.moic}x MOIC / ${base.irr}% IRR` : '—'],
    ['Hurdle', hurdle.irr ? `${hurdle.moic}x / ${hurdle.irr}% — ${R.meetsHurdle ? 'cleared' : 'not cleared'}` : '—'],
    ['IC readiness', `${pct(deal.readiness)}${verdict.state ? ` · ${verdict.state}` : ''}`],
    ['Target IC date', `${dateStr(deal.targetICDate || deal.projectedICDate)}${Number.isFinite(Number(deal.daysToIC)) ? ` (in ${deal.daysToIC}d)` : ''}`],
  ];

  const merits = [
    deal.thesis ? firstSentence : `Attractive positioning in the ${sec} sector, consistent with the fund mandate.`,
    base.moic != null ? `Base-case returns of ${base.moic}x MOIC / ${base.irr}% IRR${R.meetsHurdle ? ' clear the fund hurdle' : ''}, with the downside protected at ${down.moic != null ? `${down.moic}x` : '—'} MOIC.` : null,
    bridge.exit != null ? `A quantified value-creation path lifting EBITDA from ${m$(bridge.entry)} to ${m$(bridge.exit)} (${bridge.delta != null ? `+${m$(bridge.delta).slice(1)}` : ''}) over the hold.` : null,
    levers.length ? `${levers.length} identified value levers spanning commercial, operational and technology workstreams.` : null,
    `Diligence ${pct(deal.diligenceProgress)} complete with compliance ${dash(deal.complianceCleared)}/${dash(deal.complianceTotal)} cleared.`,
  ].filter(Boolean);

  const riskRows = riskItems.slice(0, 10).map((r) => [r.risk, riskTiming(r), r.likelihood || '—', r.mitigation || '—', riskResidual(r)]);
  const findingsRows = [...riskItems].sort((a, b) => String(a.workstream || '').localeCompare(String(b.workstream || ''))).map((r) => [prettyWorkstream(r.workstream), r.risk, r.mitigation || '—', riskTiming(r)]);
  const modelAdj = riskItems.filter((r) => r.severity === 'condition' || /condition/i.test(r.severityLabel || '')).map((r) => `${r.risk} — reflected in the model and/or SPA (${r.mitigation || 'adjustment'}).`);
  const closingCount = riskItems.filter((r) => r.severity === 'condition').length;
  const monitorCount = riskItems.filter((r) => r.severity === 'monitor').length;
  const outstandingArt = reqItems.filter((a) => !a.complete && !MEMO_FULFILS.has(a.key));
  const figRows = figures.slice(0, 12).map((f) => [f.label || '—', f.value === 0 || f.value ? String(f.value) : '—', f.source || '—', f.confidence || '—']);
  const scenRows = (R.scenarios || []).map((s) => [s.name, m$(s.exitEbitda), m$(s.exitEV), m$(s.equityOut), x$(s.moic), p$(s.irr)]);
  const sens = R.sensitivity;
  const suSrc = (R.sourcesUses && R.sourcesUses.sources) || [], suUse = (R.sourcesUses && R.sourcesUses.uses) || [];
  const suRows = [];
  for (let i = 0; i < Math.max(suSrc.length, suUse.length); i++) suRows.push([suSrc[i]?.label || '', suSrc[i]?.amount != null ? m$(suSrc[i].amount) : '', suUse[i]?.label || '', suUse[i]?.amount != null ? m$(suUse[i].amount) : '']);
  if (R.sourcesUses && (R.sourcesUses.totalSources != null || R.sourcesUses.totalUses != null)) suRows.push(['Total sources', m$(R.sourcesUses.totalSources), 'Total uses', m$(R.sourcesUses.totalUses)]);
  const bridgeRows = (bridge.components || []).map((c) => [c.lever, c.contribution != null ? `+${m$(c.contribution).slice(1)}` : '—', prettyRole(c.owner)]);
  const leverRows = levers.map((l) => [l.name, prettyWorkstream(l.workstream), l.impact != null ? `+${m$(l.impact).slice(1)}` : '—', l.timeline || '—', prettyRole(l.owner)]);
  const wsRows = workstreams.map((w) => [(w.name || w.title || w.lane) ? prettyWorkstream(w.name || w.title || w.lane) : 'Workstream', prettyRole(w.owner || w.md || w.lead), Number.isFinite(Number(w.progress)) ? `${Number(w.progress)}%` : '—', prettyStatus(w.status)]);
  const artRows = reqItems.map((a) => [a.label, a.complete ? '✓ Complete' : '✗ Open', a.detail || '']);
  const conditions = riskItems.filter((r) => r.severity === 'condition' || r.severityLabel === 'Closing condition');

  const businessPara = `${company} operates in the ${sec}${deal.subSector ? ` / ${deal.subSector}` : ''} sector${deal.hq ? `, headquartered in ${deal.hq}` : ''}. ${deal.thesis ? String(deal.thesis).split(/(?<=\.)\s/).slice(1, 3).join(' ') || 'The business, its end markets and revenue model are detailed in the sourcing pack and confirmed through commercial diligence.' : 'The business, its end markets and revenue model are detailed in the sourcing pack and confirmed through commercial diligence.'}`;

  const footer = new Footer({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: 9360 }], border: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE } }, children: [
    new TextRun({ text: `${FOOTER_CONF} · ${company} · Investment Committee Memorandum`, color: MUTE, size: 15 }),
    new TextRun({ text: '\t', size: 15 }),
    new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], color: MUTE, size: 15 }),
  ] })] });
  const header = new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${company} — IC Memorandum · Prepared ${dateStr(new Date())}`, color: MUTE, size: 14 })] })] });

  const children = [
    new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: EYEBROW, bold: true, color: ACCENT, size: 16, characterSpacing: 20 })] }),
    new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: company, bold: true, color: INK, size: 44 })] }),
    subtitle ? new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: subtitle, color: MUTE, size: 20 })] }) : new Paragraph({ text: '' }),
    new Paragraph({ children: [new TextRun({ text: `Prepared ${dateStr(new Date())}  ·  Enterprise value ${evStr}  ·  IC readiness ${pct(deal.readiness)}  ·  ${verdict.state || 'IN DILIGENCE'}`, color: MUTE, italics: true, size: 18 })] }),
    (verdict.state !== 'READY') ? new Paragraph({ spacing: { before: 30, after: 20 }, children: [new TextRun({ text: 'DRAFT — FOR COMMITTEE DISCUSSION. Generated from the live deal record; figures and diligence findings are indicative and pending confirmatory, independently-sourced evidence.', bold: true, color: AMBER, size: 15 })] }) : new Paragraph({ spacing: { after: 0 }, text: '' }),
    rule(ACCENT, 10),

    sectionHeading('1. Executive summary'),
    ...execParas.map((p) => body(p)),
    subHead('Decision metrics'),
    kvTable(decisionRows),

    sectionHeading('2. Transaction overview & rationale'),
    body(`The fund is evaluating the acquisition of ${company} at ${evStr} enterprise value${e.evEbitda != null ? `, equivalent to ${e.evEbitda}x EBITDA` : ''}${e.leverage ? ` and financed with ${e.leverage} leverage` : ''}. ${base.irr != null ? `The transaction is underwritten to a ${base.moic}x / ${base.irr}% base case over ${dash(e.holdYears)} years.` : 'The financing structure and entry economics are being finalised.'} Sponsorship sits with the ${deal.sponsorPersona ? prettyRole(deal.sponsorPersona) : 'deal partner'}; the deal lead is ${deal.leadAnalyst ? prettyRole(deal.leadAnalyst) : 'assigned'}.`),

    sectionHeading('3. Business description'),
    body(businessPara),

    sectionHeading('4. Investment merits'),
    ...(SECTIONS.merits ? bullets(merits) : [body('Investment merits summarised in the executive summary.')]),

    sectionHeading('5. Key risks & mitigants'),
    riskRows.length ? dataTable(['Risk', 'Timing', 'Likelihood', 'Mitigation', 'Residual'], riskRows, [34, 16, 11, 27, 12]) : body('No material risks flagged — diligence findings are clear or pending.'),
    ...(riskRows.length ? [body(`Risk treatment: ${closingCount} item(s) carried as closing conditions in the SPA and ${monitorCount} monitored post-close in the 100-day plan; residual risk after the stated mitigations is assessed low on the conditioned items.`)] : []),

    ...(figRows.length ? [sectionHeading('6. Financial summary'), body('Key figures from diligence and the deal model — each tagged with its source and confidence (high = audited / verified; medium = management- or model-derived):'), dataTable(['Metric', 'Value', 'Source', 'Confidence'], figRows, [38, 22, 24, 16])] : []),

    sectionHeading('7. Valuation & returns'),
    kvTable([
      ['Entry enterprise value', m$(e.entryEV)],
      ['Adjusted EBITDA', m$(e.ebitda)],
      ['Entry EV / EBITDA', x$(e.evEbitda)],
      ['Implied EV / EBITDA (ask)', x$(e.impliedEvEbitda)],
      ['Leverage', e.leverage || '—'],
      ['Hold period', e.holdYears != null ? `${e.holdYears} years` : '—'],
      ['Hurdle', hurdle.irr ? `${hurdle.moic}x MOIC / ${hurdle.irr}% IRR` : '—'],
    ]),
    ...(scenRows.length ? [subHead('Returns by scenario'), dataTable(['Scenario', 'Exit EBITDA', 'Exit EV', 'Equity out', 'MOIC', 'IRR'], scenRows, [18, 18, 16, 18, 15, 15])] : []),
    ...(sens ? [subHead(`Base IRR sensitivity — ${sens.rowLabel} × ${sens.colLabel}`), dataTable([`${sens.rowLabel} ↓ / ${sens.colLabel} →`, ...(sens.cols || [])], (sens.rows || []).map((r) => [r.cagr, ...(r.irr || []).map((v) => `${v}%`)]))] : []),
    ...(suRows.length ? [subHead('Sources & uses'), dataTable(['Sources', `${cur}M`, 'Uses', `${cur}M`], suRows, [34, 16, 34, 16])] : []),
    callout(R.meetsHurdle ? 'Returns clear the fund hurdle' : 'Returns vs. hurdle', R.headline || (base.irr != null ? `Base case ${base.moic}x / ${base.irr}% versus a ${hurdle.moic || '—'}x / ${hurdle.irr || '—'}% hurdle.` : 'Returns to be finalised.'), R.meetsHurdle ? GREEN : AMBER),
    subHead('Model assumptions & basis'),
    ...bullets([
      ...(Array.isArray(R.assumptions) ? R.assumptions : []),
      ...(modelAdj.length ? modelAdj : ['Entry economics and the operating case are taken from the base scenario; the debt schedule and free-cash-flow build sit in the accompanying Returns Model. Indicative build assumptions (capex, working capital, cost of debt, tax) are to be replaced with the confirmed operating model at IC.']),
    ]),

    ...((bridge.exit != null || leverRows.length) ? [
      sectionHeading('8. Value creation plan'),
      ...(bridge.exit != null ? [body(`EBITDA is underwritten to grow from ${m$(bridge.entry)} at entry to ${m$(bridge.exit)} at exit (${bridge.delta != null ? `+${m$(bridge.delta).slice(1)}` : ''}), bridged by:`), dataTable(['Value lever', 'EBITDA contribution', 'Owner'], bridgeRows, [50, 26, 24])] : []),
      ...(leverRows.length ? [subHead('Operating levers'), dataTable(['Lever', 'Workstream', 'Impact', 'Timeline', 'Owner'], leverRows, [26, 18, 14, 20, 22])] : []),
      ...(hundredDay.length ? [subHead('100-day plan'), ...bullets(hundredDay.map((h) => `${h.window}: ${(h.focus || []).join('; ')}`))] : []),
    ] : []),

    sectionHeading('9. Diligence status'),
    wsRows.length ? dataTable(['Workstream', 'Owner', 'Progress', 'Status'], wsRows, [40, 26, 14, 20]) : body('Workstreams not yet provisioned for this deal.'),
    body(`Diligence is ${pct(deal.diligenceProgress)} complete overall; compliance/KYC ${dash(deal.complianceCleared)} of ${dash(deal.complianceTotal)} items cleared.`),
    ...((SECTIONS.findings && findingsRows.length) ? [subHead('Findings by workstream'), dataTable(['Workstream', 'Finding', 'Treatment', 'Timing'], findingsRows, [22, 40, 26, 12]), body('Basis of findings: generated from the live deal record and templated / indicative — pending independent, sourced diligence evidence. Provenance is tracked per finding and these are not yet confirmed conclusions.', { italics: true, color: MUTE, size: 17 })] : []),

    sectionHeading('10. IC readiness'),
    body('This memorandum, together with the accompanying returns and value-creation models, constitutes the draft IC paper and recommendation for this transaction. The checklist below tracks the items still outstanding to reach a formal IC-ready status.'),
    callout(verdict.state || 'PENDING', verdict.headline || `IC readiness ${pct(deal.readiness)}.`, verdict.state === 'READY' ? GREEN : verdict.state === 'NOT-READY' ? AMBER : ACCENT),
    ...(outstandingArt.length ? [subHead('Outstanding to reach IC-ready'), dataTable(['Item', 'Status', 'Detail'], outstandingArt.map((a) => [a.label, 'Open', a.detail || '']), [40, 18, 42])] : [body('All required artifacts complete — ready for committee.')]),
    ...(blocking.length ? [subHead('Blocking workstreams'), ...bullets(blocking.map((b) => `${b.label || b.lane || b.name || 'Workstream'}${b.reason ? ` — ${b.reason}` : ''}`))] : []),

    sectionHeading('11. Recommendation & IC ask'),
    callout(A.title, A.ask, verdict.state === 'READY' ? GREEN : ACCENT),
    ...(conditions.length ? [subHead('Conditions to close'), ...bullets(conditions.map((r) => `${r.risk}${r.mitigation ? ` — ${r.mitigation}` : ''}`))] : []),

    sectionHeading('Appendix — basis of preparation'),
    body(`${DISCLAIMER} Sources for key figures are shown inline; assumptions are held in the accompanying Excel models.`, { italics: true, color: MUTE, size: 18 }),
  ];

  const doc = new Document({
    creator: BRAND, title: `IC Memo — ${company}`, subject: 'Investment Committee Memorandum', company: BRAND,
    styles: { default: { document: { run: { font: 'Calibri', size: 21, color: '2B2B2B' } } } },
    sections: [{ properties: { page: { margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 } } }, headers: { default: header }, footers: { default: footer }, children }],
  });
  return Packer.toBuffer(doc);
}

// A self-contained onboarding / reference doc dropped into the deal's Administration
// folder so a firm opening the data room knows how it's organised, what's generated for
// them, and how to brand the templates. Sets teams up for success on first use.
const FOLDER_GUIDE = [
  ['00_Administration', 'Working-group list, timelines, checklists, this guide and process docs.'],
  ['01_Corporate & Legal', 'Incorporation, org chart, cap table, board and corporate records.'],
  ['02_Financial Information', 'Historical accounts, management accounts, QoE, working-capital analysis.'],
  ['03_Commercial & Sales', 'Market, customers, pipeline, pricing and commercial diligence.'],
  ['04_Tax', 'Tax returns, structuring, transfer pricing and exposures.'],
  ['05_Intellectual Property', 'Patents, trademarks, licences and IP ownership.'],
  ['06_Real Property & Assets', 'Leases, owned property and fixed-asset registers.'],
  ['07_Contracts', 'Material contracts, change-of-control and key terms.'],
  ['08_Employment & HR', 'Org, key employees, benefits and employment matters.'],
  ['09_IT & Technology', 'Systems, architecture, cyber and technology diligence.'],
  ['10_Operations', 'Supply chain, operations and footprint.'],
  ['11_Insurance', 'Policies, claims history and coverage.'],
  ['12_Environmental & Regulatory', 'Permits, compliance and environmental matters.'],
  ['13_IC Materials', 'The generated IC memo, deck and models — the committee pack.'],
];
export async function buildDataRoomGuideDocx(deal) {
  applyBrand();
  const co = (deal && (deal.company || deal.id)) || 'this deal';
  const footer = new Footer({ children: [new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE } }, children: [new TextRun({ text: `${FOOTER_CONF} · ${BRAND} · Deal Room data-room guide`, color: MUTE, size: 15 })] })] });
  const children = [
    new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: `${BRAND.toUpperCase()} · DATA ROOM`, bold: true, color: ACCENT, size: 16, characterSpacing: 20 })] }),
    new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: `${co} — data room guide`, bold: true, color: INK, size: 36 })] }),
    new Paragraph({ children: [new TextRun({ text: `Prepared ${dateStr(new Date())}`, color: MUTE, italics: true, size: 18 })] }),
    rule(ACCENT, 10),
    sectionHeading('Welcome'),
    body(`This is the secure virtual data room for ${co}. It holds the deal's confidential documents, organised into a standard institutional index so every workstream knows exactly where material lives. Access is scoped to the deal team on a need-to-know basis.`),
    sectionHeading('How this data room is organised'),
    dataTable(['Folder', 'What lives here'], FOLDER_GUIDE, [32, 68]),
    sectionHeading('What is generated for you'),
    body('The following board-ready documents are drafted automatically from the live deal record and placed in 13_IC Materials — refine and re-publish as diligence progresses:'),
    ...bullets([
      'IC Memorandum (Word) — the full committee paper: thesis, merits, risks, financials, valuation & returns, value creation, diligence findings and the IC recommendation.',
      'IC Deck (PowerPoint) — the presentation version of the memo, with KPI tiles and returns charts.',
      'Deal Model (Excel) — the dashboard, key figures, returns scenarios, value-creation levers and risk register.',
      'Returns / LBO Model (Excel) — entry economics, sources & uses, an indicative debt & cash-flow build, scenarios, returns bridge and sensitivity.',
    ]),
    sectionHeading('Branding & templates'),
    body(`Every generated document follows your firm's template. An administrator can set the fund name, brand colours, confidentiality label and which sections appear in Settings → Document templates — no code change required.`),
    new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: DISCLAIMER, italics: true, color: MUTE, size: 18 })] }),
  ];
  const doc = new Document({ creator: BRAND, title: `Data Room Guide — ${co}`, company: BRAND, styles: { default: { document: { run: { font: 'Calibri', size: 21, color: '2B2B2B' } } } }, sections: [{ properties: { page: { margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 } } }, footers: { default: footer }, children }] });
  return Packer.toBuffer(doc);
}

// =============================================================================
// EXCEL — deal model & LBO/returns model
// =============================================================================
const XNAVY0 = 'FF1F3864';
let XNAVY = 'FF1F3864', XACC = 'FF2E74B5';
const XMUT = 'FF6B7280', XBAND = 'FFEEF2F7', XLINE = 'FFD9DEE7', XGREEN = 'FF0A8A5A', XRED = 'FFB23B3B', XAMBER = 'FFB26A00';
const XTHIN = { style: 'thin', color: { argb: XLINE } };
const XBOX = { top: XTHIN, left: XTHIN, bottom: XTHIN, right: XTHIN };

function styleTable(sheet) {
  const cols = sheet.columnCount;
  const header = sheet.getRow(1);
  header.height = 20;
  header.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XNAVY } }; c.alignment = { vertical: 'middle' }; c.border = XBOX; });
  for (let r = 2; r <= sheet.rowCount; r++) {
    sheet.getRow(r).eachCell((c) => { c.font = { size: 10, color: { argb: 'FF2B2B2B' } }; c.border = XBOX; if (r % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XBAND } }; });
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols } };
  sheet.views = [{ showGridLines: false, state: 'frozen', ySplit: 1 }];
}
function titleBlock(s, title, sub) {
  s.getCell('B2').value = title; s.getCell('B2').font = { name: 'Calibri', size: 18, bold: true, color: { argb: XNAVY } };
  s.getCell('B3').value = sub; s.getCell('B3').font = { size: 9, italic: true, color: { argb: XMUT } };
}
function kvBlock(s, startRow, heading, rows) {
  let row = startRow;
  if (heading) { s.getCell(row, 2).value = heading; s.getCell(row, 2).font = { size: 9, bold: true, color: { argb: XACC } }; row++; }
  for (const [k, v, fmt] of rows) {
    const kc = s.getCell(row, 2), vc = s.getCell(row, 3);
    kc.value = k; kc.font = { bold: true, color: { argb: XMUT }, size: 10 };
    vc.value = v === 0 || v ? v : '—'; if (fmt) vc.numFmt = fmt; vc.font = { size: 10, color: { argb: 'FF2B2B2B' } };
    kc.border = { bottom: XTHIN }; vc.border = { bottom: XTHIN };
    if ((row - startRow) % 2 === 1) { const f = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; kc.fill = f; vc.fill = f; }
    row++;
  }
  return row + 1;
}
// Horizontal data-bar conditional formatting over a column range (visual density).
function dataBar(sheet, ref, color = XACC) {
  try { sheet.addConditionalFormatting({ ref, rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: color }, gradient: false }] }); } catch { /* ignore */ }
}

function composeRichModel(deal, extras = {}) {
  applyBrand();
  const d = derive(deal, extras);
  const { base, up, down, entry: e, hurdle, bridge, levers, hundredDay, riskItems, verdict, reqItems, workstreams, figures } = d;
  const R = d.returns;
  const cur = curSymbol(deal);
  const m$ = (v) => (Number.isFinite(Number(v)) ? `${cur}${Number(v)}M` : '—');
  const evStr = e.entryEV != null ? m$(e.entryEV) : money(deal);
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND; wb.company = BRAND; wb.created = new Date(); wb.title = `Deal Model — ${deal.company || deal.id}`;

  // ---- Dashboard -------------------------------------------------------------
  const s = wb.addWorksheet('Dashboard', { views: [{ showGridLines: false }] });
  s.getColumn(1).width = 3; s.getColumn(2).width = 30; s.getColumn(3).width = 34; s.getColumn(4).width = 4; s.getColumn(5).width = 30; s.getColumn(6).width = 20;
  titleBlock(s, deal.company || deal.id || 'Deal', `${[deal.sector, deal.subSector, deal.hq || deal.region].filter(Boolean).join('  ·  ')}  ·  Prepared ${dateStr(new Date())}  ·  ${FOOTER_CONF}`);
  // KPI tiles (right)
  const tiles = [
    ['Enterprise value', evStr],
    ['Entry EV/EBITDA', x$(e.evEbitda)],
    ['Base MOIC / IRR', base.irr != null ? `${base.moic}x / ${base.irr}%` : '—'],
    ['Clears hurdle', R.meetsHurdle == null ? '—' : (R.meetsHurdle ? 'Yes' : 'No')],
    ['IC readiness', `${pct(deal.readiness)}${verdict.state ? ` · ${verdict.state}` : ''}`],
  ];
  let tr = 6;
  s.getCell(tr, 5).value = 'HEADLINE METRICS'; s.getCell(tr, 5).font = { size: 9, bold: true, color: { argb: XACC } }; tr++;
  for (const [k, v] of tiles) {
    s.getCell(tr, 5).value = k; s.getCell(tr, 5).font = { color: { argb: XMUT }, size: 10 };
    s.getCell(tr, 6).value = v; s.getCell(tr, 6).font = { size: 12, bold: true, color: { argb: XNAVY } };
    tr++;
  }
  let row = kvBlock(s, 6, 'DEAL SUMMARY', summaryRows(deal, evStr).map(([k, v]) => [k, v]));
  row = kvBlock(s, row, 'ENTRY ECONOMICS', [
    ['Entry EV (M)', Number(e.entryEV) || null, '#,##0'],
    ['Adjusted EBITDA (M)', Number(e.ebitda) || null, '#,##0'],
    ['Entry EV/EBITDA', e.evEbitda != null ? `${e.evEbitda}x` : '—'],
    ['Leverage', e.leverage || '—'],
    ['Hold (years)', Number(e.holdYears) || null, '#,##0'],
    ['Hurdle', hurdle.irr ? `${hurdle.moic}x / ${hurdle.irr}%` : '—'],
  ]);
  s.views = [{ showGridLines: false, state: 'frozen', ySplit: 4 }];

  // ---- Returns (scenarios + bridge) -----------------------------------------
  if ((R.scenarios || []).length) {
    const sc = wb.addWorksheet('Returns', { views: [{ showGridLines: false }] });
    sc.columns = [
      { header: 'Scenario', key: 'name', width: 14 }, { header: 'Entry EV', key: 'entryEV', width: 12 },
      { header: 'Equity in', key: 'equityIn', width: 12 }, { header: 'Debt', key: 'debt', width: 12 },
      { header: 'Exit EBITDA', key: 'exitEbitda', width: 13 }, { header: 'Exit EV', key: 'exitEV', width: 12 },
      { header: 'Equity out', key: 'equityOut', width: 13 }, { header: 'MOIC', key: 'moic', width: 10 }, { header: 'IRR', key: 'irr', width: 10 },
    ];
    for (const s2 of R.scenarios) sc.addRow({ name: s2.name, entryEV: s2.entryEV, equityIn: s2.equityIn, debt: s2.debt, exitEbitda: s2.exitEbitda, exitEV: s2.exitEV, equityOut: s2.equityOut, moic: s2.moic, irr: (s2.irr ?? 0) / 100 });
    ['entryEV', 'equityIn', 'debt', 'exitEbitda', 'exitEV', 'equityOut'].forEach((c) => (sc.getColumn(c).numFmt = '#,##0'));
    sc.getColumn('moic').numFmt = '0.00"x"'; sc.getColumn('irr').numFmt = '0.0%';
    styleTable(sc);
    dataBar(sc, `H2:H${sc.rowCount}`); dataBar(sc, `I2:I${sc.rowCount}`);
    // value bridge below
    let br = sc.rowCount + 3;
    sc.getCell(br, 1).value = 'EQUITY VALUE-CREATION BRIDGE'; sc.getCell(br, 1).font = { bold: true, color: { argb: XNAVY } }; br++;
    (d.valueCreation.valueBridge || []).forEach((b) => { sc.getCell(br, 1).value = b.source; sc.getCell(br, 2).value = b.value; sc.getCell(br, 2).numFmt = '#,##0'; br++; });
  }

  // ---- Sensitivity -----------------------------------------------------------
  if (R.sensitivity) {
    const g = wb.addWorksheet('Sensitivity', { views: [{ showGridLines: false }] });
    g.getCell('A1').value = `Base IRR — ${R.sensitivity.rowLabel} (rows) × ${R.sensitivity.colLabel} (cols)`;
    g.getCell('A1').font = { bold: true, color: { argb: XNAVY } };
    g.addRow([]); g.addRow(['', ...(R.sensitivity.cols || [])]);
    for (const rr of (R.sensitivity.rows || [])) g.addRow([rr.cagr, ...(rr.irr || []).map((v) => (v ?? 0) / 100)]);
    for (let c = 2; c <= (R.sensitivity.cols || []).length + 1; c++) g.getColumn(c).numFmt = '0.0%';
    g.getColumn(1).width = 16;
    const last = String.fromCharCode(65 + (R.sensitivity.cols || []).length);
    try { g.addConditionalFormatting({ ref: `B4:${last}${3 + (R.sensitivity.rows || []).length}`, rules: [{ type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }], color: [{ argb: 'FFF8D0D0' }, { argb: 'FFFFF3C4' }, { argb: 'FFC9E7D2' }] }] }); } catch { /* ignore */ }
  }

  // ---- Sources & Uses --------------------------------------------------------
  if (R.sourcesUses) {
    const su = wb.addWorksheet('Sources & Uses', { views: [{ showGridLines: false }] });
    su.columns = [{ header: 'Sources', key: 'src', width: 34 }, { header: 'M', key: 'srcAmt', width: 14 }, { header: 'Uses', key: 'use', width: 34 }, { header: 'M', key: 'useAmt', width: 14 }];
    const src = R.sourcesUses.sources || [], use = R.sourcesUses.uses || [];
    for (let i = 0; i < Math.max(src.length, use.length); i++) su.addRow({ src: src[i]?.label || '', srcAmt: src[i]?.amount ?? '', use: use[i]?.label || '', useAmt: use[i]?.amount ?? '' });
    su.addRow({ src: 'Total sources', srcAmt: R.sourcesUses.totalSources ?? '', use: 'Total uses', useAmt: R.sourcesUses.totalUses ?? '' });
    su.getColumn('srcAmt').numFmt = '#,##0'; su.getColumn('useAmt').numFmt = '#,##0';
    styleTable(su);
  }

  // ---- Value creation --------------------------------------------------------
  if (levers.length || bridge.exit != null) {
    const vc = wb.addWorksheet('Value Creation', { views: [{ showGridLines: false }] });
    vc.columns = [{ header: 'Lever', key: 'name', width: 30 }, { header: 'Workstream', key: 'ws', width: 16 }, { header: 'EBITDA impact (M)', key: 'impact', width: 18 }, { header: 'Timeline', key: 'timeline', width: 18 }, { header: 'Owner', key: 'owner', width: 28 }];
    for (const l of levers) vc.addRow({ name: l.name, ws: l.workstream ? prettyWorkstream(l.workstream) : '', impact: l.impact ?? '', timeline: l.timeline || '', owner: l.owner ? prettyRole(l.owner) : '' });
    styleTable(vc);
    dataBar(vc, `C2:C${vc.rowCount}`);
    if (bridge.components) {
      let b = vc.rowCount + 3;
      vc.getCell(b, 1).value = `EBITDA BRIDGE  ${m$(bridge.entry)} → ${m$(bridge.exit)}  (+${m$(bridge.delta).slice(1)})`; vc.getCell(b, 1).font = { bold: true, color: { argb: XNAVY } }; b++;
      for (const c of bridge.components) { vc.getCell(b, 1).value = c.lever; vc.getCell(b, 2).value = c.contribution; vc.getCell(b, 2).numFmt = '#,##0'; vc.getCell(b, 3).value = c.owner ? prettyRole(c.owner) : ''; b++; }
    }
  }

  // ---- Risk register ---------------------------------------------------------
  if (riskItems.length) {
    const rk = wb.addWorksheet('Risks', { views: [{ showGridLines: false }] });
    rk.columns = [{ header: 'ID', key: 'id', width: 6 }, { header: 'Workstream', key: 'ws', width: 24 }, { header: 'Risk', key: 'risk', width: 60 }, { header: 'Severity', key: 'sev', width: 18 }, { header: 'Likelihood', key: 'lk', width: 12 }, { header: 'Mitigation', key: 'mit', width: 50 }];
    for (const r of riskItems) rk.addRow({ id: r.id || '', ws: r.workstream ? prettyWorkstream(r.workstream) : '', risk: r.risk || '', sev: r.severityLabel || r.severity || '', lk: r.likelihood || '', mit: r.mitigation || '' });
    styleTable(rk);
    rk.getColumn('risk').alignment = { wrapText: true, vertical: 'top' }; rk.getColumn('mit').alignment = { wrapText: true, vertical: 'top' };
  }

  // ---- Key figures & workstreams --------------------------------------------
  if (figures.length) {
    const kf = wb.addWorksheet('Key Figures', { views: [{ showGridLines: false }] });
    kf.columns = [{ header: 'Metric', key: 'label', width: 40 }, { header: 'Value', key: 'value', width: 24 }, { header: 'Source', key: 'source', width: 26 }, { header: 'Confidence', key: 'confidence', width: 16 }];
    figures.forEach((f) => kf.addRow({ label: f.label || '', value: f.value ?? '', source: f.source || '', confidence: f.confidence || '' }));
    styleTable(kf);
  }
  const w = wb.addWorksheet('Workstreams', { views: [{ showGridLines: false }] });
  w.columns = [{ header: 'Workstream', key: 'name', width: 34 }, { header: 'Owner', key: 'owner', width: 24 }, { header: 'Progress', key: 'progress', width: 12 }, { header: 'Status', key: 'status', width: 22 }];
  if (workstreams.length) { for (const ws of workstreams) w.addRow({ name: (ws.name || ws.title || ws.lane) ? prettyWorkstream(ws.name || ws.title || ws.lane) : 'Workstream', owner: (ws.owner || ws.md || ws.lead) ? prettyRole(ws.owner || ws.md || ws.lead) : '', progress: Number.isFinite(Number(ws.progress)) ? Number(ws.progress) / 100 : '', status: prettyStatus(ws.status) }); w.getColumn('progress').numFmt = '0%'; dataBar(w, `C2:C${w.rowCount}`); }
  else w.addRow({ name: 'No workstreams provisioned yet', owner: '', progress: '', status: '' });
  styleTable(w);
  return wb;
}

export async function buildDealModelXlsx(deal, extras = {}) {
  const buf = await composeRichModel(deal, extras).xlsx.writeBuffer();
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

// The LBO / returns workbook — Summary dashboard, Sources & Uses (with fees), Debt &
// cash-flow build, Scenarios, Returns bridge, Sensitivity and downside/covenant view.
export async function buildReturnsXlsx(returns, extras = {}) {
  applyBrand();
  const r = returns || {};
  const vcp = extras.valueCreation || {};
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND; wb.company = BRAND; wb.created = new Date(); wb.title = `Returns Model — ${r.company || 'Deal'}`;
  const e = r.entry || {};
  const base = (r.scenarios || []).find((x) => x.name === 'Base') || {};
  const down = (r.scenarios || []).find((x) => x.name === 'Downside') || {};

  const s = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  s.getColumn(1).width = 3; s.getColumn(2).width = 32; s.getColumn(3).width = 26; s.getColumn(4).width = 4; s.getColumn(5).width = 28; s.getColumn(6).width = 18;
  titleBlock(s, `${r.company || 'Deal'} — LBO / Returns`, `Prepared ${dateStr(new Date())}  ·  ${BRAND}  ·  ${FOOTER_CONF}`);
  // takeaways box
  s.getCell('E6').value = 'KEY TAKEAWAYS'; s.getCell('E6').font = { size: 9, bold: true, color: { argb: XACC } };
  const takeaways = [
    base.irr != null ? `Base: ${base.moic}x / ${base.irr}%` : 'Base pending',
    r.hurdle ? `Hurdle: ${r.hurdle.moic}x / ${r.hurdle.irr}%` : '',
    r.meetsHurdle == null ? '' : (r.meetsHurdle ? 'Clears hurdle ✓' : 'Below hurdle'),
    down.irr != null ? `Downside floor: ${down.moic}x / ${down.irr}%` : '',
  ].filter(Boolean);
  takeaways.forEach((t, i) => { s.getCell(7 + i, 5).value = t; s.getCell(7 + i, 5).font = { size: 11, bold: i === 0, color: { argb: i === 0 ? XNAVY : XMUT } }; });
  kvBlock(s, 6, 'ENTRY & RETURNS', [
    ['Entry EV/EBITDA', e.evEbitda != null ? `${e.evEbitda}x` : '—'],
    ['Implied EV/EBITDA (ask)', e.impliedEvEbitda != null ? `${e.impliedEvEbitda}x` : '—'],
    ['Leverage', e.leverage || '—'],
    ['Entry EV (M)', e.entryEV ?? '—', '#,##0'],
    ['Adjusted EBITDA (M)', e.ebitda ?? '—', '#,##0'],
    ['Hold (years)', e.holdYears ?? '—'],
    ['Hurdle', r.hurdle ? `${r.hurdle.irr}% IRR / ${r.hurdle.moic}x MOIC` : '—'],
    ['Base IRR', base.irr != null ? `${base.irr}%` : '—'],
    ['Base MOIC', base.moic != null ? `${base.moic}x` : '—'],
    ['Meets hurdle', r.meetsHurdle == null ? '—' : (r.meetsHurdle ? 'Yes' : 'No')],
  ]);

  // Sources & Uses
  const su = r.sourcesUses || {};
  const suSheet = wb.addWorksheet('Sources & Uses', { views: [{ showGridLines: false }] });
  suSheet.columns = [{ header: 'Sources', key: 'src', width: 34 }, { header: 'M', key: 'srcAmt', width: 14 }, { header: 'Uses', key: 'use', width: 34 }, { header: 'M', key: 'useAmt', width: 14 }];
  const src = su.sources || [], use = su.uses || [];
  for (let i = 0; i < Math.max(src.length, use.length); i++) suSheet.addRow({ src: src[i]?.label || '', srcAmt: src[i]?.amount ?? '', use: use[i]?.label || '', useAmt: use[i]?.amount ?? '' });
  suSheet.addRow({ src: 'Total sources', srcAmt: su.totalSources ?? '', use: 'Total uses', useAmt: su.totalUses ?? '' });
  suSheet.getColumn('srcAmt').numFmt = '#,##0'; suSheet.getColumn('useAmt').numFmt = '#,##0';
  styleTable(suSheet);

  // Debt & cash-flow build (approximate schedule over the hold from entry EBITDA → exit)
  if (e.ebitda != null && e.holdYears) {
    const cf = wb.addWorksheet('Debt & Cash Flow', { views: [{ showGridLines: false }] });
    const years = Math.max(1, Math.round(Number(e.holdYears)));
    const entryEbitda = Number(e.ebitda);
    const exitEbitda = Number(base.exitEbitda) || entryEbitda;
    const cagr = entryEbitda > 0 ? Math.pow(exitEbitda / entryEbitda, 1 / years) - 1 : 0;
    let debt = Number(base.debt) || Number((su.sources || []).find((x) => /debt/i.test(x.label))?.amount) || 0;
    const rate = 0.09; // indicative blended cost of debt
    cf.columns = [
      { header: 'Year', key: 'yr', width: 8 }, { header: 'EBITDA', key: 'ebitda', width: 12 },
      { header: 'less: Capex', key: 'capex', width: 12 }, { header: 'less: ΔNWC', key: 'nwc', width: 12 },
      { header: 'less: Cash interest', key: 'int', width: 16 }, { header: 'less: Cash tax', key: 'tax', width: 13 },
      { header: 'Free cash flow', key: 'fcf', width: 14 }, { header: 'Debt paydown', key: 'pay', width: 13 }, { header: 'Debt (end)', key: 'debt', width: 13 },
    ];
    for (let y = 1; y <= years; y++) {
      const ebitda = entryEbitda * Math.pow(1 + cagr, y);
      const capex = ebitda * 0.12, nwc = ebitda * 0.03, interest = debt * rate, tax = Math.max(0, (ebitda - capex - interest)) * 0.23;
      const fcf = ebitda - capex - nwc - interest - tax;
      const pay = Math.max(0, Math.min(debt, fcf * 0.9));
      debt = Math.max(0, debt - pay);
      cf.addRow({ yr: y, ebitda: Math.round(ebitda), capex: Math.round(capex), nwc: Math.round(nwc), int: Math.round(interest), tax: Math.round(tax), fcf: Math.round(fcf), pay: Math.round(pay), debt: Math.round(debt) });
    }
    ['ebitda', 'capex', 'nwc', 'int', 'tax', 'fcf', 'pay', 'debt'].forEach((c) => (cf.getColumn(c).numFmt = '#,##0'));
    styleTable(cf);
    dataBar(cf, `G2:G${cf.rowCount}`, XGREEN); dataBar(cf, `I2:I${cf.rowCount}`, XACC);
    cf.addRow([]); const note = cf.addRow(['Indicative build: capex ~12% of EBITDA, ΔNWC ~3%, blended debt cost ~9%, cash tax ~23%; ~90% of FCF swept to debt. Replace with the confirmed operating model at IC.']);
    note.getCell(1).font = { italic: true, size: 9, color: { argb: XMUT } };
  }

  // Scenarios
  const sc = wb.addWorksheet('Scenarios', { views: [{ showGridLines: false }] });
  sc.columns = [
    { header: 'Scenario', key: 'name', width: 14 }, { header: 'Entry EV', key: 'entryEV', width: 12 }, { header: 'Equity in', key: 'equityIn', width: 12 }, { header: 'Debt', key: 'debt', width: 12 },
    { header: 'Exit EBITDA', key: 'exitEbitda', width: 13 }, { header: 'Exit EV', key: 'exitEV', width: 12 }, { header: 'Equity out', key: 'equityOut', width: 13 }, { header: 'MOIC', key: 'moic', width: 10 }, { header: 'IRR', key: 'irr', width: 10 },
  ];
  for (const x of (r.scenarios || [])) sc.addRow({ name: x.name, entryEV: x.entryEV, equityIn: x.equityIn, debt: x.debt, exitEbitda: x.exitEbitda, exitEV: x.exitEV, equityOut: x.equityOut, moic: x.moic, irr: (x.irr ?? 0) / 100 });
  ['entryEV', 'equityIn', 'debt', 'exitEbitda', 'exitEV', 'equityOut'].forEach((c) => (sc.getColumn(c).numFmt = '#,##0'));
  sc.getColumn('moic').numFmt = '0.00"x"'; sc.getColumn('irr').numFmt = '0.0%';
  styleTable(sc); dataBar(sc, `H2:H${sc.rowCount}`); dataBar(sc, `I2:I${sc.rowCount}`);

  // Returns bridge
  if ((vcp.valueBridge || []).length) {
    const rb = wb.addWorksheet('Returns Bridge', { views: [{ showGridLines: false }] });
    rb.columns = [{ header: 'Value driver', key: 'src', width: 28 }, { header: 'Equity value (M)', key: 'val', width: 18 }];
    for (const b of vcp.valueBridge) rb.addRow({ src: b.source, val: b.value });
    rb.getColumn('val').numFmt = '#,##0'; styleTable(rb); dataBar(rb, `B2:B${rb.rowCount}`, XGREEN);
  }

  // Sensitivity
  if (r.sensitivity) {
    const g = wb.addWorksheet('Sensitivity', { views: [{ showGridLines: false }] });
    g.getCell('A1').value = `Base IRR — ${r.sensitivity.rowLabel} (rows) × ${r.sensitivity.colLabel} (cols)`; g.getCell('A1').font = { bold: true, color: { argb: XNAVY } };
    g.addRow([]); g.addRow(['', ...(r.sensitivity.cols || [])]);
    for (const rr of (r.sensitivity.rows || [])) g.addRow([rr.cagr, ...(rr.irr || []).map((v) => (v ?? 0) / 100)]);
    for (let c = 2; c <= (r.sensitivity.cols || []).length + 1; c++) g.getColumn(c).numFmt = '0.0%';
    g.getColumn(1).width = 16;
    const last = String.fromCharCode(65 + (r.sensitivity.cols || []).length);
    try { g.addConditionalFormatting({ ref: `B4:${last}${3 + (r.sensitivity.rows || []).length}`, rules: [{ type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }], color: [{ argb: 'FFF8D0D0' }, { argb: 'FFFFF3C4' }, { argb: 'FFC9E7D2' }] }] }); } catch { /* ignore */ }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

// =============================================================================
// POWERPOINT — IC deck (text boxes + rects only; tiles/bars built from rects)
// =============================================================================
const P_WHITE = 'FFFFFF';
let P_INK = '1F3864', P_ACCENT = '2E74B5';
const P_MUTE = '6B7280', P_GREEN = '0A8A5A', P_AMBER = 'B26A00', P_RED = 'B23B3B';
const VERDICT_COLOR = { READY: P_GREEN, CONDITIONAL: P_AMBER, 'NOT-READY': P_RED };
function deckHeader(title, co) {
  return [
    { kind: 'rect', x: 0, y: 0, w: 13.333, h: 1.05, fill: P_INK },
    { kind: 'rect', x: 0, y: 1.05, w: 13.333, h: 0.06, fill: P_ACCENT },
    { kind: 'text', x: 0.68, y: 0.24, w: 9.5, h: 0.6, valign: 'ctr', paras: [{ text: title, size: 24, bold: true, color: P_WHITE }] },
    { kind: 'text', x: 9.9, y: 0.3, w: 3.0, h: 0.5, valign: 'ctr', paras: [{ text: co, size: 11, color: 'AFC6E4', align: 'r' }] },
    { kind: 'text', x: 0.68, y: 7.02, w: 12, h: 0.35, paras: [{ text: `${FOOTER_CONF} · ${BRAND} · Investment Committee`, size: 9, color: P_MUTE }] },
  ];
}
function bulletPara(text, opts = {}) { return { text, bullet: true, size: opts.size || 14, color: opts.color || '2B2B2B', spaceAfter: opts.spaceAfter ?? 8 }; }
// KPI tile row built from rects + text.
function tiles(x0, y0, items, tileW = 2.9, gap = 0.25) {
  const shapes = [];
  items.forEach((it, i) => {
    const x = x0 + i * (tileW + gap);
    shapes.push({ kind: 'rect', x, y: y0, w: tileW, h: 1.35, fill: 'F4F7FB' });
    shapes.push({ kind: 'rect', x, y: y0, w: tileW, h: 0.06, fill: it.color || P_ACCENT });
    shapes.push({ kind: 'text', x: x + 0.12, y: y0 + 0.16, w: tileW - 0.24, h: 0.35, paras: [{ text: it.label, size: 10, bold: true, color: P_MUTE }] });
    shapes.push({ kind: 'text', x: x + 0.12, y: y0 + 0.5, w: tileW - 0.24, h: 0.6, paras: [{ text: it.value, size: 22, bold: true, color: it.color || P_INK }] });
    if (it.sub) shapes.push({ kind: 'text', x: x + 0.12, y: y0 + 1.02, w: tileW - 0.24, h: 0.3, paras: [{ text: it.sub, size: 9, color: P_MUTE }] });
  });
  return shapes;
}
// Horizontal bar chart from rects. rows: [{label, value, color}], max scales width.
function barChart(x0, y0, w, rows, unit = '') {
  const shapes = [];
  const max = Math.max(1, ...rows.map((r) => Math.abs(Number(r.value) || 0)));
  const labelW = 2.2, barMax = w - labelW - 1.1, rh = 0.42, gap = 0.16;
  rows.forEach((r, i) => {
    const y = y0 + i * (rh + gap);
    const bw = Math.max(0.04, (Math.abs(Number(r.value) || 0) / max) * barMax);
    shapes.push({ kind: 'text', x: x0, y: y + 0.02, w: labelW, h: rh, valign: 'ctr', paras: [{ text: r.label, size: 11, color: '2B2B2B' }] });
    shapes.push({ kind: 'rect', x: x0 + labelW, y: y + 0.06, w: bw, h: rh - 0.12, fill: r.color || P_ACCENT });
    shapes.push({ kind: 'text', x: x0 + labelW + bw + 0.08, y: y + 0.02, w: 1.0, h: rh, valign: 'ctr', paras: [{ text: `${r.value}${unit}`, size: 11, bold: true, color: P_INK }] });
  });
  return shapes;
}
// Simple text "table" via a grid of text boxes + banded rects.
function gridTable(x0, y0, w, headers, rows, colFr) {
  const shapes = [];
  const totalFr = colFr.reduce((a, b) => a + b, 0);
  const colX = []; let acc = x0;
  colFr.forEach((fr) => { colX.push(acc); acc += (fr / totalFr) * w; });
  const rh = 0.34;
  shapes.push({ kind: 'rect', x: x0, y: y0, w, h: rh, fill: P_INK });
  headers.forEach((h, i) => shapes.push({ kind: 'text', x: colX[i] + 0.08, y: y0 + 0.02, w: (colFr[i] / totalFr) * w - 0.12, h: rh, valign: 'ctr', paras: [{ text: h, size: 10.5, bold: true, color: P_WHITE }] }));
  rows.forEach((r, ri) => {
    const y = y0 + rh + ri * rh;
    if (ri % 2 === 0) shapes.push({ kind: 'rect', x: x0, y, w, h: rh, fill: 'EEF2F7' });
    r.forEach((c, i) => shapes.push({ kind: 'text', x: colX[i] + 0.08, y: y + 0.02, w: (colFr[i] / totalFr) * w - 0.12, h: rh, valign: 'ctr', paras: [{ text: String(c ?? ''), size: 10.5, color: '2B2B2B' }] }));
  });
  return shapes;
}

export async function buildIcDeckPptx(deal, extras = {}) {
  applyBrand();
  const co = deal.company || deal.id || 'Deal';
  const sectorLine = [deal.sector, deal.subSector].filter(Boolean).join(' · ');
  const d = derive(deal, extras);
  const { base, up, down, entry: e, hurdle, bridge, levers, riskItems, verdict, reqItems, blocking, workstreams, figures } = d;
  const R = d.returns;
  const cur = curSymbol(deal);
  const m$ = (v) => (Number.isFinite(Number(v)) ? `${cur}${Number(v)}M` : '—');
  const evStr = e.entryEV != null ? m$(e.entryEV) : money(deal);
  const A = askFor(verdict, Number(deal.readiness) || 0);
  const vColor = VERDICT_COLOR[verdict.state] || P_MUTE;
  const slides = [];

  // 1) Cover
  slides.push([
    { kind: 'rect', x: 0, y: 0, w: 13.333, h: 2.85, fill: P_INK },
    { kind: 'rect', x: 0, y: 2.85, w: 13.333, h: 0.08, fill: P_ACCENT },
    { kind: 'text', x: 0.7, y: 0.62, w: 12, h: 0.4, paras: [{ text: 'INVESTMENT COMMITTEE', size: 13, bold: true, color: 'AFC6E4' }] },
    { kind: 'text', x: 0.68, y: 1.02, w: 12, h: 1.3, paras: [{ text: co, size: 40, bold: true, color: P_WHITE }] },
    { kind: 'text', x: 0.7, y: 2.18, w: 12, h: 0.5, paras: [{ text: [sectorLine, evStr !== '—' ? `${evStr} enterprise value` : ''].filter(Boolean).join('   ·   '), size: 15, color: 'DCE6F2' }] },
    ...tiles(0.68, 3.35, [
      { label: 'ENTERPRISE VALUE', value: evStr },
      { label: 'BASE MOIC / IRR', value: base.irr != null ? `${base.moic}x / ${base.irr}%` : '—' },
      { label: 'ENTRY EV/EBITDA', value: x$(e.evEbitda) },
      { label: 'IC VERDICT', value: verdict.state || 'IN DILIGENCE', color: vColor },
    ]),
    { kind: 'text', x: 0.68, y: 5.1, w: 12, h: 1.3, paras: [{ text: verdict.headline || deal.thesis || '', size: 14, color: '2B2B2B', italic: true }] },
    { kind: 'text', x: 0.68, y: 6.6, w: 12, h: 0.5, paras: [{ text: [`Prepared ${dateStr(new Date())}`, deal.leadAnalyst ? `Lead: ${prettyRole(deal.leadAnalyst)}` : '', deal.sponsorPersona ? `Sponsor: ${prettyRole(deal.sponsorPersona)}` : '', typeof deal.readiness === 'number' ? `IC readiness ${pct(deal.readiness)}` : ''].filter(Boolean).join('    ·    '), size: 11, color: P_MUTE }] },
  ]);

  // 2) Agenda & the ask
  slides.push([
    ...deckHeader('Agenda & the IC ask', co),
    { kind: 'text', x: 0.68, y: 1.4, w: 7.3, h: 5, valign: 't', paras: [
      bulletPara('Transaction overview & rationale', { size: 15 }),
      bulletPara('Business & market', { size: 15 }),
      bulletPara('Financial summary', { size: 15 }),
      bulletPara('Valuation & returns', { size: 15 }),
      bulletPara('Value creation plan', { size: 15 }),
      bulletPara('Diligence findings & risks', { size: 15 }),
      bulletPara('IC readiness & recommendation', { size: 15 }),
    ] },
    { kind: 'rect', x: 8.35, y: 1.4, w: 4.3, h: 3.4, fill: 'F4F7FB' },
    { kind: 'rect', x: 8.35, y: 1.4, w: 4.3, h: 0.07, fill: vColor },
    { kind: 'text', x: 8.6, y: 1.6, w: 3.9, h: 0.4, paras: [{ text: 'THE ASK', size: 11, bold: true, color: P_ACCENT }] },
    { kind: 'text', x: 8.6, y: 2.0, w: 3.9, h: 2.6, valign: 't', paras: [
      { text: A.ask, size: 14, bold: true, color: P_INK, spaceAfter: 10 },
      { text: hurdle.irr ? `Base ${base.moic || '—'}x / ${base.irr || '—'}% vs ${hurdle.moic}x / ${hurdle.irr}% hurdle — ${R.meetsHurdle ? 'cleared.' : 'under review.'}` : '', size: 12, color: '2B2B2B' },
    ] },
  ]);

  // 3) Company overview
  const snap = summaryRows(deal, evStr);
  const half = Math.ceil(snap.length / 2);
  const colParas = (rows) => rows.map(([k, v]) => ({ runs: [{ text: `${k}:  `, size: 12.5, bold: true, color: P_INK }, { text: String(v), size: 12.5, color: '2B2B2B' }], spaceAfter: 8 }));
  slides.push([
    ...deckHeader('Company overview', co),
    { kind: 'text', x: 0.68, y: 1.3, w: 12, h: 0.9, valign: 't', paras: [{ text: deal.thesis ? String(deal.thesis).split(/(?<=\.)\s/)[0] : `${co} operates in the ${deal.sector || 'target'} sector.`, size: 14, color: '2B2B2B' }] },
    { kind: 'text', x: 0.68, y: 2.35, w: 5.9, h: 4.4, valign: 't', paras: colParas(snap.slice(0, half)) },
    { kind: 'text', x: 6.9, y: 2.35, w: 5.8, h: 4.4, valign: 't', paras: colParas(snap.slice(half)) },
  ]);

  // 4) Investment thesis + key figures
  const kf = figures.slice(0, 6);
  slides.push([
    ...deckHeader('Investment thesis', co),
    { kind: 'text', x: 0.68, y: 1.4, w: 7.3, h: 4.9, valign: 't', paras: (deal.thesis ? String(deal.thesis).split(/(?<=\.)\s/).slice(0, 6).filter(Boolean) : ['Thesis to be finalised in the IC memo.']).map((t) => bulletPara(t, { size: 14, spaceAfter: 10 })) },
    { kind: 'rect', x: 8.35, y: 1.4, w: 4.3, h: 4.9, fill: 'F4F7FB' },
    { kind: 'text', x: 8.6, y: 1.55, w: 3.9, h: 0.4, paras: [{ text: 'KEY FIGURES', size: 11, bold: true, color: P_ACCENT }] },
    { kind: 'text', x: 8.6, y: 2.0, w: 3.9, h: 4.2, valign: 't', paras: kf.length ? kf.map((f) => ({ runs: [{ text: `${f.value}  `, size: 15, bold: true, color: P_INK }, { text: f.label || '', size: 11, color: P_MUTE }], spaceAfter: 12 })) : [{ text: 'Key figures populate from the deal model.', size: 12, color: P_MUTE }] },
  ]);

  // 5) Financial summary (KPI tiles + workstream mini-table)
  slides.push([
    ...deckHeader('Financial summary', co),
    ...tiles(0.68, 1.35, [
      { label: 'ENTERPRISE VALUE', value: evStr },
      { label: 'ADJ. EBITDA', value: m$(e.ebitda) },
      { label: 'ENTRY EV/EBITDA', value: x$(e.evEbitda) },
      { label: 'LEVERAGE', value: e.leverage || '—' },
    ]),
    { kind: 'text', x: 0.68, y: 3.0, w: 12, h: 0.4, paras: [{ text: 'KEY FIGURES', size: 11, bold: true, color: P_ACCENT }] },
    ...(kf.length ? gridTable(0.68, 3.4, 12, ['Metric', 'Value', 'Source', 'Confidence'], figures.slice(0, 7).map((f) => [f.label, f.value, f.source, f.confidence || '—']), [40, 18, 26, 16]) : [{ kind: 'text', x: 0.68, y: 3.5, w: 12, h: 1, paras: [{ text: 'Key figures populate from the deal model.', size: 13, color: P_MUTE }] }]),
  ]);

  // 6) Returns (bars + entry panel)
  const scenRows = (R.scenarios || []);
  slides.push([
    ...deckHeader('Returns — LBO / IRR & MOIC', co),
    { kind: 'text', x: 0.68, y: 1.3, w: 7.3, h: 0.4, paras: [{ text: 'IRR BY SCENARIO', size: 11, bold: true, color: P_ACCENT }] },
    ...barChart(0.68, 1.75, 7.6, scenRows.map((s) => ({ label: s.name, value: s.irr, color: s.name === 'Downside' ? P_AMBER : s.name === 'Upside' ? P_GREEN : P_ACCENT })), '%'),
    { kind: 'text', x: 0.68, y: 4.3, w: 7.3, h: 0.4, paras: [{ text: 'MOIC BY SCENARIO', size: 11, bold: true, color: P_ACCENT }] },
    ...barChart(0.68, 4.75, 7.6, scenRows.map((s) => ({ label: s.name, value: s.moic, color: s.name === 'Downside' ? P_AMBER : s.name === 'Upside' ? P_GREEN : P_ACCENT })), 'x'),
    { kind: 'rect', x: 8.6, y: 1.3, w: 4.05, h: 5.1, fill: 'F4F7FB' },
    { kind: 'text', x: 8.82, y: 1.45, w: 3.7, h: 0.4, paras: [{ text: 'ENTRY & HURDLE', size: 11, bold: true, color: P_ACCENT }] },
    { kind: 'text', x: 8.82, y: 1.9, w: 3.7, h: 4.3, valign: 't', paras: [
      { runs: [{ text: 'Entry EV/EBITDA:  ', size: 12.5, bold: true, color: P_INK }, { text: x$(e.evEbitda), size: 12.5 }], spaceAfter: 9 },
      { runs: [{ text: 'Entry EV:  ', size: 12.5, bold: true, color: P_INK }, { text: m$(e.entryEV), size: 12.5 }], spaceAfter: 9 },
      { runs: [{ text: 'Leverage:  ', size: 12.5, bold: true, color: P_INK }, { text: e.leverage || '—', size: 12.5 }], spaceAfter: 9 },
      { runs: [{ text: 'Hold:  ', size: 12.5, bold: true, color: P_INK }, { text: e.holdYears != null ? `${e.holdYears} yrs` : '—', size: 12.5 }], spaceAfter: 9 },
      { runs: [{ text: 'Hurdle:  ', size: 12.5, bold: true, color: P_INK }, { text: hurdle.irr ? `${hurdle.irr}% / ${hurdle.moic}x` : '—', size: 12.5 }], spaceAfter: 9 },
      { runs: [{ text: 'Clears hurdle:  ', size: 12.5, bold: true, color: P_INK }, { text: R.meetsHurdle == null ? '—' : (R.meetsHurdle ? 'Yes' : 'No'), size: 12.5, bold: true, color: R.meetsHurdle ? P_GREEN : P_RED }], spaceAfter: 9 },
    ] },
  ]);

  // 7) Value creation (levers table + EBITDA bridge bars)
  slides.push([
    ...deckHeader('Value creation plan', co),
    { kind: 'text', x: 0.68, y: 1.3, w: 7.3, h: 0.4, paras: [{ text: 'OPERATING LEVERS', size: 11, bold: true, color: P_ACCENT }] },
    ...(levers.length ? gridTable(0.68, 1.72, 7.6, ['Lever', 'Impact', 'Timeline'], levers.slice(0, 6).map((l) => [l.name, l.impact != null ? `+${cur}${l.impact}M` : '—', l.timeline || '—']), [50, 22, 28]) : [{ kind: 'text', x: 0.68, y: 1.8, w: 7.3, h: 1, paras: [{ text: 'Levers populate from the value-creation plan.', size: 13, color: P_MUTE }] }]),
    { kind: 'rect', x: 8.6, y: 1.3, w: 4.05, h: 5.1, fill: 'F4F7FB' },
    { kind: 'text', x: 8.82, y: 1.45, w: 3.7, h: 0.4, paras: [{ text: 'EBITDA BRIDGE', size: 11, bold: true, color: P_ACCENT }] },
    { kind: 'text', x: 8.82, y: 1.85, w: 3.7, h: 0.5, paras: [{ text: bridge.exit != null ? `${m$(bridge.entry)} → ${m$(bridge.exit)}  (+${m$(bridge.delta).slice(1)})` : '', size: 13, bold: true, color: P_INK }] },
    ...(bridge.components ? barChart(8.82, 2.5, 3.7, bridge.components.map((c) => ({ label: c.lever?.split(' ')[0] || 'Lever', value: c.contribution, color: P_GREEN })), 'M').map((sh) => sh) : []),
  ]);

  // 8) Diligence findings by workstream (RAG)
  const wsColor = (w) => { const p = Number(w.progress); const st = (w.status || '').toLowerCase(); if (/block|red|stop/.test(st)) return P_RED; if (p >= 80 || /complete|clear|green/.test(st)) return P_GREEN; if (p >= 40 || /progress|amber/.test(st)) return P_AMBER; return P_MUTE; };
  slides.push([
    ...deckHeader('Diligence findings by workstream', co),
    ...(workstreams.length ? gridTable(0.68, 1.35, 12, ['Workstream', 'Owner', 'Progress', 'Status'], workstreams.map((w) => [prettyWorkstream(w.name || w.lane), prettyRole(w.owner || w.md || w.lead), Number.isFinite(Number(w.progress)) ? `${w.progress}%` : '—', prettyStatus(w.status)]), [34, 26, 14, 26]) : [{ kind: 'text', x: 0.68, y: 1.5, w: 12, h: 1, paras: [{ text: 'Workstreams not yet provisioned.', size: 13, color: P_MUTE }] }]),
    { kind: 'text', x: 0.68, y: 5.6, w: 12, h: 1.2, valign: 't', paras: [{ runs: [{ text: 'Status:  ', size: 12, bold: true, color: P_INK }, { text: `${workstreams.filter((w) => Number(w.progress) >= 80).length} substantially complete · ${workstreams.filter((w) => Number(w.progress) < 40).length} early · compliance ${dash(deal.complianceCleared)}/${dash(deal.complianceTotal)} cleared.`, size: 12, color: '2B2B2B' }] }] },
  ]);

  // 9) Risk matrix
  const riskList = riskItems.slice(0, 8);
  const sevColor = (r) => { const s = (r.severity || r.severityLabel || '').toLowerCase(); if (/stop|high|red/.test(s)) return P_RED; if (/condition|reprice|closing/.test(s)) return P_AMBER; return P_MUTE; };
  slides.push([
    ...deckHeader('Key risks & mitigants', co),
    ...(riskList.length ? gridTable(0.68, 1.35, 12, ['Risk', 'Timing', 'Likelihood', 'Mitigation'], riskList.map((r) => [clip(r.risk, 58), riskTiming(r), r.likelihood || '—', clip(r.mitigation || '—', 48)]), [38, 16, 12, 34]) : [{ kind: 'text', x: 0.68, y: 1.5, w: 12, h: 1, paras: [{ text: 'No material risks flagged — diligence clear or pending.', size: 13, color: P_MUTE }] }]),
  ]);

  // 10) IC readiness & recommendation
  const artifacts = reqItems.filter((a) => !a.complete && !MEMO_FULFILS.has(a.key)).map((a) => a.label);
  slides.push([
    ...deckHeader('IC readiness & recommendation', co),
    { kind: 'text', x: 0.68, y: 1.3, w: 11.9, h: 0.6, paras: [{ runs: [
      { text: 'Verdict: ', size: 16, color: P_MUTE }, { text: verdict.state || 'PENDING', size: 16, bold: true, color: vColor },
      { text: `    ·    ${pct(deal.readiness)} ready`, size: 16, color: '2B2B2B' },
      { text: typeof deal.daysToIC === 'number' && deal.daysToIC >= 0 ? `    ·    IC in ${deal.daysToIC}d` : '', size: 16, color: '2B2B2B' },
    ] }] },
    { kind: 'text', x: 0.68, y: 1.95, w: 11.9, h: 0.5, paras: [{ text: verdict.headline || '', size: 13, italic: true, color: P_ACCENT }] },
    { kind: 'text', x: 0.68, y: 2.6, w: 5.8, h: 0.4, paras: [{ text: 'REQUIRED ARTIFACTS', size: 11, bold: true, color: P_ACCENT }] },
    { kind: 'text', x: 0.68, y: 3.0, w: 5.8, h: 3.2, valign: 't', paras: (reqItems.length ? reqItems : [{ label: 'Artifacts populate from the deal.', complete: false }]).slice(0, 7).map((a) => ({ runs: [{ text: (a.complete || MEMO_FULFILS.has(a.key)) ? '✓  ' : '○  ', size: 13, bold: true, color: (a.complete || MEMO_FULFILS.has(a.key)) ? P_GREEN : P_AMBER }, { text: a.label, size: 12.5, color: '2B2B2B' }], spaceAfter: 7 })) },
    { kind: 'text', x: 6.9, y: 2.6, w: 5.8, h: 0.4, paras: [{ text: 'OUTSTANDING FOR IC', size: 11, bold: true, color: P_ACCENT }] },
    { kind: 'text', x: 6.9, y: 3.0, w: 5.8, h: 2.6, valign: 't', paras: (artifacts.length ? artifacts : ['All required artifacts complete — ready for committee.']).slice(0, 6).map((t) => bulletPara(t, { size: 12.5 })) },
    { kind: 'rect', x: 0.64, y: 6.0, w: 12.05, h: 0.85, fill: 'F4F7FB' },
    { kind: 'rect', x: 0.64, y: 6.0, w: 0.09, h: 0.85, fill: (Number(deal.readiness) || 0) >= 60 ? P_GREEN : P_ACCENT },
    { kind: 'text', x: 0.9, y: 6.12, w: 11.6, h: 0.65, valign: 'ctr', paras: [{ runs: [{ text: 'Recommendation:  ', size: 13, bold: true, color: P_INK }, { text: A.ask, size: 12.5, color: '2B2B2B' }] }] },
  ]);

  return renderPptx(slides, { title: `IC Deck — ${co}` });
}
function ic_open(reqItems) { return (reqItems || []).filter((a) => !a.complete).map((a) => a.label); }
