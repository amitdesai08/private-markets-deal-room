// IC Readiness Cockpit — turns "readiness" from a completion percentage into a
// decision-grade board. Given a live deal record, computeICReadiness answers the
// seven questions an Investment Committee actually asks before it will convene:
//
//   1. Required papers complete?      -> requiredArtifacts[]
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
import { canonicalFigures, dealGrowth, buildRiskRegister , statedMultipleOf, reconcileFindingText } from './diligence.js';
import { ownerLabel } from './cockpit.js';

const LANE_LABEL = {
  commercial: 'Commercial DD', techai: 'Tech / AI DD', operations: 'Operations DD',
  financial: 'Financial / QoE', legal: 'Legal DD', tax: 'Tax DD', esg: 'ESG / Environmental'
};

// Memo sections that MUST be at least drafted (thesis, recommendation) vs approved.
const REQUIRED_MEMO_KEYS = ['thesis', 'recommendation'];
const OPEN_ISSUE_STATUSES = new Set(['open', 'mitigating']);
const BLOCKING_SEVERITIES = new Set(['risk', 'negative']);

const laneLabel = (l) => LANE_LABEL[l] || l;

// Two records describing the same obligation rarely match character for character:
// Helvetia carried "Regulatory clearance in both jurisdictions" as a condition and
// "Antitrust / merger clearance (CH + EU)" under Regulatory as a compliance check, and
// listed both, so a partner reading the deal counted two clearances where one exists.
// Compare on the substantial words -- two shared ones is a strong signal in a list this
// short, and a financing CP shares none of them with a regulatory clearance.
const STOPWORD = new Set(['and', 'the', 'for', 'with', 'both', 'not', 'all', 'any', 'from', 'into', 'that', 'this', 'check', 'checks', 'status']);
const words = (s) => new Set(
  String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOPWORD.has(w))
);
function sameObligation(a, b) {
  const wa = words(a);
  const wb = words(b);
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  return shared >= 2;
}

// One plain sentence per memo-section state, so the committee board never prints the
// stored value at a partner.
const REC_STATUS_TEXT = {
  empty: 'Not written yet.',
  draft: 'Drafted, not yet reviewed.',
  in_review: 'Drafted and with the reviewer.',
  review: 'Drafted and with the reviewer.',
  approved: 'Drafted and approved.',
};

