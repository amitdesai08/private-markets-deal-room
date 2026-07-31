// The "Deals Overview" tab — the portfolio cockpit.
//
// It answers the same three questions the DEAL cockpit answers, one level up, in the
// same visual language, so moving from the portfolio into a deal feels like zooming
// rather than switching applications:
//   1. What changed?      -> Portfolio briefing (narrative, cited, AI-labelled)
//   2. What needs me?     -> Ranked attention queue across every visible deal
//   3. Where are we?      -> KPIs, capital by phase, funnel, deal cards, market intel
//
// The briefing and the queue come from GET /api/home-desk, which composes them from
// records the platform already owns and scopes them to the deals THIS caller can see.
// Everything below the hero is the existing operational detail, unchanged in behaviour.
import { useEffect, useState } from 'react';
import { af } from './authFetch';
import { Narrative, SourceList, Tag, clock, type Para } from './deskUi';
import type { Analytics, Pipeline, Deal, MarketIntel, BackendConfig } from './types';

type HomeAttention = {
  id: string; rank: number; dealId: string; company: string; stageName?: string | null;
  readiness: number; icInDays?: number | null;
  tag: string; tone: 'bad' | 'warn' | 'good'; why: string; impact?: string | null; basis?: string;
};
type HomeCommitment = {
  dealId: string; company: string; author: string; headline: string; quote?: string;
  dueText?: string | null; laneLabel?: string | null; confidence?: string; basis?: string;
};
type HomeDesk = {
  generatedAt: string;
  roleLabel?: string | null;
  briefing: { generatedAt: string; paragraphs: Para[]; sources: string[]; suggestions: string[] };
  attention: HomeAttention[];
  phases: { key: string; label: string; count: number; capital: number }[];
  workiq: { total: number; deals: number; items: HomeCommitment[] };
  kpis: { key: string; label: string; value: string; sub: string }[];
  counts: { deals: number; attention: number; icReady: number; commitments: number };
};

