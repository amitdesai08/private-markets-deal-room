// ===========================================================================
//  HOME DESK — the portfolio-level cockpit
// ===========================================================================
// The deal cockpit answers "what is happening on THIS deal". The home page has
// to answer the same question one level up: across everything I can see, what
// moved, what is at risk, and what should I do first?
//
// Same contract as cockpit.js and dealDesk.js, deliberately:
//
//   * composed from records the platform already owns (the caller's visible
//     deal list plus the Work IQ corpus), never invented;
//   * every narrative claim carries the source it was derived from, numbered so
//     the sentence can point at it;
//   * AI output is labelled and NEVER changes authoritative status;
//   * no LLM on the read path, so the home page renders instantly and works
//     with the model provider switched off.
//
// It is scoped to the deals the CALLER can see. Two people with different
// need-to-know get different portfolio narratives, because they are looking at
// different portfolios — the summary can never leak a deal the reader could not
// open for themselves.
//
// AND IT IS COMPOSED FOR THE SEAT. Scoping and tailoring are different things: two
// people with identical clearance can still have entirely different jobs, and until
// now they opened the app to a byte-identical briefing. `seatFor` (lib/seat.js) turns
// the viewer's persona into the diligence lanes they actually own, and this module
// asks a different question of the same records depending on the answer. Where no
// seat can be resolved, the page says so rather than passing the generic view off as
// a personalised one.

import { corpusForDeal } from './workiqCorpus.js';
import { detectCommitments } from './dealDesk.js';
import { daysUntil } from './cockpit.js';
import { computeICReadiness, dealPhase } from './icReadiness.js';
import { seatFor } from './seat.js';
// The same finding read "$4.1M of ARR" in the risk register and "EUR 4.1M of ARR" on
// this desk, because only one of the two quoted it through the normaliser.
import { reconcileFindingText } from './diligence.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// How to name the lanes a seat owns. A seat can own more than one, and telling a Fund
// CFO "you own the Financial / QoE lane" while the code also assesses their Tax &
// structuring lane is a page describing a different job from the one it is doing.
const laneName = (labels = []) => (labels.length > 1
  ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
  : (labels[0] || 'your'));

