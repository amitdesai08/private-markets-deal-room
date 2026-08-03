// IC Readiness Cockpit — turns "readiness" from a completion percentage into a
// decision-grade board. Given a live deal record, computeICReadiness answers the
// seven questions an Investment Committee actually asks before it will convene:
//
//   1. Required artifacts complete?      -> requiredArtifacts[]
//   2. Which workstreams are blocking?   -> blockingWorkstreams[]
//   3. Which assumptions changed since    -> changedAssumptions[]
//      the last IC draft?
//   4. Which risks are unresolved?        -> unresolvedRisks[]  (open issues)
//   5. Which source documents support     -> supportingSources[]
//      the recommendation?
//   6. What is the exact IC ask?          -> icAsk
//   7. What conditions need approval?     -> conditions[]
//
// The overall verdict (READY / CONDITIONAL / NOT-READY) is derived from real
// gating facts (missing artifacts, blocking lanes, unresolved high-severity
// issues) — not from an averaged progress bar. Everything is grounded in what is
// actually on the deal record: workstream findings/contributions, the issue log,
// conditions, assumption snapshots, memo section status, compliance and the
// deal's documents/filings — so the board is defensible, not decorative.

import { buildReturns, fmtMoney as money } from './screening.js';

const LANE_LABEL = {
  commercial: 'Commercial DD', techai: 'Tech / AI DD', operations: 'Operations DD',
  financial: 'Financial / QoE', legal: 'Legal DD', tax: 'Tax DD', esg: 'ESG / Environmental'
};

// Memo sections that MUST be at least drafted (thesis, recommendation) vs approved.
const REQUIRED_MEMO_KEYS = ['thesis', 'recommendation'];
const OPEN_ISSUE_STATUSES = new Set(['open', 'mitigating']);
const BLOCKING_SEVERITIES = new Set(['risk', 'negative']);

const laneLabel = (l) => LANE_LABEL[l] || l;

// ---- 1. Required artifacts -------------------------------------------------
function requiredArtifacts(deal) {
  const arts = deal.artifacts || {};
  // `artifacts` is the AI generator's CACHE — it is populated when somebody presses
  // generate. On its own it makes this check ask "has the agent been run?" rather than
  // "does the paper exist?", which is not the same question and is not the one a
  // committee cares about. `icPapers` records that the deliverable is on file by any
  // route, so a deal that has already been to committee is not reported as missing the
  // very papers the committee read.
  const filed = deal.icPapers || {};
  const onRecord = (k) => !!(arts[k] || filed[k]);
  const memo = deal.memoSections || [];
  const memoApproved = memo.filter((m) => m.status === 'approved').length;
  const recSection = memo.find((m) => m.key === 'recommendation');
  const compliance = deal.compliance || [];
  const complianceCleared = compliance.length && compliance.every((c) => c.status === 'passed');

  const items = [
    // Labels are the deliverable, not its internal artifact code. These strings are
    // now read out verbatim in the gating sentence on the home queue and the deal row,
    // where "D2" means nothing to a partner.
    { key: 'D1', label: 'Diligence plan', complete: onRecord('D1'), detail: onRecord('D1') ? 'Plan on record.' : 'Not yet on record.' },
    { key: 'D2', label: 'Findings / red-flag report', complete: onRecord('D2'), detail: onRecord('D2') ? 'Findings synthesized.' : 'Not yet on record.' },
    { key: 'D3', label: 'Final IC memo', complete: onRecord('D3'), detail: onRecord('D3') ? 'Memo drafted.' : 'Not yet on record.' },
    { key: 'memo', label: 'IC memo sections approved', complete: memo.length > 0 && memoApproved === memo.length, detail: `${memoApproved}/${memo.length} sections approved.` },
    { key: 'recommendation', label: 'Recommendation drafted', complete: !!recSection && recSection.status !== 'empty', detail: recSection ? `Status: ${recSection.status}.` : 'No recommendation section.' },
    { key: 'compliance', label: 'KYC / compliance cleared', complete: !!complianceCleared, detail: compliance.length ? `${compliance.filter((c) => c.status === 'passed').length}/${compliance.length} cleared.` : 'No compliance checks.' }
  ];
  const complete = items.filter((i) => i.complete).length;
  return { items, complete, total: items.length, allComplete: complete === items.length };
}

