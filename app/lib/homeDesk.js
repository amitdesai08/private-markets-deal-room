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
function assess(deal, raw) {
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
      impact: null,
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
    return { rank: 9, tag: 'In origination', tone: 'muted', why: 'Screened, not yet launched into diligence.', impact: null, basis: 'Deal record — current step', verdict: null, gating: [] };
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
      verdict: state, gating,
    };
  }
  if (pre && typeof icDays === 'number' && icDays <= 21 && state === 'NOT-READY') {
    return {
      rank: 1, tag: 'Not IC-ready', tone: 'bad',
      why: `IC is ${icDays} day${icDays === 1 ? '' : 's'} out and the deal is not ready — ${gating.join('; ')}.`,
      impact: 'Open conditions become IC conditions, which is the slowest way to close them.',
      basis: 'IC readiness board',
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
      tag: post ? (n ? 'Post-gate obligation' : 'Record incomplete') : 'Conditional', tone: 'warn',
      // Not "approved at committee" — nothing on the record is a committee decision. The
      // stage is where the deal sits, which is all this can honestly claim.
      why: post
        ? `Past IC — ${parts.join(' and ')}: ${gating.join('; ')}.`
        : `Ready for IC, subject to ${n} condition${n === 1 ? '' : 's'} still to close.`,
      impact: post
        ? (n ? 'An unclosed obligation holds completion, and every one of them has an owner waiting on someone else.'
             : 'Nothing is outstanding on this deal; the diligence record behind it was simply never written up.')
        : 'Conditions left open at the meeting come back as post-completion obligations.',
      basis: post ? 'Deal record — open conditions and uncleared compliance checks' : 'IC readiness board — committee conditions',
      verdict: state, gating,
    };
  }
  if (state === 'NOT-READY') {
    return {
      rank: 4, tag: 'Not IC-ready', tone: 'warn',
      why: `Not ready for IC — ${gating.join('; ')}.`,
      impact: 'Each of these has to close before the deal can go to IC.',
      basis: 'IC readiness board',
      verdict: state, gating,
    };
  }
  if (state === 'READY') {
    if (phase === 'post-committee') {
      return { rank: 8, tag: 'In execution', tone: 'good', why: 'Past IC with nothing outstanding on the record.', impact: null, basis: 'Deal record — open conditions and compliance checks', verdict: state, gating };
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
      : { rank: 8, tag: 'IC-ready', tone: 'good', why: 'Papers on record, no blocking workstreams, no unresolved risk findings.', impact: null, basis: 'IC readiness board', verdict: state, gating };
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
        impact: 'A workstream that has never been opened holds IC on its own, whatever the rest of the deal looks like.',
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
        why: `${high.length} high-severity finding${high.length === 1 ? '' : 's'} in your ${label} workstream ${high.length === 1 ? 'is' : 'are'} still open — ${high.slice(0, 2).map((i) => String(i.title || '').replace(/\s*\.\s*$/, '')).join('; ')}.`,
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
      return { ...base, short: `complete with ${findings} finding${findings === 1 ? '' : 's'}`, rank: 8, tag: `${label} complete`, tone: 'good', why: `Your ${label} workstream is complete with ${findings} finding${findings === 1 ? '' : 's'} on the record.`, impact: null, verdict: bundle?.verdict?.state || null, gating: [] };
    }
    return { ...base, short: `${progress}% complete`, rank: 7, tag: `${label} ${progress}%`, tone: 'good', why: `Your ${label} workstream is ${progress}% complete with ${findings} finding${findings === 1 ? '' : 's'} recorded.`, impact: null, verdict: bundle?.verdict?.state || null, gating: [] };
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
    const found = detectCommitments(corpus.channel?.messages || [], { source: 'Teams' });
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
  return {
    total: out.length,
    deals: new Set(out.map((c) => c.dealId)).size,
    yours: mine.size ? out.filter(isMine).length : 0,
    items: out.slice(0, limit).map((c) => ({ ...c, yours: isMine(c) })),
  };
}