// Deal sizes are carried in millions on the deal record.
function money(n) {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${Math.round(n)}`;
}

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
//  Attention — the ranked cross-deal queue
// ---------------------------------------------------------------------------
// One row per deal, ranked by how close it is to hurting. The reasons are the
// same ones the deal cockpit would give, so drilling in never contradicts the
// summary that sent you there.
const PHASES = [
  { key: 'origination', label: 'Origination & Screening', re: /origin|sourc|screen/i },
  { key: 'diligence', label: 'Diligence & Approval', re: /diligence|approval/i },
  { key: 'execution', label: 'Execution & Closing', re: /execution|closing|signing/i },
  { key: 'value', label: 'Value & Exit', re: /value|exit|owned|monitor/i },
];
const phaseOf = (d) => PHASES.find((p) => p.re.test(`${d.stage || ''} ${d.stageName || ''}`)) || null;

// This queue used to rank on `deal.readiness` — a 45/35/20 blend whose largest term is
// a percentage an analyst types into a lane by hand. That made the top of a partner's
// day sortable by whoever was most optimistic with a slider. It now ranks on the IC
// readiness VERDICT (lib/icReadiness.js), which is derived from facts that leave a
// trace: whether the papers are on record, whether a lane has actually opened, whether
// high-severity findings are unresolved, whether committee conditions are outstanding.
// The percentage survives as context on the row, never as the reason.
//
// `raw` is the unredacted record and is REQUIRED to compute a verdict, because the
// verdict names lanes and findings. It is passed as null for any deal the reader holds
// at metadata level, and that case returns its own row rather than falling through to
// a health claim about a deal the reader cannot open.
const BLOCKING_AT_IC = [
  'A workstream still open at committee is a workstream the committee will condition, and a condition is the slowest way to close anything.',
  'Anything still open when the papers go up comes back as a condition, and conditions are the slowest thing to clear.',
  'The committee will attach a condition to whatever is still open, which puts the closing date in somebody else\u2019s hands.',
  'Every workstream left open at the meeting becomes a condition, and each one adds weeks to completion.',
  'What is open on the day becomes a condition on the minute, and conditions are what stretch a signing into a quarter.',
  'Take an open workstream into the room and it comes out as a condition somebody has to chase.',
];
const BLOCKING_UNWRITTEN = [
  'A workstream still open is one nobody has written a finding against, so there is nothing for the committee to read on it.',
  'Nothing has been recorded against these workstreams, so there is no finding for the papers to carry.',
  'An unopened workstream produces no evidence, and evidence is what the committee is being asked to weigh.',
  'No work has been written up here, so the papers would go to the room with a gap in them.',
  'These workstreams have produced nothing to read, which is not the same as producing nothing to worry about.',
  'The committee reads findings. On these workstreams there are none to read.',
];

// Picks a phrasing off the deal, so a queue of similar rows does not close on the
// same words five times running.
function phrasing(deal, options, salt = '') {
  const key = `${deal?.id || deal?.company || ''}${salt}`;
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 100000;
  return options[h % options.length];
}

function assess(deal, raw) {
  // Which family the impact sentence came from, so a duplicate can be swapped later.
  let impactOptions = null;
  const readiness = num(deal.readiness);
  // Not `icPending`: that is false once a deal reaches D4, the committee step itself,
  // which is exactly when its date matters most. Anything not yet past the gate is
  // still heading for one.
  const pre = dealPhase(deal) !== 'post-committee';
  const days = pre ? daysUntil(deal.targetICDate) : null;
  const icDays = typeof deal.daysToIC === 'number' ? deal.daysToIC : days;

  if (!raw) {
    return {
      rank: 7, tag: 'Not on this deal', tone: 'muted',
      why: 'You hold this deal at metadata level, so its diligence detail is not assessed here.',
      impact: 'Nothing here needs you. If you should be reading this deal in full, an administrator can add you to it.',
      basis: 'Access level',
      verdict: null, gating: [],
    };
  }

  let ic = null;
  try { ic = computeICReadiness(raw); } catch { ic = null; }
  const v = ic?.verdict || null;
  const gating = v?.gating || [];
  const phase = ic?.phase || dealPhase(deal);
  const state = phase === 'origination' ? null : (v?.state || null);

  // A deal that has not entered diligence has not failed to reach committee — it has
  // not been asked to. This is tested FIRST, ahead of the lapsed-IC-date branch: an
  // origination target carrying a stale target date is not an emergency, and ranking it
  // 0 would put it above eight diligence deals where the same words mean something.
  if (phase === 'origination') {
    return { rank: 9, tag: 'In origination', tone: 'muted', why: 'Screened, not yet launched into diligence.', impact: 'Nothing is late. It joins the diligence queue when somebody launches it.', basis: 'Deal record — current step', verdict: null, gating: [] };
  }

  // Nor has a deal whose diligence has not started slipped anything. Four first-screen
  // candidates sat in a partner's top five "at risk of slipping their IC dates" reading
  // "IC is 13 days out and the deal is not ready — 7 workstreams blocking". Nothing was
  // slipping: no lane had been opened and the date was a target nobody had booked. Two of
  // the top five not being deals yet is the arithmetic that makes a reader stop trusting
  // the count.
  const anyLaneStarted = (raw.workstreams || []).some((w) => String(w.status || 'not_started') !== 'not_started');
  if (!anyLaneStarted) {
    return {
      rank: 8, tag: 'Diligence not started', tone: 'muted',
      why: 'No diligence workstream has been opened yet, so the target committee date is a plan rather than a booking.',
      impact: 'Nothing has slipped, because nothing has started. The date only becomes real once a workstream is opened against it.', basis: 'Deal record — workstreams', verdict: state, gating: [],
    };
  }

  // Ranked worst-first. The wording states the mechanism, not just the label —
  // "IC in 9 days, diligence plan and findings report outstanding" is actionable;
  // "at risk" is not.
  if (pre && typeof icDays === 'number' && icDays < 0) {
    return {
      rank: 0, tag: 'IC date passed', tone: 'bad',
      why: `The target IC date passed ${Math.abs(icDays)} days ago and the deal has not gone to IC.`,
      impact: 'Either the date moves with a written reason, or the gap becomes the story at IC.',
      basis: 'Deal record — target IC date vs current step',
      impactOptions,
      verdict: state, gating,
    };
  }
  if (pre && typeof icDays === 'number' && icDays <= 21 && state === 'NOT-READY') {
    return {
      rank: 1, tag: 'Not IC-ready', tone: 'bad',
      // Lead with what is missing, not with the state. Thirteen of sixteen rows opened
      // "IC is N days out and the deal is not ready —" and nobody read past the second
      // one; the tag already says the state, and the gating list is the part that differs
      // deal to deal.
      why: `${gating.join('; ')} — with committee ${icDays} day${icDays === 1 ? '' : 's'} out.`,
      // ONE SENTENCE FOR THIRTEEN CARDS, AND IT WAS ABOUT THE WRONG THING.
      //
      // "Open conditions become IC conditions" was stamped on every not-ready deal,
      // including three pre-IC deals with no open conditions at all. Say what is actually
      // holding THIS deal, taken from the gating list that produced the row.
      impact: (() => {
        const g = gating.join(' ').toLowerCase();
        if (/blocking/.test(g)) { impactOptions = BLOCKING_AT_IC; return phrasing(deal, BLOCKING_AT_IC); }
        if (/memo|recommendation/.test(g)) return 'The papers are the committee\u2019s only view of this deal. Unfinished, the meeting becomes a briefing rather than a decision.';
        if (/kyc|compliance/.test(g)) return 'Compliance clearance is not a formality the committee can waive; without it the deal cannot be approved on the day.';
        if (/red-flag|findings/.test(g)) return 'Without the red-flag report the committee is being asked to price risk nobody has written down.';
        if (/diligence plan/.test(g)) return 'No diligence plan means no agreed scope, so nobody can say what has been left out.';
        return `With committee ${icDays} day${icDays === 1 ? '' : 's'} out, anything still open on the day is decided in the room rather than before it.`;
      })(),
      basis: 'IC readiness board',
      impactOptions,
      verdict: state, gating,
    };
  }
  const lanes = raw.workstreams || deal.workstreams || [];
  const idle = lanes.filter((w) => (w.progress ?? 0) === 0);
  if (idle.length && idle.length === lanes.length && lanes.length) {
    return {
      rank: 2, tag: 'Not started', tone: 'warn',
      why: `None of the ${lanes.length} diligence workstream${lanes.length === 1 ? ' has' : 's have'} recorded progress.`,
      impact: 'Nothing is wrong yet — but nothing is moving either, and the clock is.',
      basis: 'Workstream progress',
      impactOptions,
      verdict: state, gating,
    };
  }
  // Conditions rank ABOVE a generic not-ready deal, not below it. A condition is a dated
  // obligation somebody already committed to at committee; an unfinished memo section is
  // work that has not started slipping yet. Ranked the other way round — as it was — the
  // conditional deals sat behind every not-ready deal and never surfaced at all.
  if (state === 'CONDITIONAL') {
    const post = phase === 'post-committee';
    // icReadiness ALREADY separates these two things and says why (icReadiness.js#L236):
    // an open condition is an obligation the firm accepted at committee; an unevidenced
    // lane is work nobody recorded. `gating` is the concatenation of both, so counting
    // gating.length re-merged them one file later and printed "6 obligations still
    // outstanding" on a signed deal that carries none — the six were never-opened lanes.
    const exiting = /exit/i.test(`${deal.status || ''} ${deal.stageName || ''}`);
    const obligations = num(v.openConditions) + num(v.openComplianceChecks);
    const unevidenced = post ? Math.max(0, gating.length - obligations) : 0;
    const n = post ? obligations : v.openConditions;
    const parts = [];
    if (n) parts.push(`${n} obligation${n === 1 ? '' : 's'} still outstanding`);
    if (unevidenced) parts.push(`${unevidenced} diligence workstream${unevidenced === 1 ? '' : 's'} with no work recorded`);
    return {
      // A deal already through the gate ranks BELOW a live deal that cannot be tabled.
      // At rank 3 for both, half the IC chair's queue was deals he had already approved
      // — tagged "no committee date set", because there isn't one — while four live
      // NOT-READY diligence deals were pushed off the page. A pre-committee condition
      // still outranks a generic not-ready deal; a post-close obligation does not.
      rank: post ? 5 : 3,
      // An asset being sold does not carry conditions attached at approval; it carries
      // the work that has to be done before it can go to market.
      tag: post ? (n ? (exiting ? 'Exit preparation outstanding' : 'Condition attached at approval') : 'Record incomplete') : 'Conditional', tone: 'warn',
      // Not "approved at committee" — nothing on the record is a committee decision. The
      // stage is where the deal sits, which is all this can honestly claim.
      why: post
        ? `${gating.join('; ')} — ${parts.join(' and ')}${phrasing(deal, [', carried past approval.', ', still open after the deal was approved.', ' — none of it cleared before approval.', ', outstanding since the deal went through.'])}`
        : `Ready for IC, subject to ${n} condition${n === 1 ? '' : 's'} still to close.`,
      impact: post
        // Four cards ended with this identical sentence. The record already knows what the
        // obligations are and who is on the other side of them; name the count and the
        // slowest one rather than describing the category.
        ? (n
          ? (exiting
            ? `${n} item${n === 1 ? '' : 's'} of exit preparation ${n === 1 ? 'is' : 'are'} still open, and a sale process cannot be launched around ${n === 1 ? 'it' : 'them'}.`
            : phrasing(deal, [
              `${n} obligation${n === 1 ? '' : 's'} taken at approval ${n === 1 ? 'is' : 'are'} still open, and completion waits on ${n === 1 ? 'it' : 'all of them'}.`,
              `Completion is held by ${n} obligation${n === 1 ? '' : 's'} the firm accepted at approval and has not yet discharged.`,
              `The firm committed to ${n} thing${n === 1 ? '' : 's'} to get this approved, and ${n === 1 ? 'it is' : 'they are'} not done.`,
              `${n} approval obligation${n === 1 ? '' : 's'} outstanding \u2014 nothing completes until ${n === 1 ? 'it clears' : 'they clear'}.`,
            ]))
          : 'Nothing is outstanding on this deal; the diligence record behind it was simply never written up.')
        : 'Conditions left open at the meeting come back as post-completion obligations.',
      basis: post ? 'Deal record — open conditions and uncleared compliance checks' : 'IC readiness board — committee conditions',
      impactOptions,
      verdict: state, gating,
    };
  }
  if (state === 'NOT-READY') {
    return {
      rank: 4, tag: 'Not IC-ready', tone: 'warn',
      why: `${gating.join('; ')}.`,
      // "Each of these has to close before the deal can go to IC" restated the sentence
      // above it, four times in one queue. Say what the shortfall actually is.
      impact: (() => {
        const n = gating.length;
        const g = gating.join(' ').toLowerCase();
        if (/blocking/.test(g)) { impactOptions = BLOCKING_UNWRITTEN; return phrasing(deal, BLOCKING_UNWRITTEN); }
        if (/kyc|compliance/.test(g)) return 'Compliance clearance cannot be waived in the room, so this one sets the earliest possible date.';
        if (/memo|recommendation/.test(g)) return 'The papers are what the committee actually reads. Until they exist there is no meeting to book.';
        if (/diligence plan/.test(g)) return 'Without an agreed scope nobody can say what has been left out, which is the first question asked.';
        return `${n} thing${n === 1 ? '' : 's'} stand${n === 1 ? 's' : ''} between this deal and a committee date, and none of them has one against it.`;
      })(),
      basis: 'IC readiness board',
      impactOptions,
      verdict: state, gating,
    };
  }
  if (state === 'READY') {
    if (phase === 'post-committee') {
      return { rank: 8, tag: 'In execution', tone: 'good', why: 'Past IC with nothing outstanding on the record.', impact: 'Nothing here needs a decision. It is on this list so the book is complete, not because it is waiting on anyone.', basis: 'Deal record — open conditions and compliance checks', verdict: state, gating };
    }
    // A deal that is READY with a committee date inside a fortnight is the most
    // actionable row on a chair's page, and at rank 8 it fell off the bottom of a
    // six-row queue: the tile said "Ready to table: 1" and the deal itself was named
    // nowhere. Something ready to be tabled is not "nothing to see here".
    const imminent = typeof icDays === 'number' && icDays >= 0 && icDays <= 14;
    return imminent
      ? {
        // Rank 1 puts this in the same urgency band as a deal that cannot be tabled,
        // where the committee date decides the order — so the deal whose committee is
        // soonest leads the page whether the answer is "table it" or "it is not ready".
        // At rank 8 it was cut before the six-row queue even filled: the tile said
        // "Ready to table: 1" and the page never said which deal, while the chair read a
        // countdown pointing at a different company nine days out.
        rank: 1, tag: 'Ready — take it to IC', tone: 'good',
        why: `Papers on record and no blocking workstreams, with IC ${icDays === 0 ? 'today' : `in ${icDays} day${icDays === 1 ? '' : 's'}`}.`,
        impact: 'This one needs an agenda slot, not more work.',
        basis: 'IC readiness board', verdict: state, gating,
      }
      : { rank: 8, tag: 'IC-ready', tone: 'good', why: 'Papers on record, no blocking workstreams, no unresolved risk findings.', impact: 'The work is done and no committee date is booked. What this needs is a slot in the diary, not more diligence.', basis: 'IC readiness board', verdict: state, gating };
  }
  return { rank: 6, tag: 'On track', tone: 'good', why: `Progressing on plan at ${readiness}% completion.`, impact: null, basis: 'IC readiness board', verdict: state, gating, phase };
}

// ---------------------------------------------------------------------------
//  The same deal, seen from the seat that has to do something about it
// ---------------------------------------------------------------------------
// `assess` above answers "how is this DEAL doing" — the right question for an IC chair
// or a deal lead, and the wrong one for the five seats that own a single diligence
// lane. A Supply Chain Partner does not need to be told that Nordic Grocery is held up
// by legal; that is somebody else's lane and there is nothing they can do about it. It
// needs telling that the operations lane on Atlas has not opened and the committee is
// nine days away.
//
// So a lane-owning seat gets its rows built from ITS lane on each deal. Same records,
// same verdict engine, different question. Everything here is read from the workstream
// on the unredacted record and from the readiness bundle's structured blocking list —
// no string-matching on prose, and nothing is invented when a lane has no state.
function assessLane(deal, raw, lanes, laneLabels) {
  const ws = (raw.workstreams || []).filter((w) => lanes.includes(w.lane));
  // The deal does not carry this seat's lane at all. That is not a problem to report,
  // it is an absence of one — returning a row here would put every seat on every deal.
  if (!ws.length) return null;

  const phase = dealPhase(deal);
  if (phase === 'origination') return null; // diligence lanes have not opened yet

  let bundle = null;
  try { bundle = computeICReadiness(raw); } catch { bundle = null; }
  const blockingHere = (bundle?.blockingWorkstreams || []).filter((b) => lanes.includes(b.lane));
  const openIssues = (bundle?.issues || []).filter((i) => lanes.includes(i.lane) && i.status !== 'resolved');
  const highIssues = openIssues.filter((i) => /high|critical/i.test(String(i.severity || '')));

  // Same correction as in assess(): `icPending` is false the moment a deal reaches D4,
  // the committee step itself, so a workstream lead with open work on a deal sitting at the
  // gate would lose "and committee is 4 days out" from their row and drop a rank on the
  // day it matters most. This is inert on today's seed only because the one D4 deal has
  // no open lane; it is not inert in general.
  const pre = dealPhase(deal) !== 'post-committee';
  const icDays = typeof deal.daysToIC === 'number' ? deal.daysToIC : (pre ? daysUntil(deal.targetICDate) : null);
  const soon = pre && typeof icDays === 'number' && icDays >= 0 && icDays <= 21;
  const late = pre && typeof icDays === 'number' && icDays < 0;
  const when = late
    ? `the target IC date passed ${Math.abs(icDays)} days ago`
    : soon ? `IC is ${icDays} day${icDays === 1 ? '' : 's'} out` : null;
  // A seat can own MORE THAN ONE lane — the Fund CFO owns Financial / QoE and Tax &
  // structuring. Two earlier versions of this were wrong in the same direction. Reading
  // ws[0] made tax invisible on every deal. Reading the single worst lane fixed the
  // label but still judged the seat on one lane, so a high-severity finding in the
  // CFO's QoE lane rendered under a row tagged "Tax & structuring" — the label
  // describing something other than its own contents, again.
  //
  // So each owned lane is assessed on its own terms and the most severe result leads
  // the row. The lane that produced the row is the lane the row is named after, and the
  // others are reported alongside it rather than silently dropped.
  const assessOne = (w) => {
    const label = laneLabels[lanes.indexOf(w.lane)] || w.lane;
    const progress = num(w.progress);
    const started = progress > 0 && w.status !== 'not_started';
    const findings = Array.isArray(w.findings) ? w.findings.length : 0;
    const blocking = blockingHere.filter((b) => b.lane === w.lane);
    // Issues AND findings. `bundle.issues` is a separate risk register; the findings are
    // the record of the lane's own work, and a finding written up as high-severity is
    // the single thing this seat would be asked about first. Reading only the register
    // meant the CFO's page said "Financial / QoE 70% complete" on a deal nine days from
    // committee whose QoE lane records EUR 3.2M of EBITDA that may not exist.
    const highFindings = (Array.isArray(w.findings) ? w.findings : [])
      .filter((f) => /high|critical/i.test(String(f.severity || '')))
      .map((f) => ({ title: f.text, lane: w.lane }));
    const high = [...highIssues.filter((i) => i.lane === w.lane), ...highFindings];
    const base = { lane: w.lane, laneLabel: label, laneProgress: progress, laneStatus: w.status || 'not_started', basis: 'Workstream record' };

    if (!started) {
      return {
        ...base,
        short: 'has no work recorded against it either',
        rank: when ? 0 : 1,
        tag: `${label} not started`,
        tone: when ? 'bad' : 'warn',
        why: when
          ? `Your ${label} workstream has no work recorded against it and ${when}.`
          : `Your ${label} workstream has no work recorded against it.`,
        // Seven cards in the Fund CFO's queue closed with this same sentence. The row
        // already knows the deal's phase and its committee date; use them.
        impact: when
          ? `${label} is the workstream you own on this deal, and it has produced nothing while the committee date moved to within reach.`
          : `Until something is written against ${label}, this deal reaches committee with your workstream unevidenced — whatever the rest of it looks like.`,
        verdict: bundle?.verdict?.state || null,
        gating: blocking.map((b) => `${b.label} — ${b.reasons.join(', ')}`),
      };
    }
    if (high.length) {
      return {
        ...base,
        short: `is carrying ${high.length} open high-severity finding${high.length === 1 ? '' : 's'}`,
        rank: 2,
        tag: `${high.length} open in ${label}`,
        tone: 'bad',
        why: `${high.length} high-severity finding${high.length === 1 ? '' : 's'} in your ${label} workstream ${high.length === 1 ? 'is' : 'are'} still open — ${high.slice(0, 2).map((i) => reconcileFindingText(String(i.title || ''), raw).replace(/\s*\.\s*$/, '')).join('; ')}.`,
        impact: 'An unresolved high-severity finding holds the deal at IC and, left open, becomes a condition or a price adjustment.',
        verdict: bundle?.verdict?.state || null,
        gating: high.map((i) => i.title),
      };
    }
    if (blocking.length) {
      return {
        ...base,
        short: 'is blocking IC',
        rank: 3,
        tag: `${label} blocking`,
        tone: 'warn',
        why: `Your ${label} workstream is among the reasons this deal is not yet IC-ready — ${blocking.map((b) => b.reasons.join(', ')).join('; ')}.`,
        impact: 'Until this workstream clears, the deal cannot go to IC on the record as it stands.',
        verdict: bundle?.verdict?.state || null,
        gating: blocking.map((b) => `${b.label} — ${b.reasons.join(', ')}`),
      };
    }
    if (progress >= 100 && findings === 0) {
      return {
        ...base,
        short: 'is marked complete but carrying nothing on the record',
        rank: 4,
        tag: `${label} complete, nothing recorded`,
        tone: 'warn',
        // This is the same rule the readiness engine applies, said in the first person.
        // A lane marked done with no findings is either work that was never written up
        // or a lane that was closed to clear the board; the record cannot tell which,
        // and neither can this sentence, so it does not guess.
        why: `Your ${label} workstream is marked complete but carries no findings, so there is nothing on the record showing what the work concluded.`,
        impact: 'At IC, a workstream with nothing recorded counts the same as an open one.',
        verdict: bundle?.verdict?.state || null,
        gating: [],
      };
    }
    if (soon && progress < 100) {
      return {
        ...base,
        short: `is ${progress}% complete`,
        rank: 5,
        tag: `${label} ${progress}%`,
        tone: 'warn',
        why: `Your ${label} workstream is ${progress}% complete and ${when}.`,
        impact: 'Finishing after the papers go out means the IC reads a workstream that changed underneath it.',
        verdict: bundle?.verdict?.state || null,
        gating: [],
      };
    }
    if (progress >= 100) {
      return { ...base, short: `complete with ${findings} finding${findings === 1 ? '' : 's'}`, rank: 8, tag: `${label} complete`, tone: 'good', why: `Your ${label} workstream is complete with ${findings} finding${findings === 1 ? '' : 's'} on the record.`, impact: 'Your lane is done here. It is on the list so you can see the whole book, not because it is waiting on you.', verdict: bundle?.verdict?.state || null, gating: [] };
    }
    return { ...base, short: `${progress}% complete`, rank: 7, tag: `${label} ${progress}%`, tone: 'good', why: `Your ${label} workstream is ${progress}% complete with ${findings} finding${findings === 1 ? '' : 's'} recorded.`, impact: 'Your lane is done here. It is on the list so you can see the whole book, not because it is waiting on you.', verdict: bundle?.verdict?.state || null, gating: [] };
  };

  const candidates = ws.map(assessOne).sort((a, b) => a.rank - b.rank || a.laneProgress - b.laneProgress);
  const row = candidates[0];
  const others = candidates.slice(1);
  // A lane nobody opened on a deal that is already through the gate is a records gap,
  // not work standing between this seat and a committee. Left at the same rank as live
  // diligence it filled the CFO's page with four post-close deals and pushed the deal
  // with an open high-severity finding in his own lane, nine days from committee, off
  // the bottom. Same correction as the chair's queue: past the gate ranks below in
  // front of it.
  const postGate = phase === 'post-committee';
  return {
    ...row,
    rank: postGate ? row.rank + 4 : row.rank,
    // What the seat's OTHER lanes on this deal are doing. Without this the CFO's page
    // reported tax on thirteen deals and never once said what had happened to the QoE
    // work — which is the half of his job the firm actually chases him about.
    laneStates: candidates.map((c) => ({ lane: c.lane, label: c.laneLabel, progress: c.laneProgress, status: c.laneStatus, state: c.short })),
    why: others.length
      ? `${row.why} Your ${others.map((o) => `${o.laneLabel} workstream ${o.short}`).join(', and your ')}.`
      : row.why,
    // Every owned lane that is holding this deal, not just the one the row is named for.
    gating: [...new Set(candidates.flatMap((c) => c.gating || []))],
  };
}

// Seats whose job is a PHASE rather than a lane care about a different slice of the
// same queue. An analyst sources and screens, so an origination target that needs work
// is their day — ranked 9 by the portfolio assessment, i.e. off the bottom of the page.
// An operating partner owns the companies the firm already bought. Rather than write a
// second assessment for each, the phase they own is promoted within the existing one.
const SEAT_PHASE = { screening: 'origination', value: 'value' };

// ---------------------------------------------------------------------------
//  Work IQ signal across the portfolio
// ---------------------------------------------------------------------------
// The single most useful cross-deal Work IQ read: promises people made in the
// deal channels that nobody has turned into a tracked task. Proposed only —
// creating a task still routes through the deal that owns it.
function portfolioCommitments(deals, rawFor, limit = 6, laneLabels = []) {
  const out = [];
  for (const d of deals) {
    // A commitment quotes a named person out of a deal's private channel, so it is
    // deal-team content, not metadata. `listDeals` deliberately returns status-tier
    // deals to people who are NOT on that team (metadata only, thesis stripped) —
    // and `rawFor` below resolves to the UNREDACTED record. Reading a status-tier
    // deal here would therefore promote a metadata-only seat to full channel
    // content, which is the exact escalation the access model exists to prevent.
    // Only full-access deals contribute. An accessLevel that is missing entirely is
    // also refused: the one caller that omits identity (`listAgentDeals`) stamps
    // 'full' on every deal it returns, so "absent" is not a trusted internal path,
    // it is an unknown one.
    if (d.accessLevel !== 'full') continue;
    let corpus;
    // The corpus is composed from the FULL deal record (workstream leads, sponsor,
    // dates); a list summary has those stripped, which would leave every
    // commitment attributed to a lane instead of a person.
    try { corpus = corpusForDeal(rawFor(d) || d); } catch { continue; }
    const found = detectCommitments(corpus.channel?.messages || [], { source: 'Deal channel, composed from the deal record' });
    for (const c of found) {
      out.push({
        dealId: d.id,
        company: d.company,
        author: c.author,
        headline: c.headline,
        quote: c.quote,
        at: c.at,
        due: c.due,
        dueText: c.dueText,
        laneLabel: c.laneLabel,
        confidence: c.confidence,
        basis: c.basis,
      });
    }
  }
  // A commitment already carries the lane it was made against. When the reader owns a
  // lane, theirs come first — a promise somebody made about supplier audits is that
  // person's to chase, and it should not be six rows below a legal one just because
  // the legal one is due sooner. Nothing is hidden: the ordering changes, the list
  // does not, and the count in the narrative is still the full count.
  const mine = new Set(laneLabels);
  const isMine = (c) => (c.laneLabel ? mine.has(c.laneLabel) : false);
  out.sort((a, b) => {
    if (mine.size && isMine(a) !== isMine(b)) return isMine(a) ? -1 : 1;
    const ta = a.due ? new Date(a.due).getTime() : Infinity;
    const tb = b.due ? new Date(b.due).getTime() : Infinity;
    return ta - tb;
  });
  // This feed is the one place the whole book's channels are read side by side, so a
  // sentence that is unremarkable on its own deal is quoted three times here, from the
  // same person, on three different companies. The list keeps the first and drops the
  // echoes — the count above it is unchanged, so nothing is being hidden.
  const seen = new Set();
  const deduped = out.filter((c) => {
    const key = `${c.author}|${c.quote || c.headline}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  out.length = 0;
  out.push(...deduped);
  return {
    total: out.length,
    deals: new Set(out.map((c) => c.dealId)).size,
    yours: mine.size ? out.filter(isMine).length : 0,
    items: out.slice(0, limit).map((c) => ({ ...c, yours: isMine(c) })),
    // Thirty-nine follow-ups were counted on the tile and six were shown. The other
    // thirty-three could only be reached by opening the deals one at a time, and a deal
    // takes the better part of fifteen seconds to open -- so the honest way to act on
    // the number this product puts in front of a partner was eight minutes of waiting.
    // The whole list travels; the card decides how much of it to unroll at once.
    all: out.map((c) => ({ ...c, yours: isMine(c) })),
  };
}

