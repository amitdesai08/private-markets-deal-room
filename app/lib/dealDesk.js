// ===========================================================================
//  DEAL DESK — workflow, threads and documents
// ===========================================================================
// The three surfaces that sit beside the cockpit. Same contract as cockpit.js:
//
//   * Everything is COMPOSED from state the platform already owns (the flow
//     spine, workstream progress, the issue log, the Work IQ corpus). Nothing
//     is invented, and every derived claim carries the record it came from.
//   * AI output NEVER changes authoritative status. Derived items are labelled
//     and land as PROPOSALS that a named person approves through an existing
//     governed mutation.
//   * No LLM call on the read path. These are deterministic builders, so the
//     surfaces render instantly, identically for the same input, and work with
//     the model provider switched off.

import { STEPS, stepIndex } from '../data/flow.js';
import { laneLabel, ownerLabel, daysUntil, dueLabel } from './cockpit.js';

const iso = (v) => {
  const t = new Date(v || 0).getTime();
  return Number.isNaN(t) || !t ? null : new Date(t).toISOString();
};
const newest = (list, key) =>
  list.reduce((acc, x) => {
    const t = new Date(x?.[key] || 0).getTime();
    return Number.isNaN(t) ? acc : Math.max(acc, t);
  }, 0);

const initials = (name) =>
  String(name || '?')
    .replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

// A source list that hands back stable 1-based citation numbers, so a narrative
// sentence can point at the exact record it was derived from.
function citer() {
  const order = [];
  const index = (name) => {
    const label = String(name || '').trim();
    if (!label) return 0;
    const at = order.indexOf(label);
    if (at >= 0) return at + 1;
    order.push(label);
    return order.length;
  };
  const paras = [];
  return {
    add: (text, ...sources) => paras.push({ text, cites: [...new Set(sources.map(index).filter(Boolean))] }),
    result: () => ({ generatedAt: new Date().toISOString(), paragraphs: paras, sources: order }),
  };
}