// ---- 2. Blocking workstreams ----------------------------------------------
// A lane BLOCKS the committee when nothing has actually been done in it, when it has
// been explicitly halted, or when it carries an unresolved high-severity finding. A lane
// that is merely partway through does NOT block — that is progress, and
// `progressReadiness` already carries it. Treating "under 80%" as blocking made every
// mid-diligence deal NOT-READY, which collapsed the verdict to a single reachable state.
//
// "Nothing has been done" is tested against EVIDENCE, not against the typed percentage.
// Any numeric threshold is a switch: at 80 an analyst types 80, and at 0 an analyst types
// 1. A lane that has produced no finding and no contribution has not started, whatever
// number is in the box — and unlike the number, that cannot be cleared without either
// doing the work or fabricating a finding with an author against it.
function blockingWorkstreams(deal, openIssues) {
  const lanes = deal.workstreams || [];
  const out = [];
  for (const w of lanes) {
    const laneIssues = openIssues.filter((i) => i.lane === w.lane);
    const blockingIssues = laneIssues.filter((i) => BLOCKING_SEVERITIES.has(i.severity));
    const noEvidence = !(w.findings || []).length && !(w.contributions || []).length;
    // `status === 'complete'` is NOT an exemption. It is a value somebody types, and
    // exempting it reopened by one word the same door the progress field used to be.
    const notOpened = w.status === 'not_started' || noEvidence;
    const halted = w.status === 'blocked' || w.status === 'on_hold';
    const reasons = [];
    if (notOpened) reasons.push(w.status === 'not_started' ? 'not started' : 'no work recorded against it');
    else if (halted) reasons.push(`workstream ${w.status.replace('_', ' ')}`);
    if (blockingIssues.length) reasons.push(`${blockingIssues.length} open high-severity issue(s)`);
    if (reasons.length) {
      out.push({ lane: w.lane, label: laneLabel(w.lane), owner: w.owner || null, progress: w.progress || 0, status: w.status || 'not_started', openIssues: laneIssues.length, blockingIssues: blockingIssues.length, reasons });
    }
  }
  return out;
}

// ---- 3. Changed assumptions (vs last snapshot) -----------------------------
export function changedAssumptions(deal) {
  const snaps = deal.assumptionSnapshots || [];
  if (!snaps.length) return { baseline: null, changes: [], note: 'No prior IC-draft snapshot to compare against.' };
  const baseline = snaps[snaps.length - 1]; // latest snapshot = last IC draft
  const now = currentAssumptions(deal);
  const changes = [];
  for (const [key, cur] of Object.entries(now)) {
    const prev = baseline.figures?.[key];
    if (prev != null && cur != null && String(prev) !== String(cur)) {
      changes.push({ key, label: ASSUMPTION_LABELS[key] || key, from: prev, to: cur });
    }
  }
  return { baseline: { label: baseline.label, at: baseline.at }, changes, note: changes.length ? `${changes.length} assumption(s) changed since "${baseline.label}".` : `No assumptions changed since "${baseline.label}".` };
}

const ASSUMPTION_LABELS = {
  revenue: 'Revenue (LTM)', ebitda: 'EBITDA (LTM)', ebitdaMargin: 'EBITDA margin',
  entryMultiple: 'Entry multiple', baseIrr: 'Base-case IRR', baseMoic: 'Base-case MoIC', dealSize: 'Enterprise value'
};

