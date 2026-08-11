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
import { personaById, personas } from '../data/personas.js';

// Persona id -> the human whose name belongs on an action. Owners are stored as
// persona ids on the deal record; showing "legal-gc" to a partner is useless.
const personaName = (id) => (id && personaById[id]?.name) || null;

export const LANE_LABELS = {
  financial: 'Financial / QoE',
  commercial: 'Commercial DD',
  legal: 'Legal DD',
  tax: 'Tax DD & structuring',
  // Two keys, one lane. The record carries both spellings and they were labelled
  // differently, so a reader saw "Operational DD" and "Operations DD" on one screen
  // and reasonably assumed they were two workstreams.
  operational: 'Operations DD',
  operations: 'Operations DD',
  tech: 'Technology / IT / Cyber DD',
  techai: 'Tech / AI DD',
  hr: 'HR / Management DD',
  esg: 'ESG / Environmental',
};
export const laneLabel = (lane) => LANE_LABELS[lane] || lane || 'Deal team';
// Exported so nothing else keeps a second copy of this vocabulary.

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
const LANE_BENCH = {
  financial: ['fund-cfo', 'finance-md', 'finance-vp'],
  tax: ['tax-md', 'fund-cfo', 'finance-vp'],
  legal: ['legal-gc', 'legal-md'],
  commercial: ['retail-md', 'commercial-vp'],
  techai: ['ai-md', 'tech-vp'],
  tech: ['ai-md', 'tech-vp'],
  operations: ['supply-md', 'ops-vp'],
  operational: ['supply-md', 'ops-vp'],
  hr: ['operating-partner', 'commercial-vp'],
  esg: ['esg-md', 'operating-partner'],
};

const LANE_OWNER = {
  financial: 'fund-cfo', tax: 'fund-cfo', legal: 'legal-gc', commercial: 'retail-md',
  techai: 'ai-md', tech: 'ai-md', operations: 'supply-md', operational: 'supply-md',
  // Not 'ir-lp'. This map was lifted from the one that decides who SIGNS an update, where
  // investor relations reports ESG to LPs — so the product told an analyst to chase the
  // Phase I environmental assessment with the investor-relations partner. ESG diligence is
  // the operating partner's.
  hr: 'operating-partner', esg: 'operating-partner',
};

// Diligence leads who own workstreams on the record but hold no seat in the product.
// Without these four, six names carried a hundred and thirty-three workstreams.
const DILIGENCE_LEAD = {
  'esg-md': 'Tahani Al-Jamil',
  'legal-md': 'Simone Garnett',
  'finance-md': 'Chidi Anagonye',
  'tax-md': 'Jason Mendoza',
  'commercial-vp': 'Vicky Sengupta',
  'ops-vp': 'Gunnar Holt',
  'tech-vp': 'Mindy Park',
  'finance-vp': 'Brent Whitaker',
};

// Every display name the product can produce, so the resolver can recognise its own
// output instead of treating it as an unknown id.
let KNOWN_NAMES_CACHE = null;
const KNOWN_NAMES = {
  has(v) {
    if (!v) return false;
    if (!KNOWN_NAMES_CACHE) {
      KNOWN_NAMES_CACHE = new Set(Object.values(DILIGENCE_LEAD));
      for (const p of (personas || [])) if (p && p.name) KNOWN_NAMES_CACHE.add(p.name);
    }
    return KNOWN_NAMES_CACHE.has(v);
  },
};

export function ownerLabel(id, lane, salt = null) {
  const name = personaName(id);
  if (name) return name;
  const lead = DILIGENCE_LEAD[String(id || '').trim().toLowerCase()];
  if (lead) return lead;
  // Already a display name — hand it straight back rather than resolving it twice.
  if (KNOWN_NAMES.has(String(id || '').trim())) return String(id).trim();
  const laneKey = String(lane || '').toLowerCase();
  const bench = LANE_BENCH[laneKey];
  let benchId = LANE_OWNER[laneKey];
  if (bench && bench.length && salt) {
    let h = 0;
    const s = String(salt);
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 100000;
    benchId = bench[h % bench.length];
  }
  const byLane = personaName(benchId) || DILIGENCE_LEAD[String(benchId || '').toLowerCase()];
  const key = String(id || '').trim().toLowerCase();
  const title = key && ROLE_TITLE[key] ? ROLE_TITLE[key] : null;
  // Name first, role in brackets: the name is who to chase, the role is why it is theirs.
  // Their own role, not the lane's. Borrowing the lane's title printed "David Osei
  // (Finance Partner)" and "David Osei (Tax Partner)" two rows apart on one page.
  if (byLane) return byLane;
  if (title) return title;
  if (id && !LANE_LABELS[id]) return /[-_]/.test(String(id)) ? humanise(id) : String(id);
  return laneLabel(lane);
}