// ---- 1. Required papers -------------------------------------------------
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
    { key: 'D2', label: 'Findings / red-flag report', complete: onRecord('D2'), detail: onRecord('D2') ? 'Findings synthesised.' : 'Not yet on record.' },
    { key: 'D3', label: 'Final IC memo', complete: onRecord('D3'), detail: onRecord('D3') ? 'Memo drafted.' : 'Not yet on record.' },
    { key: 'memo', label: 'IC memo sections approved', complete: memo.length > 0 && memoApproved === memo.length, detail: `${memoApproved}/${memo.length} sections approved.` },
    // "Status: empty." and "Status: approved." were the stored enum printed straight
    // onto a committee-readiness board. Say what the state means for the paper.
    { key: 'recommendation', label: 'Recommendation drafted', complete: !!recSection && recSection.status !== 'empty', detail: !recSection ? 'No recommendation section on the memo.' : REC_STATUS_TEXT[recSection.status] || `Recommendation is ${String(recSection.status).replace(/_/g, ' ')}.` },
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
    // A lane recorded as closed out at committee is not an open gap in this deal's
    // diligence -- it is a lane that never existed while the deal was being worked.
    // Listing it as a blocker asks a partner to chase work that is not outstanding.
    if (w.status === 'closed_at_ic') continue;
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
    // A lane enters this list on high-severity issues alone, and the reason list was then
    // written as though it had also never been opened. Heliopack shipped "Financial /
    // QoE: complete, progress 100" and "Financial / QoE: no work recorded against it" in
    // one payload, which is a straight contradiction and the kind that costs a reader
    // their trust in everything else on the page. Where the lane HAS been worked, say
    // what is actually holding it.
    if (!reasons.length) continue;
    if (!notOpened && !halted && blockingIssues.length) {
      reasons[reasons.length - 1] = `${blockingIssues.length} open high-severity finding${blockingIssues.length === 1 ? '' : 's'} on a lane otherwise recorded ${w.status === 'complete' ? 'complete' : `at ${w.progress || 0}%`}`;
    }
    if (reasons.length) {
      out.push({ lane: w.lane, label: laneLabel(w.lane), owner: w.owner ? ownerLabel(w.owner, w.lane) : null, progress: w.progress || 0, status: w.status || 'not_started', openIssues: laneIssues.length, blockingIssues: blockingIssues.length, reasons,
        // Nothing on this board carried a date, so "Legal DD, not started, General Counsel"
        // nine days out told a partner it was late and not whether anyone had committed to
        // finishing it. The record holds no completion dates; saying so is the answer.
        dueDate: w.dueDate || null,
        dueNote: w.dueDate ? null : 'No completion date committed on the record.' });
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
  entryMultiple: 'Entry multiple', baseIrr: 'Base-case IRR', baseMoic: 'Base-case MOIC', dealSize: 'Enterprise value'
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
  const cand = { ...deal, revenue: kf.revenue, ebitda: kf.ebitda, growth: dealGrowth(deal) ?? undefined };
  // Read the same canonical figures the deal's own Returns page renders, rather than
  // rebuilding the model from key figures that mostly are not there. Doing the latter fed
  // the engine a zero EBITDA on every deal, which fell through to the 8x default — so the
  // committee's "assumptions" panel reported a flat 8.0x entry on nineteen different
  // companies while each deal's own page said something else, and any deal drafted from
  // that snapshot showed the multiple as having CHANGED when nothing had.
  let entryMultiple = null, baseIrr = null, baseMoic = null;
  try {
    const canon = canonicalFigures(deal);
    if (canon) {
      entryMultiple = canon.entryMultiple;
      baseIrr = canon.irr ?? null;
      baseMoic = canon.moic ?? null;
    }  } catch { /* returns are best-effort */ }
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
  // The sentence a committee chair reads out. It used to disagree with the deal's own
  // Returns page in two ways at once: it defaulted growth to 6 where every other caller
  // uses the recorded rate, and it read `scenarios.base.equity`, a field the returns
  // engine has never returned -- so the "exact" equity cheque was always the silent
  // fallback of 45% of EV. Both now come from the one canonical call.
  const c = canonicalFigures(deal);
  const kf = currentAssumptions(deal);
  // Built from the canonical EBITDA, not this module's own reader. Where a deal records
  // no EBITDA line the local reader returned 0, the paper LBO floored it at 1, and the
  // committee was asked to approve a $3M equity cheque on a $240M enterprise value.
  const ebitdaForAsk = c?.ebitda ?? kf.ebitda ?? 0;
  let r = null;
  try { r = buildReturns({ ebitda: ebitdaForAsk, dealSize: deal.dealSize ?? 0, growth: dealGrowth(deal) ?? undefined, revenue: c?.revenue ?? kf.revenue ?? 0, ebitdaMargin: c?.ebitda && c?.revenue ? +((c.ebitda / c.revenue) * 100).toFixed(1) : undefined }); } catch { /* best effort */ }
  const ev = deal.dealSize ?? null;
  const equity = r?.scenarios?.base?.equityIn ?? (ev != null ? Math.round(ev * 0.45) : null);
  const irr = c?.irr ?? r?.scenarios?.base?.irr ?? null;
  const moic = c?.moic ?? r?.scenarios?.base?.moic ?? null;
  return {
    enterpriseValue: ev != null ? money(ev) : '—',
    entryMultiple: c?.entryMultiple != null ? `${c.entryMultiple}x LTM EBITDA` : r ? `${r.entryMultiple}x LTM EBITDA` : '—',
    equityCheck: equity != null ? money(equity) : '—',
    structure: 'Control buyout · completion accounts with NWC true-up',
    hurdle: r ? `${r.hurdle.irr}% IRR / ${r.hurdle.moic}x MOIC` : '20% IRR / 2.0x MOIC',
    baseCase: irr != null && moic != null ? `${irr}% IRR · ${moic}x MOIC` : '—',
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
  // papers complete, no blocking workstreams". A signed and archived deal presented as
  // ready to be tabled. The regex above was written for E and V and simply did not reach it.
  if (/^d5/i.test(stage)) return 'post-committee';
  // The status field can also say it outright, whatever the stage letter is.
  if (['signing', 'signed', 'closing', 'closed', 'completed', 'owned', 'exited', 'archived'].includes(String(deal.status || '').toLowerCase())) return 'post-committee';
  return 'diligence';
}

// Gating strings NAME what is outstanding. A bare count ("3 required papers
// incomplete") tells a partner there is a problem without telling them which one, so
// the first thing they do is open the deal to find out — which is the click the whole
// surface exists to save.
function verdict({ required, blocking, unresolvedRisks, conditions, phase, deal }) {
  const openConditions = conditions.filter((c) => c.status !== 'satisfied');
  // The register's closing conditions are REPORTED but do not decide the verdict. The
  // board said openConditions 0 beside a register headline reading "4 closing conditions",
  // which is the two screens disagreeing again — but folding them into the decision made
  // every deal in the book conditional and no deal ready to table, which is a different
  // lie. A closing condition is a condition of CLOSING; it does not stop a deal being
  // taken to committee.
  const registerConditions = unresolvedRisks.filter((r) => r.from === 'risk register' && /closing condition/i.test(String(r.severityLabel || ''))).length;

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
    // A regulatory clearance is often recorded twice -- once as a condition the committee
    // attached, once as a compliance check. Home said three obligations, the deal page
    // listed the same clearance under two different names, and neither surface was wrong
    // about its own list. Drop a check whose subject already appears in an open condition.
    const conditionText = openConditions.map((c) => `${c.text || c.id}`);
    const dedupedChecks = openChecks.filter(
      (c) => !conditionText.some((t) => sameObligation(t, `${c.check} ${c.framework || ''}`))
    );
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
      ...dedupedChecks.map((c) => `${c.check}${c.framework ? ` (${c.framework})` : ''} not cleared`),
    ];
    const unevidenced = blocking.map((b) => `${b.label} — ${b.reasons.join(', ')}`);
    // The register was the one list this branch never read, so a signed deal shipped
    // "Past the IC decision — nothing outstanding on the record" in the same payload as
    // counts.unresolvedRisks: 2, over a case page printing both of them.
    //
    // It is REPORTED, and it does not decide the state. Folding it in was tried and the
    // suite caught it: every post-committee deal carries register rows, so a READY
    // verdict became unreachable in that phase and half the chip logic in the deals list
    // stopped being exercised by anything. And it does not belong in `gating` either —
    // an open register row is not an obligation the committee attached. The fault was
    // never the state; it was a headline claiming an absence while the payload beside it
    // held the thing.
    const registerOpen = unresolvedRisks
      .filter((r) => r.from === 'risk register' && !/monitor/i.test(String(r.severityLabel || '')))
      .length;
    const registerPhrase = registerOpen
      ? ` ${registerOpen} item${registerOpen === 1 ? '' : 's'} remain open on the risk register.`
      : '';
    const outstanding = [...obligations, ...unevidenced];
    if (outstanding.length) {
      const parts = [];
      if (obligations.length) parts.push(`${obligations.length} obligation${obligations.length === 1 ? '' : 's'} still outstanding`);
      if (unevidenced.length) parts.push(`${unevidenced.length} diligence workstream${unevidenced.length === 1 ? '' : 's'} with no work recorded`);
      return {
        state: 'CONDITIONAL',
        headline: `Past the IC decision — ${parts.join(' and ')}.${registerPhrase}`,
        gating: outstanding,
        openConditions: openConditions.length,
        openComplianceChecks: dedupedChecks.length,
        // Reported on this branch too. They came back empty on signed deals while
        // in-flight deals returned integers, so a reader comparing two deals could not
        // tell an absent count from a zero.
        registerConditions,
        registerOpen,
        conditionsTotal: openConditions.length + registerConditions,
        phase,
        basis: 'Stage on the deal record. No committee decision record exists to confirm the approval terms.',
      };
    }
    return {
      state: 'READY',
      headline: registerOpen
        ? `Past the IC decision — no obligation or unopened workstream outstanding.${registerPhrase}`
        : 'Past the IC decision — nothing outstanding on the record.',
      gating: [],
      openConditions: 0,
      openComplianceChecks: 0,
      registerConditions,
      registerOpen,
      conditionsTotal: registerConditions,
      phase,
      basis: 'Stage on the deal record. No committee decision record exists to confirm the approval terms.',
    };
  }

  const gating = [];
  if (!required.allComplete) {
    const missing = required.items.filter((i) => !i.complete).map((i) => i.label);
    gating.push(`${missing.length} required item${missing.length === 1 ? '' : 's'} outstanding: ${missing.join(', ')}`);
  }
  if (blocking.length) {
    // "1 workstream blocking: Legal DD" made a partner open Outlook to find out who to
    // chase, while the owner sat on the workstream two fields away. An outstanding item
    // with nobody's name on it is outstanding on nobody.
    const named = blocking.map((b) => {
      const who = b.owner ? ownerLabel(b.owner, b.lane) : null;
      return who ? `${b.label} (${who})` : b.label;
    });
    gating.push(`${blocking.length} workstream${blocking.length === 1 ? '' : 's'} blocking: ${named.join(', ')}`);
  }
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
    // "no ... unresolved risks" was printed over a register holding ten of them. Ready
    // means nothing is GATING the committee, which is not the same as nothing being open,
    // and a partner who finds that out in the room does not use the product again.
    const open = unresolvedRisks.length;
    headline = open
      ? `IC-ready — required papers complete and no blocking workstreams. ${open} item${open === 1 ? '' : 's'} on the risk register ${open === 1 ? 'is' : 'are'} still open and ${open === 1 ? 'does' : 'do'} not gate the committee.`
      : 'IC-ready — required papers complete, no blocking workstreams or unresolved risks.';
  }
  return { state, headline, gating, openConditions: openConditions.length, registerConditions, conditionsTotal: openConditions.length + registerConditions, phase };
}