// The current key assumptions, from the deal's key figures + the returns engine.
export function currentAssumptions(deal) {
  const num = (v) => {
    const m = String(v == null ? '' : v).replace(/[^0-9.\-]/g, '');
    return m ? +m : null;
  };
  const kf = {};
  for (const f of deal.keyFigures || []) {
    if (/revenue/i.test(f.label)) kf.revenue = num(f.value);
    else if (/ebitda margin/i.test(f.label)) kf.ebitdaMargin = num(f.value);
    else if (/ebitda/i.test(f.label)) kf.ebitda = num(f.value);
  }
  const cand = { ...deal, revenue: kf.revenue, ebitda: kf.ebitda, growth: deal.growth };
  let entryMultiple = null, baseIrr = null, baseMoic = null;
  try {
    const r = buildReturns({ ebitda: kf.ebitda ?? 0, dealSize: deal.dealSize ?? 0, growth: deal.growth ?? 6, revenue: kf.revenue ?? 0 });
    entryMultiple = r.entryMultiple;
    baseIrr = r.scenarios?.base?.irr ?? null;
    baseMoic = r.scenarios?.base?.moic ?? null;
  } catch { /* returns are best-effort */ }
  return { revenue: kf.revenue, ebitda: kf.ebitda, ebitdaMargin: kf.ebitdaMargin, dealSize: deal.dealSize ?? null, entryMultiple, baseIrr, baseMoic };
}

// ---- 5. Supporting sources (grounding) -------------------------------------
// Real evidence on the record: the deal's documents, the source citations on open
// and resolved issues, memo-section citations, and the sources tagged on findings.
function supportingSources(deal, allIssues) {
  const seen = new Set();
  const out = [];
  const add = (kind, label, ref) => {
    const k = `${kind}:${label}`;
    if (!label || seen.has(k)) return;
    seen.add(k);
    out.push({ kind, label, ref: ref || null });
  };
  for (const d of deal.documents || []) add('document', d.name, d.status);
  for (const iss of allIssues) for (const s of iss.sources || []) add(s.kind || 'source', s.label, s.ref || s.url || null);
  for (const m of deal.memoSections || []) for (const c of m.citations || []) add('citation', c, m.title);
  for (const w of deal.workstreams || []) {
    for (const c of w.contributions || []) if (c.source && c.source !== 'Diligence') add('finding-source', c.source, laneLabel(w.lane));
  }
  return out;
}

// ---- 6. The exact IC ask ---------------------------------------------------
function icAsk(deal) {
  if (deal.icAsk) return { ...deal.icAsk, source: 'set' };
  // Derive from the returns engine + deal fields when not explicitly set.
  const kf = currentAssumptions(deal);
  let r = null;
  try { r = buildReturns({ ebitda: kf.ebitda ?? 0, dealSize: deal.dealSize ?? 0, growth: deal.growth ?? 6, revenue: kf.revenue ?? 0 }); } catch { /* best effort */ }
  const ev = deal.dealSize ?? null;
  const equity = r?.scenarios?.base?.equity ?? (ev != null ? Math.round(ev * 0.45) : null);
  return {
    enterpriseValue: ev != null ? money(ev) : '—',
    entryMultiple: r ? `${r.entryMultiple}x adj. EBITDA` : '—',
    equityCheck: equity != null ? money(equity) : '—',
    structure: 'Control buyout · completion accounts with NWC true-up',
    hurdle: r ? `${r.hurdle.irr}% IRR / ${r.hurdle.moic}x MoIC` : '20% IRR / 2.0x MoIC',
    baseCase: r?.scenarios?.base ? `${r.scenarios.base.irr}% IRR · ${r.scenarios.base.moic}x MoIC` : '—',
    source: 'derived'
  };
}

