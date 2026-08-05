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

// Lane owners are stored as persona ids like 'finance-md'. When no real person is
// mapped, humanise() turned that into "Finance MD" -- a role code with the hyphen
// taken out, which is not a name and does not tell a partner who to chase. The tab
// already carried this map; the backend composers that write blocker prose did not,
// so the same deal named "Finance Partner" on one tab and "Finance MD" on the next.
const ROLE_TITLE = {
  'retail-md': 'Commercial Partner', 'finance-md': 'Finance Partner', 'legal-md': 'General Counsel',
  'tax-md': 'Tax Partner', 'ai-md': 'AI Partner', 'supply-md': 'Supply Chain Partner',
  'esg-md': 'Operating Partner — ESG', 'ops-md': 'Operating Partner', 'partner': 'Partner',
  'analyst': 'Analyst', 'deal-team': 'Deal Team', 'admin': 'Administrator',
  // The seed uses several spellings for the same handful of people. Every one of them
  // has to resolve, because a single miss prints the raw slug -- "fund-cfo" sat on the
  // diligence tab of a live pre-IC deal beside five properly titled colleagues.
  'fund-cfo': 'Fund CFO', 'legal-gc': 'General Counsel',
  'finance md': 'Finance Partner', 'compliance': 'Compliance',
};

// One human phrase per workstream status, for every surface that puts a status into
// a sentence. The blocker card was interpolating the raw enum -- 'Financial / QoE is
// at 0% with status "closed at ic"' -- which is the database talking, not the product.
const LANE_STATUS_TEXT = {
  not_started: 'not started',
  in_progress: 'in progress',
  complete: 'complete',
  blocked: 'blocked',
  on_hold: 'on hold',
  closed_at_ic: 'closed at IC with no write-up on file',
};
export function laneStatusText(status) {
  const k = String(status || '').toLowerCase();
  return LANE_STATUS_TEXT[k] || (k ? k.replace(/_/g, ' ') : 'not recorded');
}

// A lane closed out at committee is not outstanding work. It never gets to be a
// blocker, an "at risk" overlay, or a "not yet started" count.
export const CLOSED_AT_IC = 'closed_at_ic';

// The person accountable for a lane. Owners in the record are written as 'legal-md' and
// 'esg-md', which are not persona ids, so every owner resolved to a job title — a partner
// nine days from committee was told "Legal DD (General Counsel)" and cannot chase a job
// title.
const LANE_OWNER = {
  financial: 'fund-cfo', tax: 'fund-cfo', legal: 'legal-gc', commercial: 'retail-md',
  techai: 'ai-md', tech: 'ai-md', operations: 'supply-md', operational: 'supply-md',
  hr: 'operating-partner', esg: 'ir-lp',
};

