// ===========================================================================
//  DEAL COCKPIT — briefing, attention queue and milestone overlay
// ===========================================================================
// The cockpit is the "everything I need, front and centre" surface. It is
// composed entirely from state the platform already owns — workstream progress,
// the IC readiness board, the issue log, compliance checks and the flow spine —
// so the narrative is grounded and auditable rather than invented.
//
// Design rule carried over from the rest of the app: AI output NEVER changes
// authoritative status. Every derived item is labelled with its basis, and every
// action routes back through an existing governed mutation that a named person
// approves.

import { STEPS, stepIndex } from '../data/flow.js';
import { personaById } from '../data/personas.js';

// Persona id -> the human whose name belongs on an action. Owners are stored as
// persona ids on the deal record; showing "legal-gc" to a partner is useless.
const personaName = (id) => (id && personaById[id]?.name) || null;

const LANE_LABEL = {
  financial: 'Financial / QoE',
  commercial: 'Commercial DD',
  legal: 'Legal DD',
  tax: 'Tax DD & structuring',
  operational: 'Operational DD',
  operations: 'Operations DD',
  tech: 'Technology / IT / Cyber DD',
  techai: 'Tech / AI DD',
  hr: 'HR / Management DD',
  esg: 'ESG / Environmental',
};
export const laneLabel = (lane) => LANE_LABEL[lane] || lane || 'Deal team';

// "Owner" for display: the person's name where we can resolve one, else a readable
// version of the role slug the deal record carries (e.g. "tax-md" -> "Tax MD"),
// else the lane it belongs to.
const ACRONYMS = new Set(['md', 'gc', 'ir', 'ai', 'it', 'hr', 'vp', 'lp', 'cfo', 'ceo', 'cto', 'coo', 'esg', 'qoe']);
const humanise = (slug) =>
  String(slug)
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

export function ownerLabel(id, lane) {
  const name = personaName(id);
  if (name) return name;
  if (id && !LANE_LABEL[id]) return /[-_]/.test(String(id)) ? humanise(id) : String(id);
  return laneLabel(lane);
}

const SEV_RANK = { stopper: 5, blocker: 5, reprice: 4, negative: 4, risk: 3, caution: 3, condition: 2, monitor: 1, positive: 0, clear: 0 };
const sevRank = (s) => SEV_RANK[String(s || '').toLowerCase()] ?? 2;

// The IC decision happens at step D4. Past that the stored targetICDate is a
// historical artefact, so the countdown is meaningless and must not be shown.
const IC_STEP_INDEX = stepIndex('D4');
export function icPending(deal) {
  // currentStep is only present on derived records; fall back to the stage code,
  // and to the date itself when neither resolves to a known step.
  const idx = stepIndex(deal?.currentStep || deal?.stage);
  if (idx >= 0) return idx < IC_STEP_INDEX;
  return (daysUntil(deal?.targetICDate) ?? -1) >= 0;
}

// The readiness board's verdict is { state, headline, gating[] } — render the
// headline, never the object.
function verdictLine(board) {
  const v = board?.verdict;
  if (!v) return null;
  if (typeof v === 'string') return v;
  return v.headline || v.state || null;
}

export function daysUntil(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.round((then - Date.now()) / 86400000);
}