// ---- verdict ---------------------------------------------------------------
// Which question is worth asking of this deal.
//   origination     — it has not been asked to committee, so it cannot have failed to reach one
//   diligence       — the IC-readiness gate applies: are the papers on record and the lanes clear
//   post-committee  — it has BEEN to committee. "Is it ready to table" is answered and past.
//                     The only live question is whether its conditions are closed.
// Running the readiness gate over an Execution or Value deal produces a confident
// falsehood in both directions: it reports a signed deal as "not ready to table", and if
// you force the inputs to clear it, it reports a signed deal as "ready to table".
export function dealPhase(deal) {
  if (deal.status === 'screened' || deal.stageId === 'screened') return 'origination';
  const stage = String(deal.stage || '');
  if (/^o/i.test(stage)) return 'origination';
  if (/^[ev]/i.test(stage)) return 'post-committee';
  // D5 is the diligence stage's ARCHIVE / close-out step, which a deal only reaches after
  // the committee has sat. Reading it as diligence made `baltic-precision` — stage D5,
  // status `signing`, thesis "IC approved; deal archived" — report "IC-ready: required
  // artifacts complete, no blocking workstreams". A signed and archived deal presented as
  // ready to be tabled. The regex above was written for E and V and simply did not reach it.
  if (/^d5/i.test(stage)) return 'post-committee';
  // The status field can also say it outright, whatever the stage letter is.
  if (['signing', 'signed', 'closing', 'closed', 'completed', 'owned', 'exited', 'archived'].includes(String(deal.status || '').toLowerCase())) return 'post-committee';
  return 'diligence';
}

// Gating strings NAME what is outstanding. A bare count ("3 required artifacts
// incomplete") tells a partner there is a problem without telling them which one, so
// the first thing they do is open the deal to find out — which is the click the whole
// surface exists to save.
function verdict({ required, blocking, unresolvedRisks, conditions, phase, deal }) {
  const openConditions = conditions.filter((c) => c.status !== 'satisfied');

  // Past committee: the papers and the lanes are history and are not re-litigated. But
  // "the readiness question is closed" is NOT "there is nothing outstanding". An earlier
  // pass returned a clean READY here, so a signed deal with its EU merger-control filing
  // and its KYC screening still running read as "Approved at committee — no conditions
  // outstanding". That switched off the only check on the deals closest to spending money.
  //
  // Note also what the phase is and is not. It is read from the deal's STAGE — the firm's
  // system of record for where the deal sits. Nothing on the record is a committee decision
  // (date, attendees, outcome, terms), so this must not be worded as though a minute exists.
  if (phase === 'post-committee') {
    const openChecks = (deal?.compliance || []).filter((c) => c.status !== 'passed');
    // `blocking` is read here too. It was not, and the result was one payload contradicting
    // itself: `demo-peachtree` shipped `blockingWorkstreams: ['Tech / AI DD']` — reason,
    // no work recorded against it — under the headline "nothing outstanding on the record".
    // A lane nobody has evidenced is outstanding whatever stage the deal is at.
    //
    // But it is not the same KIND of thing, and the headline used to say it was. An open
    // condition is an obligation the firm accepted at the committee; an unevidenced lane is
    // work nobody recorded. Calling four never-opened lanes "obligations still outstanding"
    // on a deal that has signed and been archived states a fact about a closed transaction
    // that is not true. The state is unchanged — both still hold the deal off clean — but
    // the sentence now names each for what it is.
    const obligations = [
      ...openConditions.map((c) => c.text || c.id),
      ...openChecks.map((c) => `${c.check}${c.framework ? ` (${c.framework})` : ''} not cleared`),
    ];
    const unevidenced = blocking.map((b) => `${b.label} — ${b.reasons.join(', ')}`);
    const outstanding = [...obligations, ...unevidenced];
    if (outstanding.length) {
      const parts = [];
      if (obligations.length) parts.push(`${obligations.length} obligation${obligations.length === 1 ? '' : 's'} still outstanding`);
      if (unevidenced.length) parts.push(`${unevidenced.length} diligence workstream${unevidenced.length === 1 ? '' : 's'} with no work recorded`);
      return {
        state: 'CONDITIONAL',
        headline: `Past the IC decision — ${parts.join(' and ')}.`,
        gating: outstanding,
        openConditions: openConditions.length,
        openComplianceChecks: openChecks.length,
        phase,
        basis: 'Stage on the deal record. No committee decision record exists to confirm the approval terms.',
      };
    }
    return {
      state: 'READY',
      headline: 'Past the IC decision — nothing outstanding on the record.',
      gating: [],
      openConditions: 0,
      openComplianceChecks: 0,
      phase,
      basis: 'Stage on the deal record. No committee decision record exists to confirm the approval terms.',
    };
  }

  const gating = [];
  if (!required.allComplete) {
    const missing = required.items.filter((i) => !i.complete).map((i) => i.label);
    gating.push(`${missing.length} required item${missing.length === 1 ? '' : 's'} outstanding: ${missing.join(', ')}`);
  }
  if (blocking.length) gating.push(`${blocking.length} workstream${blocking.length === 1 ? '' : 's'} blocking: ${blocking.map((b) => b.label).join(', ')}`);
  const hardRisks = unresolvedRisks.filter((i) => i.severity === 'risk');
  if (hardRisks.length) gating.push(`${hardRisks.length} unresolved risk-level issue${hardRisks.length === 1 ? '' : 's'}`);

  let state, headline;
  if (gating.length) {
    state = 'NOT-READY';
    headline = `Not IC-ready — ${gating.join('; ')}.`;
  } else if (openConditions.length) {
    state = 'CONDITIONAL';
    headline = `IC-ready, subject to ${openConditions.length} condition(s) to close.`;
  } else {
    state = 'READY';
    headline = 'IC-ready — required artifacts complete, no blocking workstreams or unresolved risks.';
  }
  return { state, headline, gating, openConditions: openConditions.length, phase };
}

