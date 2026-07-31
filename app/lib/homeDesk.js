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

function assess(deal) {
  const readiness = num(deal.readiness);
  const pre = icPending(deal);
  const days = pre ? daysUntil(deal.targetICDate) : null;
  const icDays = typeof deal.daysToIC === 'number' ? deal.daysToIC : days;

  // Ranked worst-first. The wording states the mechanism, not just the label —
  // "IC in 9 days at 41% readiness" is actionable; "at risk" is not.
  if (pre && typeof icDays === 'number' && icDays < 0) {
    return {
      rank: 0, tag: 'IC date passed', tone: 'bad',
      why: `The target committee date passed ${Math.abs(icDays)} days ago and the deal has not reached committee.`,
      impact: 'Either the date moves with a written reason, or the gap becomes the story at IC.',
      basis: 'Deal record — target IC date vs current step',
    };
  }
  if (pre && typeof icDays === 'number' && icDays <= 21 && readiness < 80) {
    return {
      rank: 1, tag: 'Approaching IC', tone: 'bad',
      why: `IC is ${icDays} day${icDays === 1 ? '' : 's'} out at ${readiness}% readiness — below the 80% bar.`,
      impact: 'Open diligence gates become IC conditions, which is the slowest way to close them.',
      basis: 'IC readiness board',
    };
  }
  const lanes = deal.workstreams || [];
  const idle = lanes.filter((w) => (w.progress ?? 0) === 0);
  if (idle.length && idle.length === lanes.length && lanes.length) {
    return {
      rank: 2, tag: 'Not started', tone: 'warn',
      why: `None of the ${lanes.length} diligence lane${lanes.length === 1 ? ' has' : 's have'} recorded progress.`,
      impact: 'Nothing is wrong yet — but nothing is moving either, and the clock is.',
      basis: 'Workstream progress',
    };
  }
  if (readiness < 40) {
    return {
      rank: 3, tag: 'Early', tone: 'warn',
      why: `${readiness}% IC-ready — the evidence base is still thin.`,
      impact: 'Expect the readiness number to be the binding constraint on the IC date.',
      basis: 'IC readiness board',
    };
  }
  if (idle.length) {
    return {
      rank: 4, tag: 'Lane not started', tone: 'warn',
      why: `${idle.length} of ${lanes.length} lanes ${idle.length === 1 ? 'has' : 'have'} not started.`,
      impact: 'An unopened lane is the most common source of a late surprise.',
      basis: 'Workstream progress',
    };
  }
  if (readiness >= 80) {
    return { rank: 8, tag: 'IC-ready', tone: 'good', why: `${readiness}% ready — cleared the readiness bar.`, impact: null, basis: 'IC readiness board' };
  }
  return { rank: 6, tag: 'On track', tone: 'good', why: `${readiness}% ready and progressing on plan.`, impact: null, basis: 'IC readiness board' };
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

  const ranked = list
    .map((d) => ({ deal: d, a: assess(d) }))
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
      readiness: num(r.deal.readiness),
      icInDays: typeof r.deal.daysToIC === 'number' ? r.deal.daysToIC : null,
    }));

  // Headline numbers, all derived from the deals THIS caller can see so the
  // narrative and the tiles can never disagree.
  const capital = list.reduce((s, d) => s + num(d.dealSize), 0) * 1e6;
  const avgReadiness = list.length ? Math.round(list.reduce((s, d) => s + num(d.readiness), 0) / list.length) : 0;
  const icReady = list.filter((d) => num(d.readiness) >= 80).length;
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
      `You have ${list.length} deal${list.length === 1 ? '' : 's'} in view carrying ${money(capital)} of enterprise value across ${sectors || 1} sector${sectors === 1 ? '' : 's'}, at ${avgReadiness}% average IC readiness.`,
      'Deal list', 'IC readiness board',
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
        `The next committee date is ${nearest.company} in ${nearest.daysToIC} day${nearest.daysToIC === 1 ? '' : 's'}, at ${num(nearest.readiness)}% readiness.`,
        'Deal record — target IC date',
      );
    }

    if (icReady) {
      c.add(`${icReady} deal${icReady === 1 ? ' has' : 's have'} cleared the 80% readiness bar and could be scheduled for committee.`, 'IC readiness board');
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
      { key: 'readiness', label: 'Avg IC readiness', value: `${avgReadiness}%`, sub: `${icReady} past the 80% bar` },
      { key: 'ic', label: 'Next committee', value: nearest ? `${nearest.daysToIC}d` : '—', sub: nearest ? nearest.company : 'none scheduled' },
    ],
    counts: { deals: list.length, attention: attention.length, icReady, commitments: workiq.total },
  };
}