// ---------------------------------------------------------------------------
// `rawFor` resolves a list summary back to its full deal record, which the Work IQ
// corpus needs (workstream leads and sponsors are stripped from summaries). It defaults to
// the identity function so the builder stays testable with plain objects.
export function buildHomeDesk(deals = [], { role = null, roleLabel = null, seatLabel = null, persona = null, demoMode = false, rawFor = (d) => d } = {}) {
  // One rotating index across the whole attention queue, so no two rows open the same way.
  const headFrames = { next: 0 };
  const list = Array.isArray(deals) ? deals.filter(Boolean) : [];
  const seat = seatFor({ role, persona });

  // The verdict is computed from the unredacted record and names lanes and findings,
  // so it is only ever computed for a deal this reader can open. Metadata-tier deals
  // get a null raw and their own row — the queue says "not assessed", not "on track".
  const rawIfPermitted = (d) => {
    if (d.accessLevel !== 'full') return null;
    try { return rawFor(d) || d; } catch { return null; }
  };

  // ---- the queue, built for THIS seat ---------------------------------------
  // A lane-owning seat is asked about its lane on each deal; every other seat is asked
  // about the deal. Deals where a lane seat has no lane drop out of the queue entirely
  // rather than being reported as fine — "nothing here for you" is a true statement,
  // "on track" would not be.
  const isLaneSeat = seat.kind === 'lane';
  const promoted = SEAT_PHASE[seat.kind] || null;
  const scored = [];
  for (const d of list) {
    const raw = rawIfPermitted(d);
    let a = null;
    if (isLaneSeat && raw) a = assessLane(d, raw, seat.lanes, seat.laneLabels);
    if (!a && !isLaneSeat) a = assess(d, raw);
    if (!a) continue;
    // The phase this seat owns comes forward. It is a re-ordering, not a re-wording:
    // the row still says exactly what the record says about that deal.
    //
    // Only rows built from evidence are promoted. Without `raw`, assess() correctly
    // degrades to "you hold this deal at metadata level" at rank 7 — below the cut. If
    // the promotion applied to that too, a sourcing seat's queue would surface deals it
    // cannot read, under a row that says there is nothing to say about them, displacing
    // origination targets the analyst can actually work on. Bringing forward the phase
    // someone owns must not bring forward the deals they do not.
    const rank = raw && promoted && phaseOf(d)?.key === promoted ? Math.min(a.rank, 2) : a.rank;
    scored.push({ deal: d, a: { ...a, rank } });
  }
  // Order: severity band first, then how close the committee is.
  //
  // The tie-break used to be `readiness`, which is wrong twice over. It is the slider
  // number this file's own header says must never be the reason for a row's position —
  // and it is absent on every seeded deal, so num() returned 0 for both sides of every
  // comparison and the sort collapsed to the order of the array in data/deals.js. The
  // true answer to "why is this deal top of my list?" was "because it is first in a
  // seed file". Days-to-committee is a date somebody agreed to, it is the axis the
  // reader is actually managing against, and it can be said out loud.
  const urgency = (d) => (typeof d.daysToIC === 'number' && d.daysToIC >= 0 ? d.daysToIC : 9999);
  const ranked = scored.sort((x, y) => x.a.rank - y.a.rank
    || urgency(x.deal) - urgency(y.deal)
    || String(x.deal.company || '').localeCompare(String(y.deal.company || '')));


  const ranked_ = ranked.filter((r) => r.a.rank <= 5);
  // Everything the rank cut removed. This was not counted anywhere, so the panel dropped
  // seven not-IC-ready deals and reported attentionOmitted 0 — a list that silently
  // shortens the book while saying it has not is worse than one that is simply long.
  const droppedByRank = ranked.length - ranked_.length;
  // A row with no impact, no verdict and nothing gating it is not competing for anyone's
  // attention. Three real items followed by seven reading "In origination · Screened, not
  // yet launched into diligence" spends the list's authority: the eye stops scanning, and
  // the partner giving this 45 seconds stops trusting the ranking. They are counted and
  // named in one line instead.
  //
  // Except for the seat that owns that phase. To a sourcing seat those same rows ARE the
  // work, and cutting them empties the one queue they came here for — but not all of
  // them, or the list becomes the deal list with a new heading. An analyst was shown 11
  // of 11, five of them reading "Screened, not yet launched into diligence", and the
  // three that mattered were buried among them.
  const isOwnPhase = (r) => !!promoted && phaseOf(r.deal)?.key === promoted;
  const substantive = ranked_.filter((r) => r.a.impact || r.a.verdict || (r.a.gating && r.a.gating.length));
  const ownQuiet = ranked_.filter((r) => !substantive.includes(r) && isOwnPhase(r)).slice(0, 3);
  const kept = ranked_.filter((r) => substantive.includes(r) || ownQuiet.includes(r));
  const quiet = ranked_.length - kept.length;
  // Never cut to nothing: a desk of entirely quiet deals still needs its top of the list.
  const qualifying = kept.length >= 3 ? kept : ranked_.slice(0, Math.min(3, ranked_.length));
  // Send the whole qualifying set. A hard slice here meant the panel could say "6 deals"
  // and "7 more ranked below these" in the same sentence with no control anywhere on the
  // page to reach the other seven — a partner reads the list as the list, and walks into
  // committee blind to one of them. The tab shows six and offers to expand.
  const attention = qualifying
    .map((r, i) => ({
      ...r.a,
      id: `home-${r.deal.id}`,
      // Display order, 1-based. Set AFTER the spread so it is the queue position
      // the user sees, not the internal severity score used to sort.
      rank: i + 1,
      // Why THIS row sits where it sits. A partner's first question about any ranked
      // list is "why is this one above that one?", and until the sort had a defensible
      // second axis the honest answer was "because of its position in a seed file".
      // Now the two things that decide it — the severity band and the committee date —
      // are stated on the row that they placed.
      // The negative branch used to print "no IC date set" on deals that plainly had
      // one -- the row said "no IC date set" while the deal's own record held
      // 20 Jul 2026, fourteen days back. The date was not missing; it had passed. Say
      // which of the two it is, because they call for different actions.
      placedBy: (() => {
        const n = typeof r.deal.daysToIC === 'number' ? r.deal.daysToIC : null;
        if (n === null) return `${r.a.tag} · no IC date set`;
        if (n < 0) return `${r.a.tag} · IC was ${-n} day${n === -1 ? '' : 's'} ago`;
        return `${r.a.tag} · IC in ${n} day${n === 1 ? '' : 's'}`;
      })(),

      dealId: r.deal.id,
      company: r.deal.company,
      stageName: r.deal.stageName || r.deal.stage || null,
      // Per-stage step position. "step 2 of 5" is a place in a process; the old
      // global "6 of 16" counted archive and post-close steps a live deal will
      // never reach in this stage.
      stepNumber: typeof r.deal.stageStepNumber === 'number' && r.deal.stageStepNumber > 0 ? r.deal.stageStepNumber : null,
      stepTotal: typeof r.deal.stageStepTotal === 'number' ? r.deal.stageStepTotal : null,
      readiness: num(r.deal.readiness),
      // The tab needs this to know whether an IC readiness percentage is still a
      // live figure or a historical one. Without it the attention list said
      // "68% IC-ready" about a deal the same screen calls "Approved at IC".
      status: r.deal.status || null,
      icInDays: typeof r.deal.daysToIC === 'number' ? r.deal.daysToIC : null,
      // Where to go about it. A ranked list of things needing attention that offers no
      // route to any of them makes the reader find the deal again by hand.
      cta: (() => {
        const s = String(r.deal.stage || '').toUpperCase();
        if (s.startsWith('O')) return { label: 'Open the plan', tab: 'stages' };
        if (s.startsWith('D')) return { label: 'Open IC readiness', tab: 'ic' };
        return { label: 'Open the deal', tab: 'cockpit' };
      })(),
    }));

  // THE SAME SENTENCE, THIRTEEN TIMES.
  //
  // Every deal short of committee is short of the same five required items, in the same
  // order, so four consecutive cards opened "5 required items outstanding: Findings /
  // red-flag report, Final IC memo, IC memo sections approved, Recommendation drafted,
  // KYC / compliance cleared". Each row was true. Read together they were a wall, and
  // nobody reads the fifth — which is exactly the row the list exists to surface.
  //
  // Nothing is hidden: the first row to carry a given set states it in full, and every
  // later row with the identical set says so and names where to read it. The full list
  // stays on the row for anyone who wants it.
  // A lane seat is the WORST case, not an exception. The General Counsel's queue carried
  // seven byte-identical rows reading "Your Legal workstream has no work recorded against
  // it", and excluding lane seats protected precisely the screen this was written for.
  // They are collapsed too — the rewritten sentence still opens by naming the lane, which
  // is the one word that tells a legal seat the row is theirs.
  {
    const seenAt = new Map();
    // Keep the row's own subject. A seat can own more than one lane on a deal — "Your Tax
    // & structuring and Legal workstreams…" — and a rewrite that reached for the first
    // lane name dropped the second, which is the one word telling that seat the row is
    // theirs. Take everything before the verb and put it back unchanged.
    const subjectOf = (row) => {
      const m = /^(.*?)\s+(has|have|is|are)\s/.exec(String(row.why || ''));
      return m ? { subject: m[1], verb: m[2] } : null;
    };
    const keyOf = (row) => {
      const g = Array.isArray(row.gating) ? row.gating : [];
      if (g.length) return `g:${g.join(' | ')}`;
      // Not only lane seats. An analyst's queue carried three rows reading "Screened, not
      // yet launched into diligence." — no gating, no lane, and identical.
      return row.why ? `w:${row.why}` : null;
    };

    // THE REQUIRED PAPERS ARE THE SAME ON EVERY DEAL, AND THEY WERE PRINTED IN FULL EVERY
    // TIME.
    //
    // Six of thirteen rows carried "Final IC memo, IC memo sections approved,
    // Recommendation drafted" verbatim. Keying the collapse on the joined gating string
    // did not catch it, because a four-item list and a five-item list are different
    // strings — the same escape hatch as a template that dodges a guard by changing one
    // element. Compare the SET, and where a later row shares the set, print only what it
    // adds. The full list still travels on `gating` for anyone who wants it.
    const requiredItems = (row) => {
      const g = (Array.isArray(row.gating) ? row.gating : []).find((x) => /required item/i.test(x));
      if (!g) return null;
      const after = g.slice(g.indexOf(':') + 1);
      const items = after.split(',').map((s) => s.trim()).filter(Boolean);
      return items.length ? items : null;
    };
    let paperBaseline = null;
    for (const row of attention) {
      const items = requiredItems(row);
      if (!items) continue;
      if (!paperBaseline) {
        paperBaseline = { company: row.company, set: new Set(items) };
        continue;
      }
      const extra = items.filter((i) => !paperBaseline.set.has(i));
      const shared = items.filter((i) => paperBaseline.set.has(i));
      // Worth collapsing as soon as the baseline is most of the opening clause. The
      // earlier bar also required the extras to be few, which let the six-item rows
      // through — and those are the longest ones on the page.
      if (shared.length < 3) continue;
      const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0]);
      // Two rows landing on this phrase reads as one row printed twice, so the frame
      // rotates across the queue while the content stays exact.
      const frames = [
        (x) => `${list(x)} outstanding, on top of the standard committee papers`,
        (x) => `The committee papers are outstanding, and so ${x.length === 1 ? 'is' : 'are'} ${list(x)}`,
        (x) => `${list(x)} still to come, on top of papers nobody has started`,
        (x) => `Nothing has been produced yet: no committee papers, and no ${x.map((s) => String(s).replace(/^the /i, '').toLowerCase()).join(' or ')}`,
      ];
      const bare = [
        'The standard committee papers are the only thing outstanding',
        'Only the committee papers are outstanding',
        'Nothing is outstanding but the committee papers',
        'The committee papers are the last thing missing',
      ];
      const slot = headFrames.next;
      headFrames.next += 1;
      const phrase = extra.length ? frames[slot % 4](extra) : bare[slot % 4];
      row.why = String(row.why || '').replace(/^\d+ required items? outstanding:[^;.]*/i, phrase);
      row.paperBaseline = paperBaseline.company;
      // What the row ACTUALLY needs, kept before the collapse loses it. The pass below
      // used to compare the collapsed phrase and then assert set-equality from it --
      // so Cascadia, which is missing four papers, was told on the home screen that
      // "the same papers are outstanding as on Nordic Grocery Group", which is missing
      // five including KYC / compliance cleared. A lossy string cannot carry a set.
      row.paperSetKey = items.slice().sort().join(' | ');
    }
    const openingSeen = new Map();
    const laneSeen = new Map();
  const impactSeen = new Set();
  const paperOpenings = { next: 0 };
    for (const row of attention) {
      let why = String(row.why || '');
      if (!why) continue;
      const head = why.split(';')[0].trim();
      // Only ever keyed on the true set. Where a row has no paper set the head is left
      // alone: a repeated clause is a smaller fault than a false one, and the counting
      // pass below already tells the reader how many more rows look like this.
      if (row.paperSetKey && head.length > 25 && !row.laneLabel) {
        const first = openingSeen.get(row.paperSetKey);
        // "The same papers are outstanding as on Nordic Grocery Group" is a row telling
        // the reader to go and read a different row, on the first screen of the product.
        // Deduplication that costs the reader a lookup is worse than the repetition it
        // removes. Say what is outstanding, in fewer words.
        if (first) {
          // One index across the whole queue: keyed per paper set it restarted at zero
          // for each, so two different sets landed on the same replacement.
          const seen = paperOpenings.next;
          paperOpenings.next += 1;
          why = why.replace(head, [
            'The standard committee papers are outstanding',
            'None of the committee papers has been started',
            'The papers the committee reads do not exist yet',
            'Nobody has begun the committee papers',
          ][seen % 4]);
        }
        else openingSeen.set(row.paperSetKey, row.company);
      }
      // The blocking tail names every lane with its owner and its reason. After the
      // second mention of a lane across the queue, the reader has it.
      // The clause after the workstream list belongs to the row, not to the list.
      let tail = '';
      why = why.replace(/\s*(\u2014|--)\s*with committee[^.]*\.?\s*$/i, (m) => { tail = m.replace(/\s*\.\s*$/, '').replace(/^\s*/, ' '); return ''; });
      why = why.replace(/(\d+) workstreams? blocking: (.+?)\.?$/i, (m, n, list) => {
        const lanes = list.split(/,\s(?=[A-Z][\w &/]*\s\()/).map((s) => s.trim()).filter(Boolean);
        const kept = [];
        let dropped = 0;
        for (const l of lanes) {
          const key = l.split('—')[0].trim();
          const seen = (laneSeen.get(key) || 0) + 1;
          laneSeen.set(key, seen);
          if (seen <= 2 && kept.length < 2) kept.push(l);
          else dropped += 1;
        }
        const noun = `workstream${Number(n) === 1 ? '' : 's'}`;
        if (!kept.length) {
          const names = lanes.map((l) => l.split('—')[0].replace(/\s*\([^)]*\)\s*$/, '').trim()).filter(Boolean);
          return `${n} ${noun} blocking — ${names.join(', ')} — none of them started.`;
        }
        return `${n} ${noun} blocking: ${kept.join(', ')}${dropped ? `, and ${dropped} more` : ''}.`;
      });
      // Two rows landing on the same sentence is what a scanning eye catches. Where the
      // row carries alternatives, take one nobody else in the queue has used.
      if (row.impact && Array.isArray(row.impactOptions)) {
        const groupKey = row.impactOptions[0];
        if (impactSeen.has(groupKey)) {
          const n = (String(why).match(/^(\d+)\s/) || [])[1];
          const isIC = row.impactOptions === BLOCKING_AT_IC;
          row.impact = n
            ? (isIC
              ? `Same exposure here: ${n} of them would go to the room as conditions.`
              : `Same exposure here: ${n} of them would reach the committee with nothing written against them.`)
            : row.impact;
        } else impactSeen.add(groupKey);
      } else if (row.impact) {
        impactSeen.add(row.impact);
      }
      // Working state, not part of the row anybody reads.
      delete row.impactOptions;
      delete row.paperBaseline;
      delete row.paperSetKey;
      // Re-attach the committee clause, once, with one stop on the end.
      if (tail) why = `${why.replace(/\.\s*$/, '')}${tail}.`;
      row.why = why;
    }

    // Count first. Rewriting the second and every later row to "the same as on X" simply
    // moved the repetition: five identical rows became three identical rows. A reader who
    // is on the third one already knows; what they do not know is how many more there
    // are, so say that instead and let them stop reading.
    const totals = new Map();
    for (const row of attention) {
      const k = keyOf(row);
      if (k) totals.set(k, (totals.get(k) || 0) + 1);
    }
    const seenCount = new Map();
    for (const row of attention) {
      const g = Array.isArray(row.gating) ? row.gating : [];
      const key = keyOf(row);
      if (!key) continue;
      const first = seenAt.get(key);
      if (!first) {
        seenAt.set(key, row);
        seenCount.set(key, 1);
        continue;
      }
      const nth = (seenCount.get(key) || 1) + 1;
      seenCount.set(key, nth);
      const total = totals.get(key) || nth;
      row.sameAs = { dealId: first.dealId, company: first.company };
      const s = subjectOf(row);
      // A seat can own more than one lane on a deal, and the row must go on naming every
      // one of them or it stops being that seat's row. Rebuild the subject from the lane
      // states rather than from the sentence, so nothing is dropped.
      const labels = Array.isArray(row.laneStates) ? row.laneStates.map((x) => x.label).filter(Boolean) : [];
      const subject = labels.length > 1
        ? `Your ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]} workstreams`
        : (s ? s.subject : null);
      const plural = labels.length > 1 || s?.verb === 'have' || s?.verb === 'are';
      const tail = nth === 2
        ? `here as on ${first.company}`
        : `here — the ${nth}${nth === 3 ? 'rd' : 'th'} of ${total} deals in this queue in that state, starting with ${first.company}`;
      if (g.length) {
        const n = g.length;
        row.why = subject
          ? `${subject} ${plural ? 'have' : 'has'} the same ${n} item${n === 1 ? '' : 's'} outstanding ${tail}.`
          : `The same ${n} item${n === 1 ? ' is' : 's are'} outstanding ${tail}.`;
      } else {
        row.why = subject
          ? `${subject} ${plural ? 'are' : 'is'} in the same state ${tail} — nothing recorded against ${plural ? 'them' : 'it'} yet.`
          : `The same is true ${tail}.`;
      }
    }

    // The same treatment for the consequence line. Varying `why` per deal still left the
    // Fund CFO reading one identical `impact` seven times — because the consequence of an
    // unopened lane genuinely IS the same on every deal, which is exactly why it does not
    // need saying seven times.
    //
    // The first attempt replaced the third with "The consequence is the same as the rows
    // above" and nulled the rest. That was worse twice over: the placeholder itself then
    // appeared on several cards (it is one string, so it repeats too), it made a
    // positional claim about a list that has a "show the remaining N" toggle, and the
    // nulling left four consecutive cards on the General Counsel's screen with no
    // consequence line at all. A row that has nothing to say is not an improvement on a
    // row that repeats.
    //
    // Say the consequence in terms of THIS deal instead. The company name and the
    // committee date differ on every row, so it cannot repeat, and it tells the reader
    // the one thing that decides whether to act on this row now or later.
    const shapeSeen = new Map();
    for (const row of attention) {
      const imp = String(row.impact || '').trim();
      if (!imp) continue;
      const shape = imp.toLowerCase().replace(/\d+/g, '#').replace(/\b(is|are|it|them|s)\b/g, '').replace(/\s+/g, ' ').trim();
      const nth = (shapeSeen.get(shape) || 0) + 1;
      shapeSeen.set(shape, nth);
      if (nth < 3) continue;
      const days = typeof row.icInDays === 'number' ? row.icInDays : null;
      const co = row.company || 'this deal';
      row.impact = days == null
        ? `${co} has no committee date on the record, so nothing is forcing this to move.`
        : days < 0
          ? `${co} passed its committee date ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago with this still open.`
          : days === 0
            ? `${co} goes to committee today with this still open.`
            : `${co} has committee in ${days} day${days === 1 ? '' : 's'} with this still open.`;
    }
  }

  // The panel was headed "across every deal you can see · 6 deals" while silently
  // dropping the seventh and eighth off the bottom of a hard slice -- including deals
  // with committee inside a month. A truncated list is fine; a truncated list that
  // calls itself complete is not.
  const attentionOmitted = Math.max(0, qualifying.length - attention.length);

  // Deals that qualified but had nothing outstanding to say. Reported as a count with a
  // route, rather than as rows that repeat one sentence.
  const attentionQuiet = quiet + droppedByRank;
  // The count is computed AFTER the access wall, so on a member seat these were nine
  // deals the reader is not cleared for — and the note told them nothing was outstanding
  // on any of them. A deal you cannot see is not a deal with nothing on it.
  const restrictedHere = list.filter((d) => d.accessLevel === 'status' || d.locked).length;
  const attentionQuietNote = attentionQuiet
    ? (restrictedHere
      ? `${attentionQuiet} more deal${attentionQuiet === 1 ? '' : 's'} ${attentionQuiet === 1 ? 'is' : 'are'} in view. ${restrictedHere === attentionQuiet ? 'You are not on the deal team for ' + (restrictedHere === 1 ? 'it' : 'them') + ', so nothing about what is outstanding is shown.' : `Of ${attentionQuiet === 1 ? 'it' : 'those'}, ${restrictedHere} ${restrictedHere === 1 ? 'is one you are not on the deal team for' : 'are ones you are not on the deal team for'}; the rest have nothing outstanding today.`}`
      : `${attentionQuiet} more deal${attentionQuiet === 1 ? '' : 's'} ${attentionQuiet === 1 ? 'is' : 'are'} in view with nothing that needs a decision from you today. ${attentionQuiet === 1 ? 'It' : 'They'} may still have work outstanding \u2014 open ${attentionQuiet === 1 ? 'it' : 'them'} to see what.`)
    : null;

  // Rows the reader can see the existence of but not the detail of. Every number below
  // is computed from the deals with detail, so wherever one of them is used to reassure,
  // this count has to be said in the same breath.
  const restricted = list.filter((d) => d.accessLevel === 'status' || d.locked).length;

  // Headline numbers, all derived from the deals THIS caller can see so the
  // narrative and the tiles can never disagree.
  // A sum over redacted values is not a small number, it is a missing one. Enterprise
  // value is stripped from every row a member can only see the status of, so this summed
  // nine masked deals to nothing and the padlock screen — the one moment in the demo that
  // exists to show access working — opened with "carrying $0 of enterprise value". The
  // fund appeared to be worth nothing at precisely the point we were claiming the product
  // is careful with what it shows. Count what is actually readable and say the rest is
  // withheld; a number that cannot be honestly computed is not rendered as zero.
  const priced = list.filter((d) => num(d.dealSize) > 0);
  const capital = priced.reduce((s, d) => s + num(d.dealSize), 0) * 1e6;
  const capitalWithheld = list.length - priced.length;
  // The whole book is masked: there is no honest headline to give, only the reason.
  const capitalUnknown = list.length > 0 && priced.length === 0;
  // Counted from the verdict, not from a percentage bar. "3 not IC-ready" is a number
  // a partner can act on; "62% average readiness" is a number nobody has ever acted on.
  //
  // "Ready to table" counts only deals that have NOT yet been to committee. A signed
  // Execution deal and an owned Value company both compute READY, and reporting them as
  // ready to table is the same error as reporting an origination target as failing to
  // reach one — the tile would have read 5 when the true answer was 1.
  //
  // These are portfolio facts and are computed for every seat, because a workstream lead is
  // still entitled to the state of the deals they work on. What changes per seat is
  // which of them is put on the front page.
  const verdicts = list.map((d) => {
    const raw = rawIfPermitted(d);
    if (!raw) return null;
    try { return computeICReadiness(raw); } catch { return null; }
  });
  const stateOf = (i) => verdicts[i]?.verdict?.state || null;
  // The number of conditions the committee ACTUALLY attached. The CONDITIONAL state is
  // not evidence of one: icReadiness folds "this lane has nothing written against it"
  // into the same state as "the committee attached a condition". Counting the state
  // produced a tile reading "Conditions outstanding: 6" where four of the six deals
  // carried no condition at all — a specific, checkable claim that was wrong two thirds
  // of the time. Count the conditions, not the label.
  // ONE definition of an obligation, used by the queue rows (assess, above), the tiles,
  // the prose and the unevidenced-lane counter alike. An uncleared compliance check is
  // owed exactly as much as a condition is; counting only `conditions` here while the
  // row beneath counted both is how the operating partner's tile could omit a deal that
  // the row directly below it said owed two.
  const condsOf = (i) => num(verdicts[i]?.verdict?.openConditions) + num(verdicts[i]?.verdict?.openComplianceChecks);
  // All three verdict counters are restricted to deals actually IN diligence.
  //
  // A deal in origination has not failed to reach committee; it has not been asked to.
  // computeICReadiness has no origination branch, so an O2 screen with no CIM and no
  // model returns NOT-READY — and counting those made the chair's "Not IC-ready" tile
  // read 11 when the honest number was 7. The queue already knew better: assess() tags
  // exactly those deals "In origination — screened, not yet launched into diligence".
  // The tile and the queue were describing the same four deals in contradictory terms,
  // and a chair who cross-checks one against the other finds it in under a minute.
  const inDiligence = (d) => dealPhase(d) === 'diligence';
  // ONE definition of "in diligence" on the page. The tiles used to take the
  // denominator from `phaseOf` (a stage-code regex) while the numerator came from
  // `dealPhase`. They disagree by one deal, so the chair's tile read "7 of 9" directly
  // above a sentence whose numbers added to 8.
  const diligenceCount = list.filter(inDiligence).length;
  const notReady = list.filter((d, i) => stateOf(i) === 'NOT-READY' && inDiligence(d)).length;
  const conditional = list.filter((d, i) => stateOf(i) === 'CONDITIONAL' && inDiligence(d)).length;
  const icReady = list.filter((d, i) => stateOf(i) === 'READY' && inDiligence(d)).length;
  // Deals already through committee that still carry unmet obligations. This is a
  // different management problem from a live deal that is not ready to be tabled, and
  // it belongs to a different person — so it is counted separately rather than folded
  // into "Conditional", where it previously made a chair's second tile report six
  // signed companies as though they were awaiting his approval.
  const openObligations = list.filter((d, i) => !inDiligence(d) && condsOf(i) > 0).length;
  // Post-close deals whose CONDITIONAL state comes from lanes with nothing written
  // against them rather than from any condition the committee attached. This is a
  // records problem, not an obligations problem, and it gets its own counter and its
  // own sentence instead of being added to the number above.
  const unevidencedPostClose = list.filter((d, i) => !inDiligence(d) && stateOf(i) === 'CONDITIONAL' && condsOf(i) === 0).length;
  // The tile counts DEALS; this counts the conditions on them. Labelling a deal count
  // "Conditions outstanding" meant the tile said 2 while the sentence beside it said
  // "2 deals still carry conditions" — the same digit standing for two different things,
  // and the true number of conditions (3) appeared nowhere.
  const openConditionCount = list.reduce((s, d, i) => s + (!inDiligence(d) ? condsOf(i) : 0), 0);
  const sectors = new Set(list.map((d) => d.sector).filter(Boolean)).size;
  // `${sectorWord}` printed "1 sectors" whenever no
  // row carried a sector: the fallback said one and the plural test read the raw zero.
  // Decide the number once and agree with it.
  const sectorCount = sectors || 1;
  const sectorWord = `${sectorCount} sector${sectorCount === 1 ? '' : 's'}`;
  // "The next committee" must include the deal that is AT committee.
  //
  // `icPending` is `stepIndex < IC_STEP_INDEX`, and IC_STEP_INDEX is D4 — the committee
  // step itself — so a deal sitting on D4 with a date four days out was excluded from
  // its own countdown. Atlas Cold Chain was exactly that: READY, daysToIC 4, and the
  // only deal in "Ready to table = 1". The chair's tile said "next committee: 9 days"
  // and named a different company. He would have read nine days and nothing ready, and
  // walked into a committee in four with a deal ready to table. Everything before the
  // gate counts, which is every deal `dealPhase` has not yet called post-committee.
  // ...but a target date on a deal still in origination is an aspiration, not a booked
  // committee. All four O-stage deals in the book carry dates 48-70 days out; without
  // this a region-scoped seat holding only origination deals would be told "next
  // committee in 48 days" above a queue row saying that deal has not been launched into
  // diligence yet. Only a deal that has actually entered diligence is heading for a gate.
  const awaitingCommittee = (d) => {
    const p = dealPhase(d);
    return p !== 'post-committee' && p !== 'origination';
  };
  const upcoming = list
    .filter((d) => awaitingCommittee(d) && typeof d.daysToIC === 'number' && d.daysToIC >= 0)
    .sort((a, b) => a.daysToIC - b.daysToIC);
  const nearest = upcoming[0] || null;
  // A flat "none scheduled" sat directly above a queue card reading "IC in 55d", which
  // looks like the tile is simply broken. The exclusion above is right — that date is a
  // target on a deal nobody has launched yet — but the tile has to say so, or the reader
  // has to guess which of the two numbers to believe.
  const targeted = list
    .filter((d) => !awaitingCommittee(d) && dealPhase(d) === 'origination' && typeof d.daysToIC === 'number' && d.daysToIC >= 0)
    .sort((a, b) => a.daysToIC - b.daysToIC)[0] || null;
  const noIcSub = targeted
    ? `nothing booked — earliest target ${targeted.daysToIC}d, not yet launched`
    : 'none scheduled';

  // The phase strip is built from the SAME authority as every verdict counter on the
  // page. It used to use `phaseOf` alone — a regex over the stage code — which
  // classified one D5 deal as diligence while `dealPhase` called it post-committee, so
  // the strip said 9 in diligence while the tile beside it said 7 of 8.
  //
  // `dealPhase` is authoritative on the only question that matters here (has this deal
  // been to committee?), but it is coarser: it has no execution/value split. So it
  // decides pre/in/post, and `phaseOf` is used ONLY to divide post-committee into
  // "Execution & Closing" and "Value & Exit". One deal, one phase, on every surface.
  const stripPhase = (d) => {
    const p = dealPhase(d);
    if (p === 'origination' || p === 'diligence') return p;
    return phaseOf(d)?.key === 'value' ? 'value' : 'execution';
  };
  const phases = PHASES.map((p) => {
    const ds = list.filter((d) => stripPhase(d) === p.key);
    // Same rule as the headline: a phase whose sizes are all withheld carries an
    // unknown amount, not nothing. Sentences built from this check `capitalKnown`
    // before quoting a figure.
    const pPriced = ds.filter((d) => num(d.dealSize) > 0);
    return {
      key: p.key, label: p.label, count: ds.length,
      capital: pPriced.reduce((s, d) => s + num(d.dealSize), 0) * 1e6,
      capitalKnown: pPriced.length > 0,
    };
  }).filter((p) => p.count > 0);

  const workiq = portfolioCommitments(list, rawFor, 6, seat.laneLabels);

  // ---- what this seat owns, counted ----------------------------------------
  // Only meaningful for a lane seat; computed once and reused by the tiles and the
  // narrative so the two can never disagree.
  //
  // "Open" means open. An earlier version counted every row the lane appeared on,
  // completed ones included, which inflated the headline roughly twofold and was
  // contradicted by the sentence directly beneath it: "open on 15 of the 19 deals you
  // can see: 5 not started, 7 complete". A finished lane is not a task.
  const laneRows = isLaneSeat ? ranked : [];
  const laneDone = laneRows.filter((r) => num(r.a.laneProgress) >= 100).length;
  const laneOpen = laneRows.filter((r) => num(r.a.laneProgress) < 100).length;
  const laneNotStarted = laneRows.filter((r) => !num(r.a.laneProgress)).length;
  // "Blocking the gate" can only mean a deal that has not yet BEEN through the gate.
  // Without this filter the Fund CFO read "your lane is one of the reasons 13 deals
  // cannot be tabled at committee" two paragraphs above "19 deals, 7 not yet IC-ready"
  // — thirteen deals that cannot be tabled, out of seven that are not ready. Five of
  // the eleven on the GC's page were already signed. A reader with a calculator stops
  // the demo there.
  const laneBlocking = laneRows.filter((r) => (r.a.gating || []).length && r.a.rank <= 3 && inDiligence(r.deal)).length;
  // The lanes this seat owns that stand between a deal and a committee date. This is
  // the only number on the page a partner will chase them about, so it leads the tiles.
  const laneDueBeforeIC = laneRows.filter((r) => num(r.a.laneProgress) < 100
    && typeof r.deal.daysToIC === 'number' && r.deal.daysToIC >= 0 && r.deal.daysToIC <= 21).length;
  const laneNextIC = upcoming.find((d) => laneRows.some((r) => r.deal.id === d.id && num(r.a.laneProgress) < 100)) || null;
  // A seat that owns two lanes has two jobs, and one aggregate number cannot tell it
  // which one is behind. The Fund CFO's "Not started: 9" was true and useless: it did
  // not say whether the gap was QoE work or tax structuring, which are different people
  // and different weeks. Only computed when there is more than one lane to split.
  const laneSplit = seat.laneLabels.length > 1
    ? (seat.lanes || []).map((ln, i) => ({
      label: seat.laneLabels[i] || ln,
      notStarted: laneRows.filter((r) => (r.a.laneStates || []).some((s) => s.lane === ln && !num(s.progress))).length,
      open: laneRows.filter((r) => (r.a.laneStates || []).some((s) => s.lane === ln && num(s.progress) < 100)).length,
    }))
    : [];

  // Facts an observer CAN be told. Stage, status and target date survive the metadata
  // tier, so a seat with no workstream access is not a seat with nothing to say —
  // building an empty box and apologising for it is worse than reporting what is there.
  const observerNearCommittee = list.filter((d) => awaitingCommittee(d) && typeof d.daysToIC === 'number' && d.daysToIC >= 0 && d.daysToIC <= 14).length;  const observerOverdue = list.filter((d) => awaitingCommittee(d) && typeof d.daysToIC === 'number' && d.daysToIC < 0).length;

  // ---- the narrative -------------------------------------------------------
  const c = citer();
  if (!list.length) {
    c.add('You do not have any live deals in view. Sourced candidates appear here once they clear the screening gate.', 'Deal list');
  } else if (isLaneSeat) {
    // A lane seat is told about its lane FIRST and the portfolio second. The order is
    // the point: the previous version opened every seat with the same sentence about
    // total enterprise value, which is a fact for the fund's CFO and noise for the
    // person who owns supplier concentration.
    // Lane labels are proper nouns and are NOT lowercased. "Financial / QoE" became
    // "financial / qoe" and "ESG" became "esg", which is the sort of thing the person
    // who owns that lane notices before they read anything else on the page.
    const lane = laneName(seat.laneLabels);
    const laneWord = seat.laneLabels.length > 1 ? 'workstreams' : 'workstream';
    // The denominator is the number of deals this lane was actually ASSESSED on, not
    // every deal in view. assessLane returns null for origination deals (the lanes have
    // not opened yet), so counting against list.length produced "open on 8 of the 19 —
    // 5 not started, 7 complete": 5 + 7 = 12, 8 + 7 = 15, and neither is 19.
    const laneTotal = laneRows.length;
    if (!laneOpen) {
      c.add(`None of the ${laneTotal} deal${laneTotal === 1 ? '' : 's'} carrying your ${laneWord} ${laneTotal === 1 ? 'has' : 'have'} it open, so there is nothing waiting on you today.`, 'Workstream record');
    } else {
      const many = seat.laneLabels.length > 1;
      c.add(`You own the ${lane} ${laneWord}. Of the ${laneTotal} deal${laneTotal === 1 ? '' : 's'} in diligence or beyond that you can see, ${laneOpen} still ha${laneOpen === 1 ? 's' : 've'} ${many ? 'one of them' : 'it'} open — ${laneNotStarted} of those not yet started — and ${laneDone} ${laneDone === 1 ? 'is' : 'are'} complete.`, 'Workstream record');
      const worst = attention[0];
      if (worst && (worst.tone === 'bad' || worst.tone === 'warn')) {
        const lead = /^[A-Z][a-z]/.test(worst.why) ? `${worst.why.charAt(0).toLowerCase()}${worst.why.slice(1)}` : worst.why;
    c.add(`Start with ${worst.company} — ${lead}`, worst.basis);
      }
      if (laneBlocking) {
        c.add(`Your ${seat.laneLabels.length > 1 ? 'workstreams are' : 'workstream is'} among the reasons ${laneBlocking} deal${laneBlocking === 1 ? '' : 's'} ${laneBlocking === 1 ? 'is' : 'are'} not yet IC-ready.`, 'IC readiness board — blocking workstreams');
      } else {
        c.add(`Your ${laneWord} ${seat.laneLabels.length > 1 ? 'are' : 'is'} not blocking any deal from going to IC.`, 'IC readiness board — blocking workstreams');
      }
      if (laneNextIC) {
        c.add(`Your ${laneWord} ${seat.laneLabels.length > 1 ? 'are' : 'is'} needed soonest on ${laneNextIC.company}, which goes to IC in ${laneNextIC.daysToIC} day${laneNextIC.daysToIC === 1 ? '' : 's'}.`, 'Deal record — target IC date');
      }
    }
    // This total spans the WHOLE book, owned companies included. The Report page
    // reports pipeline value, which excludes them. Both were right and neither said
    // so, and a partner read "$8.1B" here and "$6.4B" there and asked which number
    // she was supposed to give an LP.
    c.add(`Across everything you can see, screening to exit: ${list.length} deal${list.length === 1 ? '' : 's'} carrying ${money(capital)} of enterprise value, ${notReady} not yet IC-ready. The Report page counts pipeline value, which leaves out the companies you already own.`, 'Deal list');
  } else {
    // These sentences narrate the ACCESS MODEL — "you are seeing the administrator's
    // view", "you have observer access". That is a demonstration of the product, useful
    // when someone is being shown how visibility changes between jobs, and wrong in
    // ordinary use: a person at work is not previewing a role, they are doing their job,
    // and the product should just show them their own deals without narrating why.
    // Narrating the access model tells a room it is being shown a product rather than
    // shown its own desk. The behaviour it describes is visible without being announced.
    if (demoMode) {
      if (seat.kind === 'oversight') {
        c.add(restricted
      ? `This list is ranked by what needs a decision first rather than filtered to one job. ${restricted} confidential deal${restricted === 1 ? '' : 's'} ${restricted === 1 ? 'is' : 'are'} not in it: administration is not membership of a deal team, and nothing here overrides that.`
      : `This list is every deal you are cleared for, ranked by what needs a decision first rather than filtered to one job. Confidential deals still need deal-team membership, and administration is not membership.`, 'Access model — administrator');
      } else if (seat.kind === 'observer') {
        c.add('This page shows where each deal stands. The diligence behind it sits with the deal teams.', 'Access model — observer');
      } else if (seat.unbound) {
        // Say it, rather than let a generic page pass for a tailored one.
        c.add('No specialist role is assigned to you yet, so this is the general portfolio view rather than one built around your own work. Ask an administrator to add you to the workstreams you own.', 'Access model — no specialist role');
      }
    }
    // The seat's OWN opening sentence, ahead of the portfolio statistic.
    //
    // Enterprise value across sectors is a fundraising slide, not a Monday morning. It
    // used to open the page for the IC chair, the deal lead, the analyst and the head
    // of IR alike — so the supporting cast had job-specific openings while the person
    // the product is sold to read a fund-size number. Whoever has a job here is told
    // about the job first; the portfolio line follows as context.
    const jobOpener = () => {
      if (seat.kind === 'committee') {
        // A chair's first sentence is the agenda: what can be tabled, what cannot, and
        // who is holding it up.
        const when = nearest ? `The next IC is in ${nearest.daysToIC} day${nearest.daysToIC === 1 ? '' : 's'}.` : 'No IC date is set on any deal in view.';
        c.add(
          icReady
            ? `${when} ${icReady} deal${icReady === 1 ? ' is' : 's are'} ready for IC; ${notReady} in diligence ${notReady === 1 ? 'is' : 'are'} not.`
            : `${when} Nothing in view is ready for IC yet — ${notReady} deal${notReady === 1 ? ' is' : 's are'} still short of it.`,
          'IC readiness board — verdicts',
        );
        const blockers = attention.filter((a) => (a.gating || []).length).slice(0, 3);
        if (blockers.length) {
          // "Not ready for the next IC" sat under a sentence saying the next IC is in
          // four days, and then named deals whose own committees are nine, twelve and
          // twenty-one days out. They are not late for that meeting; they are behind on
          // their own dates. Say whose date each one is against.
          c.add(`Behind for their own committee dates: ${blockers.map((b) => {
            const d = typeof b.icInDays === 'number' && b.icInDays >= 0 ? ` in ${b.icInDays} day${b.icInDays === 1 ? '' : 's'}` : '';
            return `${b.company}${d} (${(b.gating || [])[0]})`;
          }).join(', ')}.`, 'IC readiness board — blocking workstreams');
        }
        if (openObligations) {
          c.add(`Separately, ${openObligations} deal${openObligations === 1 ? '' : 's'} already through IC still carr${openObligations === 1 ? 'ies' : 'y'} ${openConditionCount} open condition${openConditionCount === 1 ? '' : 's'} — attached at approval, or compliance checks not yet cleared.`, 'IC readiness board — post-committee obligations');
        }
        if (unevidencedPostClose) {
          // A records gap, not an obligation. Reported separately and named for what it
          // is, so nobody chases an owner for a condition that was never attached.
          c.add(`Another ${unevidencedPostClose} deal${unevidencedPostClose === 1 ? '' : 's'} that ${unevidencedPostClose === 1 ? 'has' : 'have'} passed IC carr${unevidencedPostClose === 1 ? 'ies' : 'y'} no conditions, but ${unevidencedPostClose === 1 ? 'its' : 'their'} diligence workstreams were never written up — a records gap, not outstanding work.`, 'IC readiness board — workstreams with nothing recorded');
        }
        return true;
      }
      if (seat.kind === 'deal-lead') {
        // The deal lead is accountable for getting deals TO the gate, so their sentence
        // is about the gap between now and the next date, not the size of the book.
        const soon = list.filter((d) => typeof d.daysToIC === 'number' && d.daysToIC >= 0 && d.daysToIC <= 21 && awaitingCommittee(d)).length;
        c.add(
          soon
            ? `You are running ${soon} deal${soon === 1 ? '' : 's'} with an IC date inside three weeks, and ${notReady} of the deals in view ${notReady === 1 ? 'is' : 'are'} not yet ready for IC.`
            : `No deal in view has an IC date inside three weeks. ${notReady} ${notReady === 1 ? 'is' : 'are'} still short of being ready.`,
          'Deal record — target IC date',
        );
        if (workiq.total) {
          c.add(`${workiq.total} follow-up${workiq.total === 1 ? '' : 's'} raised in the deal channels ${workiq.total === 1 ? 'has' : 'have'} no matching task here — those land on you before they land on anyone else. The channels are composed from the deal record; no Microsoft 365 mailbox is connected yet.`, 'Deal channels, composed from the deal record until Microsoft 365 is connected');
        }
        return true;
      }
      if (seat.kind === 'lp') {
        // Investor relations answers to LPs, so the frame is committed capital and what
        // has completed, not which diligence lane is late.
        const closed = phases.find((p) => p.key === 'value');
        c.add(
          capitalUnknown
            ? `Across the book you can see, ${list.length} deal${list.length === 1 ? '' : 's'}${closed ? `, of which ${closed.count} ${closed.count === 1 ? 'company has' : 'companies have'} completed and moved into value creation` : ''}. Deal sizes are not shown at your access level.`
            : `Across the book you can see, ${money(capital)} of enterprise value in ${list.length} deal${list.length === 1 ? '' : 's'}${closed ? `, of which ${closed.count} ${closed.count === 1 ? 'company has' : 'companies have'} completed and moved into value creation${closed.capitalKnown ? ` carrying ${money(closed.capital)}` : ''}` : ''}.`,
          'Deal list',
        );
        if (openObligations) {
          c.add(`${openObligations} completed deal${openObligations === 1 ? '' : 's'} still carr${openObligations === 1 ? 'ies' : 'y'} conditions attached at approval — the ones most likely to be asked about in an LP update.`, 'IC readiness board — post-committee obligations');
        }
        return true;
      }
      if (seat.kind === 'value') {
        // An operating partner's job starts at close. Opening them on the whole book's
        // enterprise value — which is mostly deals that may never complete — put the
        // one number they cannot act on at the top of their page, while their own tiles
        // below counted owned companies.
        const owned = phases.find((p) => p.key === 'value');
        // "Closing soon" must mean ONE thing on this page. The tile counts the
        // execution phase — signed, not yet closed — so the sentence counts the same
        // deals rather than inventing a second definition (approved with a date inside
        // 30 days) that produced 1 next to a tile reading 3.
        const soonClosing = phases.find((p) => p.key === 'execution')?.count || 0;
        c.add(
          owned && owned.count
            ? `You own ${owned.count} ${owned.count === 1 ? 'company' : 'companies'} post-close${owned.capitalKnown ? ` carrying ${money(owned.capital)}` : ''}${soonClosing ? `, with ${soonClosing} more signed and about to become yours` : ''}.`
            : `No company in your view has completed yet${soonClosing ? `, though ${soonClosing} ${soonClosing === 1 ? 'is' : 'are'} signed and about to close` : ''}.`,
          'Deal list — post-close portfolio',
        );
        if (openObligations) {
          c.add(`${openObligations} deal${openObligations === 1 ? '' : 's'} past IC still carr${openObligations === 1 ? 'ies' : 'y'} a condition attached at approval, which lands on the value-creation plan before anything else does.`, 'IC readiness board — post-committee obligations');
        }
        return true;
      }
      return false;
    };
    const openedWithJob = jobOpener();

    c.add(
        // The same rule as the tile: with every size withheld, the sentence says so
        // rather than reporting the fund as carrying nothing.
        capitalUnknown
          ? `You have ${list.length} deal${list.length === 1 ? '' : 's'} in view across ${sectorWord}, screening to exit. Deal sizes are not shown at your access level — ask the deal team if you need them.`
          : openedWithJob
            ? `Across everything you can see, screening to exit: ${list.length} deal${list.length === 1 ? '' : 's'} carrying ${money(capital)} of enterprise value in ${sectorWord}${capitalWithheld ? `, with ${capitalWithheld} more shown to you as status only` : ''}. The Report page counts pipeline value, which leaves out the companies you already own.`
            : `You have ${list.length} deal${list.length === 1 ? '' : 's'} in view, screening to exit, carrying ${money(capital)} of enterprise value across ${sectorWord}${capitalWithheld ? `, with ${capitalWithheld} shown to you as status only` : ''}.`,
      'Deal list',
    );

    if (seat.kind === 'screening') {
      const orig = phases.find((p) => p.key === 'origination');
      c.add(
        orig
          ? `${orig.count} of them ${orig.count === 1 ? 'is' : 'are'} still in origination and screening, which is where your work starts.`
          : 'Nothing is sitting in origination — every deal you can see has already been launched into diligence.',
        'Deal record — current step',
      );
    }
    if (seat.kind === 'value') {
      const val = phases.find((p) => p.key === 'value');
      c.add(
        val
          ? `${val.count} ${val.count === 1 ? 'company is' : 'companies are'} owned and in the value phase${val.capitalKnown ? `, carrying ${money(val.capital)}` : ''}.`
          : 'Nothing has reached the value phase yet, so the value-creation plan is still forward-looking on every deal here.',
        'Deal record — current step',
      );
    }

    const urgent = attention.filter((a) => a.tone === 'bad');
    if (urgent.length) {
      // This said "3 deals need attention" directly above a panel headed "13 deals",
      // which reads as the product disagreeing with itself. They are different facts —
      // at risk of slipping is a subset of what is queued — so say both numbers in one
      // sentence and the reader can see they are not in conflict.
      c.add(
        `${urgent.length} of the ${attention.length} deals on your attention list ${urgent.length === 1 ? 'is at risk of slipping its IC date' : 'are at risk of slipping their IC dates'}. ${urgent[0].company} is the closest.${urgent[0] === attention[0] ? ' It heads the list below.' : ` It is ${attention.indexOf(urgent[0]) + 1}${['th','st','nd','rd'][(attention.indexOf(urgent[0]) + 1) % 10] || 'th'} on the list below, behind ${attention[0].company}.`}`,
        urgent[0].basis,
      );
    } else if (attention.length) {
      c.add(
        `Nothing is in danger of slipping. The most worth watching is ${attention[0].company}, at the top of the list below.`,
        attention[0].basis,
      );
    } else {
      // "There is nothing competing for your attention today" was being said to a seat
      // holding six masked rows, three of which had a committee inside the fortnight. The
      // dates were not absent, they were redacted — and absent had been rendered as fine.
      // A reassurance may only ever be built out of what the reader can actually see.
      c.add(
        restricted
          ? `Nothing on the deals you can see in full needs attention today. ${restricted} ${restricted === 1 ? 'deal shows' : 'deals show'} status only — ask the deal team if you need ${restricted === 1 ? 'its date' : 'their dates'}.`
          : 'Every deal in view is either on track or past the readiness bar. There is nothing competing for your attention today.',
        'IC readiness board',
      );
    }

    // The committee seat's opener already leads with the date and the ready/not-ready
    // split, so these would restate it two paragraphs later in different words.
    if (nearest && seat.kind !== 'committee') {
      c.add(
        `The next IC is in ${nearest.daysToIC} day${nearest.daysToIC === 1 ? '' : 's'}, for ${nearest.company}.`,
        'Deal record — target IC date',
      );
    }

    if (icReady && seat.kind !== 'committee') {
      c.add(`${icReady} deal${icReady === 1 ? ' is' : 's are'} ready for IC — papers on record, no blocking workstreams, no unresolved risk findings.`, 'IC readiness board');
    }
    if (openObligations && !openedWithJob) {
      // The seats that open with their own job sentence (committee, IR) already say
      // this above; repeating it here would read as two different findings.
      c.add(`${openObligations} deal${openObligations === 1 ? '' : 's'} already through IC still carr${openObligations === 1 ? 'ies' : 'y'} conditions that were attached at approval.`, 'IC readiness board — post-committee obligations');
    }
  }

  if (workiq.total) {
    c.add(
      workiq.yours
        ? `${workiq.total} follow-up${workiq.total === 1 ? '' : 's'} raised in the deal channels ${workiq.total === 1 ? 'has' : 'have'} no matching task here — ${workiq.yours} of them yours.`
        : `${workiq.total} follow-up${workiq.total === 1 ? '' : 's'} raised in the deal channels across ${workiq.deals} deal${workiq.deals === 1 ? '' : 's'} ${workiq.total === 1 ? 'has' : 'have'} no matching task here. The channels are composed from the deal record; no Microsoft 365 mailbox is connected yet.`,
      'Deal channels, composed from the deal record until Microsoft 365 is connected',
    );
  }

  // ---- the tiles -----------------------------------------------------------
  // A workstream lead leads with their lane; a committee seat leads with the gate; a
  // sourcing seat leads with what is early. Every tile is a count over the deals this
  // caller can see, so no tile can describe a deal they cannot open.
  const portfolioKpis = [
    { key: 'deals', label: 'Deals in view', value: String(list.length), sub: `${diligenceCount} in diligence` },
    { key: 'capital', label: 'Enterprise value', value: capitalUnknown ? 'Not shown' : money(capital), sub: capitalUnknown ? 'Withheld at your access level' : (priced.length ? `avg ${money(capital / priced.length)} · ${sectorWord}${capitalWithheld ? ` · ${capitalWithheld} withheld` : ''}` : '—') },
    { key: 'readiness', label: 'Not IC-ready', value: String(notReady), sub: `${icReady} ready for IC · ${openObligations} with conditions open` },
    { key: 'ic', label: 'Next IC', value: nearest ? `${nearest.daysToIC}d` : '—', sub: nearest ? nearest.company : noIcSub },
  ];
  let kpis = portfolioKpis;
  if (seat.kind === 'observer') {
    // An observer cannot see the workstreams the verdict is computed from, so every
    // deal came back "not not-ready" and the tile rendered a confident 0 — telling
    // someone nothing is late, directly above prose admitting we cannot tell. A tile is
    // a claim; this seat is only entitled to make claims about status and dates.
    kpis = [
      portfolioKpis[0], portfolioKpis[1],
      { key: 'near', label: 'IC within 14 days', value: restricted ? `${observerNearCommittee} of ${list.length - restricted}` : String(observerNearCommittee), sub: observerNearCommittee && nearest ? `soonest: ${nearest.company}, in ${nearest.daysToIC} day${nearest.daysToIC === 1 ? '' : 's'}` : (restricted ? `${restricted} ${restricted === 1 ? 'deal does' : 'deals do'} not show dates at your access level` : 'none in the next two weeks') },
      // The tile immediately above says "9 deals do not show dates at your access level".
      // This one then reported "0 — none overdue", which is a claim about exactly those
      // withheld dates, one inch away. Counting zero out of nothing and rendering it as
      // reassurance is the same fault as summing redacted deal sizes to $0: an unknown
      // presented as a finding. Where every date is withheld there is nothing to count.
      { key: 'passed', label: 'Past target IC date',
        value: restricted >= list.length ? 'Not shown' : String(observerOverdue),
        sub: restricted >= list.length
          ? 'Dates are withheld at your access level'
          : observerOverdue
            ? 'still shown as pre-IC'
            : restricted
              ? `none overdue among the ${list.length - restricted} that show dates`
              : 'none overdue' },
    ];
  } else if (isLaneSeat) {
    const lane = laneName(seat.laneLabels);
    // Ordered by what somebody will be asked about, not by what is easy to count.
    // "Lanes open" was the old headline: a denominator, inflated by counting completed
    // lanes, and a number nobody has ever behaved differently because of. What this
    // person is chased about is which committees they are holding up.
    kpis = [
      { key: 'lane-blocking', label: 'Blocking IC', value: String(laneBlocking), sub: laneBlocking ? `${lane} still open` : 'not blocking anything' },
      { key: 'lane-due', label: 'Needed before the next IC', value: String(laneDueBeforeIC), sub: laneNextIC ? `soonest: ${laneNextIC.company}, IC in ${laneNextIC.daysToIC} days` : 'none inside three weeks' },
      { key: 'lane-idle', label: 'Not started', value: String(laneNotStarted), sub: laneSplit.length ? `at least one of yours untouched — ${laneSplit.map((s) => `${s.label} on ${s.notStarted}`).join(', ')}` : (laneNotStarted ? 'no work recorded yet' : 'every workstream has opened') },
      { key: 'lane-open', label: `Deals with your ${seat.laneLabels.length > 1 ? 'workstreams' : 'workstream'} open`, value: String(laneOpen), sub: laneSplit.length ? `${laneSplit.map((s) => `${s.label} on ${s.open}`).join(', ')} — counted once per deal` : `${laneDone} complete · of ${laneRows.length} carrying it` },
    ];
  } else if (seat.kind === 'committee') {
    kpis = [
      { key: 'ready', label: 'Ready for IC', value: String(icReady), sub: 'papers on record, nothing blocking' },
      { key: 'notready', label: 'Not IC-ready', value: String(notReady), sub: `of ${diligenceCount} in diligence` },
      // Labelled for what it is. "Conditional" reads to a chair as a gate outcome —
      // approved subject to conditions — and every deal in this bucket is already
      // through committee. Six signed companies with an open obligation is a different
      // management problem from a live deal awaiting approval.
      { key: 'obligations', label: 'Deals with conditions open', value: String(openObligations), sub: `${openConditionCount} condition${openConditionCount === 1 ? '' : 's'} or compliance check${openConditionCount === 1 ? '' : 's'} not yet cleared` },
      { key: 'ic', label: 'Next IC', value: nearest ? `${nearest.daysToIC}d` : '—', sub: nearest ? nearest.company : noIcSub },
    ];
  } else if (seat.kind === 'deal-lead') {
    const soon = list.filter((d) => typeof d.daysToIC === 'number' && d.daysToIC >= 0 && d.daysToIC <= 21 && awaitingCommittee(d)).length;
    kpis = [
      { key: 'to-gate', label: 'IC within 3 weeks', value: String(soon), sub: nearest ? `soonest ${nearest.company}, ${nearest.daysToIC}d` : noIcSub },
      { key: 'notready', label: 'Not yet ready for IC', value: String(notReady), sub: `${icReady} ready for IC` },
      { key: 'commitments', label: 'Untracked follow-ups', value: String(workiq.total), sub: workiq.total ? `across ${workiq.deals} deal${workiq.deals === 1 ? '' : 's'}` : 'nothing outstanding' },
      { key: 'deals', label: 'Deals in view', value: String(list.length), sub: `${sectorWord}` },
    ];
  } else if (seat.kind === 'lp') {
    const val = phases.find((p) => p.key === 'value');
    kpis = [
      { key: 'capital', label: 'Enterprise value', value: capitalUnknown ? 'Not shown' : money(capital), sub: capitalUnknown ? 'Withheld at your access level' : `${priced.length} deal${priced.length === 1 ? '' : 's'} · ${sectorWord}${capitalWithheld ? ` · ${capitalWithheld} withheld` : ''}` },
      { key: 'owned', label: 'Completed', value: String(val?.count || 0), sub: val ? `${money(val.capital)} now in value creation` : 'none completed yet' },
      { key: 'obligations', label: 'Deals with conditions open', value: String(openObligations), sub: `${openConditionCount} outstanding on signed or completed deals` },
      { key: 'ic', label: 'Next IC', value: nearest ? `${nearest.daysToIC}d` : '—', sub: nearest ? nearest.company : noIcSub },
    ];
  } else if (seat.kind === 'screening') {
    const orig = phases.find((p) => p.key === 'origination')?.count || 0;
    const dil = phases.find((p) => p.key === 'diligence')?.count || 0;
    kpis = [
      { key: 'origination', label: 'In origination', value: String(orig), sub: 'screened, not yet launched' },
      { key: 'diligence', label: 'In diligence', value: String(dil), sub: 'live workstreams' },
      { key: 'deals', label: 'Deals in view', value: String(list.length), sub: `${sectorWord}` },
      { key: 'ic', label: 'Next IC', value: nearest ? `${nearest.daysToIC}d` : '—', sub: nearest ? nearest.company : noIcSub },
    ];
  } else if (seat.kind === 'value') {
    const val = phases.find((p) => p.key === 'value');
    const exe = phases.find((p) => p.key === 'execution');
    kpis = [
      { key: 'owned', label: 'Owned companies', value: String(val?.count || 0), sub: val ? `${money(val.capital)} of enterprise value` : 'none in the value phase' },
      { key: 'closing', label: 'Closing soon', value: String(exe?.count || 0), sub: 'about to become yours' },
      { key: 'obligations', label: 'Deals with conditions open', value: String(openObligations), sub: `${openConditionCount} carried past IC` },
      { key: 'deals', label: 'Deals in view', value: String(list.length), sub: `${sectorWord}` },
    ];
  }

  // ---- what to ask next ----------------------------------------------------
  // Phrased for the seat. A generic "which deals should I prioritise today?" is a
  // question anyone could ask; "which deals is my lane holding up?" is one only this
  // person would.
  const suggestions = [];
  // The queue is ordered by committee date, so its first row is often a deal that is
  // completely ready and simply next in the diary. Asking "Why is Atlas not ready?" two
  // inches under "#1 Ready - take it to IC - 100% IC-ready" makes the product look like
  // it has not read its own screen. Pick a deal the question actually fits.
  const notReadyDeal = attention.find((a) => (a.readiness ?? 100) < 80) || null;
  const atRiskDeal = attention.find((a) => a.tone === 'bad') || null;
  if (isLaneSeat) {
    const lane = laneName(seat.laneLabels);
    if (attention[0]) suggestions.push(`What is outstanding in my ${lane} workstream on ${attention[0].company}?`);
    suggestions.push(`Which deals is my ${lane} workstream holding up?`);
    if (laneNextIC) suggestions.push(`What does ${laneNextIC.company} need from me before IC?`);
    suggestions.push(`Summarise my ${lane} findings across every deal`);
  } else if (seat.kind === 'committee') {
    if (icReady) suggestions.push('What is ready for the next IC?');
    // A suggested question the product then asks you to clarify is a dead end. Offered
    // from the home page with no deal in focus, this came back as "Which deal do you
    // mean (company name or deal id)?" after nearly seven seconds. Ask across the book,
    // which is answerable from the summaries the assistant already holds.
    if (openObligations) suggestions.push(`Which of my ${openObligations === 1 ? 'deals has' : 'deals have'} IC conditions still open, and who owns them?`);
    if (notReadyDeal) suggestions.push(`Why is ${notReadyDeal.company} not ready?`);
    suggestions.push('What changed across my deals this week?');
  } else if (seat.kind === 'deal-lead') {
    if (nearest) suggestions.push(`What is still missing for ${nearest.company}'s IC papers?`);
    suggestions.push('Which workstreams are blocking my deals, and who owns them?');
    if (workiq.total) suggestions.push('Show me follow-ups raised in my deal channels with no task against them');
    suggestions.push('What changed across my deals this week?');
  } else if (seat.kind === 'value') {
    const ownedP = phases.find((p) => p.key === 'value');
    if (ownedP && ownedP.count) suggestions.push('What is on the value-creation plan for the companies I own?');
    if (openObligations) suggestions.push('Which approval conditions land on me post-close?');
    suggestions.push('Which deals close soonest, and what should the 100-day plan cover?');
    suggestions.push('What changed across my deals this week?');
  } else if (seat.kind === 'lp') {
    suggestions.push('Summarise portfolio performance for an LP update');
    if (openObligations) suggestions.push('Which completed deals still have conditions outstanding?');
    suggestions.push('What is our exposure by sector and region?');
    suggestions.push('What completed since the last quarter?');
  } else if (seat.kind === 'screening') {
    if (attention[0]) suggestions.push(`What do we know about ${attention[0].company} so far?`);
    suggestions.push('Which origination targets are ready to launch into diligence?');
    suggestions.push('What changed across my deals this week?');
  } else {
    if (atRiskDeal) suggestions.push(`Why is ${atRiskDeal.company} at risk?`);
    suggestions.push('What changed across my deals this week?');
    if (nearest) suggestions.push(`What is still missing for ${nearest.company}'s IC?`);
    suggestions.push('Which deals should I prioritise today?');
  }
  if (workiq.total) suggestions.push('Show me untracked follow-ups across all deals');

  return {
    generatedAt: new Date().toISOString(),
    roleLabel: roleLabel || null,
    // The access tier and the job are two different facts. The header used to print the
    // tier, so the investor-relations seat wore "Partner / Deal Sponsor".
    seatLabel: seatLabel || roleLabel || null,
    role: role || null,
    // The seat is returned so the page can say whose desk it is, and admit when it
    // could not work that out, instead of printing "weighted for Deal Team" over a
    // queue that was not weighted for anything.
    seat: {
      personaId: seat.personaId,
      label: seat.label,
      focus: seat.focus,
      kind: seat.kind,
      lanes: seat.lanes,
      laneLabels: seat.laneLabels,
      tailored: !seat.unbound,
    },
    briefing: { ...c.result(), suggestions: suggestions.slice(0, 5) },
    attention,
    // WHY the queue is empty, decided here rather than guessed in the page.
    //
    // An empty queue has three quite different meanings and the page cannot tell them
    // apart from the array alone. It previously assumed the happy one and printed
    // "every deal you can see is on track" to an observer holding sixteen deals, four
    // of which were not IC-ready — the reader's own tiles contradicted the sentence.
    // An empty result is not the same as a clean result.
    attentionOmitted,
    attentionQuiet,
    attentionQuietNote,
    // Rows the reader can see exist but not open. Published so no surface has to infer
    // "nothing to worry about" from a list it cannot fully read.
    restricted,
    attentionEmpty: attention.length ? null
      : !list.length ? 'There are no deals in your view yet.'
      : seat.kind === 'observer'
        // Not "ask an administrator for deal-team access". Access to a live deal comes
        // from the deal lead or the sponsor, and in a firm with information barriers it
        // is a wall-crossing that goes through compliance and gets logged — nobody rings
        // IT for diligence content. An observer seat is also frequently the CORRECT
        // seat: a junior, an LP-side observer, someone conflicted off a deal. The page
        // should not be advising them to escalate their own permissions.
        ? `Your access shows deal status, not the workstreams underneath, so there is nothing here to rank. On what you can see: ${observerNearCommittee} IC meeting${observerNearCommittee === 1 ? '' : 's'} inside 14 days and ${observerOverdue} target date${observerOverdue === 1 ? '' : 's'} already passed. Diligence detail is granted by the deal lead.`
        : isLaneSeat && !laneOpen
          ? `No deal in your view has an open ${seat.laneLabels.join(' or ').toLowerCase()} workstream.`
          : ranked.length === 0 && list.length
            ? 'The deals in your view have no workstream records yet, so there is nothing to rank.'
            : 'Nothing is flagged right now — every deal in your view is on track or IC-ready.',
    phases,
    workiq,
    kpis,
    counts: { deals: list.length, attention: attention.length, notReady, conditional, openObligations, icReady, commitments: workiq.total, laneOpen, laneNotStarted, laneBlocking, laneDueBeforeIC },
  };
}
