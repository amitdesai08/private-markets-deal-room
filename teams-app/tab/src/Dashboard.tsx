// The "Deals Overview" tab: deal KPIs (live deals, pipeline value, IC readiness, next
// to committee), a "Needs attention" priority list, the deals-by-stage capital view, the
// Stage-1 origination funnel (/api/pipeline), the deal cards (/api/deals) and the
// market-intel panel (/api/market-intel). Read-only; onAsk opens the agents panel and
// onOpen drills into a deal's DealDetail overlay.
import { useState } from 'react';
import type { Analytics, Pipeline, Deal, MarketIntel, BackendConfig } from './types';

function money(n?: number): string {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${Math.round(n)}`;
}

export default function Dashboard({ analytics, pipeline, deals, market, config, onAsk, onOpen }: {
  analytics: Analytics | null; pipeline: Pipeline | null; deals: Deal[]; market: MarketIntel | null;
  config: BackendConfig | null; onAsk: (dealId: string) => void; onOpen: (dealId: string) => void;
}) {
  const fabric = config?.fabric || market?.info;
  const comps = market?.comparableDeals || [];
  const precedents = market?.icPrecedents || [];
  const benchmarks = market?.benchmarkFindings || [];

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

  return (
    <div className="dash">
      {/* KPI row */}
      <div className="kpis">
        {kpis.map((k) => (
          <div key={k.label} className="kpi">
            <div className="kpi-v">{k.value}</div>
            <div className="kpi-l">{k.label}</div>
            <div className="kpi-s">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* What needs action before it slips */}
      <section className="panel">
        <div className="panel-h"><span>Needs attention</span><span className="muted">move these before they slip</span></div>
        {attention.length ? (
          <div className="attn">
            {attention.map(({ d, p }) => (
              <div key={d.id} className="attn-row" role="button" tabIndex={0} onClick={() => onOpen(d.id)}>
                <div className="attn-main">
                  <span className="attn-co">{d.company} <span className="attn-sub">· {d.stageName || d.stage || '—'}</span></span>
                  <span className="attn-why">{p.why}</span>
                </div>
                <span className={`pill ${p.cls}`}>{p.tag}</span>
                <span className="attn-acts">
                  <button className="askbtn" onClick={(e) => { e.stopPropagation(); onOpen(d.id); }}>Open ▸</button>
                  <button className="askbtn" onClick={(e) => { e.stopPropagation(); onAsk(d.id); }}>Ask ▸</button>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-panel">Nothing needs action right now — every live deal is on track or IC-ready.</div>
        )}
      </section>

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
            <button className="linkbtn" onClick={() => onAsk('')}>Ask an agent what to source next →</button>
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
          <span className="muted">{fabric?.source ? `${fabric.source}${fabric?.freshness?.label ? ` · ${fabric.freshness.label}` : ''}` : 'Microsoft Fabric / OneLake'}</span>
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