function money(n?: number): string {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${Math.round(n)}`;
}

export default function Dashboard({ analytics, pipeline, deals, market, config, onAsk, onAskQuestion, onOpen, canWrite, roleLabel }: {
  analytics: Analytics | null; pipeline: Pipeline | null; deals: Deal[]; market: MarketIntel | null;
  config: BackendConfig | null; onAsk: (dealId: string) => void; onAskQuestion?: (q: string) => void;
  onOpen: (dealId: string) => void; canWrite?: boolean; roleLabel?: string | null;
}) {
  const fabric = config?.fabric || market?.info;
  const comps = market?.comparableDeals || [];
  const precedents = market?.icPrecedents || [];
  const benchmarks = market?.benchmarkFindings || [];

  // The portfolio briefing. It is additive: if the call fails, everything below still
  // renders from the deal list, so a briefing outage never takes the home page down.
  const [home, setHome] = useState<HomeDesk | null>(null);
  const [homeLoading, setHomeLoading] = useState(true);
  const [evidence, setEvidence] = useState(false);
  const [briefOpen, setBriefOpen] = useState(true);
  // Modules render OPEN. A collapsed card is a header floating above dead space,
  // which reads as a layout bug rather than a choice — and it hides the very thing
  // that justifies the card being on the page. Hiding stays available, it is just
  // not the default.
  const [showWorkiq, setShowWorkiq] = useState(true);

  function loadHome() {
    setHomeLoading(true);
    af('/api/home-desk')
      .then((r) => (r.ok ? r.json() : null))
      .then(setHome)
      .catch(() => setHome(null))
      .finally(() => setHomeLoading(false));
  }
  // Re-derive when the visible deal list changes — switching persona or view-as role
  // changes which deals are in scope, and the briefing must never lag behind them.
  useEffect(loadHome, [deals.length]);

  // Derive the headline counts from the deals THIS caller can actually see, so the
  // totals always match the deal cards below (and change when the persona changes).
  // Falls back to the system analytics only when the deal list hasn't loaded yet.
  const inDiligenceRe = /diligence|approval/i;
  const liveDeals = deals.length || analytics?.deals || 0;
  const inDiligence = deals.length
    ? deals.filter((d) => inDiligenceRe.test(`${d.stage || ''} ${d.stageName || ''}`)).length
    : (analytics?.inDiligence ?? 0);
  const avgReadiness = deals.length
    ? Math.round(deals.reduce((s, d) => s + (d.readiness || 0), 0) / deals.length)
    : (analytics?.avgReadiness ?? 0);

  // Day-to-day PE headline data, derived from the deals THIS caller can see.
  const pipelineValue = deals.reduce((s, d) => s + (d.dealSize || 0), 0) * 1e6; // total EV in flight
  const avgCheck = deals.length ? pipelineValue / deals.length : 0;
  const sectors = new Set(deals.map((d) => d.sector).filter(Boolean)).size;
  const icReady = deals.filter((d) => (d.readiness ?? 0) >= 80).length;
  // "Next to committee" = the soonest UPCOMING IC among pre-IC deals (never a past-IC,
  // owned/exiting deal — which would show negative days).
  const withIC = deals.filter((d) => typeof d.daysToIC === 'number' && (d.daysToIC as number) >= 0 && /diligence|approval|screen|origin|sourc/i.test(`${d.stage || ''} ${d.stageName || ''}`));
  const nearestIC = withIC.length ? withIC.reduce((a, b) => ((a.daysToIC as number) <= (b.daysToIC as number) ? a : b)) : null;

  const kpis = [
    { label: 'Live deals', value: String(liveDeals), sub: `${inDiligence} in diligence` },
    { label: 'Pipeline value', value: money(pipelineValue), sub: liveDeals ? `avg ${money(avgCheck)} · ${sectors} sector${sectors === 1 ? '' : 's'}` : '—' },
    { label: 'Avg IC readiness', value: `${avgReadiness}%`, sub: `${icReady} ready for IC` },
    { label: 'Next to committee', value: nearestIC ? `${nearestIC.daysToIC}d` : '—', sub: nearestIC ? nearestIC.company : 'none scheduled' },
  ];

  // What needs action before it slips: approaching IC but not ready, or early / stalled.
  const priority = (d: Deal) => {
    const r = d.readiness ?? 0;
    const days = typeof d.daysToIC === 'number' ? d.daysToIC : 999;
    if (days <= 21 && r < 80) return { rank: 0, tag: 'Approaching IC', cls: 'bad', why: `IC in ${days}d but only ${r}% ready — close diligence gaps before committee` };
    if (r < 40) return { rank: 1, tag: 'Early', cls: 'warn', why: `${r}% IC-ready — needs diligence to progress` };
    if (r >= 80) return { rank: 3, tag: 'IC-ready', cls: 'ok', why: 'Cleared the readiness bar' };
    return { rank: 2, tag: 'On track', cls: 'ok', why: 'Progressing on plan' };
  };
  const attention = deals
    .map((d) => ({ d, p: priority(d) }))
    .filter((x) => x.p.rank <= 1)
    .sort((a, b) => a.p.rank - b.p.rank || ((a.d.daysToIC ?? 999) - (b.d.daysToIC ?? 999)))
    .slice(0, 6);

  // Prefer the server's queue — it reasons over the full deal record (lane owners,
  // step position) that the list summary doesn't carry. The local derivation stays
  // as the fallback so the page is never empty just because one call failed.
  const attentionRows: HomeAttention[] = home?.attention?.length
    ? home.attention
    : attention.map(({ d, p }, i) => ({
      id: `local-${d.id}`,
      rank: i + 1,
      dealId: d.id,
      company: d.company,
      stageName: d.stageName || d.stage || null,
      readiness: d.readiness ?? 0,
      icInDays: typeof d.daysToIC === 'number' ? d.daysToIC : null,
      tag: p.tag,
      tone: p.cls === 'ok' ? 'good' : (p.cls as 'bad' | 'warn'),
      why: p.why,
      impact: null,
      basis: 'IC readiness board',
    }));

  // Where the live capital sits in the deal process.
  const PHASES = [
    { key: 'diligence', label: 'Diligence & Approval', re: /diligence|approval/i },
    { key: 'execution', label: 'Execution & Closing', re: /execution|closing|signing/i },
    { key: 'value', label: 'Value & Exit', re: /value|exit|owned|monitor/i },
  ];
  const byPhase = PHASES.map((ph) => {
    const ds = deals.filter((d) => ph.re.test(`${d.stage || ''} ${d.stageName || ''}`));
    return { key: ph.key, label: ph.label, count: ds.length, capital: ds.reduce((s, d) => s + (d.dealSize || 0), 0) * 1e6 };
  });

  // Side-by-side comparison: pick 2–4 deals and scan the same decision fields at once.
  const [compare, setCompare] = useState<string[]>([]);
  const toggleCompare = (id: string) => setCompare((c) => c.includes(id) ? c.filter((x) => x !== id) : c.length >= 4 ? c : [...c, id]);
  const compareDeals = compare.map((id) => deals.find((d) => d.id === id)).filter(Boolean) as Deal[];
  const CMP_ROWS: { label: string; get: (d: Deal) => string }[] = [
    { label: 'Stage', get: (d) => d.stageName || d.stage || '—' },
    { label: 'IC readiness', get: (d) => `${d.readiness ?? 0}%` },
    { label: 'Days to IC', get: (d) => typeof d.daysToIC === 'number' ? (d.daysToIC >= 0 ? `${d.daysToIC}d` : 'past') : '—' },
    { label: 'Deal size', get: (d) => money(d.dealSize ? d.dealSize * 1e6 : undefined) },
    { label: 'Sector', get: (d) => d.sector || '—' },
    { label: 'Status', get: (d) => d.status || '—' },
    { label: 'Priority', get: (d) => priority(d).tag },
    { label: 'Recommended action', get: (d) => priority(d).why },
  ];
  const copyCompare = () => {
    const header = ['Field', ...compareDeals.map((d) => d.company)].join('\t');
    const rows = CMP_ROWS.map((r) => [r.label, ...compareDeals.map((d) => r.get(d))].join('\t'));
    navigator.clipboard?.writeText([header, ...rows].join('\n')).catch(() => {});
  };

  const kpiRow = home?.kpis?.length ? home.kpis : kpis.map((k) => ({ key: k.label, ...k }));

  return (
    <div className="dash">
      {/* ================= Portfolio cockpit =================
          Same shape as the deal cockpit: an AI-labelled briefing on the left, the
          ranked queue of what needs a person on the right. */}
      <div className="grid g2">
        <div style={{ minWidth: 0 }}>
          <div className="card aicard">
            <div className="hd">
              <span className="aibadge">✦ AI</span>
              <h3>Portfolio briefing</h3>
              <Tag kind="new" />
              <span className="spacer" />
              <button className="btn link compact" onClick={loadHome}>↻ Refresh</button>
              <button className="btn link compact" onClick={() => setEvidence((v) => !v)}>🔍 Evidence</button>
              <button className="btn link compact" onClick={() => setBriefOpen((v) => !v)}>{briefOpen ? 'Hide' : 'Show'}</button>
            </div>
            {briefOpen ? (
              <div className="bd">
                {homeLoading && !home ? (
                  <div className="muted">Building your briefing…</div>
                ) : !home ? (
                  <div className="muted">
                    The portfolio briefing is unavailable right now — the deal detail below is still live.
                    <button className="btn link compact" onClick={loadHome}>Retry</button>
                  </div>
                ) : (
                  <>
                    <div className="sub" style={{ marginBottom: 8 }}>
                      Generated {clock(home.briefing.generatedAt)}
                      {home.roleLabel || roleLabel ? ` · scoped to what a ${home.roleLabel || roleLabel} can see` : ' · scoped to the deals you can see'}
                    </div>
                    <Narrative paragraphs={home.briefing.paragraphs} sources={home.briefing.sources} onCite={() => setEvidence(true)} />
                    {evidence ? <SourceList sources={home.briefing.sources} /> : null}
                    {home.briefing.suggestions.length && onAskQuestion ? (
                      <div className="suggest">
                        <span className="sub" style={{ fontWeight: 600 }}>Ask next</span>
                        {home.briefing.suggestions.map((s, i) => (
                          <button key={i} className="sgchip" onClick={() => onAskQuestion(s)}>{s}</button>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
            <div className="note">
              Composed from the deal record, the IC readiness board and Work IQ — no model is called to build it,
              and it never changes a deal's recorded status. Every claim carries the source it came from.
            </div>
          </div>

          {/* Work IQ across the portfolio: promises made in deal channels that are
              not tracked anywhere. Proposed only — a task is created on the deal
              that owns it, by a named person. */}
          {home?.workiq?.total ? (
            <div className="card aicard">
              <div className="hd">
                <span className="aibadge">✦ AI</span>
                <h3>Untracked commitments</h3>
                <Tag kind="new" />
                <span className="spacer" />
                <span className="chip">{home.workiq.total} across {home.workiq.deals} deal{home.workiq.deals === 1 ? '' : 's'}</span>
                <button className="btn link compact" onClick={() => setShowWorkiq((v) => !v)}>{showWorkiq ? 'Hide' : 'Show'}</button>
              </div>
              {showWorkiq ? (
                <div className="bd">
                  {home.workiq.items.map((c, i) => (
                    <div className="commit" key={`${c.dealId}-${i}`}>
                      <div className="att-t">
                        <span className="name">{c.author}</span>
                        <span className="chip">{c.company}</span>
                        {c.laneLabel ? <span className="sub">{c.laneLabel}</span> : null}
                        {c.dueText ? <span className="chip warn">📅 {c.dueText}</span> : null}
                      </div>
                      <div className="quote">“{c.quote || c.headline}”</div>
                      <div className="sub">Basis: {c.basis || 'detected in the deal channel'} · not recorded as a task</div>
                      <div className="acts">
                        <button className="btn" onClick={() => onOpen(c.dealId)}>Open {c.company} ▸</button>
                        {onAskQuestion ? (
                          <button className="btn link" onClick={() => onAskQuestion(`On ${c.company}, is this commitment tracked: "${c.headline}"?`)}>Ask about it</button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  <div className="sub">
                    Detected, not decided. Turning one of these into a tracked task happens on the deal itself,
                    where the audit trail records who did it.
                  </div>
                </div>
              ) : (
                <div className="note">
                  Work IQ read {home.workiq.total} promise{home.workiq.total === 1 ? '' : 's'} out of deal channels that
                  nobody has turned into a task. Show them to see who owes what, and when.
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* ---------------- Attention queue ---------------- */}
        <div style={{ minWidth: 0 }}>
          <div className="card">
            <div className="hd">
              <h3>What needs my attention</h3>
              <Tag kind="ext" />
              <span className="spacer" />
              <span className="chip">{attentionRows.length} deal{attentionRows.length === 1 ? '' : 's'}</span>
            </div>
            <div className="legend">
              <span>
                Ranked worst-first across every deal you can see
                {home?.roleLabel || roleLabel ? <> · weighted for <b>{home?.roleLabel || roleLabel}</b></> : null}
                {canWrite === false ? <> · <b>read-only seat</b></> : null}
              </span>
            </div>
            {attentionRows.length === 0 ? (
              <div className="bd"><div className="muted">Nothing needs action right now — every deal you can see is on track or IC-ready.</div></div>
            ) : attentionRows.map((a) => (
              <div className="att" key={a.id}>
                <div className="att-t">
                  <span className="rank">#{a.rank}</span>
                  <span className={`chip ${a.tone}`}>{a.tag}</span>
                  <span className="name">{a.company}</span>
                </div>
                <div className="att-l">⏰ {a.why}</div>
                <div className="att-l">
                  {a.stageName ? <span>📍 {a.stageName}</span> : null}
                  <span>📊 {a.readiness}% IC-ready</span>
                  {typeof a.icInDays === 'number' ? <span>📅 IC in {a.icInDays}d</span> : null}
                </div>
                {a.impact ? <div className="impact">⚡ {a.impact}</div> : null}
                {a.basis ? <div className="sub" style={{ marginTop: 6 }}>Basis: {a.basis}</div> : null}
                <div className="acts">
                  <button className="btn primary" onClick={() => onOpen(a.dealId)}>Open deal ▸</button>
                  <button className="btn link" onClick={() => onAsk(a.dealId)}>Ask agents</button>
                </div>
              </div>
            ))}
            <div className="note">
              Opening a deal takes you into its own cockpit. Nothing here changes a deal — it only tells you where to look first.
            </div>
          </div>

          {/* KPI row sits beside the queue so the headline numbers and the work to be
              done are read together rather than on separate screens. */}
          <div className="kpis">
            {kpiRow.map((k) => (
              <div key={k.key || k.label} className="kpi">
                <div className="kpi-v">{k.value}</div>
                <div className="kpi-l">{k.label}</div>
                <div className="kpi-s">{k.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Where the live capital sits in the process */}
      <section className="panel">
        <div className="panel-h"><span>Deals by stage</span><span className="muted">{money(pipelineValue)} across {liveDeals} live deal{liveDeals === 1 ? '' : 's'}</span></div>
        <div className="funnel">
          {byPhase.map((ph) => (
            <div key={ph.key} className="fstep">
              <div className="fcount">{money(ph.capital)}</div>
              <div className="flabel">{ph.label}</div>
              <div className="fkey">{ph.count} deal{ph.count === 1 ? '' : 's'}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Origination funnel */}
      {pipeline?.funnel?.length ? (
        <section className="panel">
          <div className="panel-h"><span>Origination funnel</span><span className="muted">{pipeline.fundName}</span></div>
          <div className="funnel">
            {pipeline.funnel.map((f) => (
              <div key={f.key} className="fstep">
                <div className="fcount">{f.count}</div>
                <div className="flabel">{f.label}</div>
                <div className="fkey">{f.key}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Side-by-side comparison */}
      {compareDeals.length >= 2 ? (
        <section className="panel">
          <div className="panel-h">
            <span>Compare deals</span>
            <span className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="askbtn" onClick={copyCompare}>⧉ Copy table</button>
              <button className="askbtn" onClick={() => setCompare([])}>Clear</button>
            </span>
          </div>
          <div style={{ overflowX: 'auto', padding: '4px 14px 14px' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--muted)', fontWeight: 600, borderBottom: '1px solid var(--border, #23232c)' }}>Field</th>
                  {compareDeals.map((d) => (
                    <th key={d.id} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 700, borderBottom: '1px solid var(--border, #23232c)', cursor: 'pointer' }} onClick={() => onOpen(d.id)}>{d.company} ↗</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CMP_ROWS.map((r) => (
                  <tr key={r.label}>
                    <td style={{ padding: '6px 10px', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border, #1c1c24)' }}>{r.label}</td>
                    {compareDeals.map((d) => (
                      <td key={d.id} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border, #1c1c24)' }}>{r.get(d)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Deals */}
      <section className="panel">
        <div className="panel-h"><span>Pipeline deals</span><span className="muted">{deals.length} active{compare.length ? ` · ${compare.length} selected to compare` : ' · tick 2–4 to compare'}</span></div>
        {deals.length === 0 ? (
          <div className="empty-panel">
            No deals are live yet. Sourced candidates that clear the screening gate appear here.
            <button className="linkbtn" onClick={() => onAsk('')}>Ask what to source next →</button>
          </div>
        ) : (
          <div className="deals">
            {deals.map((d) => (
              <div key={d.id} className="dealcard" onClick={() => onOpen(d.id)} role="button" tabIndex={0}>
                <div className="dc-top">
                  <div className="dc-co">{d.company}</div>
                  <div className="dc-size">{money(d.dealSize ? d.dealSize * 1e6 : undefined)}</div>
                </div>
                <div className="dc-meta">{d.sector || '—'} · {d.stageName || d.stage || '—'}{d.status ? ` · ${d.status}` : ''}</div>
                <div className="dc-bar"><span style={{ width: `${Math.max(0, Math.min(100, d.readiness ?? 0))}%` }} /></div>
                <div className="dc-foot">
                  <span className="muted">IC readiness {d.readiness ?? 0}%{typeof d.daysToIC === 'number' ? ` · IC in ${d.daysToIC}d` : ''}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className={`askbtn${compare.includes(d.id) ? ' on' : ''}`} title="Add to comparison" onClick={(e) => { e.stopPropagation(); toggleCompare(d.id); }}>{compare.includes(d.id) ? '✓ Compare' : '+ Compare'}</button>
                    <button className="askbtn" onClick={(e) => { e.stopPropagation(); onAsk(d.id); }}>Ask ▸</button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Market intelligence — live Fabric */}
      <section className="panel">
        <div className="panel-h">
          <span>Market intelligence</span>
          <span className="muted">{fabric?.source ? `${fabric.source}${fabric?.freshness?.label ? ` · ${fabric.freshness.label}` : ''}` : 'Live market data'}</span>
        </div>
        <div className="mi">
          <div className="mi-col">
            <div className="mi-h">Comparable deals</div>
            {comps.length ? comps.slice(0, 6).map((c, i) => (
              <div key={i} className="mi-row">
                <span className="mi-name">{c.company}{c.ticker ? ` (${c.ticker})` : ''}</span>
                <span className="mi-val">{c.dealType || '—'} · {money(c.impliedValuation)}</span>
                {c.status ? <span className={`pill ${String(c.status).toLowerCase().replace(/\s+/g, '-')}`}>{c.status}</span> : null}
              </div>
            )) : <div className="muted">No comparables loaded.</div>}
          </div>
          <div className="mi-col">
            <div className="mi-h">IC voting precedents</div>
            {precedents.length ? precedents.slice(0, 6).map((p, i) => (
              <div key={i} className="mi-row">
                <span className="mi-name">{p.deal}</span>
                <span className="mi-val">{p.decision} · {(p.votesFor ?? 0)}–{(p.votesAgainst ?? 0)}{typeof p.votesAbstain === 'number' ? `–${p.votesAbstain}` : ''}</span>
              </div>
            )) : <div className="muted">No precedents loaded.</div>}
            {benchmarks.length ? (
              <div className="mi-bench">
                <div className="mi-h" style={{ marginTop: 10 }}>Benchmark findings</div>
                <div className="chips">{benchmarks.map((b) => (<span key={b.workstream} className="chip">{b.workstream} · {b.total}</span>))}</div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
