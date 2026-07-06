// Deal tool contracts — the single source of truth for the "analyst tools" that
// read the fund's deals (stored in Cosmos, container `deals`). Both surfaces reuse
// these EXACT contracts and projections:
//   • the Foundry "deal-room-analyst" agent (lib/dealAgent.js), and
//   • the Deal MCP server for Copilot Studio (lib/mcp/dealServer.js).
//
// Keeping the projections + dispatch + scope enforcement here means a partner-MD
// Copilot Studio agent and the in-app analyst see identical, size-bounded views of
// a deal, and the same server-side per-deal scoping guarantees.

import { listDeals, getDeal } from './store.js';

// ---- projections (narrow, size-bounded views of the deal record) ------------
const trim = (s, n) => (typeof s === 'string' && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
const RISK_SEVERITIES = new Set(['caution', 'negative', 'risk', 'high', 'warning']);

// Sections a caller may request from get_deal (also the MCP tool's enum).
export const DEAL_SECTIONS = ['summary', 'financials', 'workstreams', 'memo', 'compliance', 'risks', 'activity'];
const DEFAULT_SECTIONS = ['summary', 'financials', 'workstreams', 'memo', 'compliance', 'risks'];

export function dealSummary(s) {
  return {
    id: s.id,
    company: s.company,
    sector: s.sector,
    subSector: s.subSector,
    hq: s.hq,
    dealSize: s.dealSize,
    currency: s.currency,
    stage: s.stage,
    stageName: s.stageName,
    status: s.status,
    readiness: s.readiness,
    daysToIC: s.daysToIC,
    diligenceProgress: s.diligenceProgress,
    memoProgress: s.memoProgress,
    thesis: trim(s.thesis, 240)
  };
}

export function listDealSummaries() {
  return listDeals().map(dealSummary);
}

export function summaryFor(id) {
  return listDeals().find((s) => s.id === id) || null;
}

// Bounded "analyst view" of one deal. `sections` narrows what is returned.
export function dealAnalystView(id, sections) {
  const d = getDeal(id);
  if (!d) return { error: 'deal-not-found', deal_id: id };
  const want = new Set(Array.isArray(sections) && sections.length ? sections : DEFAULT_SECTIONS);
  const view = { id: d.id, company: d.company };

  if (want.has('summary')) {
    view.summary = {
      sector: d.sector,
      subSector: d.subSector,
      hq: d.hq,
      dealSize: d.dealSize,
      currency: d.currency,
      stage: d.stage,
      stageName: d.stageName,
      status: d.status,
      leadAnalyst: d.leadAnalyst,
      sponsorPersona: d.sponsorPersona,
      thesis: trim(d.thesis, 600),
      readiness: d.readiness,
      daysToIC: d.daysToIC,
      projectedICDate: d.projectedICDate,
      diligenceProgress: d.diligenceProgress
    };
  }
  if (want.has('financials')) {
    view.keyFigures = (d.keyFigures || []).slice(0, 14).map((f) => ({ label: f.label, value: f.value, source: f.source }));
  }
  if (want.has('workstreams')) {
    view.workstreams = (d.workstreams || []).map((w) => ({
      lane: w.lane,
      status: w.status,
      progress: w.progress,
      findings: (w.findings || []).slice(0, 2).map((f) => ({ text: trim(f.text, 220), severity: f.severity }))
    }));
  }
  if (want.has('memo')) {
    view.memo = {
      progress: d.memoProgress,
      approved: d.memoApproved,
      total: d.memoTotal,
      sections: (d.memoSections || []).map((m) => ({ title: m.title, status: m.status }))
    };
  }
  if (want.has('compliance')) {
    view.compliance = {
      cleared: d.complianceCleared,
      total: d.complianceTotal,
      items: (d.compliance || []).map((c) => ({ check: c.check, framework: c.framework, status: c.status }))
    };
  }
  if (want.has('risks')) {
    const risks = [];
    for (const w of d.workstreams || []) {
      for (const f of w.findings || []) {
        if (RISK_SEVERITIES.has(f.severity)) risks.push({ text: trim(f.text, 220), lane: w.lane, source: f.source });
      }
    }
    for (const c of d.compliance || []) {
      if (c.status && c.status !== 'passed' && c.status !== 'cleared') {
        risks.push({ text: `Open compliance item: ${c.check} (${c.framework})`, lane: 'compliance', source: c.framework });
      }
    }
    view.risks = risks.slice(0, 8);
  }
  if (want.has('activity')) {
    view.activity = (d.activity || []).slice(0, 6).map((a) => ({ actor: a.actor, action: trim(a.action, 160), when: a.when }));
  }
  return view;
}

export function searchDealSummaries(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  return listDeals()
    .filter((s) => {
      const hay = `${s.company} ${s.sector} ${s.subSector} ${s.thesis}`.toLowerCase();
      return terms.some((t) => hay.includes(t));
    })
    .map(dealSummary);
}

// ---- tool dispatch with server-side scope enforcement -----------------------
// In 'deal' scope every tool is hard-filtered to the focused deal, so a caller
// (a model, or a Copilot Studio agent) cannot reach another deal's data no matter
// what arguments it emits. 'portfolio' scope exposes the whole pipeline.
export function dispatchTool(name, args, { scope = 'portfolio', focusId, focusCompany } = {}) {
  const dealScope = scope === 'deal';
  if (name === 'list_deals') {
    if (dealScope) {
      const s = summaryFor(focusId);
      return { scoped_to: focusCompany, deals: s ? [dealSummary(s)] : [], note: `Scoped to ${focusCompany}; other deals are not accessible in this conversation.` };
    }
    return { deals: listDeals().map(dealSummary) };
  }
  if (name === 'get_deal') {
    if (dealScope) {
      const note = args?.deal_id && args.deal_id !== focusId
        ? `Ignored deal_id "${args.deal_id}" — this conversation is scoped to ${focusCompany} (${focusId}).`
        : undefined;
      const view = dealAnalystView(focusId, args?.sections);
      return note ? { ...view, note } : view;
    }
    if (!args?.deal_id) return { error: 'deal_id-required' };
    return dealAnalystView(args.deal_id, args?.sections);
  }
  if (name === 'search_deals') {
    if (dealScope) {
      const s = summaryFor(focusId);
      return { scoped_to: focusCompany, deals: s ? [dealSummary(s)] : [], note: `Scoped to ${focusCompany}; search is limited to this deal.` };
    }
    return { deals: searchDealSummaries(args?.query) };
  }
  return { error: 'unknown-tool', name };
}

// Human-readable tool descriptions — shared so the MCP tool descriptions and any
// docs stay identical to what the Foundry agent was provisioned with.
export const TOOL_DESCRIPTIONS = {
  list_deals:
    "List EVERY deal in the fund's pipeline as a compact summary (id, company, sector, stage, " +
    'status, deal size, IC readiness, days-to-IC, thesis). Use to see the whole portfolio or to ' +
    "find a deal's id.",
  get_deal:
    'Get ONE deal as a bounded analyst view: key figures, diligence workstreams + status, ' +
    'memo-section status, compliance status and top risks/findings. Use for anything specific ' +
    'about a named deal. Pass optional sections to narrow the view.',
  search_deals:
    'Keyword-search the pipeline across company name, sector and thesis when you do not know the ' +
    'deal id. Returns matching deal summaries.'
};