// ---------------------------------------------------------------------------
//  Commitment detection
// ---------------------------------------------------------------------------
// People commit to things in chat and email and then nobody tracks them. We look
// for first-person promises with a time reference and surface them as PROPOSED
// tasks — never auto-created, because a task nobody agreed to is worse than no
// task at all.
const PROMISE = /\b(i(?:'| w)?ll|i will|i can|we(?:'| w)?ll|we will|let me|i'm going to|happy to)\b/i;
const DELIVERY = /\b(turn|send|share|circulate|draft|run|close|deliver|own|produce|prepare|confirm|book|schedule|memo|pack|analysis)\b/i;
const WHEN = /\b(by\s+(?:end of\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day|by\s+(?:eod|cob|tomorrow|today|friday|monday|thursday)|in\s+\d+\s+(?:day|days|weeks?)|this week|next week|by\s+\d{1,2}(?:st|nd|rd|th)?\s+\w+|thursday|friday|monday|tuesday|wednesday)\b/i;

// Lane routing for a detected commitment — the words people use map onto the
// diligence lane the work actually belongs to. Scored rather than first-match:
// a sentence that says "contract" once and "merchant pricing churn" three times
// is commercial, not legal.
const LANE_HINTS = [
  ['financial', /\b(qoe|quality of earnings|ebitda|normalis\w*|financial|audit|working capital)\b/gi],
  ['legal', /\b(legal|spa|contract\w*|clause|counsel|warrant\w*|indemnit\w*|standstill|nda)\b/gi],
  ['tax', /\b(tax|structuring|withholding|transfer pricing)\b/gi],
  ['commercial', /\b(commercial|merchant\w*|customer\w*|churn|pricing|market|revenue|concentration)\b/gi],
  ['tech', /\b(tech|ai|data|telemetry|platform|cyber|lims|integration)\b/gi],
  ['operational', /\b(ops|operational|supply|vendor\w*|sourcing|reagent|logistics|fleet)\b/gi],
  ['hr', /\b(hr|management|people|retention|org)\b/gi],
  ['esg', /\b(esg|sfdr|carbon|environment\w*|sustainab\w*)\b/gi],
];
function laneFor(text) {
  const s = String(text || '');
  let best = null;
  let bestScore = 0;
  for (const [lane, re] of LANE_HINTS) {
    const n = (s.match(re) || []).length;
    if (n > bestScore) { bestScore = n; best = lane; }
  }
  return best;
}

// Turn a loose time reference into a concrete date so the proposed task is
// actionable rather than "sometime". Anything we can't resolve stays null and
// the person is asked to pick a date.
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function resolveDue(text, fromIso) {
  const base = new Date(fromIso || Date.now());
  if (Number.isNaN(base.getTime())) return null;
  const t = String(text).toLowerCase();
  const rel = t.match(/in\s+(\d+)\s+(day|days|week|weeks)/);
  if (rel) {
    const n = Number(rel[1]) * (rel[2].startsWith('week') ? 7 : 1);
    return new Date(base.getTime() + n * 86400000).toISOString();
  }
  if (/\b(today|eod|cob)\b/.test(t)) return base.toISOString();
  if (/\btomorrow\b/.test(t)) return new Date(base.getTime() + 86400000).toISOString();
  const named = DAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(t));
  if (named >= 0) {
    const delta = ((named - base.getDay()) + 7) % 7 || 7;   // always the NEXT such day
    return new Date(base.getTime() + delta * 86400000).toISOString();
  }
  if (/\bnext week\b/.test(t)) return new Date(base.getTime() + 7 * 86400000).toISOString();
  if (/\bthis week\b/.test(t)) return new Date(base.getTime() + ((5 - base.getDay() + 7) % 7) * 86400000).toISOString();
  return null;
}

// Split a message into sentences and keep the one that carries the promise, so
// the quote we show back is the person's own words and nothing more. Two shapes
// count as a commitment: an explicit first-person promise ("I'll send the pack"),
// and a deliverable stated against a deadline ("memo by Thursday") — in a deal
// channel the second is a commitment even without the pronoun.
function promiseSentence(text) {
  const sentences = String(text || '').split(/(?<=[.!?])\s+/);
  return sentences.find((s) => DELIVERY.test(s) && (PROMISE.test(s) || WHEN.test(s))) || null;
}

export function detectCommitments(messages = [], { source = 'Teams', dealSteps = [] } = {}) {
  const out = [];
  for (const m of messages) {
    const body = m.preview || m.text || m.body || '';
    const sentence = promiseSentence(body);
    if (!sentence) continue;
    const when = (sentence.match(WHEN) || [])[0] || null;
    const lane = laneFor(sentence) || laneFor(body);
    const due = when ? resolveDue(when, m.created || m.received || m.createdAt) : null;
    const step = dealSteps.find((s) => s.lane && s.lane === lane) || null;
    out.push({
      id: `commit-${out.length + 1}`,
      source,
      author: m.from || m.author || 'Unknown',
      at: iso(m.created || m.received || m.createdAt),
      // The headline is what we think was promised; the quote is what was
      // actually said. Both are shown so nobody has to trust the paraphrase.
      headline: sentence.trim().replace(/\s+/g, ' '),
      quote: String(body).trim().replace(/\s+/g, ' ').slice(0, 320),
      owner: m.from || m.author || null,
      due,
      dueText: when,
      lane,
      laneLabel: lane ? laneLabel(lane) : null,
      stepKey: step?.key || null,
      stepTitle: step ? `${step.key} ${step.title}` : null,
      confidence: when ? 'high' : 'medium',
      basis: `${source} message${m.from ? ` from ${m.from}` : ''}`,
    });
  }
  return out;
}

// Decisions are the other thing that evaporates in chat. Same rule: we detect
// and PROPOSE, the decision log only records what a person confirms.
const DECISION = /\b(agreed|decided|we(?:'| a)?re going with|sign(?:ed)? off|approved|confirmed|let'?s go with|final answer|conclusion is)\b/i;
export function detectDecisions(messages = []) {
  return messages
    .filter((m) => DECISION.test(m.preview || m.text || ''))
    .map((m, i) => ({
      id: `dec-${i + 1}`,
      by: m.from || m.author || 'Unknown',
      at: iso(m.created || m.received),
      text: String(m.preview || m.text || '').trim().replace(/\s+/g, ' '),
      recorded: false,
      basis: 'Detected in the deal channel — not yet recorded',
    }));
}

// ---------------------------------------------------------------------------
//  Workflow & blockers
// ---------------------------------------------------------------------------
// The authoritative spine is the 16-step flow. On top of it we lay a labelled AI
// analysis of WHY a step is stalled — evidence, downstream impact, and the
// actions that would unstick it.
const STATUS_STALLED = new Set(['blocked', 'stalled', 'not_started', 'at_risk']);

// Which lanes are actually holding the deal up, worst first. The readiness board
// already computes this (blockingWorkstreams, each with its reasons); we add any
// lane that has stalled outright but hasn't reached the board yet.
function stalledLanes(deal, board) {
  const fromBoard = new Map((board?.blockingWorkstreams || []).map((w) => [w.lane, w]));
  const out = [];
  for (const w of deal.workstreams || []) {
    const b = fromBoard.get(w.lane);
    const stopped = STATUS_STALLED.has(w.status) || (w.progress ?? 0) === 0;
    if (!b && !stopped) continue;
    out.push({ ...w, reasons: b?.reasons || (stopped ? [`status "${String(w.status || 'not started').replace(/_/g, ' ')}"`] : []) });
  }
  return out.sort((a, b2) => (a.progress ?? 0) - (b2.progress ?? 0));
}

// Blocker analysis for a step. Diligence work happens across lanes rather than
// one-lane-per-step, so we attribute the stalled lanes to the step that is
// actually waiting on them — the one in flight — instead of guessing a mapping.
function blockerAnalysis(step, deal, board, lanes) {
  if (!lanes.length) return null;
  const worst = lanes[0];
  const evidence = [];
  for (const w of lanes.slice(0, 3)) {
    evidence.push({
      text: `${laneLabel(w.lane)} is at ${w.progress ?? 0}% with status "${String(w.status || 'unknown').replace(/_/g, ' ')}" (owner ${ownerLabel(w.owner, w.lane)}).`,
      source: 'Workstream progress',
    });
  }
  for (const f of (worst.findings || []).slice(0, 2)) {
    evidence.push({ text: f.text, source: f.source || 'Diligence finding' });
  }
  for (const r of (worst.reasons || []).slice(0, 2)) {
    evidence.push({ text: `${laneLabel(worst.lane)}: ${r}`, source: 'IC readiness board' });
  }

  // Downstream impact is real, not rhetorical: it is the steps that sit after
  // this one on the spine and therefore cannot start.
  const at = STEPS.findIndex((s) => s.key === step.key);
  const downstream = STEPS.slice(at + 1, at + 4).map((s) => `${s.key} ${s.title}`);
  return {
    headline: lanes.length === 1
      ? `${laneLabel(worst.lane)} is the critical path`
        : `${lanes.length} workstreams are holding this step — ${laneLabel(worst.lane)} is furthest behind`,
    evidence,
    impact: downstream.length
      ? `Blocks ${downstream.join(', ')} (${downstream.length} downstream step${downstream.length === 1 ? '' : 's'}).`
      : 'Holds up the next step.',
    owner: ownerLabel(worst.owner, worst.lane),
    lane: worst.lane,
    laneLabel: laneLabel(worst.lane),
    basis: 'Derived from workstream status + the IC readiness board — authoritative status is unchanged',
  };
}

export function buildWorkflowDesk(deal, board, { role = null, commitments = [] } = {}) {
  const currentIdx = Math.max(0, stepIndex(deal.currentStep || deal.stage));
  const lanes = deal.workstreams || [];
  const stalled = stalledLanes(deal, board);

  const steps = STEPS.map((s, i) => ({
    key: s.key, code: s.code, title: s.title, stage: s.stage, agent: s.agent || null,
    produces: s.produces || [], m365: s.m365 || [], why: s.why || null,
    state: i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'pending',
    ownerId: s.owner || null,
    owner: ownerLabel(s.owner, null),
    mine: !!role && s.owner === role,
  }));

  // Only the step in flight can be blocked. A step nobody has started yet is not
  // a blocker, it is just pending — calling it "at risk" would be noise.
  const current = steps[currentIdx];
  if (current) {
    const an = blockerAnalysis(current, deal, board, stalled);
    if (an) {
      current.flagged = true;
      current.blocker = an;
      current.lane = an.lane;
      current.laneLabel = an.laneLabel;
    }
    // The lanes doing the work on the step in flight, so the row shows real
    // progress rather than an abstract "in progress".
    current.lanes = lanes.map((w) => ({
      lane: w.lane, label: laneLabel(w.lane), progress: w.progress ?? 0,
      status: w.status || 'unknown', owner: ownerLabel(w.owner, w.lane),
      blocking: stalled.some((x) => x.lane === w.lane),
    }));
  }

  const done = steps.filter((s) => s.state === 'done');

  // Narrative — the same story the step list tells, in one readable paragraph set.
  const c = citer();
  c.add(`${deal.company} is at ${done.length} of ${steps.length} steps on the flow, currently in ${current?.key} ${current?.title}.`, 'Deal record');
  const moving = lanes.filter((w) => (w.progress ?? 0) > 0);
  const idle = lanes.length - moving.length;
  if (lanes.length) {
    c.add(`${moving.length} of ${lanes.length} diligence workstreams are moving${idle ? `; ${idle} ${idle === 1 ? 'has' : 'have'} not started` : ''}. ${moving.map((w) => `${laneLabel(w.lane)} ${w.progress}%`).join(' · ') || 'No workstream has recorded progress.'}`, 'Workstream progress');
  }
  if (current?.blocker) {
    // The headline was lowercased to splice it after a dash, which turned the defined
    // term QoE into "qoe" in the one sentence that says what is blocking the deal.
    // Ending the first clause with a full stop removes the need for any case change.
    c.add(`${current.key} ${current.title} is stalled. ${current.blocker.headline}. ${current.blocker.impact}`, 'IC readiness board');
  }
  const icDays = daysUntil(deal.targetICDate);
  if (icDays != null && icDays >= 0) c.add(`IC is ${icDays} days out; ${dueLabel(deal.targetICDate)}.`, 'Deal record');
  if (commitments.length) {
    // These three strings are printed as citation sources, which exist so a partner
    // can check where a claim came from. An internal product codename tells them
    // nothing they can go and verify.
    c.add(`${commitments.length} commitment${commitments.length === 1 ? ' was' : 's were'} made in the deal channel that ${commitments.length === 1 ? 'has' : 'have'} no matching task on the plan.`, 'Deal channel (Teams)');
  }

  return {
    dealId: deal.id,
    company: deal.company,
    narrative: c.result(),
    commitments,
    steps,
    counts: {
      all: steps.length,
      pending: steps.filter((s) => s.state === 'pending').length,
      inProgress: steps.filter((s) => s.state === 'current').length,
      atRisk: steps.filter((s) => s.flagged).length,
      completed: done.length,
      mine: steps.filter((s) => s.mine).length,
    },
  };
}

// ---------------------------------------------------------------------------
//  Work IQ threads
// ---------------------------------------------------------------------------
// Conversation is where deal knowledge actually lives, and today it lives in a
// place the deal record cannot see. We pull the deal's Teams channel and the
// durable Work IQ notes into threads that are ANCHORED to a deal object (a lane,
// a step, a document) so a conversation has a home in the deal, not just a date.

function threadFromNotes(dealId, notes) {
  // One thread per lane the notes touch — that is how the deal team thinks about
  // them ("the tech thread", "the financing thread"), not one flat log.
  const byPersona = new Map();
  for (const n of notes) {
    const key = n.personaId || 'deal-team';
    if (!byPersona.has(key)) byPersona.set(key, []);
    byPersona.get(key).push(n);
  }
  const out = [];
  for (const [personaId, list] of byPersona) {
    const lane = laneFor(list.map((n) => n.text).join(' '));
    out.push({
      id: `note-${dealId}-${personaId}`,
      group: 'Deal objects',
      title: list[0].personaLabel || list[0].author,
      anchorKind: lane ? 'Workstream' : 'Deal',
      anchor: lane ? laneLabel(lane) : 'Deal record',
      preview: list[list.length - 1].text.slice(0, 90),
      updated: iso(list[list.length - 1].createdAt),
      participants: [...new Set(list.flatMap((n) => [n.author, ...(n.sharedWith || [])]))].slice(0, 6),
      messages: list.map((n, i) => ({
        id: `${personaId}-${i}`, from: n.author, initials: initials(n.author),
        role: n.personaLabel || null, at: iso(n.createdAt), text: n.text,
      })),
      source: 'Shared deal notes',
    });
  }
  return out;
}

export function buildThreads(deal, { channel = null, notes = [], liveChannel = null } = {}) {
  const threads = [];

  // 1. The deal war room — the real Teams channel where it exists, the seeded
  //    corpus otherwise. Either way it is labelled with which one it is.
  //    `graphId` is the real Teams message id and is present ONLY on live messages;
  //    it is what lets a person reply to a specific message from inside the app.
  const msgs = (liveChannel?.results || channel?.messages || []).map((m, i) => ({
    id: `ch-${i}`, graphId: m.id || null,
    from: m.from, initials: initials(m.from), at: iso(m.created), text: m.preview || m.text || '',
    webUrl: m.webUrl || null,
  }));
  if (msgs.length) {
    threads.push({
      id: 'war-room',
      group: 'Deal team',
      title: channel?.name || liveChannel?.channel_id || `${deal.company} — Deal Room`,
      anchorKind: 'Channel',
      anchor: deal.teamsChannel?.displayName || channel?.name || 'Deal channel',
      preview: msgs[msgs.length - 1]?.text.slice(0, 90) || '',
      updated: msgs.length ? iso(msgs[msgs.length - 1].at) : null,
      participants: [...new Set(msgs.map((m) => m.from))],
      messages: msgs,
      live: !!liveChannel && !liveChannel.demo,
      webUrl: deal.teamsChannel?.webUrl || null,
      source: liveChannel && !liveChannel.demo ? 'Microsoft Teams (live)' : 'Sample deal channel',
    });
  }

  // 2. Lane threads from the durable Work IQ notes.
  threads.push(...threadFromNotes(deal.id, notes));

  // 3. Cross-functional requests — the open issue log, which is exactly a set of
  //    asks pointed at another function with an owner and a state.
  for (const [i, issue] of (deal.issues || []).filter((x) => !x.status || x.status === 'open').entries()) {
    threads.push({
      id: `req-${issue.id || i}`,
      group: 'Cross-functional',
      title: issue.title || 'Open request',
      ref: `#${String(issue.lane || 'REQ').slice(0, 3).toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
      anchorKind: 'Workstream',
      anchor: laneLabel(issue.lane),
      state: issue.status === 'in_progress' ? 'In progress' : 'Pending',
      preview: issue.resolutionPath || issue.title || '',
      updated: iso(issue.raisedAt || issue.createdAt),
      participants: [ownerLabel(issue.owner, issue.lane)].filter(Boolean),
      messages: [{
        id: `${issue.id || i}-0`, from: ownerLabel(issue.owner, issue.lane), initials: initials(ownerLabel(issue.owner, issue.lane)),
        at: iso(issue.raisedAt || issue.createdAt), text: issue.resolutionPath || issue.title || '',
      }],
      source: 'Deal issue log',
    });
  }

  const commitments = detectCommitments(channel?.messages || liveChannel?.results || [], { source: 'Teams' });
  const decisions = detectDecisions(channel?.messages || liveChannel?.results || []);

  // Catch-up: what a person who was away needs, expressed as key point / open
  // question / decision status rather than a transcript.
  const since = Date.now() - 36 * 3600 * 1000;
  const fresh = msgs.filter((m) => new Date(m.at || 0).getTime() >= since);
  const catchUp = msgs.length ? {
    count: fresh.length,
    window: fresh.length ? 'since yesterday evening' : 'no new messages in the last 36 hours',
    keyPoint: (fresh[0] || msgs[msgs.length - 1])?.text?.slice(0, 220) || null,
    openQuestion: commitments.length ? `${commitments[0].author} committed to "${commitments[0].dueText || 'a date'}" — no task exists for it.` : null,
    decision: decisions.length ? decisions[0].text.slice(0, 200) : 'No decision has been recorded in this thread.',
    basis: 'Composed from the channel messages above — nothing is inferred beyond them',
  } : null;

  return {
    dealId: deal.id,
    company: deal.company,
    connected: !!(liveChannel && !liveChannel.demo),
    channelUrl: deal.teamsChannel?.webUrl || null,
    threads: threads.sort((a, b) => new Date(b.updated || 0) - new Date(a.updated || 0)),
    catchUp,
    commitments,
    decisions,
    // The people the thread context suggests should be in it but are not.
    suggestedParticipants: (deal.workstreams || [])
      .filter((w) => (w.progress ?? 0) > 0)
      .map((w) => ({ name: ownerLabel(w.owner, w.lane), why: `owns ${laneLabel(w.lane)}` }))
      .slice(0, 4),
  };
}

// ---------------------------------------------------------------------------
//  Documents
// ---------------------------------------------------------------------------
// Two questions: what changed in the room since I last looked, and what SHOULD
// be in the room that isn't. The second one we can answer precisely, because
// every flow step already declares what it produces.

const SENSITIVITY = [
  [/legal|spa|contract|counsel/i, 'Restricted'],
  [/qoe|quality of earnings|model|returns|financing|debt|sources/i, 'Confidential'],
];
const sensitivity = (name) => (SENSITIVITY.find(([re]) => re.test(name)) || [null, 'Internal'])[1];

const KIND = [
  [/\.xlsx?$|model|returns|qoe/i, 'Model'],
  [/legal|spa|contract/i, 'Legal'],
  [/memo|ic pack|cim/i, 'IC pack'],
];
const kindOf = (name) => (KIND.find(([re]) => re.test(name)) || [null, 'Document'])[1];

export function buildDocumentDesk(deal, { files = [], since = null, live = [] } = {}) {
  const currentIdx = Math.max(0, stepIndex(deal.currentStep || deal.stage));
  const sinceMs = since ? new Date(since).getTime() : newest(files, 'lastModified') - 36 * 3600 * 1000;

  const docs = [...files, ...live].map((f, i) => {
    const changedAt = new Date(f.lastModified || f.modified || 0).getTime();
    return {
      id: f.id || `doc-${i}`,
      name: f.name,
      kind: kindOf(f.name),
      sensitivity: sensitivity(f.name),
      summary: f.summary || null,
      lastModified: iso(f.lastModified || f.modified),
      webUrl: f.webUrl || null,
      changed: !!changedAt && changedAt >= sinceMs,
      live: !!f.webUrl,
    };
  });

  // What changed — with the WHY, pulled from the diligence findings that cite the
  // same evidence, so "changed today" is never a dead end.
  const findings = (deal.workstreams || []).flatMap((w) => (w.findings || []).map((f) => ({ ...f, lane: w.lane, owner: w.owner })));
  const changed = docs.filter((d) => d.changed).map((d) => {
    const hit = findings.find((f) => f.source && d.name.toLowerCase().includes(String(f.source).toLowerCase().split(' ')[0]))
      || findings.find((f) => laneFor(d.name) === f.lane);
    return {
      ...d,
      delta: hit ? hit.text : (d.summary || 'Content updated.'),
      deltaTone: hit ? (hit.severity === 'positive' ? 'good' : hit.severity === 'caution' || hit.severity === 'negative' ? 'bad' : 'warn') : 'warn',
      author: hit ? ownerLabel(hit.owner, hit.lane) : 'Deal team',
      basis: hit ? `Matched to the ${laneLabel(hit.lane)} finding "${String(hit.source || '').trim()}"` : 'Data room metadata',
    };
  });

  // Open review comments — every caution/negative finding is a point somebody
  // has to resolve against a document, which is what a review comment IS.
  const comments = findings
    .filter((f) => f.severity === 'caution' || f.severity === 'negative')
    .map((f, i) => {
      const doc = docs.find((d) => laneFor(d.name) === f.lane) || docs[0] || null;
      return {
        id: `cmt-${i + 1}`,
        blocking: f.severity === 'negative',
        doc: doc?.name || `${laneLabel(f.lane)} pack`,
        ref: f.source || laneLabel(f.lane),
        author: ownerLabel(f.owner, f.lane),
        text: f.text,
        webUrl: doc?.webUrl || null,
      };
    });

  // Gap detection — the flow already declares produces[] for every step, so we can
  // say precisely what a deal at this stage should have and does not. Scoped to the
  // CURRENT stage: an origination one-pager missing on a deal that is three stages
  // past origination is history, not a gap someone can act on today.
  const currentStep = STEPS[currentIdx];
  const inScope = STEPS.filter((s, i) => i <= currentIdx && s.stage === currentStep?.stage);
  const have = docs.map((d) => d.name.toLowerCase());
  const gaps = [];
  for (const s of inScope) {
    for (const p of s.produces || []) {
      const words = String(p).toLowerCase().split(/\W+/).filter((w) => w.length > 4);
      const covered = words.length && have.some((n) => words.some((w) => n.includes(w)));
      if (!covered) gaps.push({ artefact: p, step: `${s.key} ${s.title}`, stepKey: s.key, owner: ownerLabel(s.owner, null) });
    }
  }

  return {
    dealId: deal.id,
    company: deal.company,
    stageName: deal.stageName || null,
    since: iso(sinceMs),
    changed,
    docs,
    comments,
    counts: {
      docs: docs.length,
      models: docs.filter((d) => d.kind === 'Model').length,
      legal: docs.filter((d) => d.kind === 'Legal').length,
      icPack: docs.filter((d) => d.kind === 'IC pack').length,
      openComments: comments.length,
      blockingComments: comments.filter((c) => c.blocking).length,
    },
    gaps: gaps.slice(0, 8),
    gapBasis: `Derived from the produces[] list declared on the ${currentStep?.stage || 'current'}-stage flow steps up to ${currentStep?.key || 'today'}`,
  };
}