// ---- public: the decision board --------------------------------------------
export function computeICReadiness(deal) {
  const allIssues = (deal.issues || []).slice();
  const openIssues = allIssues.filter((i) => OPEN_ISSUE_STATUSES.has(i.status));

  const required = requiredArtifacts(deal);
  const blocking = blockingWorkstreams(deal, openIssues);
  const assumptions = changedAssumptions(deal);
  const unresolvedRisks = openIssues
    .filter((i) => BLOCKING_SEVERITIES.has(i.severity) || i.severity === 'caution')
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity))
    .map((i) => ({ id: i.id, lane: i.lane, laneLabel: laneLabel(i.lane), title: i.title, severity: i.severity, owner: i.owner || null, status: i.status, resolutionPath: i.resolutionPath || null, sources: (i.sources || []).length }));
  const sources = supportingSources(deal, allIssues);
  const ask = icAsk(deal);
  const conditions = (deal.conditions || []).map((c) => ({ id: c.id, text: c.text, owner: c.owner || null, status: c.status || 'proposed' }));

  const v = verdict({ required, blocking, unresolvedRisks, conditions, phase: dealPhase(deal), deal });

  return {
    dealId: deal.id,
    company: deal.company,
    stage: deal.stage,
    phase: dealPhase(deal),
    verdict: v,
    // legacy completion % kept for continuity, clearly labelled as progress-only
    progressReadiness: deal.readiness ?? null,
    requiredArtifacts: required,
    blockingWorkstreams: blocking,
    changedAssumptions: assumptions,
    unresolvedRisks,
    supportingSources: sources,
    icAsk: ask,
    conditions,
    overrides: (deal.icOverrides || []).map((o) => ({ stage: o.stage, gate: o.gate, verdict: o.verdict, reason: o.reason, by: o.by, at: o.at })),
    counts: {
      openIssues: openIssues.length,
      unresolvedRisks: unresolvedRisks.length,
      blockingWorkstreams: blocking.length,
      conditions: conditions.length,
      sources: sources.length
    }
  };
}

function sevRank(s) {
  return { risk: 4, negative: 3, caution: 2, neutral: 1, positive: 0 }[s] ?? 1;
}
