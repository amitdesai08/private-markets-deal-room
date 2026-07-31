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

import { corpusForDeal } from './workiqCorpus.js';
import { detectCommitments } from './dealDesk.js';
import { icPending, daysUntil } from './cockpit.js';
import { computeICReadiness, dealPhase } from './icReadiness.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

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
  const pre = icPending(deal);
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
      why: `The target committee date passed ${Math.abs(icDays)} days ago and the deal has not reached committee.`,
      impact: 'Either the date moves with a written reason, or the gap becomes the story at IC.',
      basis: 'Deal record — target IC date vs current step',
      verdict: state, gating,
    };
  }
  if (pre && typeof icDays === 'number' && icDays <= 21 && state === 'NOT-READY') {
    return {
      rank: 1, tag: 'Not IC-ready', tone: 'bad',
      why: `IC is ${icDays} day${icDays === 1 ? '' : 's'} out and the deal is not ready — ${gating.join('; ')}.`,
      impact: 'Open gates become IC conditions, which is the slowest way to close them.',
      basis: 'IC readiness board',
      verdict: state, gating,
    };
  }
  const lanes = raw.workstreams || deal.workstreams || [];
  const idle = lanes.filter((w) => (w.progress ?? 0) === 0);
  if (idle.length && idle.length === lanes.length && lanes.length) {
    return {
      rank: 2, tag: 'Not started', tone: 'warn',
      why: `None of the ${lanes.length} diligence lane${lanes.length === 1 ? ' has' : 's have'} recorded progress.`,
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
    // Count the OBLIGATIONS, not just the `conditions` array. Post-committee, an
    // uncleared compliance check is an obligation exactly as much as a condition is, and
    // counting only the array produced "with 0 conditions still to close" on a deal that
    // had two uncleared regulatory checks.
    const n = post ? (gating.length || v.openConditions) : v.openConditions;
    return {
      rank: 3, tag: 'Conditional', tone: 'warn',
      // Not "approved at committee" — nothing on the record is a committee decision. The
      // stage is where the deal sits, which is all this can honestly claim.
      why: post
        ? `Past the committee gate, with ${n} obligation${n === 1 ? '' : 's'} still outstanding — ${gating.join('; ')}.`
        : `Ready to table, subject to ${n} condition${n === 1 ? '' : 's'} still to close.`,
      impact: post ? 'An unclosed obligation holds completion, and every one of them has an owner waiting on someone else.' : 'Conditions left open at the meeting come back as post-completion obligations.',
      basis: post ? 'Deal record — open conditions and uncleared compliance checks' : 'IC readiness board — committee conditions',
      verdict: state, gating,
    };
  }
  if (state === 'NOT-READY') {
    return {
      rank: 4, tag: 'Not IC-ready', tone: 'warn',
      why: `Not ready for committee — ${gating.join('; ')}.`,
      impact: 'Each of these has to close before the deal can be tabled.',
      basis: 'IC readiness board',
      verdict: state, gating,
    };
  }
  if (state === 'READY') {
    return phase === 'post-committee'
      ? { rank: 8, tag: 'In execution', tone: 'good', why: 'Past the committee gate with nothing outstanding on the record.', impact: null, basis: 'Deal record — open conditions and compliance checks', verdict: state, gating }
      : { rank: 8, tag: 'IC-ready', tone: 'good', why: 'Papers on record, no blocking lanes, no unresolved risk findings.', impact: null, basis: 'IC readiness board', verdict: state, gating };
  }
  return { rank: 6, tag: 'On track', tone: 'good', why: `Progressing on plan at ${readiness}% completion.`, impact: null, basis: 'IC readiness board', verdict: state, gating, phase };
}

// ---------------------------------------------------------------------------
//  Work IQ signal across the portfolio
// ---------------------------------------------------------------------------
// The single most useful cross-deal Work IQ read: promises people made in the
// deal channels that nobody has turned into a tracked task. Proposed only —
// creating a task still routes through the deal that owns it.
function portfolioCommitments(deals, rawFor, limit = 6) {
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
    // The corpus is composed from the FULL deal record (lane owners, sponsor,
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
  // Nearest deadline first — a promise due tomorrow matters more than one due
  // next month, regardless of which deal it sits on.
  out.sort((a, b) => {
    const ta = a.due ? new Date(a.due).getTime() : Infinity;
    const tb = b.due ? new Date(b.due).getTime() : Infinity;
    return ta - tb;
  });
  return { total: out.length, deals: new Set(out.map((c) => c.dealId)).size, items: out.slice(0, limit) };
}