export function ownerLabel(id, lane) {
  const name = personaName(id);
  if (name) return name;
  const byLane = personaName(LANE_OWNER[String(lane || '').toLowerCase()]);
  const key = String(id || '').trim().toLowerCase();
  const title = key && ROLE_TITLE[key] ? ROLE_TITLE[key] : null;
  // Name first, role in brackets: the name is who to chase, the role is why it is theirs.
  if (byLane) return title ? `${byLane} (${title})` : byLane;
  if (title) return title;
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
        { label: 'Open workstream', kind: 'goto', args: { tab: 'workspace' } },
      ],
    });
  } else if (blocking.length > 1) {
    const named = blocking.map((w) => w.label || laneLabel(w.key || w.lane));
    const worst = [...blocking].sort((a, b) => (a.progress ?? 100) - (b.progress ?? 100))[0];
    const worstLane = worst.key || worst.lane;
    items.push({
      kind: 'risk',
      kindLabel: 'Blocking',
      // Was "short of IC-ready", which names the 80% committee bar the workstream panel
      // measures against -- and this row does not count that bar. It counts the lanes
      // the readiness board has formally flagged as blocking, which on Lumen was two
      // while the panel showed two below the bar AND two not started. Same screen, two
      // populations, one label. Say which population this is.
      title: `${blocking.length} diligence workstreams are flagged as blocking ${preIC ? 'IC' : 'the next gate'}`,
      why: `${named.join(', ')} — none has closed out yet.`,
      owner: ownerLabel(worst.owner, worstLane),
      due: null,
      // "The IC gate stays shut" was the noun in the sentence telling a partner why
      // their approval was refused, and it is not a word anyone in the industry uses.
      // A deal is IC-ready or it is not.
      impact: `${preIC ? 'This cannot go to IC' : 'The deal cannot advance'} until every workstream closes.`,
      basis: 'IC readiness board',
      score: 82 + Math.max(...blocking.map((w) => laneBoost(w.key || w.lane))),
      actions: [
        { label: 'Open workstreams', kind: 'goto', args: { tab: 'workspace' } },
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
      impact: sevRank(i.severity) >= 4 ? 'Deal-stopper severity — must clear before signing.' : 'Counts against IC readiness.',
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
  // Lanes closed out at committee are excluded outright: they are a records gap on a
  // decided deal, not a workstream anybody is waiting on.
  const lanes = (deal.workstreams || []).filter((w) => w.status !== 'complete' && w.status !== CLOSED_AT_IC);
  // Whatever the blocking row above already named does not get ranked a second time.
  // Lumen listed "2 diligence workstreams are short of IC-ready" at #1 and "2 diligence
  // workstreams have not started" at #3 -- the same two workstreams, twice, in a queue
  // whose whole job is to say what to do first.
  const blockingLanes = new Set(blocking.map((w) => w.key || w.lane));
  const uncovered = lanes.filter((w) => !blockingLanes.has(w.lane));
  const notStarted = uncovered.filter((w) => !(w.progress > 0));
  const inFlight = uncovered.filter((w) => w.progress > 0);

  // Only worth its own row when it says something the blocking row does not: either
  // it spans several lanes, or nothing has been flagged as blocking at all.
  if (notStarted.length && preIC && (notStarted.length > 1 || !blocking.length)) {
    const names = notStarted.map((w) => laneLabel(w.lane));
    items.push({
      kind: 'ai',
      kindLabel: '✦ AI · not started',
      title: notStarted.length === 1
        ? `${names[0]} has not started`
        : `${notStarted.length} diligence workstreams have not started`,
      why: `${names.join(', ')} — no progress recorded against ${notStarted.length === 1 ? 'this workstream' : 'these workstreams'} yet.`,
      owner: ownerLabel(notStarted[0].owner, notStarted[0].lane),
      due: deal.targetICDate || null,
      dueLabel: dueLabel(deal.targetICDate),
      impact: 'Each unstarted workstream is a fresh scope of work between here and the IC memo freeze.',
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
        why: caution ? caution.text : `Trailing the other workstreams, which average ${Math.round(avg)}%.`,
        owner: ownerLabel(laggard.owner, laggard.lane),
        due: null,
        impact: 'At the current pace this closes after the IC memo freeze.',
        basis: caution?.source ? `${caution.source} · workstream progress` : 'Workstream progress',
        score: 78 + laneBoost(laggard.lane),
        actions: [
          { label: '+ Record issue', kind: 'record_issue', args: { lane: laggard.lane, title: `${laneLabel(laggard.lane)} is the critical path`, severity: 'risk', resolutionPath: caution ? caution.text : 'Workstream trailing its peers.', sources: [caution?.source || 'Workstream progress'] } },
          { label: 'Open workstream', kind: 'goto', args: { tab: 'workspace' } },
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
        blockingCount ? `${blockingCount} workstream${blockingCount === 1 ? '' : 's'} still open` : null,
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
  //
  // A demo reseed writes itself into the audit trail, correctly -- it discards state and
  // that has to leave a trace. But it is an operator action on the platform, not news
  // about the deal, and it was opening the brief with "Deal reset to its starting
  // state", which is the first thing a partner read about their own transaction.
  const recent = (deal.activity || []).filter((a) => {
    if (/reset to its starting state|demo fixture/i.test(String(a.action || ''))) return false;
    if (!since) return true;
    const t = new Date(a.when || a.at || 0).getTime();
    return !Number.isNaN(t) && t >= since.getTime();
  });
  if (recent.length) {
    const top = recent.slice(0, 3).map((a) => `${a.actor || 'Someone'} ${a.action || 'updated the deal'}`);
    // "Since your last visit" was a promise the product could not keep: with no `since`
    // it reports the whole audit trail, so a first-ever visit was told what had changed
    // since a visit that never happened -- and on a quiet deal it asserted "unchanged"
    // to a reader who had never seen it. Only claim a delta when a window was supplied.
    add(since
      ? `Since your last visit there ${recent.length === 1 ? 'has been 1 update' : `have been ${recent.length} updates`} on this deal — ${top.join('; ')}.`
      : `Latest recorded activity on this deal — ${top.join('; ')}.`, 'Deal audit trail');
  } else {
    add(since
      ? `Nothing new has been recorded on ${deal.company} since your last visit. The position below is unchanged.`
      : `No activity has been recorded on ${deal.company} yet.`, 'Deal audit trail');
  }

  // Where it stands. Only lanes with real movement are worth naming; the rest are
  // summarised so the sentence stays readable on a deal with eight workstreams.
  const lanes = deal.workstreams || [];
  if (lanes.length) {
    const moving = lanes.filter((w) => w.progress > 0);
    // Telling the sponsor of a SIGNED deal that four workstreams were "never started"
    // is worse than saying nothing: it is the product accusing the deal team of not
    // doing work its own audit trail records them doing. Closed-at-IC lanes are a gap
    // in the record and are described as one.
    const closedAtIc = lanes.filter((w) => w.status === CLOSED_AT_IC).length;
    const idle = lanes.length - moving.length - closedAtIc;
    const laneTxt = moving.map((w) => `${laneLabel(w.lane)} ${w.progress}%`).join(' · ');
    const tail = [
      idle ? `${idle} further workstream${idle === 1 ? '' : 's'} not yet started` : '',
      closedAtIc ? `${closedAtIc} closed at IC with no write-up on file` : '',
    ].filter(Boolean).join(' and ');
    if (moving.length) {
      add(`Diligence stands at ${laneTxt}${tail ? `, with ${tail}` : ''}.`, 'Workstream progress');
    } else {
      add(lanes.length === 1
        ? `The ${laneLabel(lanes[0].lane)} workstream has not recorded any progress yet.`
        : `None of the ${lanes.length} diligence workstreams has recorded progress yet.`, 'Workstream progress');
    }
  }

  // The single most important thing.
  const top = attention[0];
  if (top) {
    // "Your most pressing item is 2 diligence workstreams are short of IC-ready" -- the
    // frame assumes the title is a noun phrase, and half of them are full sentences.
    // Lead with the title as its own sentence instead of forcing it into a clause.
    add(`Most pressing: ${top.title}. ${top.why}${top.impact ? ` ${top.impact}` : ''}`, top.basis);
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
  //
  // These used to be the same five on every deal. On a signed deal with a closing date
  // in the diary the product was offering "What is still missing for IC?", "Draft the IC
  // memo skeleton" and "What is holding up Commercial DD?" — a workstream sitting at
  // 100%. Committee is behind that deal; the questions the team actually has are about
  // conditions precedent and clearances. Ask what fits where the deal is.
  const suggestions = [];
  const pastCommittee = !icPending(deal);
  if (pastCommittee) {
    suggestions.push('Which conditions precedent are still open?');
    suggestions.push('Who owns each outstanding clearance?');
    suggestions.push('What changed on this deal this week?');
    if (caution.length) suggestions.push(`Summarise the ${laneLabel(caution[0].lane)} findings`);
    suggestions.push('Draft the closing checklist');
  } else {
    // Only offer to chase a workstream that is genuinely behind. The old rule took the
    // lowest-progress workstream whatever its number, and named one at 100%.
    const laggard = [...lanes]
      .filter((w) => w.progress > 0 && w.progress < 100 && w.status !== CLOSED_AT_IC && w.status !== 'complete')
      .sort((a, b) => (a.progress || 0) - (b.progress || 0))[0];
    if (laggard) suggestions.push(`What is holding up ${laneLabel(laggard.lane)}?`);
    suggestions.push('What changed on this deal this week?');
    if (caution.length) suggestions.push(`Summarise the ${laneLabel(caution[0].lane)} findings`);
    suggestions.push('What is still missing for IC?');
    suggestions.push('Draft the IC memo skeleton');
  }

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