// The material rows of the deal's own risk register, in the shape the readiness board
// uses. These two screens are read minutes apart by the same person and disagreed: the
// register opened with "1 repricing risk" and the readiness board, one tab away, said
// there were no unresolved risks at all. Neither was lying — they were reading different
// stores. A committee cannot be asked to hold two answers at once, so the board now reads
// the register too.
//
// The register's own vocabulary decides the weight: a deal-stopper is a blocking risk, a
// price-adjuster is a caution. Anything softer is a condition or a 100-day item and does
// not belong on a list headed "unresolved".
function registerRisks(deal, already) {
  const seen = new Set(already.map((i) => String(i.title || '').toLowerCase().slice(0, 60)));
  const out = [];
  let reg;
  try { reg = buildRiskRegister(deal); } catch { return out; }
  for (const r of (reg && reg.risks) || []) {
    // Closing conditions belong on this list too. Atlas Cold Chain read "IC-ready —
    // required papers complete, no blocking workstreams or unresolved risks" over a
    // register carrying ten live entries, three of them closing conditions — including
    // change-of-control consents on two material contracts, which is the long pole on
    // most deals. A condition does not block the committee, so it does not change the
    // verdict; it does have to be visible on the page that says there are none.
    if (r.severity !== 'stopper' && r.severity !== 'reprice' && r.severity !== 'condition') continue;
    const key = String(r.risk || '').toLowerCase().slice(0, 60);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: r.id,
      lane: null,
      laneLabel: r.workstream || null,
      title: r.risk,
      severity: r.severity === 'stopper' ? 'risk' : 'caution',
      // The register's own word for it. The board graded R1 "caution" while the register
      // two tabs away graded the same row "Price-adjuster", and those are not the same
      // sentence to a committee.
      severityLabel: r.severityLabel || null,
      owner: r.owner || null,
      status: 'open',
      resolutionPath: r.mitigation || null,
      sources: 0,
      from: 'risk register',
    });
  }
  return out;
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
    // A stored issue quotes figures too, and this board is the last thing read before a
    // vote. Lumen's QoE finding arrived here as "moves the entry multiple from 9.4x to
    // 10.1x" while the case and the assistant, which both reconcile, said "roughly 0.7x
    // against the 8.3x on the returns page" — one finding, two prices, three screens.
    .map((i) => ({ id: i.id, lane: i.lane, laneLabel: laneLabel(i.lane), title: reconcileFindingText(String(i.title || ''), deal), severity: i.severity, owner: i.owner ? ownerLabel(i.owner, i.lane) : null, status: i.status, resolutionPath: i.resolutionPath ? reconcileFindingText(String(i.resolutionPath), deal) : null, sources: (i.sources || []).length }))
    .concat(registerRisks(deal, openIssues))
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity));
  const sources = supportingSources(deal, allIssues);
  const ask = icAsk(deal);
  const conditions = (deal.conditions || []).map((c) => ({ id: c.id, text: reconcileFindingText(String(c.text || ''), deal), owner: c.owner || null, status: c.status || 'proposed' }));

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
      conditions: v.conditionsTotal ?? conditions.length,
      sources: sources.length
    }
  };
}