// ---------------------------------------------------------------------------
// `rawFor` resolves a list summary back to its full deal record, which the Work IQ
// corpus needs (lane owners and sponsors are stripped from summaries). It defaults to
// the identity function so the builder stays testable with plain objects.
export function buildHomeDesk(deals = [], { role = null, roleLabel = null, rawFor = (d) => d } = {}) {
  const list = Array.isArray(deals) ? deals.filter(Boolean) : [];

  // The verdict is computed from the unredacted record and names lanes and findings,
  // so it is only ever computed for a deal this reader can open. Metadata-tier deals
  // get a null raw and their own row — the queue says "not assessed", not "on track".
  const rawIfPermitted = (d) => {
    if (d.accessLevel !== 'full') return null;
    try { return rawFor(d) || d; } catch { return null; }
  };

  const ranked = list
    .map((d) => ({ deal: d, a: assess(d, rawIfPermitted(d)) }))
    .sort((x, y) => x.a.rank - y.a.rank || num(x.deal.readiness) - num(y.deal.readiness));

  const attention = ranked
    .filter((r) => r.a.rank <= 4)
    .slice(0, 6)
    .map((r, i) => ({
      ...r.a,
      id: `home-${r.deal.id}`,
      // Display order, 1-based. Set AFTER the spread so it is the queue position
      // the user sees, not the internal severity score used to sort.
      rank: i + 1,
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
  const notReady = ranked.filter((r) => r.a.verdict === 'NOT-READY').length;
  const conditional = ranked.filter((r) => r.a.verdict === 'CONDITIONAL').length;
  const icReady = ranked.filter((r) => r.a.verdict === 'READY' && dealPhase(r.deal) === 'diligence').length;
  const sectors = new Set(list.map((d) => d.sector).filter(Boolean)).size;
  const upcoming = list
    .filter((d) => icPending(d) && typeof d.daysToIC === 'number' && d.daysToIC >= 0)
    .sort((a, b) => a.daysToIC - b.daysToIC);
  const nearest = upcoming[0] || null;

  const phases = PHASES.map((p) => {
    const ds = list.filter((d) => phaseOf(d)?.key === p.key);
    return { key: p.key, label: p.label, count: ds.length, capital: ds.reduce((s, d) => s + num(d.dealSize), 0) * 1e6 };
  }).filter((p) => p.count > 0);

  const workiq = portfolioCommitments(list, rawFor);

  // ---- the narrative -------------------------------------------------------
  const c = citer();
  if (!list.length) {
    c.add('You do not have any live deals in view. Sourced candidates appear here once they clear the screening gate.', 'Deal list');
  } else {
    c.add(
      `You have ${list.length} deal${list.length === 1 ? '' : 's'} in view carrying ${money(capital)} of enterprise value across ${sectors || 1} sector${sectors === 1 ? '' : 's'}.`,
      'Deal list',
    );

    const urgent = attention.filter((a) => a.tone === 'bad');
    if (urgent.length) {
      c.add(
        `${urgent.length === 1 ? 'One deal needs' : `${urgent.length} deals need`} attention before ${urgent.length === 1 ? 'it slips' : 'they slip'} — starting with ${urgent[0].company}: ${urgent[0].why}`,
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

    if (nearest) {
      c.add(
        `The next committee date is ${nearest.company} in ${nearest.daysToIC} day${nearest.daysToIC === 1 ? '' : 's'}.`,
        'Deal record — target IC date',
      );
    }

    if (icReady) {
      c.add(`${icReady} deal${icReady === 1 ? ' is' : 's are'} ready to table — papers on record, no blocking lanes, no unresolved risk findings.`, 'IC readiness board');
    }
    if (conditional) {
      c.add(`${conditional} deal${conditional === 1 ? ' carries' : 's carry'} committee conditions that are still open.`, 'IC readiness board — committee conditions');
    }

    if (workiq.total) {
      c.add(
        `Work IQ found ${workiq.total} commitment${workiq.total === 1 ? '' : 's'} made in deal channels across ${workiq.deals} deal${workiq.deals === 1 ? '' : 's'} that ${workiq.total === 1 ? 'is' : 'are'} not tracked as tasks anywhere.`,
        'Work IQ — Teams channels',
      );
    }
  }

  const suggestions = [];
  if (attention[0]) suggestions.push(`Why is ${attention[0].company} at risk?`);
  suggestions.push('What changed across my deals this week?');
  if (nearest) suggestions.push(`What is still missing for ${nearest.company}'s IC?`);
  if (workiq.total) suggestions.push('Show me untracked commitments across all deals');
  suggestions.push('Which deals should I prioritise today?');

  return {
    generatedAt: new Date().toISOString(),
    roleLabel: roleLabel || null,
    role: role || null,
    briefing: { ...c.result(), suggestions: suggestions.slice(0, 5) },
    attention,
    phases,
    workiq,
    kpis: [
      { key: 'deals', label: 'Deals in view', value: String(list.length), sub: `${phases.find((p) => p.key === 'diligence')?.count || 0} in diligence` },
      { key: 'capital', label: 'Enterprise value', value: money(capital), sub: list.length ? `avg ${money(capital / list.length)} · ${sectors || 1} sector${sectors === 1 ? '' : 's'}` : '—' },
      { key: 'readiness', label: 'Not IC-ready', value: String(notReady), sub: `${conditional} conditional · ${icReady} ready to table` },
      { key: 'ic', label: 'Next committee', value: nearest ? `${nearest.daysToIC}d` : '—', sub: nearest ? nearest.company : 'none scheduled' },
    ],
    counts: { deals: list.length, attention: attention.length, notReady, conditional, icReady, commitments: workiq.total },
  };
}