// ---------------------------------------------------------------------------
// `rawFor` resolves a list summary back to its full deal record, which the Work IQ
// corpus needs (workstream leads and sponsors are stripped from summaries). It defaults to
// the identity function so the builder stays testable with plain objects.
export function buildHomeDesk(deals = [], { role = null, roleLabel = null, persona = null, rawFor = (d) => d } = {}) {
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


  const attention = ranked
    .filter((r) => r.a.rank <= 5)
    .slice(0, 6)
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
      placedBy: (() => {
        const d = typeof r.deal.daysToIC === 'number' && r.deal.daysToIC >= 0 ? r.deal.daysToIC : null;
        if (d === null) return `${r.a.tag} · no IC date set`;
        return `${r.a.tag} · IC in ${d} day${d === 1 ? '' : 's'}`;
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
      icInDays: typeof r.deal.daysToIC === 'number' ? r.deal.daysToIC : null,
    }));

  // Headline numbers, all derived from the deals THIS caller can see so the
  // narrative and the tiles can never disagree.
  const capital = list.reduce((s, d) => s + num(d.dealSize), 0) * 1e6;
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
    return { key: p.key, label: p.label, count: ds.length, capital: ds.reduce((s, d) => s + num(d.dealSize), 0) * 1e6 };
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
  const observerNearCommittee = list.filter((d) => awaitingCommittee(d) && typeof d.daysToIC === 'number' && d.daysToIC >= 0 && d.daysToIC <= 14).length;
  const observerOverdue = list.filter((d) => awaitingCommittee(d) && typeof d.daysToIC === 'number' && d.daysToIC < 0).length;

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
        c.add(`Start with ${worst.company} — ${worst.why.charAt(0).toLowerCase()}${worst.why.slice(1)}`, worst.basis);
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
    c.add(`Across everything you can see: ${list.length} deal${list.length === 1 ? '' : 's'} carrying ${money(capital)} of enterprise value, ${notReady} not yet IC-ready.`, 'Deal list');
  } else {
    if (seat.kind === 'oversight') {
      c.add(`You are seeing the administrator's view — every deal in the fund, ranked by urgency rather than filtered to one role.`, 'Access model — administrator');
    } else if (seat.kind === 'observer') {
      c.add('You have observer access, so this page shows where each deal stands, not the diligence detail behind it.', 'Access model — observer');
    } else if (seat.unbound) {
      // Say it, rather than let a generic page pass for a tailored one.
      c.add('No specialist role is assigned to you yet, so this is the general portfolio view rather than one built around your own work. Ask an administrator to add you to the workstreams you own.', 'Access model — no specialist role');
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
          c.add(`Not ready for the next IC: ${blockers.map((b) => `${b.company} (${(b.gating || [])[0]})`).join(', ')}.`, 'IC readiness board — blocking workstreams');
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
          c.add(`${workiq.total} follow-up${workiq.total === 1 ? '' : 's'} raised in the deal channels ${workiq.total === 1 ? 'has' : 'have'} no matching task here — those land on you before they land on anyone else.`, 'Teams channels on the deals');
        }
        return true;
      }
      if (seat.kind === 'lp') {
        // Investor relations answers to LPs, so the frame is committed capital and what
        // has completed, not which diligence lane is late.
        const closed = phases.find((p) => p.key === 'value');
        c.add(
          `Across the book you can see, ${money(capital)} of enterprise value in ${list.length} deal${list.length === 1 ? '' : 's'}${closed ? `, of which ${closed.count} ${closed.count === 1 ? 'company has' : 'companies have'} completed and moved into value creation carrying ${money(closed.capital)}` : ''}.`,
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
            ? `You own ${owned.count} ${owned.count === 1 ? 'company' : 'companies'} post-close carrying ${money(owned.capital)}${soonClosing ? `, with ${soonClosing} more signed and about to become yours` : ''}.`
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
      openedWithJob
        ? `Across everything you can see: ${list.length} deal${list.length === 1 ? '' : 's'} carrying ${money(capital)} of enterprise value in ${sectors || 1} sector${sectors === 1 ? '' : 's'}.`
        : `You have ${list.length} deal${list.length === 1 ? '' : 's'} in view carrying ${money(capital)} of enterprise value across ${sectors || 1} sector${sectors === 1 ? '' : 's'}.`,
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
          ? `${val.count} ${val.count === 1 ? 'company is' : 'companies are'} owned and in the value phase, carrying ${money(val.capital)}.`
          : 'Nothing has reached the value phase yet, so the value-creation plan is still forward-looking on every deal here.',
        'Deal record — current step',
      );
    }

    const urgent = attention.filter((a) => a.tone === 'bad');
    if (urgent.length) {
      c.add(
        `${urgent.length === 1 ? 'One deal needs' : `${urgent.length} deals need`} attention before ${urgent.length === 1 ? 'it slips its IC date' : 'they slip their IC dates'} — starting with ${urgent[0].company}: ${urgent[0].why}`,
        urgent[0].basis,
      );
    } else if (attention.length) {
      c.add(
        `Nothing is in danger of slipping. The most worth watching is ${attention[0].company} — ${attention[0].why}`,
        attention[0].basis,
      );
    } else {
      c.add('Every deal in view is either on track or past the readiness bar. There is nothing competing for your attention today.', 'IC readiness board');
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
        : `${workiq.total} follow-up${workiq.total === 1 ? '' : 's'} raised in the deal channels across ${workiq.deals} deal${workiq.deals === 1 ? '' : 's'} ${workiq.total === 1 ? 'has' : 'have'} no matching task here.`,
      'Teams channels on the deals',
    );
  }

  // ---- the tiles -----------------------------------------------------------
  // A workstream lead leads with their lane; a committee seat leads with the gate; a
  // sourcing seat leads with what is early. Every tile is a count over the deals this
  // caller can see, so no tile can describe a deal they cannot open.
  const portfolioKpis = [
    { key: 'deals', label: 'Deals in view', value: String(list.length), sub: `${diligenceCount} in diligence` },
    { key: 'capital', label: 'Enterprise value', value: money(capital), sub: list.length ? `avg ${money(capital / list.length)} · ${sectors || 1} sector${sectors === 1 ? '' : 's'}` : '—' },
    { key: 'readiness', label: 'Not IC-ready', value: String(notReady), sub: `${icReady} ready for IC · ${openObligations} with conditions open` },
    { key: 'ic', label: 'Next IC', value: nearest ? `${nearest.daysToIC}d` : '—', sub: nearest ? nearest.company : 'none scheduled' },
  ];
  let kpis = portfolioKpis;
  if (seat.kind === 'observer') {
    // An observer cannot see the workstreams the verdict is computed from, so every
    // deal came back "not not-ready" and the tile rendered a confident 0 — telling
    // someone nothing is late, directly above prose admitting we cannot tell. A tile is
    // a claim; this seat is only entitled to make claims about status and dates.
    kpis = [
      portfolioKpis[0], portfolioKpis[1],
      { key: 'near', label: 'IC within 14 days', value: String(observerNearCommittee), sub: observerNearCommittee && nearest ? `soonest: ${nearest.company}, in ${nearest.daysToIC} day${nearest.daysToIC === 1 ? '' : 's'}` : 'none in the next two weeks' },
      { key: 'passed', label: 'Past target IC date', value: String(observerOverdue), sub: observerOverdue ? 'still shown as pre-IC' : 'none overdue' },
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
      { key: 'ic', label: 'Next IC', value: nearest ? `${nearest.daysToIC}d` : '—', sub: nearest ? nearest.company : 'none scheduled' },
    ];
  } else if (seat.kind === 'deal-lead') {
    const soon = list.filter((d) => typeof d.daysToIC === 'number' && d.daysToIC >= 0 && d.daysToIC <= 21 && awaitingCommittee(d)).length;
    kpis = [
      { key: 'to-gate', label: 'IC within 3 weeks', value: String(soon), sub: nearest ? `soonest ${nearest.company}, ${nearest.daysToIC}d` : 'none scheduled' },
      { key: 'notready', label: 'Not yet ready for IC', value: String(notReady), sub: `${icReady} ready for IC` },
      { key: 'commitments', label: 'Untracked follow-ups', value: String(workiq.total), sub: workiq.total ? `across ${workiq.deals} deal${workiq.deals === 1 ? '' : 's'}` : 'nothing outstanding' },
      { key: 'deals', label: 'Deals in view', value: String(list.length), sub: `${sectors || 1} sector${sectors === 1 ? '' : 's'}` },
    ];
  } else if (seat.kind === 'lp') {
    const val = phases.find((p) => p.key === 'value');
    kpis = [
      { key: 'capital', label: 'Enterprise value', value: money(capital), sub: `${list.length} deal${list.length === 1 ? '' : 's'} · ${sectors || 1} sector${sectors === 1 ? '' : 's'}` },
      { key: 'owned', label: 'Completed', value: String(val?.count || 0), sub: val ? `${money(val.capital)} now in value creation` : 'none completed yet' },
      { key: 'obligations', label: 'Deals with conditions open', value: String(openObligations), sub: `${openConditionCount} outstanding on signed or completed deals` },
      { key: 'ic', label: 'Next IC', value: nearest ? `${nearest.daysToIC}d` : '—', sub: nearest ? nearest.company : 'none scheduled' },
    ];
  } else if (seat.kind === 'screening') {
    const orig = phases.find((p) => p.key === 'origination')?.count || 0;
    const dil = phases.find((p) => p.key === 'diligence')?.count || 0;
    kpis = [
      { key: 'origination', label: 'In origination', value: String(orig), sub: 'screened, not yet launched' },
      { key: 'diligence', label: 'In diligence', value: String(dil), sub: 'live workstreams' },
      { key: 'deals', label: 'Deals in view', value: String(list.length), sub: `${sectors || 1} sector${sectors === 1 ? '' : 's'}` },
      { key: 'ic', label: 'Next IC', value: nearest ? `${nearest.daysToIC}d` : '—', sub: nearest ? nearest.company : 'none scheduled' },
    ];
  } else if (seat.kind === 'value') {
    const val = phases.find((p) => p.key === 'value');
    const exe = phases.find((p) => p.key === 'execution');
    kpis = [
      { key: 'owned', label: 'Owned companies', value: String(val?.count || 0), sub: val ? `${money(val.capital)} of enterprise value` : 'none in the value phase' },
      { key: 'closing', label: 'Closing soon', value: String(exe?.count || 0), sub: 'about to become yours' },
      { key: 'obligations', label: 'Deals with conditions open', value: String(openObligations), sub: `${openConditionCount} carried past IC` },
      { key: 'deals', label: 'Deals in view', value: String(list.length), sub: `${sectors || 1} sector${sectors === 1 ? '' : 's'}` },
    ];
  }

  // ---- what to ask next ----------------------------------------------------
  // Phrased for the seat. A generic "which deals should I prioritise today?" is a
  // question anyone could ask; "which deals is my lane holding up?" is one only this
  // person would.
  const suggestions = [];
  if (isLaneSeat) {
    const lane = laneName(seat.laneLabels);
    if (attention[0]) suggestions.push(`What is outstanding in my ${lane} workstream on ${attention[0].company}?`);
    suggestions.push(`Which deals is my ${lane} workstream holding up?`);
    if (laneNextIC) suggestions.push(`What does ${laneNextIC.company} need from me before IC?`);
    suggestions.push(`Summarise my ${lane} findings across every deal`);
  } else if (seat.kind === 'committee') {
    if (icReady) suggestions.push('What is ready for the next IC?');
    if (openObligations) suggestions.push('Which IC conditions are still open, and who owns them?');
    if (attention[0]) suggestions.push(`Why is ${attention[0].company} not ready?`);
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
    if (attention[0]) suggestions.push(`Why is ${attention[0].company} at risk?`);
    suggestions.push('What changed across my deals this week?');
    if (nearest) suggestions.push(`What is still missing for ${nearest.company}'s IC?`);
    suggestions.push('Which deals should I prioritise today?');
  }
  if (workiq.total) suggestions.push('Show me untracked follow-ups across all deals');

  return {
    generatedAt: new Date().toISOString(),
    roleLabel: roleLabel || null,
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