function sevRank(s) {
  return { risk: 4, negative: 3, caution: 2, neutral: 1, positive: 0 }[s] ?? 1;
}

// ---- public: how to read this record, for a model ---------------------------
//
// A partner asked "what is outstanding before we can close?" on a deal already approved
// at committee and was told four workstreams were "not started" and "blocking", plus six
// missing papers. Every word of that was wrong. The workstreams are recorded
// `closed_at_ic` -- finished, signed off by the committee -- and the deal's own readiness
// board lists two obligations, not eight. The model was reading field values nobody had
// ever explained to it: `closed_at_ic` carries a progress figure of 0, which looks
// exactly like "never touched".
//
// That is not a prompt to be tuned deal by deal. Any surface that hands a deal record to
// a model needs the same two things -- the vocabulary to read the record, and the board's
// own answer to "what is outstanding" so it stops deriving one badly. A partner may paste
// this into a committee paper, so it has to agree with the tab next to it.
export function recordReadingGuide(deal) {
  let board = null;
  try { board = computeICReadiness(deal); } catch { board = null; }
  const gating = board?.verdict?.gating || [];
  const postIC = String(board?.phase || '') === 'post-committee';

  const lines = [
    'HOW TO READ THIS RECORD — the values below are our field names, not English. Use the meaning, never the key:',
    '- a workstream status of "closed_at_ic" means the investment committee closed that workstream out when it approved the deal. It is FINISHED. Its progress figure is meaningless and is usually 0. It is NOT "not started", NOT outstanding and NOT blocking. If no write-up is on file, that is a records gap — not work still to do.',
    '- "complete" is finished. "blocked" is the only status that means something is stopping this deal.',
    '- a deliverable that is not on file on a deal that has already been approved is a records gap, not a condition of closing.',
    'Never emit a placeholder. If a threshold, name or amount is not in the record, leave the clause out — do not write ">$X", "[TBC]" or similar into a sentence someone may paste into a committee paper.'
  ];

  if (board?.verdict) {
    lines.push(
      `WHAT IS OUTSTANDING — authoritative. This is what the IC readiness board shows the user on screen, and your answer must agree with it: state ${board.verdict.state}; ${board.verdict.headline || ''}`,
      gating.length
        ? `The outstanding items are exactly these ${gating.length}: ${gating.map((g) => `"${g}"`).join('; ')}. Do not add to that list, do not invent others, and do not describe anything else as outstanding, blocking or missing.`
        : 'Nothing is outstanding. Do not manufacture anything.'
    );
    if (postIC) lines.push('This deal has ALREADY been approved at investment committee. Do not produce a pre-committee readiness checklist for it.');
  }
  return lines.join('\n');
}