// Nineteen briefs opening on the same three sentences is the tell. Same content, and
// the frame follows the deal.
function variantFor(deal, options) {
  const key = String(deal?.id || deal?.company || '');
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 100000;
  return options[h % options.length];
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
  if (idx >= 0) return idx <= IC_STEP_INDEX;
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

// HOW MANY DAYS UNTIL A DATE, ANSWERED ONCE.
//
// There were two of these — this one rounding and another in the store ceiling — over the
// same targetICDate. Home said "IC in 9 days" and the deal you clicked into said "IC in 8
// days", at the same instant, about the same committee. Click-through is the most-used
// gesture in the product and the number changed as the reader made it.
//
// Ceiling is the right answer for a deadline: with 7.2 days left you have eight days to
// work with in the sense anybody means it, and rounding to 7 quietly loses one. Both
// callers now use this.
export function daysUntil(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.ceil((then - Date.now()) / 86400000);
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

const SEVERITY_LABEL = { stopper: 'Deal-stopper', risk: 'Risk', reprice: 'Repricing item', condition: 'Condition', monitor: 'Watch item', clear: 'Cleared' };

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
    const nIss = w.blockingIssues || w.openIssues || 0;
    const reason = (w.reasons && w.reasons[0]) || `${nIss} blocking issue${nIss === 1 ? '' : 's'}`;
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
      // "none has closed out yet" was false for lanes that HAVE produced work and are
      // blocked for some other reason. Each lane already carries the reason it is on this
      // list; naming them is both true and the only part of this row that differs deal to
      // deal.
      why: blocking.map((w) => {
        const label = w.label || laneLabel(w.key || w.lane);
        const reason = (w.reasons || [])[0];
        return reason ? `${label} — ${reason}` : label;
      }).join('; ') + '.',
      owner: (() => {
        const owners = [...new Set(blocking.map((w) => ownerLabel(w.owner, w.key || w.lane)).filter(Boolean))];
        return owners.length === 1 ? owners[0] : null;
      })(),
      due: null,
      // The title already says these block the gate. Repeating it here spent the row's
      // third line saying nothing; the useful fact is which one to start on.
      impact: `Start with ${worst.label || laneLabel(worstLane)} at ${worst.progress ?? 0}% — it is the furthest from done, so it sets the date the others are waiting on.`,
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
      kindLabel: SEVERITY_LABEL[String(i.severity || '').toLowerCase()] || 'Issue',
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
      kindLabel: 'Not started',
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

  if (inFlight.length > 1 && !blocking.length) {
    const avg = inFlight.reduce((a, w) => a + (w.progress || 0), 0) / inFlight.length;
    const laggard = [...inFlight].sort((a, b) => (a.progress || 0) - (b.progress || 0))[0];
    if (laggard && (laggard.progress || 0) < avg - 8) {
      const caution = (laggard.findings || []).find((f) => f.severity === 'caution' || f.severity === 'negative');
      items.push({
        kind: 'ai',
        kindLabel: 'Critical path',
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
    if (/reset to its starting state|restored to the firm’s baseline|demo fixture/i.test(String(a.action || ''))) return false;
    if (!since) return true;
    const t = new Date(a.when || a.at || 0).getTime();
    return !Number.isNaN(t) && t >= since.getTime();
  });
  if (recent.length) {
    const said = (a) => {
      const who = String(a.actor || 'Someone').replace(/\s*\u2014.*$/, '').trim();
      const did = String(a.action || 'updated the deal').trim();
      // Only lower-case an ordinary capitalised word. An acronym or an all-caps verdict
  // keeps its own shape.
  const joined = /^[A-Z][a-z]/.test(did) ? `${did.charAt(0).toLowerCase()}${did.slice(1)}` : did;
  return `${who} ${joined}`;
    };
    const top = recent.slice(0, 3).map(said);
    // "Since your last visit" was a promise the product could not keep: with no `since`
    // it reports the whole audit trail, so a first-ever visit was told what had changed
    // since a visit that never happened -- and on a quiet deal it asserted "unchanged"
    // to a reader who had never seen it. Only claim a delta when a window was supplied.
    add(since
      ? `Since your last visit there ${recent.length === 1 ? 'has been 1 update' : `have been ${recent.length} updates`} on this deal — ${top.join('; ')}.`
      : `${variantFor(deal, ['Latest recorded activity on this deal', 'Most recently on this deal', 'What has been recorded here lately', 'The last things logged against this deal'])} — ${top.join('; ')}.`, 'Deal audit trail');
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
        : `${variantFor(deal, [`None of the ${lanes.length} diligence workstreams has recorded progress yet.`, `Not one of the ${lanes.length} diligence workstreams has produced anything yet.`, `All ${lanes.length} diligence workstreams are still empty.`, `Nothing has been written against any of the ${lanes.length} diligence workstreams.`])}`, 'Workstream progress');
    }
  }

  // The single most important thing.
  const top = attention[0];
  if (top) {
    // This printed the top card's title, why AND impact verbatim, directly above the same
    // card. Six copies of two facts were above the fold on the first screen of the demo.
    // The briefing's job is to point; the card carries the detail.
    add(variantFor(deal, [
      `Most pressing: ${top.title}${top.owner ? `, with ${top.owner}` : ''}. The card below carries the detail.`,
      `${top.title}${top.owner ? `, with ${top.owner}` : ''} \u2014 that is where I would start. Detail on the card below.`,
      `Before anything else: ${top.title.charAt(0).toLowerCase()}${top.title.slice(1)}${top.owner ? `, which sits with ${top.owner}` : ''}. It is the first card below.`,
      `First thing to deal with is ${top.title.charAt(0).toLowerCase()}${top.title.slice(1)}${top.owner ? `, with ${top.owner}` : ''} \u2014 the card below has it in full.`,
      `Top of the list: ${top.title}${top.owner ? `, sitting with ${top.owner}` : ''}. Detail on the card below.`,
      `Take ${top.title.charAt(0).toLowerCase()}${top.title.slice(1)} first${top.owner ? `; it is with ${top.owner}` : ''}. The card below sets it out.`,
    ]), top.basis);
  }

  // Findings worth knowing about, positive and negative.
  const findings = lanes.flatMap((w) => (w.findings || []).map((f) => ({ ...f, lane: w.lane })));
  // The attention cards below already quote whatever the top row is about. Quoting it
  // again two paragraphs up is the same sentence twice on one screen.
  const alreadyShown = new Set(attention.slice(0, 3).map((a) => String(a.why || '').trim()).filter(Boolean));
  const caution = findings.filter((f) => (f.severity === 'caution' || f.severity === 'negative') && !alreadyShown.has(String(f.text || '').trim()));
  const positive = findings.filter((f) => f.severity === 'positive' && !alreadyShown.has(String(f.text || '').trim()));
  if (caution.length) {
    // The count was of the whole list and the sentence printed the first two, so a
    // reader counted three and saw two.
    const shown = caution.slice(0, 2);
    const more = caution.length - shown.length;
    const body = shown.map((f) => `${laneLabel(f.lane)}: ${f.text}`).join(' ');
    const qual = more ? `, ${more === 1 ? 'the two most serious of which are' : 'of which these two are the most serious'}` : '';
    add(variantFor(deal, [
      `Diligence has raised ${caution.length} point${caution.length === 1 ? '' : 's'} of caution${qual} — ${body}`,
      `${caution.length} point${caution.length === 1 ? '' : 's'} of caution ${caution.length === 1 ? 'has' : 'have'} come out of diligence${qual} — ${body}`,
      `What diligence is worried about${more ? ', in the two that matter most' : ''}: ${body}`,
      `On the cautionary side${qual ? ', and these two are the most serious' : ''} — ${body}`,
    ]),
      ...caution.slice(0, 2).map((f) => f.source).filter(Boolean));
  }
  if (positive.length) {
    add(`On the supportive side, ${positive.slice(0, 2).map((f) => f.text).join(' ')}`,
      ...positive.slice(0, 2).map((f) => f.source).filter(Boolean));
  }

  // The clock.
  const icDays = icPending(deal) ? daysUntil(deal.targetICDate) : null;
  if (icDays != null) {
    // `verdictLine` spells out the whole gating list, which the attention rows below
    // already print in full. Give the clock and the state, and let the rows carry the list.
    const state = board?.verdict?.state;
    const short = state === 'READY' ? ' The board has it IC-ready.'
      : state === 'NOT-READY' ? ` ${variantFor(deal, ['The board does not have it IC-ready; what it is waiting on is listed below.', 'The board has not cleared it for committee; the outstanding list is below.', 'It is not IC-ready on the board, and what is missing is set out below.', 'The readiness board is still holding it; the reasons are below.'])}`
      : '';
    add(icDays < 0
      ? `The target IC date passed ${Math.abs(icDays)} days ago.${short}`
      : `IC is ${icDays} days out.${short}`, 'IC readiness board');
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
    suggestions.push('Draft the IC memo');
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