export function dueLabel(iso) {
  const d = daysUntil(iso);
  if (d == null) return null;
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} overdue`;
  if (d === 0) return 'due today';
  if (d === 1) return 'due tomorrow';
  return `due in ${d} days`;
}

// ---------------------------------------------------------------------------
//  Attention queue — a ranked merge of everything competing for the user's time
// ---------------------------------------------------------------------------
// Sources, in descending authority: blocking workstreams from the IC board, the
// open issue log, lagging diligence lanes, unmet compliance checks and the IC
// countdown. Ranking is urgency-weighted and then re-weighted for the viewer's
// role so a Fund CFO and a Lead Partner see a different #1.
const ROLE_LANE_BIAS = {
  'fund-cfo': { financial: 3, tax: 2 },
  'legal-gc': { legal: 3 },
  'retail-md': { commercial: 3 },
  'ai-md': { tech: 3 },
  'operating-partner': { operational: 3, hr: 2 },
  principal: {},
  partner: {},
};

function buildAttention(deal, board, role) {
  const items = [];
  const bias = ROLE_LANE_BIAS[role] || {};
  const laneBoost = (lane) => bias[lane] || 0;

  // 1) Workstreams the IC board says are blocking. When several lanes are simply
  //    still in flight, one summary row is far more useful than three near-identical
  //    ones — the queue is meant to cut noise, not reproduce it.
  const blocking = board?.blockingWorkstreams || [];
  const preIC = icPending(deal);
  const gateNoun = preIC ? 'IC' : 'the next gate';
  if (blocking.length === 1) {
    const w = blocking[0];
    const lane = w.key || w.lane;
    const reason = (w.reasons && w.reasons[0]) || `${w.blockingIssues || w.openIssues || 0} blocking issue(s)`;
    items.push({
      kind: 'risk',
      kindLabel: 'Blocking',
      title: `${w.label || laneLabel(lane)} is blocking ${gateNoun}`,
      why: reason,
      owner: ownerLabel(w.owner, lane),
      due: null,
      impact: `Blocks ${gateNoun} until cleared.`,
      basis: 'IC readiness board',
      score: 90 + laneBoost(lane),
      actions: [
        { label: '+ Record issue', kind: 'record_issue', args: { lane, title: `${w.label || laneLabel(lane)} workstream blocking IC`, severity: 'risk', resolutionPath: reason, sources: [`IC readiness board · ${w.label || laneLabel(lane)}`] } },
        { label: 'Open lane', kind: 'goto', args: { tab: 'workspace' } },
      ],
    });
  } else if (blocking.length > 1) {
    const named = blocking.map((w) => w.label || laneLabel(w.key || w.lane));
    const worst = [...blocking].sort((a, b) => (a.progress ?? 100) - (b.progress ?? 100))[0];
    const worstLane = worst.key || worst.lane;
    items.push({
      kind: 'risk',
      kindLabel: 'Blocking',
      title: `${blocking.length} diligence lanes are short of ${preIC ? 'IC-ready' : 'closed out'}`,
      why: `${named.join(', ')} — none has closed out yet.`,
      owner: ownerLabel(worst.owner, worstLane),
      due: null,
      impact: `${preIC ? 'The IC gate stays shut' : 'The next gate stays shut'} until every lane closes.`,
      basis: 'IC readiness board',
      score: 82 + Math.max(...blocking.map((w) => laneBoost(w.key || w.lane))),
      actions: [
        { label: 'Open lanes', kind: 'goto', args: { tab: 'workspace' } },
        { label: '+ Record issue', kind: 'record_issue', args: { lane: worstLane, title: `${named.length} workstreams blocking IC`, severity: 'risk', resolutionPath: `${named.join(', ')} outstanding.`, sources: ['IC readiness board'] } },
      ],
    });
  }

  // 2) Open issues, most severe first.
  for (const i of deal.issues || []) {
    if (i.status && i.status !== 'open') continue;
    items.push({
      kind: 'issue',
      kindLabel: i.severity ? String(i.severity) : 'Issue',
      title: i.title,
      why: i.resolutionPath || 'No resolution path recorded yet.',
      owner: ownerLabel(i.owner, i.lane),
      due: i.dueDate || null,
      dueLabel: dueLabel(i.dueDate),
      impact: sevRank(i.severity) >= 4 ? 'Deal-stopper severity — must clear before signing.' : 'Tracked against the IC gate.',
      basis: `Issue log · ${i.lane ? laneLabel(i.lane) : 'deal'}`,
      score: 50 + sevRank(i.severity) * 8 + laneBoost(i.lane) + (daysUntil(i.dueDate) != null && daysUntil(i.dueDate) < 2 ? 10 : 0),
      actions: [
        { label: '✓ Mark resolved', kind: 'resolve_issue', args: { issueId: i.id } },
        { label: 'Open issue log', kind: 'goto', args: { tab: 'workspace' } },
      ],
    });
  }

  // 3) Lagging lanes — the AI overlay. A lane materially behind its peers is the
  //    critical path even when nothing has formally been logged as blocking. Lanes
  //    that have not started at all are a different problem (kick-off, not velocity),
  //    so they are called out separately rather than crowned "critical path".
  const lanes = (deal.workstreams || []).filter((w) => w.status !== 'complete');
  const notStarted = lanes.filter((w) => !(w.progress > 0));
  const inFlight = lanes.filter((w) => w.progress > 0);

  // Only worth its own row when it says something the blocking row does not: either
  // it spans several lanes, or nothing has been flagged as blocking at all.
  if (notStarted.length && preIC && (notStarted.length > 1 || !blocking.length)) {
    const names = notStarted.map((w) => laneLabel(w.lane));
    items.push({
      kind: 'ai',
      kindLabel: '✦ AI · not started',
      title: notStarted.length === 1
        ? `${names[0]} has not started`
        : `${notStarted.length} diligence lanes have not started`,
      why: `${names.join(', ')} — no progress recorded against ${notStarted.length === 1 ? 'this lane' : 'these lanes'} yet.`,
      owner: ownerLabel(notStarted[0].owner, notStarted[0].lane),
      due: deal.targetICDate || null,
      dueLabel: dueLabel(deal.targetICDate),
      impact: 'Each unstarted lane is a fresh scope of work between here and the IC memo freeze.',
      basis: 'Workstream progress',
      score: 74 + Math.max(...notStarted.map((w) => laneBoost(w.lane))),
      actions: [{ label: 'Open lanes', kind: 'goto', args: { tab: 'workspace' } }],
    });
  }

  if (inFlight.length > 1) {
    const avg = inFlight.reduce((a, w) => a + (w.progress || 0), 0) / inFlight.length;
    const laggard = [...inFlight].sort((a, b) => (a.progress || 0) - (b.progress || 0))[0];
    if (laggard && (laggard.progress || 0) < avg - 8) {
      const caution = (laggard.findings || []).find((f) => f.severity === 'caution' || f.severity === 'negative');
      items.push({
        kind: 'ai',
        kindLabel: '✦ AI · critical path',
        title: `${laneLabel(laggard.lane)} is the critical path at ${laggard.progress || 0}%`,
        why: caution ? caution.text : `Trailing the other lanes, which average ${Math.round(avg)}%.`,
        owner: ownerLabel(laggard.owner, laggard.lane),
        due: null,
        impact: 'At the current lane velocity this closes after the IC memo freeze.',
        basis: caution?.source ? `${caution.source} · lane progress` : 'Lane progress',
        score: 78 + laneBoost(laggard.lane),
        actions: [
          { label: '+ Record issue', kind: 'record_issue', args: { lane: laggard.lane, title: `${laneLabel(laggard.lane)} is the critical path`, severity: 'risk', resolutionPath: caution ? caution.text : 'Lane trailing its peers.', sources: [caution?.source || 'Lane progress'] } },
          { label: 'Open lane', kind: 'goto', args: { tab: 'workspace' } },
        ],
      });
    }
  }

  // 4) Compliance checks that have not passed.
  for (const c of deal.compliance || []) {
    if (c.status === 'passed') continue;
    items.push({
      kind: 'compliance',
      kindLabel: 'Compliance',
      title: c.check,
      why: `${c.framework || 'Compliance'} check is ${String(c.status || 'outstanding').replace(/_/g, ' ')}.`,
      owner: 'Compliance',
      due: null,
      impact: 'Required before announcement / signing.',
      basis: `Compliance register · ${c.framework || '—'}`,
      score: c.status === 'failed' ? 85 : 45,
      actions: [{ label: 'Open compliance', kind: 'goto', args: { tab: 'ic' } }],
    });
  }

  // 5) IC countdown pressure.
  const icDays = icPending(deal) ? daysUntil(deal.targetICDate) : null;
  if (icDays != null && icDays <= 30) {
    const openCount = (deal.issues || []).filter((i) => !i.status || i.status === 'open').length;
    const blockingCount = board?.counts?.blockingWorkstreams || 0;
    if (openCount || blockingCount) {
      const outstanding = [
        openCount ? `${openCount} open issue${openCount === 1 ? '' : 's'}` : null,
        blockingCount ? `${blockingCount} lane${blockingCount === 1 ? '' : 's'} still open` : null,
      ].filter(Boolean).join(' and ');
      items.push({
        kind: 'schedule',
        kindLabel: 'Schedule',
        title: icDays < 0 ? `IC date passed ${Math.abs(icDays)} days ago` : `IC in ${icDays} days with ${outstanding}`,
        why: verdictLine(board) || 'The readiness board is not yet green.',
        owner: ownerLabel(deal.sponsorPersona, null),
        due: deal.targetICDate,
        dueLabel: dueLabel(deal.targetICDate),
        impact: 'The IC pack cannot freeze while these are open.',
        basis: 'Deal record · target IC date',
        score: icDays <= 7 ? 88 : 60,
        actions: [{ label: 'Open IC readiness', kind: 'goto', args: { tab: 'ic' } }],
      });
    }
  }

  return items
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((it, idx) => ({ ...it, rank: idx + 1 }));
}

// ---------------------------------------------------------------------------
//  Briefing — "what changed and what it means", in prose, with sources
// ---------------------------------------------------------------------------
function buildBriefing(deal, board, attention, sinceIso) {
  const paras = [];
  // Sources are an ordered list so each claim can carry a numbered citation that
  // points at the evidence behind it. A narrative without traceable provenance is
  // not usable in an investment process, so every sentence we generate registers
  // the record it was derived from.
  const sourceOrder = [];
  const sourceIndex = (name) => {
    const label = String(name || '').trim();
    if (!label) return 0;
    const at = sourceOrder.indexOf(label);
    if (at >= 0) return at + 1;
    sourceOrder.push(label);
    return sourceOrder.length;
  };
  const add = (text, ...srcNames) => {
    const cites = srcNames.map(sourceIndex).filter(Boolean);
    paras.push({ text, cites: [...new Set(cites)] });
  };
  const since = sinceIso ? new Date(sinceIso) : null;

  // What moved, from the audit trail.
  const recent = (deal.activity || []).filter((a) => {
    if (!since) return true;
    const t = new Date(a.when || a.at || 0).getTime();
    return !Number.isNaN(t) && t >= since.getTime();
  });
  if (recent.length) {
    const top = recent.slice(0, 3).map((a) => `${a.actor || 'Someone'} ${a.action || 'updated the deal'}`);
    add(`Since your last visit there ${recent.length === 1 ? 'has been 1 update' : `have been ${recent.length} updates`} on this deal — ${top.join('; ')}.`, 'Deal audit trail');
  } else {
    add(`Nothing new has been recorded on ${deal.company} since your last visit. The position below is unchanged.`, 'Deal audit trail');
  }

  // Where it stands. Only lanes with real movement are worth naming; the rest are
  // summarised so the sentence stays readable on a deal with eight workstreams.
  const lanes = deal.workstreams || [];
  if (lanes.length) {
    const moving = lanes.filter((w) => w.progress > 0);
    const idle = lanes.length - moving.length;
    const laneTxt = moving.map((w) => `${laneLabel(w.lane)} ${w.progress}%`).join(' · ');
    if (moving.length) {
      add(`Diligence stands at ${laneTxt}${idle ? `, with ${idle} further lane${idle === 1 ? '' : 's'} not yet started` : ''}.`, 'Workstream progress');
    } else {
      add(lanes.length === 1
        ? `The ${laneLabel(lanes[0].lane)} lane has not recorded any progress yet.`
        : `None of the ${lanes.length} diligence lanes has recorded progress yet.`, 'Workstream progress');
    }
  }

  // The single most important thing.
  const top = attention[0];
  if (top) {
    add(`Your most pressing item is ${top.title.charAt(0).toLowerCase()}${top.title.slice(1)}. ${top.why}${top.impact ? ` ${top.impact}` : ''}`, top.basis);
  }

  // Findings worth knowing about, positive and negative.
  const findings = lanes.flatMap((w) => (w.findings || []).map((f) => ({ ...f, lane: w.lane })));
  const caution = findings.filter((f) => f.severity === 'caution' || f.severity === 'negative');
  const positive = findings.filter((f) => f.severity === 'positive');
  if (caution.length) {
    add(`Diligence has raised ${caution.length} point${caution.length === 1 ? '' : 's'} of caution — ${caution.slice(0, 2).map((f) => `${laneLabel(f.lane)}: ${f.text}`).join(' ')}`,
      ...caution.slice(0, 2).map((f) => f.source).filter(Boolean));
  }
  if (positive.length) {
    add(`On the supportive side, ${positive.slice(0, 2).map((f) => f.text).join(' ')}`,
      ...positive.slice(0, 2).map((f) => f.source).filter(Boolean));
  }

  // The clock.
  const icDays = icPending(deal) ? daysUntil(deal.targetICDate) : null;
  if (icDays != null) {
    const verdict = verdictLine(board);
    add(icDays < 0
      ? `The target IC date passed ${Math.abs(icDays)} days ago.${verdict ? ` ${verdict}` : ''}`
      : `IC is ${icDays} days out.${verdict ? ` ${verdict}` : ''}`, 'IC readiness board');
  }

  // Suggested next questions — seeded into the existing deal agent.
  const suggestions = [];
  const laggard = [...lanes].filter((w) => w.progress > 0).sort((a, b) => (a.progress || 0) - (b.progress || 0))[0];
  if (laggard) suggestions.push(`What is holding up ${laneLabel(laggard.lane)}?`);
  suggestions.push('What changed on this deal this week?');
  if (caution.length) suggestions.push(`Summarise the ${laneLabel(caution[0].lane)} findings`);
  suggestions.push('What is still missing for IC?');
  suggestions.push('Draft the IC memo skeleton');

  return {
    generatedAt: new Date().toISOString(),
    since: sinceIso || null,
    paragraphs: paras,
    sources: sourceOrder,
    suggestions: suggestions.slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
//  Milestones — the authoritative flow spine with a labelled AI risk overlay
// ---------------------------------------------------------------------------
function buildMilestones(deal, attention) {
  const curIdx = stepIndex(deal.currentStep || deal.stage);
  const risk = attention.find((a) => a.kind === 'ai' || a.kind === 'risk');
  return STEPS.map((s, i) => {
    const state = i < curIdx ? 'done' : i === curIdx ? 'current' : 'pending';
    const out = {
      key: s.key,
      title: s.title,
      stage: s.stage,
      owner: s.owner,
      produces: s.produces || [],
      state,
    };
    if (state === 'current' && risk) {
      // Labelled overlay only — it never rewrites `state`.
      out.aiRisk = { headline: risk.title, detail: risk.why, impact: risk.impact, basis: risk.basis };
    }
    if (state === 'pending' && risk && i === curIdx + 1) {
      out.waitingOn = risk.title;
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
export function buildCockpit(deal, board, { since = null, role = null } = {}) {
  const attention = buildAttention(deal, board, role);
  return {
    dealId: deal.id,
    company: deal.company,
    stage: deal.stage,
    stageName: deal.stageName || null,
    currentStep: deal.currentStep || null,
    confidential: !!deal.confidential,
    targetICDate: deal.targetICDate || null,
    icInDays: icPending(deal) ? daysUntil(deal.targetICDate) : null,
    briefing: buildBriefing(deal, board, attention, since),
    attention,
    milestones: buildMilestones(deal, attention),
    counts: {
      attention: attention.length,
      openIssues: (deal.issues || []).filter((i) => !i.status || i.status === 'open').length,
      blockingWorkstreams: board?.counts?.blockingWorkstreams || 0,
    },
  };
}
